import { NextResponse } from "next/server";

export const runtime = "nodejs";

// Executa as cadências do tipo run_agent (as de notify/suggest_whatsapp são
// tratadas pelo pg_cron `cadence_sweep`). Protegido por CRON_SECRET.
// Configurar como Vercel Cron (ver docs/cadences.md).
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "não autorizado" }, { status: 401 });
  }

  // Usa a service role via admin client seria o ideal; sem ela, este endpoint
  // apenas registra a intenção. Implementação completa requer SUPABASE_SERVICE_ROLE_KEY.
  const hasService = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!hasService) {
    return NextResponse.json({
      ok: true,
      note: "cadências run_agent exigem SUPABASE_SERVICE_ROLE_KEY para rodar sem sessão de usuário. As cadências notify/suggest_whatsapp já rodam via pg_cron no Supabase.",
      processed: 0,
    });
  }

  const { createClient } = await import("@supabase/supabase-js");
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { runAgentForDeal } = await import("@/lib/run-agent-admin");

  const { data: rules } = await admin
    .from("cadence_rules")
    .select("id, org_id, stage_key, days, agent_kind")
    .eq("enabled", true)
    .eq("action", "run_agent");

  let processed = 0;
  for (const r of rules ?? []) {
    if (!r.agent_kind) continue;
    const { data: stage } = await admin.from("stages").select("id").eq("org_id", r.org_id).eq("key", r.stage_key).maybeSingle();
    if (!stage) continue;
    const cutoff = new Date(Date.now() - r.days * 86_400_000).toISOString();
    const { data: deals } = await admin.from("deals").select("id").eq("org_id", r.org_id).eq("stage_id", stage.id).lt("updated_at", cutoff).limit(20);
    for (const d of deals ?? []) {
      try { await runAgentForDeal(admin, r.agent_kind, d.id, r.org_id); processed++; } catch { /* segue */ }
    }
  }
  return NextResponse.json({ ok: true, processed });
}

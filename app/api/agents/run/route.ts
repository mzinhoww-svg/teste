import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/db";
import { RateLimitError, runAgentForDeal } from "@/lib/run-agent";

export const runtime = "nodejs";

// GET /api/agents/run?dealId=... — última execução de cada agente para o deal
// (reidrata o painel ao reabrir; escopado pela org ativa).
export async function GET(req: Request) {
  const auth = await getAuthContext();
  if (!auth) return NextResponse.json({ error: "não autenticado" }, { status: 401 });

  const dealId = new URL(req.url).searchParams.get("dealId");
  if (!dealId) return NextResponse.json({ error: "dealId obrigatório" }, { status: 400 });

  const { createClient } = await import("@/lib/supabase/server");
  const supabase = createClient();
  const { data } = await supabase
    .from("agent_runs")
    .select("agent_kind, output, created_at")
    .eq("org_id", auth.orgId)
    .eq("deal_id", dealId)
    .order("created_at", { ascending: false })
    .limit(60);

  const latest: Record<string, unknown> = {};
  for (const r of data ?? []) {
    if (!(r.agent_kind in latest)) latest[r.agent_kind] = r.output;
  }
  return NextResponse.json({ latest });
}

export async function POST(req: Request) {
  const auth = await getAuthContext();
  if (!auth) return NextResponse.json({ error: "não autenticado" }, { status: 401 });

  const { dealId, kind } = (await req.json()) as { dealId?: string; kind?: string };
  if (!dealId || !kind) return NextResponse.json({ error: "dealId e kind obrigatórios" }, { status: 400 });

  try {
    const result = await runAgentForDeal(kind, dealId, { orgId: auth.orgId, userId: auth.userId, via: "manual" });
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof RateLimitError) return NextResponse.json({ error: e.message }, { status: 429 });
    const msg = e instanceof Error ? e.message : "erro ao executar agente";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

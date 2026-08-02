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
    .select("id, org_id, stage_key, days, agent_kind, action, config")
    .eq("enabled", true)
    .in("action", ["run_agent", "send_email"]);

  let processed = 0;
  let emailed = 0;
  for (const r of rules ?? []) {
    const { data: stage } = await admin.from("stages").select("id").eq("org_id", r.org_id).eq("key", r.stage_key).maybeSingle();
    if (!stage) continue;
    const cutoff = new Date(Date.now() - r.days * 86_400_000).toISOString();

    if (r.action === "send_email") {
      // Follow-up por e-mail aos contatos de deals parados no estágio.
      const { data: deals } = await admin
        .from("deals")
        .select("id, title, contact:contacts(id, name, email)")
        .eq("org_id", r.org_id).eq("stage_id", stage.id).lt("updated_at", cutoff).limit(20);
      if (!deals?.length) continue;
      const { data: org } = await admin.from("orgs").select("name, settings").eq("id", r.org_id).maybeSingle();
      const brand = (org?.settings as any)?.brand ?? {};
      const message = (r.config as any)?.message
        ?? "Passando para retomar nossa conversa. Podemos seguir com os próximos passos?";
      const { sendAndLogEmail } = await import("@/lib/email/send");
      const { cadenceFollowupEmail } = await import("@/lib/email/templates");
      for (const d of deals) {
        const contact: any = Array.isArray((d as any).contact) ? (d as any).contact[0] : (d as any).contact;
        if (!contact?.email) continue;
        const content = cadenceFollowupEmail({ brand, orgName: org?.name ?? "CRM", contactName: contact.name, message });
        await sendAndLogEmail({ db: admin, orgId: r.org_id, to: { email: contact.email, name: contact.name }, content, dealId: d.id, contactId: contact.id, tags: ["cadencia"] });
        emailed++;
      }
      continue;
    }

    // action === "run_agent"
    if (!r.agent_kind) continue;
    const { data: deals } = await admin.from("deals").select("id").eq("org_id", r.org_id).eq("stage_id", stage.id).lt("updated_at", cutoff).limit(20);
    for (const d of deals ?? []) {
      try { await runAgentForDeal(admin, r.agent_kind, d.id, r.org_id); processed++; } catch { /* segue */ }
    }
  }

  // ---- Cobrança (dunning): faturas "enviada" vencidas → "vencida" + e-mail. ----
  const overdue = await processOverdueInvoices(admin);
  // ---- Agente de Reativação: deals perdidos há 30+ dias → tarefa de retorno. ----
  const reactivated = await processReactivation(admin);
  // ---- Saúde do pipeline: digest diário por org para o gestor. ----
  const digests = await processPipelineDigest(admin);

  return NextResponse.json({ ok: true, processed, emailed, overdue, reactivated, digests });
}

// Agente de Reativação (determinista): deals em estágio de perda parados há 30+
// dias ganham uma tarefa de retorno + notificação. Dedupe: pula se já houver uma
// atividade de reativação recente para o deal.
async function processReactivation(admin: any): Promise<number> {
  const { data: lostStages } = await admin.from("stages").select("id").eq("is_lost", true);
  const ids = (lostStages ?? []).map((s: any) => s.id);
  if (!ids.length) return 0;
  const cutoff = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const { data: deals } = await admin
    .from("deals")
    .select("id, org_id, title")
    .in("stage_id", ids)
    .lt("updated_at", cutoff)
    .limit(50);
  if (!deals?.length) return 0;

  let count = 0;
  for (const d of deals) {
    const { data: existing } = await admin
      .from("activities")
      .select("id")
      .eq("deal_id", d.id)
      .ilike("summary", "Reativação:%")
      .is("done_at", null)
      .limit(1)
      .maybeSingle();
    if (existing) continue;
    const due = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    await admin.from("activities").insert({
      org_id: d.org_id, deal_id: d.id, type: "note",
      summary: `Reativação: retomar contato com "${d.title}" (perdido há 30+ dias) com nova abordagem`,
      author: "Agente de Reativação", due_at: due,
    });
    await admin.from("notifications").insert({
      org_id: d.org_id, type: "reactivation", title: "Lead para reativar",
      body: `${d.title} está parado como perdido há mais de 30 dias. Que tal um retorno?`,
      deal_id: d.id, action_url: "/app/tarefas",
    });
    count++;
  }
  return count;
}

// Saúde do pipeline (gestor): 1x/dia por org, resume deals abertos e parados.
// Dedupe: pula se já houver um digest hoje.
async function processPipelineDigest(admin: any): Promise<number> {
  const { data: orgs } = await admin.from("orgs").select("id");
  if (!orgs?.length) return 0;
  const todayStart = new Date().toISOString().slice(0, 10) + "T00:00:00.000Z";
  const staleCut = new Date(Date.now() - 7 * 86_400_000).toISOString();
  let count = 0;
  for (const o of orgs) {
    const { data: already } = await admin
      .from("notifications").select("id").eq("org_id", o.id).eq("type", "pipeline_digest").gte("created_at", todayStart).limit(1).maybeSingle();
    if (already) continue;
    const { data: wonLost } = await admin.from("stages").select("id, is_won, is_lost").eq("org_id", o.id);
    const closedIds = (wonLost ?? []).filter((s: any) => s.is_won || s.is_lost).map((s: any) => s.id);
    let openQ = admin.from("deals").select("id, amount, updated_at").eq("org_id", o.id);
    if (closedIds.length) openQ = openQ.not("stage_id", "in", `(${closedIds.join(",")})`);
    const { data: open } = await openQ;
    const rows = open ?? [];
    if (!rows.length) continue;
    const stalled = rows.filter((d: any) => d.updated_at < staleCut).length;
    const pipelineValue = rows.reduce((s: number, d: any) => s + Number(d.amount ?? 0), 0);
    await admin.from("notifications").insert({
      org_id: o.id, type: "pipeline_digest", title: "Resumo do pipeline",
      body: `${rows.length} deals abertos (${Math.round(pipelineValue).toLocaleString("pt-BR")} em pipeline). ${stalled} parado(s) há 7+ dias — priorize hoje.`,
      action_url: "/app",
    });
    count++;
  }
  return count;
}

// Resolve destinatários do cliente (usuários ativos do portal ou o contato principal).
async function clientRecipients(admin: any, clientAccountId: string): Promise<{ email: string; name?: string }[]> {
  const { data: users } = await admin.from("client_users").select("email, name").eq("client_account_id", clientAccountId).eq("status", "active");
  const rec = (users ?? []).filter((u: any) => u.email).map((u: any) => ({ email: u.email, name: u.name ?? undefined }));
  if (rec.length) return rec;
  const { data: ca } = await admin.from("client_accounts").select("primary_contact_id").eq("id", clientAccountId).maybeSingle();
  if (ca?.primary_contact_id) {
    const { data: c } = await admin.from("contacts").select("email, name").eq("id", ca.primary_contact_id).maybeSingle();
    if (c?.email) return [{ email: c.email, name: c.name ?? undefined }];
  }
  return [];
}

async function processOverdueInvoices(admin: any): Promise<number> {
  const today = new Date().toISOString().slice(0, 10);
  const { data: invoices } = await admin
    .from("invoices")
    .select("id, org_id, client_account_id, number, amount, due_date, payment_link")
    .eq("status", "enviada")
    .lt("due_date", today)
    .limit(100);
  if (!invoices?.length) return 0;

  const { sendAndLogEmail } = await import("@/lib/email/send");
  const { invoiceEmail } = await import("@/lib/email/templates");
  let count = 0;
  for (const inv of invoices) {
    // Marca vencida antes (evita reprocessar no próximo cron).
    await admin.from("invoices").update({ status: "vencida" }).eq("id", inv.id);
    const recipients = await clientRecipients(admin, inv.client_account_id);
    if (recipients.length) {
      const { data: org } = await admin.from("orgs").select("name, settings").eq("id", inv.org_id).maybeSingle();
      const content = invoiceEmail({
        brand: (org?.settings as any)?.brand ?? {}, orgName: org?.name ?? "CRM",
        number: inv.number ?? "—", amount: Number(inv.amount), dueDate: inv.due_date ?? undefined,
        paymentUrl: inv.payment_link ?? undefined, overdue: true,
      });
      await sendAndLogEmail({ db: admin, orgId: inv.org_id, to: recipients, content, tags: ["cobranca"] });
    }
    await admin.from("notifications").insert({
      org_id: inv.org_id, type: "invoice_overdue", title: "Fatura vencida",
      body: `${inv.number ?? "Fatura"} venceu e foi marcada como vencida${recipients.length ? " (cobrança enviada)" : ""}.`,
      action_url: "/app/financeiro",
    });
    count++;
  }
  return count;
}

import type { SupabaseClient } from "@supabase/supabase-js";
import { runAdvisory, runContract, runCopilot, runLeadScoring, runProposal } from "@/lib/agents";
import { mapAgent } from "@/lib/db";
import type { Contact, Deal } from "@/lib/types";

// Execução de agente por cadência (cron), usando o client admin (service role).
// Sem sessão de usuário; por isso não usa RLS — o org_id é passado explicitamente.

const STUB: Contact = { id: "", name: "Contato", email: "", company: "", channel: "form" };

export async function runAgentForDeal(admin: SupabaseClient, kind: string, dealId: string, orgId: string) {
  const [{ data: d }, { data: ag }] = await Promise.all([
    admin.from("deals").select("*").eq("id", dealId).eq("org_id", orgId).maybeSingle(),
    admin.from("agents").select("*").eq("kind", kind).eq("org_id", orgId).maybeSingle(),
  ]);
  if (!d || !ag || !ag.enabled) return;

  const { data: stageRows } = await admin.from("stages").select("id,key").eq("pipeline_id", d.pipeline_id);
  const stageKey = (stageRows ?? []).find((s: any) => s.id === d.stage_id)?.key ?? "";
  let contact: Contact = STUB;
  if (d.contact_id) {
    const { data: c } = await admin.from("contacts").select("*").eq("id", d.contact_id).maybeSingle();
    if (c) contact = { id: c.id, name: c.name, email: c.email ?? "", phone: c.phone ?? undefined, company: c.company ?? "", role: c.job_title ?? undefined, channel: c.channel };
  }

  const deal: Deal = {
    id: d.id, title: d.title, pipelineId: d.pipeline_id, stageId: d.stage_id, stageKey,
    contactId: d.contact_id ?? "", amount: Number(d.amount), engagement: d.engagement ?? 0,
    lastTouch: d.last_touch ?? "", activities: [], tags: d.tags ?? [],
    temperature: d.temperature ?? undefined,
  };
  const agent = mapAgent(ag);

  let result: any;
  if (kind === "lead-scoring") {
    result = await runLeadScoring(deal, contact, agent);
    await admin.from("deals").update({ score: result.score, temperature: result.temperature, score_reason: result.reason }).eq("id", dealId);
  } else if (kind === "sales-copilot") result = await runCopilot(deal, contact, agent);
  else if (kind === "proposal") result = await runProposal(deal, contact, agent);
  else if (kind === "legal-contract") result = await runContract(deal, contact, agent);
  else result = await runAdvisory(deal, contact, agent);

  await admin.from("agent_runs").insert({
    org_id: orgId, agent_kind: kind, deal_id: dealId,
    input: { title: deal.title, stage: stageKey, via: "cadence" },
    output: result, source: result?.source ?? "n/a", model: agent.model,
  });
  await admin.from("notifications").insert({
    org_id: orgId, type: "cadence", title: `${agent.name} (cadência)`,
    body: `Executado automaticamente no deal "${deal.title}".`, deal_id: dealId, action_url: "/app",
  });
}

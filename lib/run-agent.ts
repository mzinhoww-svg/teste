import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getAgentByKind, getDealFull } from "@/lib/db";
import {
  runAdvisory, runContract, runCopilot, runLeadScoring, runProposal,
} from "@/lib/agents";
import { waMeLink } from "@/lib/whatsapp";
import type { Contact } from "@/lib/types";

// ==========================================================================
// Execução de agentes — usada pela rota manual (/api/agents/run) e pelas
// automações (mudança de estágio). Persiste resultado, auditoria e timeline.
// ==========================================================================

const STUB_CONTACT: Contact = { id: "", name: "Contato", email: "", company: "", channel: "form" };

/** Máximo de execuções de agentes por org por minuto (proteção de custo/abuso). */
const MAX_RUNS_PER_MINUTE = 20;

export class RateLimitError extends Error {
  constructor() { super("Limite de execuções atingido — aguarde um minuto."); }
}

export interface RunContext {
  orgId: string;
  userId: string | null;
  /** origem da execução: manual (botão) ou automação */
  via: "manual" | "automation";
}

export async function runAgentForDeal(kind: string, dealId: string, ctx: RunContext) {
  const supabase = createClient();

  // Rate limit por org (janela de 60s)
  const since = new Date(Date.now() - 60_000).toISOString();
  const { count } = await supabase
    .from("agent_runs")
    .select("id", { count: "exact", head: true })
    .eq("org_id", ctx.orgId)
    .gte("created_at", since);
  if ((count ?? 0) >= MAX_RUNS_PER_MINUTE) throw new RateLimitError();

  const [full, agent] = await Promise.all([getDealFull(dealId), getAgentByKind(kind)]);
  if (!full || !agent) throw new Error("Deal ou agente não encontrado");
  if (!agent.enabled) throw new Error("Agente inativo");

  const { deal } = full;
  const contact = full.contact ?? STUB_CONTACT;

  let result: any;
  const extra: Record<string, unknown> = {};

  switch (kind) {
    case "lead-scoring": {
      result = await runLeadScoring(deal, contact, agent);
      await supabase.from("deals").update({
        score: result.score, temperature: result.temperature, score_reason: result.reason,
      }).eq("id", dealId);
      break;
    }
    case "sales-copilot": {
      result = await runCopilot(deal, contact, agent);
      extra.waLink = waMeLink(contact.phone, result.message);
      // Registra a mensagem sugerida como rascunho (histórico omnichannel)
      await supabase.from("messages").insert({
        org_id: ctx.orgId, contact_id: contact.id || null, deal_id: dealId,
        channel: contact.channel === "whatsapp" ? "whatsapp" : "email",
        direction: "outbound", body: result.message, status: "draft",
      });
      break;
    }
    case "proposal": {
      result = await runProposal(deal, contact, agent);
      await supabase.from("proposals").insert({
        org_id: ctx.orgId, deal_id: dealId, items: result.items, subtotal: result.subtotal,
        discount_pct: result.discountPct, total: result.total, summary: result.summary,
        terms: result.terms, generated_by: result.generatedBy,
      });
      break;
    }
    case "legal-contract": {
      result = await runContract(deal, contact, agent);
      await supabase.from("contracts").insert({
        org_id: ctx.orgId, deal_id: dealId, reference: result.reference, title: result.title,
        clauses: result.clauses, value: result.value, signatories: result.signatories,
        signature_status: result.signatureStatus, signature_provider: result.signatureProvider,
        generated_by: result.generatedBy,
      });
      break;
    }
    default:
      result = await runAdvisory(deal, contact, agent);
  }

  await supabase.from("agent_runs").insert({
    org_id: ctx.orgId, agent_kind: kind, deal_id: dealId,
    input: { title: deal.title, stage: deal.stageKey, via: ctx.via },
    output: result, source: result?.source ?? "n/a", model: agent.model, created_by: ctx.userId,
  });

  await supabase.from("activities").insert({
    org_id: ctx.orgId, deal_id: dealId, type: "agent",
    summary: ctx.via === "automation" ? `${agent.name} executado automaticamente` : `${agent.name} executado`,
    author: agent.name,
  });

  return { ...result, ...extra };
}

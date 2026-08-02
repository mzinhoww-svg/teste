import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// F3.1 — Orquestrador de agentes por evento. Dado um evento do deal (hoje:
// mudança de estágio), decide qual agente rodar quando NÃO há automação
// explícita para aquele estágio, evitando disparo duplo. Gated por env
// ORCHESTRATOR_ENABLED (default off) — auto-executar LLM tem custo, então é opt-in.

/** Agente-padrão sugerido por chave de estágio (sem automação configurada). */
export function defaultAgentForStageKey(key: string): string | null {
  const k = (key ?? "").toLowerCase();
  if (["reuniao", "reunião", "meeting"].includes(k)) return "sales-copilot";
  if (["proposta", "proposal"].includes(k)) return "proposal";
  if (["negociacao", "negociação", "negotiation"].includes(k)) return "sales-copilot";
  if (["contrato", "contract"].includes(k)) return "legal-contract";
  if (["perdido", "lost", "descarte"].includes(k)) return "sales-feedback";
  return null;
}

export interface OrchestratorCtx {
  orgId: string; userId: string | null; stageKey: string | null;
}

/**
 * Reage à entrada num estágio. Só roda se ORCHESTRATOR_ENABLED=true e não houver
 * automação `stage_enter` já cobrindo o estágio (essa é tratada por moveDeal).
 */
export async function onStageChanged(db: SupabaseClient, dealId: string, stageId: string, ctx: OrchestratorCtx): Promise<{ ran: string | null }> {
  if (process.env.ORCHESTRATOR_ENABLED !== "true") return { ran: null };

  const { count } = await db.from("automations")
    .select("id", { count: "exact", head: true })
    .eq("trigger_stage_id", stageId).eq("trigger_type", "stage_enter").eq("enabled", true);
  if ((count ?? 0) > 0) return { ran: null }; // automação explícita já cuida

  const kind = defaultAgentForStageKey(ctx.stageKey ?? "");
  if (!kind) return { ran: null };

  try {
    const { runAgentForDeal } = await import("@/lib/run-agent");
    await runAgentForDeal(kind, dealId, { orgId: ctx.orgId, userId: ctx.userId, via: "automation" });
    return { ran: kind };
  } catch {
    return { ran: null };
  }
}

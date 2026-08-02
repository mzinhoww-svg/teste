import type { SupabaseClient } from "@supabase/supabase-js";

// I2 — Loop de feedback fechado (versão pragmática, sem re-treino de modelo):
// agentes de Aprendizado/Coaching GRAVAM aprendizados; todos os agentes LEEM os
// aprendizados recentes da org no prompt. Assim o que se aprende num deal passa a
// influenciar os próximos — sem alterar código.

/** Agentes cujo resultado alimenta a memória da org. */
const LEARNING_SOURCES = new Set(["sales-feedback", "coaching"]);

export function isLearningSource(kind: string): boolean {
  return LEARNING_SOURCES.has(kind);
}

/** Persiste um aprendizado (headline + 1º item) gerado por um agente advisory. */
export async function recordLearning(
  db: Pick<SupabaseClient, "from">,
  args: { orgId: string; sourceKind: string; dealId?: string | null; result: any },
): Promise<void> {
  try {
    const headline = String(args.result?.headline ?? "").trim();
    const first = Array.isArray(args.result?.items) ? String(args.result.items[0] ?? "").trim() : "";
    const learning = [headline, first].filter(Boolean).join(" — ").slice(0, 400);
    if (!learning) return;
    await db.from("agent_learnings").insert({
      org_id: args.orgId, source_kind: args.sourceKind, deal_id: args.dealId ?? null,
      learning, confidence: "media",
    });
  } catch { /* memória é best-effort */ }
}

/** Bloco de prompt com os aprendizados recentes aplicáveis da org. */
export async function buildLearningsPromptBlock(
  db: Pick<SupabaseClient, "from">, orgId: string,
): Promise<{ block: string | null; count: number }> {
  try {
    const { data } = await db
      .from("agent_learnings")
      .select("learning, source_kind, created_at")
      .eq("org_id", orgId).eq("applied", true)
      .order("created_at", { ascending: false })
      .limit(8);
    if (!data?.length) return { block: null, count: 0 };
    const lines = data.map((l: any) => `- ${l.learning}`);
    const block = [
      "APRENDIZADOS RECENTES DESTA OPERAÇÃO (memória do CRM — leve em conta, mas",
      "trate como hipótese quando conflitar com a evidência do deal atual):",
      ...lines,
    ].join("\n");
    return { block, count: data.length };
  } catch {
    return { block: null, count: 0 };
  }
}

import type { SupabaseClient } from "@supabase/supabase-js";

// F2 — Injeta no prompt os fatos JÁ coletados em lead_enrichment (CNPJ/BrasilAPI,
// buscas recomendadas etc). Antes, o ENRICHMENT_BLOCK só instruía o modelo a
// "buscar", mas nada era injetado — a camada de enriquecimento era promessa.
// Agora as evidências reais entram no prompt em ambos os runtimes (manual/cron).

export interface EnrichmentInjection { block: string | null; used: boolean; count: number }

export async function buildEnrichmentPromptBlock(
  db: Pick<SupabaseClient, "from">, orgId: string, dealId: string,
): Promise<EnrichmentInjection> {
  try {
    const { data } = await db
      .from("lead_enrichment")
      .select("source_label, extracted_fact, confidence, relevance")
      .eq("org_id", orgId).eq("deal_id", dealId)
      .order("created_at", { ascending: false })
      .limit(25);
    if (!data?.length) return { block: null, used: false, count: 0 };
    const lines = data.map((f: any) => `- [${f.confidence ?? "?"}·${f.relevance ?? "-"}] ${f.source_label}: ${f.extracted_fact}`);
    const block = [
      "EVIDÊNCIAS DE ENRIQUECIMENTO JÁ COLETADAS NO CRM (fonte real — use como base,",
      "não reinvente nem contradiga sem sinalizar; marque confiança quando citar):",
      ...lines,
    ].join("\n");
    return { block, used: true, count: data.length };
  } catch {
    return { block: null, used: false, count: 0 };
  }
}

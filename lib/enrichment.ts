import "server-only";

// Executor de enriquecimento. Faz chamadas a APIs públicas GRATUITAS (BrasilAPI
// para CNPJ/CEP; sem chave) e devolve fatos normalizados. Nenhuma API paga.
// A persistência em lead_enrichment é feita pela server action enrichDeal.

const BASE = process.env.BRASILAPI_BASE_URL ?? "https://brasilapi.com.br/api";

export interface EnrichmentFact {
  source_type: string;
  source_label: string;
  source_url: string | null;
  extracted_fact: string;
  confidence: "high" | "medium" | "low";
  relevance: string;
}

const onlyDigits = (s: string) => (s ?? "").replace(/\D/g, "");

/** Consulta CNPJ na BrasilAPI. Retorna fatos ou [] em qualquer falha. */
export async function fetchCNPJ(cnpjRaw: string): Promise<EnrichmentFact[]> {
  const cnpj = onlyDigits(cnpjRaw);
  if (cnpj.length !== 14) return [];
  try {
    const res = await fetch(`${BASE}/cnpj/v1/${cnpj}`, { headers: { accept: "application/json" } });
    if (!res.ok) return [];
    const d = (await res.json()) as any;
    const url = `${BASE}/cnpj/v1/${cnpj}`;
    const facts: EnrichmentFact[] = [];
    const push = (fact: string, relevance: string) =>
      facts.push({ source_type: "public_registry", source_label: "BrasilAPI · CNPJ", source_url: url, extracted_fact: fact, confidence: "high", relevance });

    if (d.razao_social) push(`Razão social: ${d.razao_social}`, "legal");
    if (d.nome_fantasia) push(`Nome fantasia: ${d.nome_fantasia}`, "company_context");
    if (d.descricao_situacao_cadastral) push(`Situação cadastral: ${d.descricao_situacao_cadastral}`, "legal");
    if (d.cnae_fiscal_descricao) push(`Atividade principal: ${d.cnae_fiscal_descricao}`, "company_context");
    if (d.municipio || d.uf) push(`Localização: ${[d.municipio, d.uf].filter(Boolean).join("/")}`, "company_context");
    if (d.logradouro) push(`Endereço: ${[d.logradouro, d.numero, d.bairro, d.cep].filter(Boolean).join(", ")}`, "legal");
    if (d.porte) push(`Porte: ${d.porte}`, "company_context");
    if (Array.isArray(d.qsa) && d.qsa.length) push(`Sócios/administração: ${d.qsa.slice(0, 5).map((s: any) => s.nome_socio).filter(Boolean).join("; ")}`, "decision_maker");
    return facts;
  } catch {
    return [];
  }
}

/** Buscas recomendadas quando não há busca automática. */
export function recommendedSearches(company?: string | null, contact?: string | null): EnrichmentFact[] {
  const facts: EnrichmentFact[] = [];
  const add = (q: string) => facts.push({
    source_type: "other", source_label: "Busca recomendada", source_url: null,
    extracted_fact: q, confidence: "low", relevance: "company_context",
  });
  if (company) {
    for (const suf of ["site oficial", "LinkedIn", "diretoria", "evento", "podcast", "Mato Grosso comunicação"]) add(`"${company}" ${suf}`);
  }
  if (contact) add(`"${contact}"${company ? ` "${company}"` : ""} LinkedIn`);
  return facts;
}

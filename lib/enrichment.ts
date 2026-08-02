import "server-only";
import { callLLM, extractJson, hasLiveAI } from "./ai";

// Executor de enriquecimento. Faz chamadas a APIs públicas GRATUITAS (BrasilAPI
// para CNPJ/CEP; sem chave), infere um perfil comercial por IA e devolve fatos
// normalizados. A persistência em lead_enrichment é feita pela action enrichDeal.

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

/**
 * Enriquecimento por IA: infere um perfil comercial ÚTIL a partir de empresa +
 * contato (segmento, porte, estrutura de decisão, fit de produto Reiners, sinais).
 * Não inventa dados legais (isso vem do CNPJ). [] em qualquer falha/sem IA.
 */
export async function llmEnrich(company?: string | null, contact?: string | null, context?: string): Promise<EnrichmentFact[]> {
  if (!hasLiveAI() || (!company && !contact)) return [];
  try {
    const text = await callLLM({
      system:
        `Você enriquece leads B2B para a Reiners Media (comunicação institucional / estúdio — ` +
        `vende posicionamento e presença institucional CONTÍNUA, não posts nem social media). ` +
        `A partir do nome da empresa e do contato, infira um perfil comercial realista e acionável. ` +
        `NÃO invente dados legais (CNPJ, endereço, razão social). Foque em: segmento provável, porte ` +
        `estimado, estrutura de decisão, fit de produto Reiners e sinais de abordagem. ` +
        `Responda SOMENTE com JSON {"facts":[{"fact":string,"relevance":"company_context|decision_maker|product_fit|signal","confidence":"medium|low"}]} ` +
        `com 4 a 6 itens curtos, em português.`,
      prompt: JSON.stringify({ empresa: company ?? "", contato: contact ?? "", contexto: context ?? "" }),
      maxTokens: 700,
    });
    const parsed = extractJson<{ facts: { fact: string; relevance?: string; confidence?: string }[] }>(text);
    if (!parsed?.facts?.length) return [];
    return parsed.facts.slice(0, 6).filter((f) => f?.fact).map((f) => ({
      source_type: "ai_inference",
      source_label: "IA · perfil do lead",
      source_url: null,
      extracted_fact: String(f.fact),
      confidence: f.confidence === "medium" ? "medium" : "low",
      relevance: f.relevance ?? "company_context",
    }));
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

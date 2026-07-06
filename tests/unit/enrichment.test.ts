import { describe, it, expect } from "vitest";
import { fetchCNPJ, recommendedSearches } from "@/lib/enrichment";

describe("fetchCNPJ", () => {
  it("retorna [] para CNPJ com tamanho inválido (sem rede)", async () => {
    expect(await fetchCNPJ("123")).toEqual([]);
    expect(await fetchCNPJ("")).toEqual([]);
  });
});

describe("recommendedSearches", () => {
  it("gera buscas por empresa e contato", () => {
    const out = recommendedSearches("Sicredi", "Fulano");
    expect(out.length).toBeGreaterThan(0);
    expect(out.some((f) => f.extracted_fact.includes("Sicredi"))).toBe(true);
    expect(out.some((f) => f.extracted_fact.includes("Fulano"))).toBe(true);
    for (const f of out) expect(f.confidence).toBe("low");
  });
  it("sem empresa nem contato, retorna vazio", () => {
    expect(recommendedSearches(null, null)).toEqual([]);
  });
});

import { describe, it, expect } from "vitest";
import { composeAgentPrompt, REINERS_CONTEXT, ENRICHMENT_BLOCK, OUTPUT_FORMAT } from "@/lib/agents/reiners-context";
import { PLATFORM_AGENTS, PLATFORM_AGENT_BY_KIND } from "@/lib/agents/catalog";

describe("composeAgentPrompt", () => {
  it("injeta contexto Reiners, enriquecimento e formato de saída", () => {
    const out = composeAgentPrompt("Instrução específica do agente.");
    expect(out).toContain(REINERS_CONTEXT.slice(0, 20));
    expect(out).toContain(ENRICHMENT_BLOCK.slice(0, 20));
    expect(out).toContain("Instrução específica do agente.");
    expect(out).toContain(OUTPUT_FORMAT.slice(0, 20));
  });
  it("não usa linguagem de social media como proposta de valor", () => {
    // O contexto proíbe posicionar como 'posts/feed bonito'.
    expect(REINERS_CONTEXT.toLowerCase()).toContain("posicionamento contínuo");
  });
});

describe("catálogo de agentes da plataforma", () => {
  it("tem 12 agentes (9 originais + 3 de gestão) com kinds únicos", () => {
    expect(PLATFORM_AGENTS).toHaveLength(12);
    const kinds = new Set(PLATFORM_AGENTS.map((a) => a.kind));
    expect(kinds.size).toBe(PLATFORM_AGENTS.length);
    // novos agentes de gestão (F3.4)
    for (const kind of ["pipeline-health", "reactivation", "data-quality"]) {
      expect(kinds.has(kind)).toBe(true);
    }
  });
  it("mapeia os kinds usados no runtime", () => {
    for (const kind of ["lead-scoring", "proposal", "legal-contract", "sales-copilot"]) {
      expect(PLATFORM_AGENT_BY_KIND.get(kind)).toBeTruthy();
    }
  });
  it("todo agente tem prompt não vazio e triggers", () => {
    for (const a of PLATFORM_AGENTS) {
      expect(a.prompt.trim().length).toBeGreaterThan(30);
      expect(a.triggers.length).toBeGreaterThan(0);
    }
  });
});

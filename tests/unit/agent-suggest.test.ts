import { describe, it, expect } from "vitest";
import { suggestAgentKind, AGENT_LABEL_BY_KIND } from "@/lib/agent-suggest";

describe("suggestAgentKind", () => {
  it("contrato → agente de contratos", () => {
    expect(suggestAgentKind({ stageKey: "contrato" }).kind).toBe("legal-contract");
  });
  it("reunião/proposta → agente de propostas", () => {
    expect(suggestAgentKind({ stageKey: "proposta" }).kind).toBe("proposal");
  });
  it("decisor + orçamento → priorização", () => {
    expect(suggestAgentKind({ hasDecisor: true, hasBudget: true }).kind).toBe("lead-scoring");
  });
  it("lead incompleto → nutrição", () => {
    expect(suggestAgentKind({ complete: false }).kind).toBe("lead-nurturing");
  });
  it("lead completo sem estágio avançado → copiloto", () => {
    expect(suggestAgentKind({ complete: true }).kind).toBe("sales-copilot");
  });
  it("todo kind sugerido tem rótulo legível", () => {
    for (const stage of ["contrato", "proposta", "perdido", ""]) {
      const { kind } = suggestAgentKind({ stageKey: stage });
      expect(AGENT_LABEL_BY_KIND[kind]).toBeTruthy();
    }
  });
});

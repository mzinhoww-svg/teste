// Sugestão do agente ideal para o momento do lead. Usado na criação de lead e
// na central de notificações. Mapeamento alinhado ao processo comercial.

export interface AgentSuggestion { kind: string; reason: string }

export function suggestAgentKind(opts: {
  stageKey?: string; hasDecisor?: boolean; hasBudget?: boolean; complete?: boolean;
}): AgentSuggestion {
  const s = opts.stageKey ?? "";
  if (["contrato", "contract", "ganho", "won"].includes(s))
    return { kind: "legal-contract", reason: "Deal em contrato — preparar minuta e assinatura." };
  if (["proposta", "proposal", "negociacao", "negociação", "negotiation", "reuniao", "reunião", "meeting"].includes(s))
    return { kind: "proposal", reason: "Reunião/proposta — montar escopo e proposta com diagnóstico." };
  if (["perdido", "lost", "descarte"].includes(s))
    return { kind: "sales-feedback", reason: "Deal perdido — extrair aprendizado e causa raiz." };
  if (opts.hasDecisor && opts.hasBudget)
    return { kind: "lead-scoring", reason: "Sinais fortes (decisor + orçamento) — priorizar." };
  if (!opts.complete)
    return { kind: "lead-nurturing", reason: "Lead incompleto — enriquecer e qualificar antes de avançar." };
  return { kind: "sales-copilot", reason: "Lead pronto para abordagem — gerar próxima mensagem." };
}

// Rótulos legíveis dos agentes por kind.
export const AGENT_LABEL_BY_KIND: Record<string, string> = {
  "lead-nurturing": "Inteligência e Nutrição",
  "lead-scoring": "Priorização Comercial",
  "sales-copilot": "Copiloto Comercial",
  proposal: "Propostas e Escopo",
  "legal-contract": "Contratos e Assinatura",
  activities: "Cadência e SLA",
  coaching: "Coach Comercial",
  "sales-feedback": "Aprendizado Comercial",
  "support-copilot": "Onboarding e Sucesso",
};

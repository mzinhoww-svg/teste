// Lógica de cada agente de IA. Cada função tenta o Claude API e, em qualquer
// falha (sem chave, timeout, erro), usa uma heurística determinística.

import { callLLM, extractJson, hasLiveAI } from "./ai";
import type { Agent, Contact, Contract, Deal, Proposal } from "./types";

export interface ScoreResult {
  score: number;
  temperature: "hot" | "warm" | "cold";
  reason: string;
  source: "llm" | "heuristic";
}

export interface CopilotResult {
  nextAction: string;
  message: string;
  channel: string;
  source: "llm" | "heuristic";
}

export interface ProposalResult extends Proposal {
  source: "llm" | "heuristic";
}

export interface ContractResult extends Contract {
  source: "llm" | "heuristic";
}

function tempFromScore(score: number): "hot" | "warm" | "cold" {
  if (score >= 75) return "hot";
  if (score >= 45) return "warm";
  return "cold";
}

function daysSince(iso?: string | null): number {
  if (!iso) return 0;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 0;
  const now = Date.now();
  return Math.max(0, Math.round((now - then) / 86_400_000));
}

// ---------------------------------------------------------------------------
// Lead Scoring Agent
// ---------------------------------------------------------------------------

export async function runLeadScoring(
  deal: Deal,
  contact: Contact,
  agent: Agent,
): Promise<ScoreResult> {
  if (hasLiveAI() && agent.enabled) {
    try {
      const text = await callLLM({
        system: `Você é o "${agent.name}" de um CRM. ${agent.instructions} Responda SOMENTE com JSON no formato {"score": number, "temperature": "hot|warm|cold", "reason": string}.`,
        prompt: JSON.stringify({
          deal: { title: deal.title, amount: deal.amount, stage: deal.stageKey, engagement: deal.engagement, diasSemContato: daysSince(deal.lastTouch), tags: deal.tags },
          contact: { company: contact.company, role: contact.role, channel: contact.channel },
        }),
        maxTokens: 400,
      });
      const parsed = extractJson<{ score: number; temperature: "hot" | "warm" | "cold"; reason: string }>(text);
      if (parsed && typeof parsed.score === "number") {
        return { ...parsed, source: "llm" };
      }
    } catch {
      // cai no heurístico
    }
  }

  // Heurística: engajamento (40%) + valor normalizado (30%) + recência (30%)
  const valueSignal = Math.min(100, (deal.amount / 320000) * 100);
  const recency = Math.max(0, 100 - daysSince(deal.lastTouch) * 4);
  const score = Math.round(deal.engagement * 0.4 + valueSignal * 0.3 + recency * 0.3);
  const temperature = tempFromScore(score);
  const reason =
    `Engajamento ${deal.engagement}/100, ticket R$${(deal.amount / 1000).toFixed(0)}k, ` +
    `${daysSince(deal.lastTouch)} dia(s) sem contato. ` +
    (temperature === "hot" ? "Priorizar agora." : temperature === "warm" ? "Nutrir e agendar próximo passo." : "Reativar com cadência automatizada.");
  return { score, temperature, reason, source: "heuristic" };
}

// ---------------------------------------------------------------------------
// Sales Copilot
// ---------------------------------------------------------------------------

const channelLabel: Record<Contact["channel"], string> = {
  whatsapp: "WhatsApp", email: "E-mail", voice: "Ligação", portal: "Portal", form: "Formulário",
};

export async function runCopilot(
  deal: Deal,
  contact: Contact,
  agent: Agent,
): Promise<CopilotResult> {
  if (hasLiveAI() && agent.enabled) {
    try {
      const text = await callLLM({
        system: `Você é o "${agent.name}". ${agent.instructions} Responda SOMENTE com JSON {"nextAction": string, "message": string, "channel": string}.`,
        prompt: JSON.stringify({
          deal: { title: deal.title, stage: deal.stageId, amount: deal.amount, lastActivities: deal.activities.slice(-2) },
          contact: { name: contact.name, company: contact.company, role: contact.role, channel: contact.channel },
        }),
        maxTokens: 500,
      });
      const parsed = extractJson<{ nextAction: string; message: string; channel: string }>(text);
      if (parsed && parsed.message) return { ...parsed, source: "llm" };
    } catch {
      // fallback
    }
  }

  const firstName = contact.name.split(" ")[0];
  const byStage: Record<string, { action: string; msg: string }> = {
    meeting: {
      action: "Qualificar interesse e agendar descoberta de 20 min.",
      msg: `Oi ${firstName}, vi que a ${contact.company} demonstrou interesse. Consigo te mostrar em 20 min como resolver isso — quinta 15h funciona?`,
    },
    proposal: {
      action: "Enviar proposta personalizada e marcar revisão conjunta.",
      msg: `${firstName}, preparei a proposta da ${contact.company} com os tiers que conversamos. Posso te guiar por ela numa call rápida amanhã?`,
    },
    negotiation: {
      action: "Fechar condições comerciais e definir data de assinatura.",
      msg: `${firstName}, alinhando os últimos pontos: consigo aprovar a condição de volume se fecharmos até sexta. Fazemos isso?`,
    },
    contract: {
      action: "Enviar contrato para assinatura digital e confirmar prazos.",
      msg: `${firstName}, contrato da ${contact.company} pronto para assinatura digital. Te envio o link agora — conseguimos assinar ainda hoje?`,
    },
    won: {
      action: "Iniciar handoff para Customer Success e onboarding.",
      msg: `${firstName}, que ótimo ter a ${contact.company} com a gente! Já aciono o time de CS para o onboarding — te apresento a pessoa responsável ainda hoje.`,
    },
  };
  const rec = byStage[deal.stageKey] ?? byStage.proposal;
  return { nextAction: rec.action, message: rec.msg, channel: channelLabel[contact.channel], source: "heuristic" };
}

// ---------------------------------------------------------------------------
// Sales Proposal Agent
// ---------------------------------------------------------------------------

const MAX_DISCOUNT = 0.15;

export async function runProposal(
  deal: Deal,
  contact: Contact,
  agent: Agent,
): Promise<ProposalResult> {
  if (hasLiveAI() && agent.enabled) {
    try {
      const text = await callLLM({
        system: `Você é o "${agent.name}". ${agent.instructions} Teto de desconto ${MAX_DISCOUNT * 100}%. Responda SOMENTE com JSON {"items":[{"name":string,"qty":number,"unitPrice":number}],"discountPct":number,"summary":string,"terms":string}.`,
        prompt: JSON.stringify({ deal: { title: deal.title, amount: deal.amount, tags: deal.tags }, contact: { company: contact.company, role: contact.role } }),
        maxTokens: 800,
      });
      const parsed = extractJson<{ items: { name: string; qty: number; unitPrice: number }[]; discountPct: number; summary: string; terms: string }>(text);
      if (parsed && Array.isArray(parsed.items) && parsed.items.length) {
        const subtotal = parsed.items.reduce((s, i) => s + i.qty * i.unitPrice, 0);
        const discountPct = Math.min(MAX_DISCOUNT * 100, Math.max(0, parsed.discountPct));
        const total = Math.round(subtotal * (1 - discountPct / 100));
        return { dealId: deal.id, items: parsed.items, subtotal, discountPct, total, summary: parsed.summary, terms: parsed.terms, generatedBy: agent.name, source: "llm" };
      }
    } catch {
      // fallback
    }
  }

  // Heurística: decompõe o valor do deal em plataforma + implantação + suporte.
  const platform = Math.round(deal.amount * 0.62);
  const setup = Math.round(deal.amount * 0.23);
  const support = Math.round(deal.amount * 0.15);
  const items = [
    { name: "Plataforma CRM AI Studio — assinatura anual", qty: 1, unitPrice: platform },
    { name: "Implantação e configuração de agentes", qty: 1, unitPrice: setup },
    { name: "Suporte e sucesso do cliente (12 meses)", qty: 1, unitPrice: support },
  ];
  const subtotal = items.reduce((s, i) => s + i.qty * i.unitPrice, 0);
  const discountPct = deal.amount > 150000 ? 12 : deal.amount > 80000 ? 8 : 5;
  const total = Math.round(subtotal * (1 - discountPct / 100));
  return {
    dealId: deal.id, items, subtotal, discountPct, total, generatedBy: agent.name, source: "heuristic",
    summary: `Proposta para ${contact.company}: plataforma, implantação e suporte com desconto de ${discountPct}% por volume. Retorno esperado em até 20 dias de uso.`,
    terms: "Validade: 15 dias. Pagamento: 12x sem juros ou anual à vista. Inclui SLA de suporte e onboarding assistido.",
  };
}

// ---------------------------------------------------------------------------
// Agente Jurídico / de Contratos
// ---------------------------------------------------------------------------

const SIGNATURE_PROVIDER = "e-signature (ICP-Brasil)";

function contractValue(deal: Deal): number {
  // Espelha o valor final da proposta (mesma política de desconto).
  const discountPct = deal.amount > 150000 ? 12 : deal.amount > 80000 ? 8 : 5;
  return Math.round(deal.amount * (1 - discountPct / 100));
}

export async function runContract(
  deal: Deal,
  contact: Contact,
  agent: Agent,
): Promise<ContractResult> {
  const value = contractValue(deal);
  const reference = `CT-${deal.id.toUpperCase()}-2026`;

  if (hasLiveAI() && agent.enabled) {
    try {
      const text = await callLLM({
        system: `Você é o "${agent.name}". ${agent.instructions} Responda SOMENTE com JSON {"title":string,"clauses":[{"heading":string,"body":string}],"signatories":[{"name":string,"role":string,"party":"contratante|contratada","email":string}]}.`,
        prompt: JSON.stringify({
          deal: { title: deal.title, value, tags: deal.tags },
          contratante: { company: contact.company, signatory: contact.name, role: contact.role, email: contact.email },
          contratada: { company: "CRM AI Studio Ltda." },
        }),
        maxTokens: 1200,
      });
      const parsed = extractJson<{ title: string; clauses: { heading: string; body: string }[]; signatories: Contract["signatories"] }>(text);
      if (parsed && Array.isArray(parsed.clauses) && parsed.clauses.length) {
        return {
          dealId: deal.id, reference, title: parsed.title, clauses: parsed.clauses, value,
          signatories: parsed.signatories?.length ? parsed.signatories : defaultSignatories(contact),
          signatureStatus: "enviado", signatureProvider: SIGNATURE_PROVIDER, generatedBy: agent.name, source: "llm",
        };
      }
    } catch {
      // fallback
    }
  }

  // Heurística: contrato padronizado, personalizado com dados do cliente.
  const clauses = [
    { heading: "1. Objeto", body: `Contratação da plataforma CRM AI Studio e serviços de implantação de agentes de IA para a ${contact.company}, conforme proposta comercial ${reference.replace("CT", "PROP")}.` },
    { heading: "2. Valor e pagamento", body: `Valor total de R$ ${value.toLocaleString("pt-BR")}, em 12 parcelas mensais ou à vista com desconto. Reajuste anual pelo IPCA.` },
    { heading: "3. Vigência", body: "12 (doze) meses a contar da assinatura, renovável automaticamente por iguais períodos salvo denúncia com 30 dias de antecedência." },
    { heading: "4. Nível de serviço (SLA)", body: "Disponibilidade de 99,5% e suporte com resposta em até 8 horas úteis, conforme política de sucesso do cliente." },
    { heading: "5. Proteção de dados (LGPD)", body: "As partes tratam dados pessoais conforme a Lei 13.709/2018, adotando medidas técnicas e organizacionais de segurança e sigilo." },
    { heading: "6. Confidencialidade", body: "Informações trocadas são confidenciais e não podem ser divulgadas a terceiros sem autorização por escrito." },
    { heading: "7. Foro", body: `Fica eleito o foro da comarca de São Paulo/SP para dirimir controvérsias oriundas deste contrato.` },
  ];

  return {
    dealId: deal.id, reference, title: `Contrato de Prestação de Serviços — ${contact.company}`,
    clauses, value, signatories: defaultSignatories(contact),
    signatureStatus: "enviado", signatureProvider: SIGNATURE_PROVIDER, generatedBy: agent.name, source: "heuristic",
  };
}

function defaultSignatories(contact: Contact): Contract["signatories"] {
  return [
    { name: contact.name, role: contact.role ?? "Representante", party: "contratante", email: contact.email },
    { name: "Diretoria Comercial", role: "Representante legal", party: "contratada", email: "juridico@crmaistudio.com" },
  ];
}

// ---------------------------------------------------------------------------
// Agentes consultivos: Nutrição, Atividades, Coaching, Feedback, Atendimento
// Retornam um cabeçalho + lista de itens acionáveis.
// ---------------------------------------------------------------------------

export interface AdvisoryResult {
  headline: string;
  items: string[];
  source: "llm" | "heuristic";
}

export async function runAdvisory(deal: Deal, contact: Contact, agent: Agent): Promise<AdvisoryResult> {
  if (hasLiveAI() && agent.enabled) {
    try {
      const text = await callLLM({
        system: `Você é o "${agent.name}" de um CRM. ${agent.instructions} Responda SOMENTE com JSON {"headline": string, "items": string[]} com 3 a 5 itens curtos e acionáveis, em português.`,
        prompt: JSON.stringify({
          deal: { title: deal.title, stage: deal.stageKey, amount: deal.amount, engagement: deal.engagement, diasSemContato: daysSince(deal.lastTouch), tags: deal.tags, ultimasAtividades: deal.activities.slice(0, 3) },
          contact: { name: contact.name, company: contact.company, role: contact.role, channel: contact.channel },
        }),
        maxTokens: 600,
      });
      const parsed = extractJson<{ headline: string; items: string[] }>(text);
      if (parsed && Array.isArray(parsed.items) && parsed.items.length) {
        return { headline: parsed.headline, items: parsed.items.slice(0, 6), source: "llm" };
      }
    } catch {
      // fallback
    }
  }
  return heuristicAdvisory(deal, contact, agent);
}

function heuristicAdvisory(deal: Deal, contact: Contact, agent: Agent): AdvisoryResult {
  return { ...heuristicAdvisoryBase(deal, contact, agent), source: "heuristic" };
}

function heuristicAdvisoryBase(deal: Deal, contact: Contact, agent: Agent): Omit<AdvisoryResult, "source"> {
  const dias = daysSince(deal.lastTouch);
  const first = contact.name.split(" ")[0];
  switch (agent.id) {
    case "lead-nurturing":
      return {
        headline: `Enriquecimento de ${contact.company || contact.name}`,
        items: [
          `Empresa: ${contact.company || "—"} · Contato: ${contact.name} (${contact.role || "cargo n/d"}).`,
          `Canal preferido detectado: ${contact.channel}. Priorizar contato por esse canal.`,
          deal.engagement >= 70 ? "Sinal de intenção ALTO — encaminhar como lead quente ao SDR." : "Sinal de intenção médio — incluir em cadência de nutrição.",
          "Verificar duplicidade por e-mail/telefone antes de criar novo card.",
        ],
      };
    case "activities":
      return {
        headline: `Plano de follow-up (${dias} dia(s) sem contato)`,
        items: [
          dias > 5 ? `Atenção: deal parado há ${dias} dias — acima do SLA. Follow-up hoje.` : `Próximo follow-up sugerido em 2 dias.`,
          `Tarefa: registrar resumo da última interação com ${first}.`,
          `Tarefa: confirmar próximo passo e data com o cliente.`,
          deal.amount > 100000 ? "Alta prioridade (ticket alto) — acionar gerente." : "Prioridade normal.",
        ],
      };
    case "coaching":
      return {
        headline: `Coaching para o deal ${deal.title}`,
        items: [
          `Estágio ${deal.stageKey}: reforce prova de valor antes de avançar.`,
          "Use pergunta de descoberta para mapear critério de decisão e orçamento.",
          "Antecipe a objeção de preço com ancoragem de ROI (retorno em ~20 dias).",
          "Confirme os próximos passos por escrito ao final da call.",
        ],
      };
    case "sales-feedback":
      return {
        headline: deal.stageKey === "won" ? "Registro de ganho" : deal.stageKey === "lost" ? "Registro de perda" : "Feedback em andamento",
        items: [
          `Resultado: ${deal.stageKey === "won" ? "GANHO" : deal.stageKey === "lost" ? "PERDIDO" : "em aberto"}.`,
          `Ticket: R$${(deal.amount / 1000).toFixed(0)}k · Engajamento final: ${deal.engagement}/100.`,
          deal.engagement >= 70 ? "Alto engajamento reforça peso desse critério no scoring." : "Baixo engajamento: revisar critério de qualificação para casos assim.",
          "Sugestão: ajustar ICP com base neste desfecho.",
        ],
      };
    case "support-copilot":
      return {
        headline: `Handoff e onboarding de ${contact.company || contact.name}`,
        items: [
          `Criar card de onboarding com contexto completo do deal ${deal.title}.`,
          `Apresentar ${first} ao CS responsável em até 24h.`,
          "Definir plano de implementação com marcos e SLAs.",
          "Agendar kickoff e configurar dashboard de acompanhamento.",
        ],
      };
    default:
      return { headline: agent.name, items: ["Sem recomendação específica para este estágio."] };
  }
}

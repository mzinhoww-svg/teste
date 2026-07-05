import type { Agent, Contact, Deal, Pipeline } from "./types";

// Dados-semente que fazem o app funcionar sem banco de dados.
// Em produção, troque este módulo por um store real (Postgres/Supabase).
//
// Estágios e agentes espelham a arquitetura do CRM AI Studio (Pipefy).

export const pipelines: Pipeline[] = [
  {
    id: "sales",
    name: "Funil Comercial",
    area: "sales",
    stages: [
      { id: "meeting", name: "Reunião", order: 0, accent: "#6366f1" },
      { id: "proposal", name: "Proposta", order: 1, accent: "#8b5cf6" },
      { id: "negotiation", name: "Negociação", order: 2, accent: "#ec4899" },
      { id: "contract", name: "Contrato", order: 3, accent: "#f59e0b" },
      { id: "won", name: "Ganho", order: 4, accent: "#10b981" },
      { id: "lost", name: "Descarte", order: 5, accent: "#94a3b8" },
    ],
  },
];

export const contacts: Contact[] = [
  { id: "c1", name: "Ana Ribeiro", email: "ana@northwind.com.br", company: "Northwind Log", role: "Head de Operações", channel: "whatsapp", phone: "+55 11 90000-0001" },
  { id: "c2", name: "Bruno Costa", email: "bruno@lumina.io", company: "Lumina SaaS", role: "CEO", channel: "email" },
  { id: "c3", name: "Carla Mendes", email: "carla@vertex.com", company: "Vertex Retail", role: "Diretora Comercial", channel: "voice", phone: "+55 21 90000-0003" },
  { id: "c4", name: "Diego Alves", email: "diego@fintrust.com.br", company: "FinTrust", role: "CFO", channel: "portal" },
  { id: "c5", name: "Elisa Faria", email: "elisa@medcare.com", company: "MedCare Health", role: "COO", channel: "form" },
  { id: "c6", name: "Felipe Nunes", email: "felipe@buildco.com", company: "BuildCo", role: "Gerente de Compras", channel: "whatsapp", phone: "+55 31 90000-0006" },
];

export const deals: Deal[] = [
  {
    id: "d1", title: "Northwind — Plataforma de Automação", pipelineId: "sales", stageId: "meeting",
    contactId: "c1", amount: 84000, engagement: 82, lastTouch: "2026-07-02", tags: ["enterprise", "logística"],
    activities: [
      { id: "a1", at: "2026-06-28", type: "whatsapp", summary: "Respondeu interesse em demo", author: "Ana Ribeiro" },
      { id: "a2", at: "2026-07-02", type: "meeting", summary: "Demo técnica realizada — 4 stakeholders", author: "SDR" },
    ],
  },
  {
    id: "d2", title: "Lumina — Expansão de Licenças", pipelineId: "sales", stageId: "proposal",
    contactId: "c2", amount: 156000, engagement: 74, lastTouch: "2026-07-03", tags: ["upsell", "saas"],
    activities: [
      { id: "a3", at: "2026-07-01", type: "email", summary: "Solicitou proposta com 3 tiers", author: "Bruno Costa" },
    ],
  },
  {
    id: "d3", title: "Vertex — Rollout Multi-loja", pipelineId: "sales", stageId: "negotiation",
    contactId: "c3", amount: 320000, engagement: 91, lastTouch: "2026-07-04", tags: ["enterprise", "varejo"],
    activities: [
      { id: "a4", at: "2026-07-04", type: "call", summary: "Negociando desconto por volume", author: "AE" },
    ],
  },
  {
    id: "d4", title: "FinTrust — Piloto de Compliance", pipelineId: "sales", stageId: "meeting",
    contactId: "c4", amount: 45000, engagement: 38, lastTouch: "2026-06-20", tags: ["fintech", "piloto"],
    activities: [
      { id: "a5", at: "2026-06-20", type: "form", summary: "Preencheu formulário no site", author: "Diego Alves" },
    ],
  },
  {
    id: "d5", title: "MedCare — Onboarding Digital", pipelineId: "sales", stageId: "contract",
    contactId: "c5", amount: 62000, engagement: 55, lastTouch: "2026-06-29", tags: ["saúde"],
    activities: [
      { id: "a6", at: "2026-06-29", type: "form", summary: "Baixou whitepaper e pediu contato", author: "Elisa Faria" },
    ],
  },
  {
    id: "d6", title: "BuildCo — Gestão de Fornecedores", pipelineId: "sales", stageId: "proposal",
    contactId: "c6", amount: 98000, engagement: 67, lastTouch: "2026-07-01", tags: ["construção"],
    activities: [
      { id: "a7", at: "2026-07-01", type: "whatsapp", summary: "Confirmou budget para Q3", author: "Felipe Nunes" },
    ],
  },
];

// Roster completo de agentes do CRM AI Studio. Os três marcados com `runnable`
// têm execução ao vivo via rota de API (usam Claude API ou heurística).
export const agents: Agent[] = [
  {
    id: "lead-nurturing",
    name: "Agente de Nutrição de Leads",
    group: "aquisição",
    role: "Nutrição",
    description: "Enriquece as informações do lead com dados internos e externos e consolida duplicados.",
    pains: [
      "Leads chegam de múltiplos canais e planilhas sem padronização.",
      "Falta de visibilidade sobre leads quentes e duplicados.",
      "Tempo excessivo gasto na triagem e enriquecimento de dados.",
    ],
    automatedActivities: [
      "Enriquecimento automático de dados de empresa, departamento e contato.",
      "Consolidação de leads duplicados e preenchimento de campos faltantes.",
      "Padronização de leads de todos os canais em um único funil.",
    ],
    instructions: "Enriqueça e normalize cada lead com dados de empresa e contato, deduplique registros e sinalize leads quentes.",
    enabled: true,
    triggers: ["meeting"],
    model: "z-ai/glm-5.2",
  },
  {
    id: "lead-scoring",
    name: "Agente de Lead Scoring",
    group: "aquisição",
    role: "Qualificação",
    description: "Analisa variáveis de ICP e comportamento para pontuar, priorizar e rotear leads.",
    pains: [
      "Dificuldade em identificar quais leads têm real intenção de compra.",
      "Priorização manual e inconsistente entre vendedores.",
      "Leads quentes esfriam esperando triagem.",
    ],
    automatedActivities: [
      "Cálculo de pontuação de fit e interesse com base no ICP.",
      "Identificação de leads prontos para contato.",
      "Roteamento automático para o SDR responsável.",
    ],
    instructions:
      "Avalie cada deal considerando: fit de perfil (porte/segmento), sinais de engajamento, valor potencial e recência do último contato. Retorne score 0-100, temperatura (hot/warm/cold) e uma justificativa curta e acionável.",
    enabled: true,
    triggers: ["meeting", "proposal"],
    model: "z-ai/glm-5.2",
    runnable: true,
  },
  {
    id: "sales-copilot",
    name: "Agente Copiloto de Vendas",
    group: "vendas",
    role: "Aceleração",
    description: "Gera resumos, scripts e mensagens personalizadas com base no histórico e perfil do lead.",
    pains: [
      "Abordagens genéricas e falta de contexto nas negociações.",
      "Perda de tempo com follow-ups manuais e retrabalho.",
      "Propostas comerciais geradas de forma lenta e sem padronização.",
    ],
    automatedActivities: [
      "Geração de resumos e scripts de abordagem personalizados.",
      "Sugestão da próxima ação e cadência de follow-up ideal.",
      "Registro automático de contatos, interações e próximas ações no CRM.",
    ],
    instructions:
      "Com base no estágio, histórico e canal preferido do contato, proponha a próxima ação ideal e escreva uma mensagem de outreach curta, personalizada e no tom certo para o canal.",
    enabled: true,
    triggers: ["proposal", "negotiation", "contract"],
    model: "z-ai/glm-5.2",
    runnable: true,
  },
  {
    id: "proposal",
    name: "Agente de Proposta Comercial",
    group: "vendas",
    role: "Proposta",
    description: "Cria, precifica e envia propostas com compliance de política comercial e assinatura digital.",
    pains: [
      "Demora na validação de descontos e condições comerciais.",
      "Falta de rastreabilidade e controle sobre as propostas enviadas.",
      "Ausência de padronização e compliance nas políticas de aprovação.",
    ],
    automatedActivities: [
      "Geração de propostas personalizadas com base em dados do cliente e estoque.",
      "Validação de condições, descontos e cross-sell conforme regras de negócio.",
      "Envio para assinatura digital e atualização do status da venda no CRM.",
    ],
    instructions:
      "Monte uma proposta com itens, preços e desconto coerentes com o valor do deal e o segmento. Respeite o teto de desconto de 15%. Inclua um resumo executivo e termos comerciais.",
    enabled: true,
    triggers: ["proposal", "negotiation"],
    model: "z-ai/glm-5.2",
    runnable: true,
  },
  {
    id: "legal-contract",
    name: "Agente Jurídico / de Contratos",
    group: "vendas",
    role: "Jurídico",
    description: "Gera um contrato personalizado para cada proposta aprovada e coleta assinaturas digitais válidas (e-signature).",
    pains: [
      "Contratos redigidos manualmente, lentos e sem padronização jurídica.",
      "Cláusulas divergentes da proposta aprovada e risco de compliance.",
      "Assinaturas coletadas por e-mail solto, sem validade e sem rastreabilidade.",
    ],
    automatedActivities: [
      "Geração de contrato personalizado a partir dos dados da proposta e do cliente.",
      "Montagem de cláusulas (objeto, valor, vigência, SLA, LGPD, foro) conforme regras do jurídico.",
      "Envio para assinatura digital com validade jurídica (ICP-Brasil/e-signature) e trilha auditável.",
    ],
    instructions:
      "A partir da proposta aprovada do deal, redija um contrato personalizado com cláusulas de objeto, valor, vigência, SLA, proteção de dados (LGPD) e foro. Identifique os signatários de cada parte e envie para assinatura digital com validade jurídica, mantendo trilha auditável. Responda SOMENTE com JSON no formato do contrato.",
    enabled: true,
    triggers: ["contract"],
    model: "z-ai/glm-5.2",
    runnable: true,
  },
  {
    id: "activities",
    name: "Agente de Atividades e Follow-ups",
    group: "vendas",
    role: "Execução",
    description: "Cria tarefas, lembretes e alertas de SLA para que nenhum follow-up seja esquecido.",
    pains: [
      "Dificuldade em acompanhar tarefas e pendências por vendedor.",
      "Falta de visibilidade sobre atividades concluídas e atrasadas.",
      "Perda de oportunidades por ausência de follow-up estruturado.",
    ],
    automatedActivities: [
      "Criação automática de tarefas e lembretes de follow-up.",
      "Atualização em tempo real dos status e dashboards de execução.",
      "Alertas automáticos para cards parados acima do SLA definido.",
    ],
    instructions: "Gere um plano de follow-up com tarefas, responsável e prazo, priorizando deals parados ou de maior valor. Dispare alertas para cards acima do SLA.",
    enabled: true,
    triggers: ["negotiation", "contract"],
    model: "z-ai/glm-5.2",
  },
  {
    id: "coaching",
    name: "Agente de Coaching",
    group: "vendas",
    role: "Coaching",
    description: "Analisa as interações do time e sugere melhorias de abordagem e argumentação.",
    pains: [
      "Falta de feedback estruturado sobre a performance de cada vendedor.",
      "Boas práticas não se propagam pelo time.",
      "Dificuldade em identificar gargalos de conversão por etapa.",
    ],
    automatedActivities: [
      "Análise das interações e identificação de pontos de melhoria.",
      "Sugestão de scripts e contornos de objeção por contexto.",
      "Recomendações de coaching personalizadas por vendedor.",
    ],
    instructions: "Avalie as interações do vendedor no deal e produza recomendações de coaching específicas e acionáveis.",
    enabled: false,
    triggers: ["negotiation"],
    model: "z-ai/glm-5.2",
  },
  {
    id: "sales-feedback",
    name: "Agente de Feedback de Vendas",
    group: "vendas",
    role: "Aprendizado",
    description: "Registra os resultados de cada abordagem e realimenta o modelo de scoring — aprendizado contínuo.",
    pains: [
      "Critérios de qualificação estáticos que não evoluem com os resultados.",
      "Aprendizados de negócios ganhos e perdidos se perdem.",
      "Decisões baseadas em intuição, não em dados do próprio funil.",
    ],
    automatedActivities: [
      "Registro dos resultados de cada abordagem (ganho/perdido e motivo).",
      "Ajuste automático dos critérios de scoring e qualificação.",
      "Evolução contínua do processo a cada ciclo, com mais precisão.",
    ],
    instructions: "A cada deal fechado ou perdido, registre o motivo e proponha ajustes nos critérios de lead scoring.",
    enabled: true,
    triggers: ["won", "lost"],
    model: "z-ai/glm-5.2",
  },
  {
    id: "support-copilot",
    name: "Copiloto de Atendimento",
    group: "pós-venda",
    role: "Customer Success",
    description: "Automatiza handoff, onboarding e acompanhamento de entregas entre vendas e CS.",
    pains: [
      "Falta de alinhamento entre vendas e atendimento no início do projeto.",
      "Handoffs manuais e perda de informações críticas sobre o cliente.",
      "Dificuldade em acompanhar SLAs e entregas do onboarding.",
    ],
    automatedActivities: [
      "Handoff automático entre vendas e CS com contexto completo do cliente.",
      "Criação de tarefas e lembretes de implementação conforme o plano do cliente.",
      "Acompanhamento de entregas e prazos com alertas e dashboards automáticos.",
    ],
    instructions: "Ao marcar o deal como Ganho, gere o card de onboarding com contexto completo, tarefas de implementação e alertas de SLA.",
    enabled: true,
    triggers: ["won"],
    model: "z-ai/glm-5.2",
  },
];

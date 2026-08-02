// Domínio do CRM AI Studio — versão privada.
// Modela funis (pipelines), estágios, deals, contatos e agentes de IA.

export type StageId = string;

export interface Stage {
  id: StageId;
  name: string;
  /** ordem no funil */
  order: number;
  /** cor de destaque para a coluna do Kanban */
  accent: string;
}

export interface Pipeline {
  id: string;
  name: string;
  /** área do funil: marketing | sales | cs (customer success) */
  area: "marketing" | "sales" | "cs";
  stages: Stage[];
}

export interface Contact {
  id: string;
  name: string;
  email: string;
  phone?: string;
  company: string;
  role?: string;
  channel: "whatsapp" | "email" | "voice" | "portal" | "form";
}

export interface Activity {
  id: string;
  at: string; // ISO date
  type: "note" | "email" | "call" | "meeting" | "whatsapp" | "form" | "agent" | "task";
  summary: string;
  author: string; // pessoa ou nome do agente
  dueAt?: string | null;
  doneAt?: string | null;
}

export interface Deal {
  id: string;
  title: string;
  pipelineId: string;
  stageId: StageId;
  /** chave estável do estágio (meeting/proposal/...), usada por agentes e automações */
  stageKey: string;
  contactId: string;
  amount: number; // valor do negócio em BRL
  /** score 0-100 atribuído pelo Lead Scoring Agent */
  score?: number;
  scoreReason?: string;
  /** temperatura calculada: hot | warm | cold */
  temperature?: "hot" | "warm" | "cold";
  engagement: number; // 0-100 sinal de engajamento
  lastTouch: string; // ISO date
  origin?: string;
  nextActionAt?: string;
  productId?: string;
  lostReason?: string;
  probability?: number;
  custom?: Record<string, any>;
  activities: Activity[];
  tags: string[];
}

/** IDs dos agentes que têm execução ao vivo (rota de API). */
export type RunnableAgentKind = "lead-scoring" | "sales-copilot" | "proposal";
export type AgentKind = RunnableAgentKind | string;

export interface Agent {
  id: AgentKind;
  /** id (uuid) da linha no banco, usado para updates */
  uuid?: string;
  name: string;
  /** grupo do funil: aquisição | vendas | pós-venda */
  group: "aquisição" | "vendas" | "pós-venda";
  role: string;
  description: string;
  /** dores que o agente resolve (fonte: página do produto) */
  pains: string[];
  /** atividades automatizadas pelo agente */
  automatedActivities: string[];
  /** instruções no-code editáveis pelo usuário no Studio */
  instructions: string;
  enabled: boolean;
  /** estágios do funil em que o agente atua */
  triggers: string[];
  model: string;
  /** se true, o agente pode ser executado ao vivo pelo board */
  runnable?: boolean;
}

export interface Proposal {
  dealId: string;
  items: { name: string; qty: number; unitPrice: number }[];
  subtotal: number;
  discountPct: number;
  total: number;
  summary: string;
  terms: string;
  generatedBy: string;
}

export interface Contract {
  dealId: string;
  /** número/identificador do contrato */
  reference: string;
  title: string;
  /** cláusulas do contrato personalizado */
  clauses: { heading: string; body: string }[];
  /** valor contratado */
  value: number;
  /** signatários que precisam assinar digitalmente */
  signatories: { name: string; role: string; party: "contratante" | "contratada"; email: string }[];
  /** status da coleta de assinatura digital */
  signatureStatus: "rascunho" | "enviado" | "assinado";
  /** provedor de assinatura digital (e-signature) */
  signatureProvider: string;
  generatedBy: string;
}

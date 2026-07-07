// WhatsApp — MVP click-to-chat via wa.me (zero custo, sem API oficial).
// Nunca registra "entregue" — apenas a AÇÃO de abrir o WhatsApp é registrada.

/** Normaliza telefone brasileiro para o formato de dígitos do wa.me (com DDI). */
export function normalizePhoneBR(raw: string | undefined | null): string | null {
  if (!raw) return null;
  let d = raw.replace(/\D/g, "");
  if (!d) return null;
  // Remove zeros à esquerda e código de operadora comum
  if (d.startsWith("0")) d = d.replace(/^0+/, "");
  // Sem DDI: assume Brasil (55) se tiver 10-11 dígitos (DDD + número)
  if (d.length === 10 || d.length === 11) d = "55" + d;
  if (d.length < 12 || d.length > 14) return null;
  return d;
}

export function waMeLink(phone: string | undefined | null, message: string): string | null {
  const digits = normalizePhoneBR(phone);
  if (!digits) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

/** Compartilhar via WhatsApp sem telefone definido (tela de escolha de contato). */
export function waShareLink(message: string): string {
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}

export function inviteMessage(orgName: string, role: string, link: string): string {
  return `Olá! Você foi convidado(a) para a organização "${orgName}" no CRM AI Studio, como ${role === "admin" ? "administrador(a)" : "membro"}.\n\nAcesse o link para aceitar (use este mesmo e-mail ao entrar):\n${link}`;
}

// ---------------------------------------------------------------------------
// Templates de mensagem por contexto (tom Reiners: conversa, não pitch frio).
// {nome} = primeiro nome do contato · {empresa} · {deal} = título do deal.
// ---------------------------------------------------------------------------

export type WaTemplateKey =
  | "primeiro_contato" | "confirmacao_reuniao" | "envio_proposta"
  | "followup_48h" | "ligacao_5d" | "ultimo_contato_10d"
  | "envio_contrato" | "link_opensign" | "convite_membro"
  | "posvenda" | "upsell" | "reativacao_30d";

export interface WaContext { nome?: string; empresa?: string; deal?: string; link?: string }

export const WA_TEMPLATES: Record<WaTemplateKey, { label: string; build: (c: WaContext) => string }> = {
  primeiro_contato: {
    label: "Primeiro contato",
    build: (c) => `Oi ${c.nome ?? ""}, tudo bem? Aqui é da Reiners Media. Tenho um modelo de presença institucional contínua que faz sentido para a ${c.empresa ?? "sua organização"} — sem você precisar gerenciar nada internamente. Consigo te mostrar em 30 min. Qual o melhor horário essa semana?`,
  },
  confirmacao_reuniao: {
    label: "Confirmação de reunião",
    build: (c) => `${c.nome ?? ""}, confirmando nossa conversa. Vou levar alguns exemplos do que fazemos e entender melhor a comunicação da ${c.empresa ?? "sua organização"} hoje. Até lá!`,
  },
  envio_proposta: {
    label: "Envio de proposta",
    build: (c) => `${c.nome ?? ""}, preparei a proposta da ${c.empresa ?? "sua organização"} com base no que conversamos${c.link ? `: ${c.link}` : "."}. Posso te guiar por ela numa call rápida?`,
  },
  followup_48h: {
    label: "Follow-up 48h",
    build: (c) => `${c.nome ?? ""}, recebi que você viu a proposta. Teve alguma dúvida? Fico à disposição.`,
  },
  ligacao_5d: {
    label: "Após 5 dias (roteiro de ligação)",
    build: (c) => `${c.nome ?? ""}, vou te ligar hoje para alinharmos os próximos passos da proposta da ${c.empresa ?? "sua organização"}. Qual horário funciona?`,
  },
  ultimo_contato_10d: {
    label: "Último contato (10 dias)",
    build: (c) => `${c.nome ?? ""}, quero entender se faz sentido avançar agora ou se o momento não é esse. Sem problema em qualquer resposta — só me diz como prefere seguir.`,
  },
  envio_contrato: {
    label: "Envio de contrato",
    build: (c) => `${c.nome ?? ""}, ótimo ter a ${c.empresa ?? "sua organização"} com a gente! Já te envio o contrato para assinatura${c.link ? `: ${c.link}` : "."}. Qualquer ajuste, me avisa.`,
  },
  link_opensign: {
    label: "Link de assinatura (OpenSign)",
    build: (c) => `${c.nome ?? ""}, o contrato está pronto para assinatura digital. É rápido e tem validade jurídica${c.link ? `: ${c.link}` : "."}. Conseguimos assinar ainda hoje?`,
  },
  convite_membro: {
    label: "Convite de membro",
    build: (c) => `Oi! Segue seu acesso ao CRM da Reiners Media${c.link ? `: ${c.link}` : "."}. Entre com este e-mail para aceitar.`,
  },
  posvenda: {
    label: "Pós-venda / onboarding",
    build: (c) => `${c.nome ?? ""}, vamos começar! Já organizo aqui o onboarding da ${c.empresa ?? "sua organização"} e te apresento quem vai cuidar da entrega. Qual o melhor dia para o kickoff?`,
  },
  upsell: {
    label: "Upsell",
    build: (c) => `${c.nome ?? ""}, pelo resultado que a ${c.empresa ?? "sua organização"} teve, faz muito sentido evoluir para um formato recorrente de presença. Posso te mostrar como fica?`,
  },
  reativacao_30d: {
    label: "Reativação (30 dias)",
    build: (c) => `${c.nome ?? ""}, faz um tempo que conversamos sobre a comunicação da ${c.empresa ?? "sua organização"}. Mudou algo no cenário de vocês? Quem sabe agora é o momento.`,
  },
};

// Substitui os placeholders {nome} {empresa} {deal} {link} num corpo editado.
export function renderWaBody(body: string, ctx: WaContext): string {
  return body
    .replace(/\{nome\}/g, ctx.nome ?? "")
    .replace(/\{empresa\}/g, ctx.empresa ?? "sua organização")
    .replace(/\{deal\}/g, ctx.deal ?? "")
    .replace(/\{link\}/g, ctx.link ?? "")
    .trim();
}

// Overrides = textos editados pela org (message_templates, channel 'whatsapp').
// Quando existe override para a chave, usa-o; senão, o texto padrão do catálogo.
export function buildWaTemplate(key: WaTemplateKey, ctx: WaContext, overrides?: Record<string, string> | null): string {
  const override = overrides?.[key];
  if (override && override.trim()) return renderWaBody(override, ctx);
  const t = WA_TEMPLATES[key];
  return t ? t.build(ctx) : "";
}

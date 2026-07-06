import "server-only";
import { createClient } from "@/lib/supabase/server";

// Contexto de comunicação do lead para os agentes: junta timeline do CRM com as
// últimas mensagens de WhatsApp (quando o bridge estiver ativo e houver thread).
// Sempre escopado por org — nunca lê conversa de outro tenant.

export interface LeadCommContext {
  whatsapp_available: boolean;
  last_inbound_message: string | null;
  last_outbound_message: string | null;
  unanswered_question: boolean;
  conversation_summary: string | null;
  message_count: number;
  last_message_at: string | null;
  recent: { direction: string; body: string; at: string | null }[];
}

const MAX = Number(process.env.WHATSAPP_READ_MAX_MESSAGES ?? 80);

export async function getLeadCommunicationContext(
  orgId: string,
  dealId: string | null,
  contactId: string | null,
): Promise<LeadCommContext> {
  const empty: LeadCommContext = {
    whatsapp_available: false, last_inbound_message: null, last_outbound_message: null,
    unanswered_question: false, conversation_summary: null, message_count: 0,
    last_message_at: null, recent: [],
  };
  if (!orgId || (!dealId && !contactId)) return empty;

  const sb = createClient();
  // Localiza a thread pelo deal ou contato (RLS garante o escopo por org).
  let threadQuery = sb.from("whatsapp_threads").select("id, last_summary, last_message_at").eq("org_id", orgId);
  if (dealId) threadQuery = threadQuery.eq("deal_id", dealId);
  else if (contactId) threadQuery = threadQuery.eq("contact_id", contactId);
  const { data: thread } = await threadQuery.order("last_message_at", { ascending: false }).limit(1).maybeSingle();
  if (!thread) return empty;

  const limit = Math.min(MAX, 20);
  const { data: msgs } = await sb
    .from("whatsapp_messages")
    .select("direction, body, sent_at, received_at, created_at")
    .eq("org_id", orgId)
    .eq("thread_id", thread.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  const list = (msgs ?? []).map((m: any) => ({
    direction: m.direction, body: m.body ?? "",
    at: m.sent_at ?? m.received_at ?? m.created_at ?? null,
  }));
  if (!list.length) return { ...empty, whatsapp_available: true, conversation_summary: thread.last_summary ?? null };

  const lastInbound = list.find((m) => m.direction === "inbound")?.body ?? null;
  const lastOutbound = list.find((m) => m.direction === "outbound")?.body ?? null;
  // Pergunta sem resposta: a mensagem mais recente é do lead (inbound).
  const unanswered = list[0]?.direction === "inbound";

  return {
    whatsapp_available: true,
    last_inbound_message: lastInbound,
    last_outbound_message: lastOutbound,
    unanswered_question: unanswered,
    conversation_summary: thread.last_summary ?? null,
    message_count: list.length,
    last_message_at: thread.last_message_at ?? list[0]?.at ?? null,
    recent: list.slice(0, 20).reverse(),
  };
}

/** Monta o bloco CONVERSA_WHATSAPP_DO_LEAD para injetar no prompt. */
export function buildWhatsAppPromptBlock(ctx: LeadCommContext): string {
  if (!ctx.whatsapp_available) return "CONVERSA_WHATSAPP_DO_LEAD: não disponível.";
  const lines = ctx.recent.map((m) => `${m.direction === "inbound" ? "Lead" : "Reiners"}: ${m.body}`).join("\n");
  return [
    "CONVERSA_WHATSAPP_DO_LEAD (use para intenção, objeções, dados já confirmados; não repita perguntas já respondidas):",
    ctx.conversation_summary ? `Resumo: ${ctx.conversation_summary}` : null,
    `Mensagens (${ctx.message_count}, última em ${ctx.last_message_at ?? "?"}):`,
    lines,
    ctx.unanswered_question ? "ATENÇÃO: a última mensagem foi do lead e está sem resposta." : null,
  ].filter(Boolean).join("\n");
}

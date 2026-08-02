// WhatsApp do site público — módulo PURO (sem I/O), testável no vitest.
//
// O manual comercial da Reiners define o WhatsApp pessoal como canal de
// ativação ("conversa, não pitch"). Por isso o site trata o WhatsApp como o
// caminho principal: o formulário grava o lead e leva a conversa pra lá.

/** Número padrão da Reiners Media (formato internacional, só dígitos). */
export const DEFAULT_WHATSAPP = "5565999207108";

/** Deixa só dígitos. Aceita "+55 (65) 99920-7108" e devolve "5565999207108". */
export function sanitizeWhatsappNumber(raw: string | null | undefined): string {
  return (raw ?? "").replace(/\D/g, "");
}

/**
 * Exibição amigável: "+55 65 99920-7108". Números fora do padrão brasileiro
 * (11 dígitos após o DDI 55) voltam com "+" na frente e nada mais — melhor
 * mostrar cru do que formatar errado.
 */
export function formatWhatsappNumber(raw: string | null | undefined): string {
  const digits = sanitizeWhatsappNumber(raw);
  if (!digits) return "";
  const br = /^55(\d{2})(\d{4,5})(\d{4})$/.exec(digits);
  if (!br) return `+${digits}`;
  return `+55 ${br[1]} ${br[2]}-${br[3]}`;
}

/** Link click-to-chat. Sem número válido devolve string vazia (o chamador oculta o CTA). */
export function whatsappUrl(raw: string | null | undefined, message?: string): string {
  const digits = sanitizeWhatsappNumber(raw);
  if (digits.length < 10) return "";
  const base = `https://wa.me/${digits}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}

export type BookingMessageInput = {
  name?: string;
  email?: string;
  phone?: string;
  message?: string;
};

/**
 * Mensagem pré-preenchida do agendamento. Tom de conversa, não de formulário:
 * abre com a pessoa se apresentando e só então lista o que preencheu.
 * Campos vazios simplesmente não aparecem.
 */
export function bookingWhatsappMessage(input: BookingMessageInput = {}): string {
  const name = (input.name ?? "").trim();
  const email = (input.email ?? "").trim();
  const project = (input.message ?? "").trim();

  const lines: string[] = [
    name
      ? `Olá! Aqui é ${name}. Quero agendar uma sessão no estúdio.`
      : "Olá! Quero agendar uma sessão no estúdio.",
  ];
  if (project) lines.push("", `Sobre o projeto: ${project}`);
  if (email) lines.push("", `Meu e-mail: ${email}`);

  return lines.join("\n");
}

/** Mensagem curta do botão flutuante (a pessoa ainda não preencheu nada). */
export const FLOATING_WHATSAPP_MESSAGE =
  "Olá! Vim pelo site da Reiners Media e quero falar sobre um podcast.";

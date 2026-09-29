// Formulário "Agendar sessão" — regras compartilhadas entre o navegador e o
// servidor. Módulo PURO (sem I/O, sem dependências): dá para importar no
// componente cliente sem puxar nada do servidor e testar no vitest.
//
// O formulário NÃO grava em banco. No envio, o navegador abre o WhatsApp com a
// mensagem pronta (lib/site/whatsapp.ts) e, em segundo plano, avisa a equipe
// por e-mail (lib/site/lead-notify.ts → Brevo). As mesmas regras valem nos dois
// lados: o cliente valida para dar retorno na hora, o servidor não confia nele.

/** Tamanhos máximos. A mensagem pronta vira URL do wa.me: texto longo demais quebra o link. */
export const LEAD_LIMITS = { name: 80, email: 120, phone: 30, message: 600 } as const;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function isEmail(value: string): boolean {
  return EMAIL.test(value);
}

export type LeadFields = { name: string; email: string; phone: string; message: string };
export type LeadErrors = Partial<Record<"name" | "email", string>>;

// Caracteres de controle (inclui CR/LF e TAB). Fora "\n" no texto livre, nada
// disso tem lugar em nome/e-mail/telefone — e quebra de linha em campo de uma
// linha é a porta de entrada de injeção de cabeçalho em e-mail.
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f\u0085\u2028\u2029]/g;
// eslint-disable-next-line no-control-regex
const CONTROL_KEEP_NEWLINE = /[\u0000-\u0009\u000b-\u001f\u007f\u0085\u2028\u2029]/g;

/** Uma linha só: sem controle nem quebra, espaços colapsados, no máximo `max` caracteres. */
export function cleanLine(value: unknown, max: number): string {
  return String(value ?? "")
    .replace(CONTROL, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

/** Texto livre: mantém as quebras de linha (máx. 2 seguidas), tira controle e corta em `max`. */
export function cleanText(value: unknown, max: number): string {
  return String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(CONTROL_KEEP_NEWLINE, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, max);
}

/** Normaliza o que veio do formulário (ou do corpo da requisição). */
export function cleanLead(raw: Partial<Record<keyof LeadFields, unknown>>): LeadFields {
  return {
    name: cleanLine(raw.name, LEAD_LIMITS.name),
    email: cleanLine(raw.email, LEAD_LIMITS.email),
    phone: cleanLine(raw.phone, LEAD_LIMITS.phone),
    message: cleanText(raw.message, LEAD_LIMITS.message),
  };
}

/**
 * Único campo obrigatório é o nome. E-mail e WhatsApp são opcionais (a pessoa
 * já se identifica no próprio WhatsApp); o e-mail só é conferido se preenchido.
 */
export function validateLead(lead: LeadFields): LeadErrors {
  const errors: LeadErrors = {};
  if (lead.name.length < 2) errors.name = "Informe seu nome.";
  if (lead.email && !isEmail(lead.email)) errors.email = "Confira o e-mail: parece incompleto.";
  return errors;
}

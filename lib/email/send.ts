import "server-only";
import { getEmailProvider, type EmailAddress, type EmailAttachment } from "./provider";
import type { EmailContent } from "./templates";

// Camada de envio + log. Envia via provider (Brevo ou mock) e grava a tentativa
// em `messages` (channel='email') para auditoria e para o webhook do Brevo casar
// o status por `external_id` (messageId). Nunca lança: retorna { ok, error }, para
// não derrubar a action chamadora (o CRM segue funcionando mesmo se o e-mail falhar).

export interface SendAndLogInput {
  /** cliente Supabase já com sessão/escopo (server action ou service role) */
  db: { from: (t: string) => any };
  orgId: string;
  to: EmailAddress | EmailAddress[];
  content: EmailContent;
  attachments?: EmailAttachment[];
  tags?: string[];
  sender?: EmailAddress;
  /** vínculos opcionais para a timeline */
  contactId?: string | null;
  dealId?: string | null;
}

export interface SendAndLogResult {
  ok: boolean;
  provider: string;
  messageId?: string;
  error?: string;
}

export async function sendAndLogEmail(input: SendAndLogInput): Promise<SendAndLogResult> {
  const provider = getEmailProvider();
  const first = Array.isArray(input.to) ? input.to[0]?.email : input.to.email;

  const res = await provider.send({
    to: input.to,
    subject: input.content.subject,
    html: input.content.html,
    attachments: input.attachments,
    tags: input.tags,
    sender: input.sender,
  });

  // Log em `messages` — sucesso e falha, para rastreabilidade.
  try {
    await input.db.from("messages").insert({
      org_id: input.orgId,
      contact_id: input.contactId ?? null,
      deal_id: input.dealId ?? null,
      channel: "email",
      direction: "outbound",
      body: input.content.subject, // corpo real é o HTML; guardamos o assunto como resumo
      subject: input.content.subject,
      to_email: first ?? null,
      status: res.ok ? "enviado" : "falha",
      external_id: res.messageId ?? null,
      meta: { provider: res.provider, tags: input.tags ?? [], error: res.error ?? null },
    });
  } catch {
    // não bloqueia o retorno se o log falhar
  }

  return { ok: res.ok, provider: res.provider, messageId: res.messageId, error: res.error };
}

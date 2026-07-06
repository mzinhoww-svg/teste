// Adapter de e-mail transacional. Provider padrão: Brevo (ex-Sendinblue).
// https://developers.brevo.com/reference/sendtransacemail
//
// Segue o mesmo padrão de lib/signature/provider.ts: interface única, provider
// real gated por env e um "mock" que NÃO faz rede (dev/CI sobem sem BREVO_API_KEY).
// A UI e as actions dependem só de `sendEmail` — trocar de provider não muda o app.

export interface EmailAddress {
  email: string;
  name?: string;
}

export interface EmailAttachment {
  /** nome do arquivo exibido no e-mail (ex.: "proposta.pdf") */
  name: string;
  /** conteúdo do anexo em base64 */
  content: string;
}

export interface SendEmailInput {
  to: EmailAddress | EmailAddress[];
  subject: string;
  html: string;
  replyTo?: EmailAddress;
  attachments?: EmailAttachment[];
  /** tags do Brevo — úteis para filtrar eventos no webhook (ex.: ["proposta"]) */
  tags?: string[];
  /** remetente; default vem de BREVO_SENDER_EMAIL/NAME */
  sender?: EmailAddress;
}

export interface SendEmailResult {
  provider: string;
  ok: boolean;
  /** messageId retornado pelo Brevo — casa com os eventos do webhook */
  messageId?: string;
  error?: string;
}

export interface EmailProvider {
  readonly name: string;
  readonly configured: boolean;
  send(input: SendEmailInput): Promise<SendEmailResult>;
}

function defaultSender(): EmailAddress {
  return {
    email: process.env.BREVO_SENDER_EMAIL ?? "no-reply@example.test",
    name: process.env.BREVO_SENDER_NAME ?? "CRM",
  };
}

function toArray(to: EmailAddress | EmailAddress[]): EmailAddress[] {
  return Array.isArray(to) ? to : [to];
}

// ---------------------------------------------------------------------------
// Brevo
// ---------------------------------------------------------------------------

export class BrevoProvider implements EmailProvider {
  readonly name = "brevo";
  constructor(
    private apiKey = process.env.BREVO_API_KEY ?? "",
    private replyToEnv = process.env.BREVO_REPLY_TO ?? "",
  ) {}

  get configured() {
    return Boolean(this.apiKey);
  }

  async send(input: SendEmailInput): Promise<SendEmailResult> {
    if (!this.configured) {
      return { provider: this.name, ok: false, error: "Brevo não configurado (BREVO_API_KEY)" };
    }
    const sender = input.sender ?? defaultSender();
    const replyTo = input.replyTo ?? (this.replyToEnv ? { email: this.replyToEnv } : undefined);
    try {
      const res = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
          "api-key": this.apiKey,
        },
        body: JSON.stringify({
          sender: { email: sender.email, name: sender.name },
          to: toArray(input.to).map((t) => ({ email: t.email, name: t.name })),
          subject: input.subject,
          htmlContent: input.html,
          replyTo: replyTo ? { email: replyTo.email, name: replyTo.name } : undefined,
          attachment: input.attachments?.length
            ? input.attachments.map((a) => ({ name: a.name, content: a.content }))
            : undefined,
          tags: input.tags,
        }),
      });
      if (!res.ok) {
        const body = await res.text();
        // 402/429 ≈ limite do plano (300/dia no free) ou throttling.
        return { provider: this.name, ok: false, error: `Brevo ${res.status}: ${body}` };
      }
      const data = (await res.json()) as { messageId?: string };
      return { provider: this.name, ok: true, messageId: data.messageId };
    } catch (e) {
      return { provider: this.name, ok: false, error: e instanceof Error ? e.message : "erro de rede" };
    }
  }
}

// ---------------------------------------------------------------------------
// Mock — testes (não faz rede) e fallback local sem BREVO_API_KEY.
// ---------------------------------------------------------------------------

export class MockEmailProvider implements EmailProvider {
  readonly name = "mock";
  readonly configured = true;
  async send(input: SendEmailInput): Promise<SendEmailResult> {
    const first = toArray(input.to)[0]?.email ?? "?";
    // Não loga corpo/HTML (pode conter dados do cliente); só o essencial.
    // eslint-disable-next-line no-console
    console.info(`[email:mock] → ${first} · "${input.subject}"`);
    return { provider: this.name, ok: true, messageId: `mock_${Date.now().toString(36)}` };
  }
}

/** Retorna o provider ativo. Sem BREVO_API_KEY, cai no mock (sem rede). */
export function getEmailProvider(): EmailProvider {
  if (process.env.EMAIL_PROVIDER === "mock") return new MockEmailProvider();
  const brevo = new BrevoProvider();
  return brevo.configured ? brevo : new MockEmailProvider();
}

/** Indica se há envio real ativo (para UI/telemetria, análogo a hasLiveAI). */
export function hasLiveEmail(): boolean {
  return new BrevoProvider().configured && process.env.EMAIL_PROVIDER !== "mock";
}

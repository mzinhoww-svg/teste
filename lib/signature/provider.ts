// Adapter de assinatura digital. Provider padrão: OpenSign (open source, grátis).
// https://github.com/OpenSignLabs/OpenSign
//
// A UI e as rotas dependem apenas desta interface — trocar de provider não
// exige mudar o resto do app.

export interface Signer {
  name: string;
  email: string;
  phone?: string;
}

export interface CreateEnvelopeInput {
  title: string;
  /** conteúdo do contrato (texto/markdown) — o provider gera o documento */
  body: string;
  signers: Signer[];
  /** referência interna do contrato no CRM */
  reference: string;
}

export interface EnvelopeResult {
  provider: string;
  envelopeId: string;
  status: "enviado" | "erro";
  /** URL para o signatário assinar (quando o provider expõe) */
  signingUrl?: string;
  error?: string;
}

export type ExternalStatus = "enviado" | "visualizado" | "assinado" | "recusado" | "expirado" | "erro";

export interface SignatureProvider {
  readonly name: string;
  createEnvelope(input: CreateEnvelopeInput): Promise<EnvelopeResult>;
  getStatus(envelopeId: string): Promise<{ status: ExternalStatus; certificateUrl?: string }>;
  /** valida a assinatura/segredo do webhook; retorna o payload normalizado */
  verifyWebhook(rawBody: string, headers: Headers): { valid: boolean; envelopeId?: string; status?: ExternalStatus; certificateUrl?: string };
}

// ---------------------------------------------------------------------------
// OpenSign
// ---------------------------------------------------------------------------

const STATUS_MAP: Record<string, ExternalStatus> = {
  created: "enviado", sent: "enviado", inprogress: "enviado", viewed: "visualizado",
  signed: "assinado", completed: "assinado", declined: "recusado",
  expired: "expirado", voided: "recusado", error: "erro",
};

export class OpenSignProvider implements SignatureProvider {
  readonly name = "opensign";
  constructor(
    private baseUrl = process.env.OPENSIGN_BASE_URL ?? "",
    private apiKey = process.env.OPENSIGN_API_KEY ?? "",
    private webhookSecret = process.env.OPENSIGN_WEBHOOK_SECRET ?? "",
    private templateId = process.env.OPENSIGN_DEFAULT_TEMPLATE_ID ?? "",
  ) {}

  get configured() {
    return Boolean(this.baseUrl && this.apiKey);
  }

  private headers() {
    return { "content-type": "application/json", "x-api-token": this.apiKey };
  }

  async createEnvelope(input: CreateEnvelopeInput): Promise<EnvelopeResult> {
    if (!this.configured) {
      return { provider: this.name, envelopeId: "", status: "erro", error: "OpenSign não configurado (OPENSIGN_BASE_URL / OPENSIGN_API_KEY)" };
    }
    try {
      // OpenSign REST: cria documento a partir de template ou de conteúdo.
      const res = await fetch(`${this.baseUrl.replace(/\/$/, "")}/api/v1/documents`, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({
          title: input.title,
          templateId: this.templateId || undefined,
          content: input.body,
          signers: input.signers.map((s) => ({ name: s.name, email: s.email, phone: s.phone })),
          reference: input.reference,
          sendInApp: true,
        }),
      });
      if (!res.ok) return { provider: this.name, envelopeId: "", status: "erro", error: `OpenSign ${res.status}: ${await res.text()}` };
      const data = (await res.json()) as { objectId?: string; id?: string; signingUrl?: string; url?: string };
      const envelopeId = data.objectId ?? data.id ?? "";
      return { provider: this.name, envelopeId, status: "enviado", signingUrl: data.signingUrl ?? data.url };
    } catch (e) {
      return { provider: this.name, envelopeId: "", status: "erro", error: e instanceof Error ? e.message : "erro de rede" };
    }
  }

  async getStatus(envelopeId: string): Promise<{ status: ExternalStatus; certificateUrl?: string }> {
    if (!this.configured) return { status: "erro" };
    try {
      const res = await fetch(`${this.baseUrl.replace(/\/$/, "")}/api/v1/documents/${envelopeId}`, { headers: this.headers() });
      if (!res.ok) return { status: "erro" };
      const data = (await res.json()) as { status?: string; certificateUrl?: string };
      return { status: STATUS_MAP[(data.status ?? "").toLowerCase()] ?? "enviado", certificateUrl: data.certificateUrl };
    } catch {
      return { status: "erro" };
    }
  }

  verifyWebhook(rawBody: string, headers: Headers) {
    // OpenSign envia um segredo compartilhado no header. Sem segredo configurado,
    // recusa por segurança.
    const provided = headers.get("x-opensign-secret") ?? headers.get("x-webhook-secret") ?? "";
    if (!this.webhookSecret || provided !== this.webhookSecret) return { valid: false };
    try {
      const p = JSON.parse(rawBody) as { objectId?: string; documentId?: string; status?: string; certificateUrl?: string };
      return {
        valid: true,
        envelopeId: p.objectId ?? p.documentId,
        status: STATUS_MAP[(p.status ?? "").toLowerCase()] ?? "enviado",
        certificateUrl: p.certificateUrl,
      };
    } catch {
      return { valid: false };
    }
  }
}

// ---------------------------------------------------------------------------
// Mock — usado em testes (não faz rede) e como fallback local sem config.
// ---------------------------------------------------------------------------

export class MockSignatureProvider implements SignatureProvider {
  readonly name = "mock";
  async createEnvelope(input: CreateEnvelopeInput): Promise<EnvelopeResult> {
    const envelopeId = `mock_${input.reference}`;
    return { provider: this.name, envelopeId, status: "enviado", signingUrl: `https://example.test/sign/${envelopeId}` };
  }
  async getStatus(): Promise<{ status: ExternalStatus }> {
    return { status: "assinado" };
  }
  verifyWebhook(rawBody: string) {
    try {
      const p = JSON.parse(rawBody) as { envelopeId?: string; status?: ExternalStatus };
      return { valid: true, envelopeId: p.envelopeId, status: p.status ?? "assinado" };
    } catch {
      return { valid: false };
    }
  }
}

export function getSignatureProvider(): SignatureProvider {
  if (process.env.SIGNATURE_PROVIDER === "mock") return new MockSignatureProvider();
  const os = new OpenSignProvider();
  return os.configured ? os : new MockSignatureProvider();
}

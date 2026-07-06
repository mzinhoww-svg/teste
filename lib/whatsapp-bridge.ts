import "server-only";
import { normalizePhoneBR } from "@/lib/whatsapp";

// Adapter de WhatsApp. Provider padrão: wa_me (envio manual por link). O provider
// `bridge` conversa com um serviço externo persistente (WPPConnect/Baileys
// self-hosted) — NUNCA roda dentro da Vercel. `fake` é para testes.
//
// Nenhum envio automático: enquanto o bridge não estiver ativo, o contato é
// sempre manual via wa.me.

export type WaProviderName = "wa_me" | "bridge" | "fake";

export interface NormalizedWebhook {
  valid: boolean;
  orgHint?: string;         // instance_id → resolve org via whatsapp_connections
  chatId?: string;
  phone?: string;
  direction?: "inbound" | "outbound";
  body?: string;
  senderName?: string;
  providerMessageId?: string;
  mediaType?: string;
  mediaUrl?: string;
  timestamp?: string;
}

export interface WhatsAppProvider {
  readonly name: WaProviderName;
  /** Só o bridge consulta histórico; wa_me/fake retornam vazio. */
  fetchHistory(chatId: string, limit: number): Promise<NormalizedWebhook[]>;
  verifyWebhook(rawBody: string, headers: Headers): NormalizedWebhook;
}

const STATUS_HEADERS = ["x-webhook-secret", "x-whatsapp-secret", "x-bridge-secret"];

export class BridgeProvider implements WhatsAppProvider {
  readonly name = "bridge" as const;
  constructor(
    private baseUrl = process.env.WHATSAPP_BRIDGE_BASE_URL ?? "",
    private apiKey = process.env.WHATSAPP_BRIDGE_API_KEY ?? "",
    private secret = process.env.WHATSAPP_BRIDGE_WEBHOOK_SECRET ?? "",
  ) {}

  get configured() { return Boolean(this.baseUrl && this.apiKey); }

  async fetchHistory(chatId: string, limit: number): Promise<NormalizedWebhook[]> {
    if (!this.configured) return [];
    try {
      const res = await fetch(`${this.baseUrl.replace(/\/$/, "")}/messages?chat=${encodeURIComponent(chatId)}&limit=${limit}`, {
        headers: { authorization: `Bearer ${this.apiKey}` },
      });
      if (!res.ok) return [];
      const data = (await res.json()) as any[];
      return (data ?? []).map((m) => ({
        valid: true, chatId, phone: normalizePhoneBR(m.phone) ?? m.phone,
        direction: m.fromMe ? "outbound" : "inbound", body: m.body ?? m.text ?? "",
        senderName: m.senderName, providerMessageId: m.id,
        mediaType: m.mediaType, mediaUrl: m.mediaUrl, timestamp: m.timestamp,
      }));
    } catch {
      return [];
    }
  }

  verifyWebhook(rawBody: string, headers: Headers): NormalizedWebhook {
    const provided = STATUS_HEADERS.map((h) => headers.get(h)).find(Boolean) ?? "";
    if (!this.secret || provided !== this.secret) return { valid: false };
    try {
      const p = JSON.parse(rawBody) as any;
      return {
        valid: true,
        orgHint: p.instanceId ?? p.instance ?? p.session,
        chatId: p.chatId ?? p.from,
        phone: normalizePhoneBR(p.phone ?? p.from) ?? p.phone,
        direction: p.fromMe ? "outbound" : "inbound",
        body: p.body ?? p.text ?? "",
        senderName: p.senderName ?? p.notifyName,
        providerMessageId: p.id ?? p.messageId,
        mediaType: p.mediaType, mediaUrl: p.mediaUrl,
        timestamp: p.timestamp ?? new Date().toISOString(),
      };
    } catch {
      return { valid: false };
    }
  }
}

export class WaMeProvider implements WhatsAppProvider {
  readonly name = "wa_me" as const;
  async fetchHistory(): Promise<NormalizedWebhook[]> { return []; }
  verifyWebhook(): NormalizedWebhook { return { valid: false }; }
}

export class FakeWhatsAppProvider implements WhatsAppProvider {
  readonly name = "fake" as const;
  async fetchHistory(): Promise<NormalizedWebhook[]> { return []; }
  verifyWebhook(rawBody: string): NormalizedWebhook {
    try {
      const p = JSON.parse(rawBody) as any;
      return { valid: true, ...p };
    } catch {
      return { valid: false };
    }
  }
}

export function getWhatsAppProvider(): WhatsAppProvider {
  switch (process.env.WHATSAPP_PROVIDER) {
    case "bridge": return new BridgeProvider();
    case "fake": return new FakeWhatsAppProvider();
    default: return new WaMeProvider();
  }
}

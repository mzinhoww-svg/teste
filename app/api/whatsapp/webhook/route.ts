import { NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { getWhatsAppProvider } from "@/lib/whatsapp-bridge";
import { normalizePhoneBR } from "@/lib/whatsapp";

export const runtime = "nodejs";

// Webhook do bridge de WhatsApp (WPPConnect/Baileys self-hosted). Valida o
// segredo compartilhado, resolve a org pela conexão (instance_id) e grava a
// mensagem por org/thread/contato/deal. Sem service role, apenas confirma.
export async function POST(req: Request) {
  const raw = await req.text();
  const provider = getWhatsAppProvider();
  const evt = provider.verifyWebhook(raw, req.headers);
  if (!evt.valid) {
    return NextResponse.json({ error: "webhook inválido" }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return NextResponse.json({ ok: true, note: "recebido, mas SUPABASE_SERVICE_ROLE_KEY ausente — não persistido" });
  }
  const db = createAdminClient(url, serviceKey);

  // Resolve a org pela conexão (instance_id). Sem conexão registrada, não grava
  // (evita mensagens órfãs sem tenant).
  const { data: conn } = await db
    .from("whatsapp_connections")
    .select("id, org_id")
    .eq("instance_id", evt.orgHint ?? "")
    .maybeSingle();
  if (!conn) {
    return NextResponse.json({ ok: true, note: "instância sem conexão registrada" });
  }
  const orgId = conn.org_id;
  const phone = normalizePhoneBR(evt.phone) ?? evt.phone ?? null;

  // Vincula a thread a um contato/deal existente pelo telefone, quando possível.
  let contactId: string | null = null;
  let dealId: string | null = null;
  if (phone) {
    const { data: contact } = await db.from("contacts").select("id").eq("org_id", orgId).eq("phone", phone).maybeSingle();
    contactId = contact?.id ?? null;
    if (contactId) {
      const { data: deal } = await db.from("deals").select("id").eq("org_id", orgId).eq("contact_id", contactId).order("created_at", { ascending: false }).maybeSingle();
      dealId = deal?.id ?? null;
    }
  }

  const now = new Date().toISOString();
  const { data: thread } = await db
    .from("whatsapp_threads")
    .upsert({
      org_id: orgId, phone_normalized: phone, wa_chat_id: evt.chatId ?? null,
      contact_id: contactId, deal_id: dealId, display_name: evt.senderName ?? null,
      last_message_at: evt.timestamp ?? now,
      ...(evt.direction === "inbound" ? { last_inbound_at: evt.timestamp ?? now } : { last_outbound_at: evt.timestamp ?? now }),
      updated_at: now,
    }, { onConflict: "org_id,phone_normalized" })
    .select("id")
    .single();

  if (thread) {
    await db.from("whatsapp_messages").insert({
      org_id: orgId, thread_id: thread.id, contact_id: contactId, deal_id: dealId,
      provider_message_id: evt.providerMessageId ?? null, direction: evt.direction ?? "inbound",
      sender_phone: phone, sender_name: evt.senderName ?? null, body: evt.body ?? "",
      media_type: evt.mediaType ?? null, media_url: evt.mediaUrl ?? null,
      sent_at: evt.direction === "outbound" ? (evt.timestamp ?? now) : null,
      received_at: evt.direction === "inbound" ? (evt.timestamp ?? now) : null,
    });
  }

  await db.from("whatsapp_sync_events").insert({
    org_id: orgId, connection_id: conn.id, event_type: "message", status: "ok", payload: { chatId: evt.chatId, direction: evt.direction },
  });

  return NextResponse.json({ ok: true });
}

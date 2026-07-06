import { NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

// GET: healthcheck do endpoint — abrir a URL no navegador confirma que a rota
// está no ar (o teste de alcance do Brevo e a verificação manual passam). NÃO
// processa eventos nem exige o secret; só sinaliza se as dependências estão
// prontas. O processamento real (com validação do secret) fica no POST abaixo.
export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: "brevo-webhook",
    note: "Endpoint ativo. Os eventos são recebidos por POST. Configure a URL com ?secret=… no painel do Brevo.",
    secretConfigured: Boolean(process.env.BREVO_WEBHOOK_SECRET),
    canPersist: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
  });
}

// Webhook de eventos transacionais do Brevo — atualiza `messages.status` pelo
// message-id (external_id). O Brevo não assina o payload; protegemos o endpoint
// com um segredo próprio (BREVO_WEBHOOK_SECRET) via query `?secret=` ou header
// `x-brevo-secret`. Configure a URL em Brevo → Transactional → Settings → Webhook:
//   https://SEU-APP/api/webhooks/brevo?secret=SEGREDO
//
// Sem SUPABASE_SERVICE_ROLE_KEY não há como escrever ignorando RLS — degrada e loga.

// Brevo event → status interno em `messages`.
const STATUS_MAP: Record<string, string> = {
  request: "enviado",
  delivered: "entregue",
  opened: "aberto",
  uniqueOpened: "aberto",
  click: "clicado",
  soft_bounce: "bounce",
  hard_bounce: "bounce",
  blocked: "bloqueado",
  spam: "spam",
  invalid_email: "invalido",
  deferred: "adiado",
  error: "falha",
};

// Ordem de progressão — não regride o status (um "delivered" tardio não apaga um "opened").
const RANK: Record<string, number> = {
  enviado: 1, adiado: 2, entregue: 3, clicado: 5, aberto: 4,
  bounce: 9, bloqueado: 9, spam: 9, invalido: 9, falha: 9,
};

function authorized(req: Request): boolean {
  const secret = process.env.BREVO_WEBHOOK_SECRET;
  if (!secret) return false; // sem segredo configurado, recusa por segurança
  const url = new URL(req.url);
  const provided = url.searchParams.get("secret") ?? req.headers.get("x-brevo-secret") ?? "";
  return provided === secret;
}

export async function POST(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "webhook não autorizado" }, { status: 401 });
  }

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "payload inválido" }, { status: 400 });
  }

  // Brevo pode enviar um evento único ou um array (batch).
  const events: any[] = Array.isArray(payload) ? payload : payload?.events ?? [payload];

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return NextResponse.json({ ok: true, note: "recebido, mas SUPABASE_SERVICE_ROLE_KEY ausente — status não persistido" });
  }
  const admin = createAdminClient(url, serviceKey);

  let updated = 0;
  for (const ev of events) {
    const messageId: string | undefined = ev["message-id"] ?? ev.messageId ?? ev["message_id"];
    const rawEvent: string = ev.event ?? ev.type ?? "";
    const next = STATUS_MAP[rawEvent];
    if (!messageId || !next) continue;

    const { data: msg } = await admin
      .from("messages")
      .select("id, status, org_id, contact_id, deal_id, to_email")
      .eq("external_id", messageId)
      .maybeSingle();
    if (!msg) continue;

    // Não regride: só atualiza se o novo status tiver rank >= o atual.
    if ((RANK[next] ?? 0) < (RANK[msg.status ?? ""] ?? 0)) continue;

    await admin.from("messages").update({ status: next }).eq("id", msg.id);
    updated++;

    // Bounce/spam/inválido → notifica a org (endereço problemático).
    if (["bounce", "spam", "invalido", "bloqueado"].includes(next)) {
      await admin.from("notifications").insert({
        org_id: msg.org_id,
        type: "email_bounce",
        title: "E-mail não entregue",
        body: `Falha de entrega (${rawEvent}) para ${msg.to_email ?? "destinatário"}.`,
        deal_id: msg.deal_id ?? null,
        contact_id: msg.contact_id ?? null,
        action_url: "/app",
      });
    }
  }

  return NextResponse.json({ ok: true, received: events.length, updated });
}

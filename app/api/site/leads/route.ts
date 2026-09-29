import { NextResponse } from "next/server";
import { getEmailProvider } from "@/lib/email/provider";
import {
  clientIp,
  createRateLimiter,
  isSameOrigin,
  leadEmail,
  leadFingerprint,
  leadRecipients,
  parseLeadBody,
} from "@/lib/site/lead-notify";

// Aviso à equipe do formulário "Agendar sessão". NÃO grava em banco: manda um
// e-mail pela Brevo (o provider do CRM) e pronto. Quem preenche o formulário já
// foi levado ao WhatsApp pelo próprio navegador — esta rota é a rede de
// segurança para quem fechar o WhatsApp sem enviar, então nada aqui pode
// atrapalhar o fluxo: o cliente chama em segundo plano e ignora a resposta.
//
// Rota pública ⇒ cada chamada vira um e-mail (cota gratuita da Brevo: 300/dia,
// dividida com o CRM). Defesas: mesma origem, campo-isca, limite por IP e por
// hora, descarte de envio repetido e corpo pequeno. Ver lib/site/lead-notify.ts.

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 8 * 1024;
const perIp = createRateLimiter({ max: 6, windowMs: 10 * 60_000 });
const overall = createRateLimiter({ max: 60, windowMs: 60 * 60_000 });
const recentSubmissions = new Map<string, number>();
const DUPLICATE_WINDOW_MS = 10 * 60_000;

export async function POST(request: Request) {
  if (!isSameOrigin(request.headers)) {
    return NextResponse.json({ error: "Origem não permitida." }, { status: 403 });
  }

  const text = await request.text().catch(() => "");
  if (text.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Mensagem grande demais." }, { status: 413 });
  }
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "Payload inválido." }, { status: 400 });
  }

  const parsed = parseLeadBody(body);
  if (parsed.kind === "spam") {
    // Robô: finge sucesso e não gasta e-mail.
    return NextResponse.json({ ok: true }, { status: 202 });
  }
  if (parsed.kind === "invalid") {
    return NextResponse.json({ errors: parsed.errors }, { status: 422 });
  }

  const now = Date.now();
  if (!perIp.allow(clientIp(request.headers), now) || !overall.allow("todos", now)) {
    return NextResponse.json({ error: "Muitas tentativas. Tente de novo em instantes." }, { status: 429 });
  }
  // Mesmo envio repetido (duplo clique, reenvio): já avisamos, não avisa de novo.
  const fingerprint = leadFingerprint(parsed.lead);
  const seenAt = recentSubmissions.get(fingerprint);
  if (seenAt && now - seenAt < DUPLICATE_WINDOW_MS) {
    return NextResponse.json({ ok: true, duplicate: true }, { status: 202 });
  }
  recentSubmissions.set(fingerprint, now);
  if (recentSubmissions.size > 200) {
    for (const [key, at] of recentSubmissions) if (now - at >= DUPLICATE_WINDOW_MS) recentSubmissions.delete(key);
  }

  const to = leadRecipients(process.env);
  if (!to.length) {
    console.error("[site-lead] sem destinatário: defina LEADS_NOTIFY_EMAIL (ou BREVO_REPLY_TO / BREVO_SENDER_EMAIL).");
    return NextResponse.json({ ok: false, notified: false }, { status: 503 });
  }

  const { subject, html } = leadEmail(parsed.lead, { path: parsed.path });
  const res = await getEmailProvider().send({
    to,
    subject,
    html,
    // Responder o aviso já fala com a pessoa (quando ela deixou e-mail).
    replyTo: parsed.lead.email ? { email: parsed.lead.email, name: parsed.lead.name } : undefined,
    tags: ["site-lead"],
  });

  if (!res.ok) {
    // Só o motivo do provedor — sem nome, e-mail nem telefone de quem escreveu.
    console.error(`[site-lead] falha ao avisar a equipe (${res.provider}): ${res.error}`);
    recentSubmissions.delete(fingerprint);
    return NextResponse.json({ ok: false, notified: false }, { status: 502 });
  }
  return NextResponse.json({ ok: true, notified: true }, { status: 202 });
}

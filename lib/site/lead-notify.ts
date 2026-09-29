// Aviso à equipe quando alguém preenche o formulário "Agendar sessão".
//
// O site não guarda o lead em banco: a pessoa é levada ao WhatsApp com a
// mensagem pronta e, em paralelo, a equipe recebe um e-mail pela Brevo (o mesmo
// provider do CRM — lib/email/provider.ts). É a rede de segurança para quem
// fechar o WhatsApp sem apertar "enviar": o contato fica na caixa de entrada.
//
// Módulo PURO (sem I/O, sem env global): a rota (app/api/site/leads) injeta o
// que precisa. Tudo aqui é testável no vitest.

import { emailLayout } from "@/lib/email/templates";
import type { EmailAddress } from "@/lib/email/provider";
import { cleanLead, cleanLine, isEmail, validateLead, type LeadErrors, type LeadFields } from "./lead-form";
import { formatWhatsappNumber, sanitizeWhatsappNumber } from "./whatsapp";

// ── Corpo da requisição ──────────────────────────────────────────────────────

export type ParsedLead =
  | { kind: "ok"; lead: LeadFields; path: string }
  /** Campo-isca preenchido: robô. A rota finge sucesso e não envia nada. */
  | { kind: "spam" }
  | { kind: "invalid"; errors: LeadErrors };

/**
 * Lê e limpa o corpo. O cliente já validou, mas o servidor não confia nele:
 * limpa de novo (controle, tamanho) e revalida.
 */
export function parseLeadBody(body: unknown): ParsedLead {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { kind: "invalid", errors: { name: "Informe seu nome." } };
  }
  const raw = body as Record<string, unknown>;

  // Campo-isca ("website"): invisível para gente, preenchido por robô.
  if (String(raw.website ?? "").trim() !== "") return { kind: "spam" };

  const lead = cleanLead(raw);
  const errors = validateLead(lead);
  if (Object.keys(errors).length) return { kind: "invalid", errors };

  const path = cleanLine(raw.path, 200);
  return { kind: "ok", lead, path: path.startsWith("/") ? path : "/" };
}

// ── Destinatários ────────────────────────────────────────────────────────────

/**
 * Quem recebe o aviso: `LEADS_NOTIFY_EMAIL` (um ou vários, separados por vírgula
 * ou ponto e vírgula) e, sem ele, o e-mail de resposta e o remetente que o CRM
 * já usa na Brevo. Endereço inválido é ignorado; sem nenhum válido, lista vazia.
 */
export function leadRecipients(env: Record<string, string | undefined>): EmailAddress[] {
  for (const candidate of [env.LEADS_NOTIFY_EMAIL, env.BREVO_REPLY_TO, env.BREVO_SENDER_EMAIL]) {
    const emails = (candidate ?? "")
      .split(/[;,]/)
      .map((e) => e.trim())
      .filter(isEmail)
      .slice(0, 5);
    if (emails.length) return emails.map((email) => ({ email }));
  }
  return [];
}

// ── WhatsApp de quem escreveu ────────────────────────────────────────────────

/**
 * Dígitos para o link `wa.me` do telefone informado. Aceita "(65) 99920-7108"
 * (assume Brasil, DDI 55) e "+55 65 99920-7108". Fora do padrão, devolve "":
 * melhor sem link do que com um link errado.
 */
export function leadWhatsappDigits(phone: string): string {
  const digits = sanitizeWhatsappNumber(phone);
  // Com "+", o DDI foi digitado de propósito: só vale se for o do Brasil. Sem
  // essa trava, "+1 415 555 0100" viraria "55 14 15555 0100" — um número errado.
  if (phone.trim().startsWith("+")) return /^55\d{10,11}$/.test(digits) ? digits : "";
  if (/^\d{10,11}$/.test(digits)) return `55${digits}`;
  if (/^55\d{10,11}$/.test(digits)) return digits;
  return "";
}

// ── E-mail ───────────────────────────────────────────────────────────────────

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}

const CELL = "font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#334155;";

function row(label: string, valueHtml: string): string {
  return `<tr>
    <td valign="top" style="${CELL}padding:6px 14px 6px 0;color:#64748b;white-space:nowrap;">${label}</td>
    <td valign="top" style="${CELL}padding:6px 0;color:#0f172a;">${valueHtml}</td>
  </tr>`;
}

const DASH = '<span style="color:#94a3b8;">não informado</span>';

export function leadEmail(
  lead: LeadFields,
  meta: { path?: string; at?: Date } = {},
): { subject: string; html: string } {
  const wa = leadWhatsappDigits(lead.phone);
  const at = meta.at ?? new Date();
  const when = new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Cuiaba",
  }).format(at);

  const emailHtml = lead.email
    ? `<a href="mailto:${esc(lead.email)}" style="color:#14243E;">${esc(lead.email)}</a>`
    : DASH;
  const phoneHtml = wa
    ? `<a href="https://wa.me/${wa}" style="color:#14243E;">${esc(formatWhatsappNumber(wa))}</a>`
    : lead.phone
      ? esc(lead.phone)
      : DASH;
  const projectHtml = lead.message ? esc(lead.message).replace(/\n/g, "<br>") : DASH;

  const bodyHtml = `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 8px;">
    ${row("Nome", `<strong>${esc(lead.name)}</strong>`)}
    ${row("E-mail", emailHtml)}
    ${row("WhatsApp", phoneHtml)}
    ${row("Projeto", projectHtml)}
    ${row("Página", esc(meta.path ?? "/"))}
    ${row("Recebido em", esc(when))}
  </table>`;

  const first = lead.name.split(" ")[0];
  const cta = wa
    ? {
        label: "Responder no WhatsApp",
        url: `https://wa.me/${wa}?text=${encodeURIComponent(
          `Olá, ${first}! Aqui é da Reiners Media. Recebemos o seu contato pelo site e vamos combinar a sua sessão.`,
        )}`,
      }
    : lead.email
      ? { label: "Responder por e-mail", url: `mailto:${lead.email}` }
      : undefined;

  // `footnote` entra sem escape no layout: só texto estático aqui.
  const semContato = !lead.email && !wa && !lead.phone
    ? " Ela não deixou e-mail nem WhatsApp: só dá para retornar se enviar a mensagem por lá."
    : "";
  const footnote =
    "A pessoa foi levada ao WhatsApp com a mensagem pronta. Este aviso é a rede de segurança: se ela não enviar por lá, o contato está aqui." +
    semContato;

  const subject = `Novo contato pelo site: ${lead.name}`;
  const html = emailLayout({
    brand: { primary: "#14243E" },
    orgName: "Reiners Media",
    preheader: `${lead.name} pediu contato pelo site.`,
    heading: "Novo contato pelo site",
    bodyHtml,
    cta,
    footnote,
  });
  return { subject, html };
}

// ── Proteção da rota pública ─────────────────────────────────────────────────

/**
 * A rota é pública e cada chamada vira um e-mail (a cota gratuita da Brevo é de
 * 300 por dia, dividida com o CRM). Por isso exige que a chamada venha de uma
 * página do próprio site: `Origin` igual ao `Host`. Não impede quem forja o
 * cabeçalho, mas barra formulário colado em outro site e robô de curl.
 */
export function isSameOrigin(headers: { get(name: string): string | null }): boolean {
  const origin = headers.get("origin");
  if (!origin) return false;
  let originHost: string;
  try {
    originHost = new URL(origin).host.toLowerCase();
  } catch {
    return false;
  }
  const host = (headers.get("x-forwarded-host") ?? headers.get("host") ?? "").split(",")[0].trim().toLowerCase();
  return Boolean(host) && originHost === host;
}

/** IP de quem chamou (Vercel manda `x-real-ip`/`x-forwarded-for`). */
export function clientIp(headers: { get(name: string): string | null }): string {
  return headers.get("x-real-ip") ?? headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "desconhecido";
}

/**
 * Limite de chamadas por chave numa janela móvel. Fica na memória da instância:
 * em serverless cada instância conta a sua, então é um freio contra enxurrada,
 * não uma garantia — a cota da Brevo e o campo-isca cobrem o resto.
 */
export function createRateLimiter({ max, windowMs }: { max: number; windowMs: number }) {
  const hits = new Map<string, number[]>();
  return {
    allow(key: string, now: number = Date.now()): boolean {
      const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
      if (recent.length >= max) {
        hits.set(key, recent);
        return false;
      }
      recent.push(now);
      hits.set(key, recent);
      if (hits.size > 500) {
        for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
      }
      return true;
    },
  };
}

/** Impressão digital para descartar o mesmo envio repetido (duplo clique, reenvio). */
export function leadFingerprint(lead: LeadFields): string {
  return [lead.name, lead.email, lead.phone, lead.message].join("\u0001").toLowerCase();
}

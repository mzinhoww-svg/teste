// Templates de e-mail transacional — HTML no código, tematizado pela marca do
// tenant (orgs.settings.brand). CSS inline + tabelas para compatibilidade com
// clientes de e-mail (Gmail/Outlook/Apple Mail). No mesmo espírito do PDF de
// proposta. Cada builder retorna { subject, html }.

import { brl } from "@/lib/format";

export interface EmailBrand {
  primary?: string;
  accent?: string;
  logoUrl?: string;
}

export interface EmailContent {
  subject: string;
  html: string;
}

const FALLBACK_PRIMARY = "#4f46e5"; // índigo padrão do app

function esc(s: string): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

interface LayoutInput {
  brand?: EmailBrand;
  orgName: string;
  preheader?: string;
  heading: string;
  /** blocos de corpo já em HTML (parágrafos, tabelas) */
  bodyHtml: string;
  cta?: { label: string; url: string };
  footnote?: string;
}

/** Shell reutilizável: header com a marca, corpo, CTA e rodapé. */
export function emailLayout(input: LayoutInput): string {
  const primary = input.brand?.primary || FALLBACK_PRIMARY;
  const org = esc(input.orgName || "CRM");
  const logo = input.brand?.logoUrl
    ? `<img src="${esc(input.brand.logoUrl)}" alt="${org}" height="28" style="height:28px;display:block;border:0;" />`
    : `<span style="font-family:Arial,Helvetica,sans-serif;color:#ffffff;font-size:16px;font-weight:bold;letter-spacing:.3px;">${org}</span>`;
  const cta = input.cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0 4px;">
         <tr><td bgcolor="${primary}" style="border-radius:8px;">
           <a href="${esc(input.cta.url)}" target="_blank" rel="noreferrer"
              style="display:inline-block;padding:12px 22px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:8px;">
             ${esc(input.cta.label)}</a>
         </td></tr>
       </table>`
    : "";
  const foot = input.footnote
    ? `<p style="margin:14px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;color:#94a3b8;">${input.footnote}</p>`
    : "";
  const pre = input.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(input.preheader)}</div>`
    : "";

  return `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;">
${pre}
<center>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f1f5f9">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="width:560px;max-width:560px;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">
  <tr><td bgcolor="${primary}" style="padding:18px 28px;">${logo}</td></tr>
  <tr><td style="padding:28px 28px 8px;">
    <h1 style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:20px;line-height:1.3;color:#0f172a;">${esc(input.heading)}</h1>
  </td></tr>
  <tr><td style="padding:6px 28px 26px;">
    ${input.bodyHtml}
    ${cta}
    ${foot}
  </td></tr>
  <tr><td bgcolor="#f8fafc" style="padding:16px 28px;border-top:1px solid #e2e8f0;">
    <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;color:#94a3b8;">
      Enviado por ${org}. Se você não esperava este e-mail, pode ignorá-lo.
    </p>
  </td></tr>
</table>
</td></tr>
</table>
</center>
</body></html>`;
}

function p(text: string): string {
  return `<p style="margin:0 0 12px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#334155;">${text}</p>`;
}

// ---------------------------------------------------------------------------
// Builders por fluxo
// ---------------------------------------------------------------------------

export function inviteEmail(o: {
  brand?: EmailBrand; orgName: string; inviteUrl: string; role: string; inviterName?: string;
}): EmailContent {
  const roleLabel = o.role === "admin" ? "administrador(a)" : "membro";
  return {
    subject: `Convite para ${o.orgName}`,
    html: emailLayout({
      brand: o.brand, orgName: o.orgName,
      preheader: `Você foi convidado para ${o.orgName}.`,
      heading: `Você foi convidado para ${esc(o.orgName)}`,
      bodyHtml:
        p(`${o.inviterName ? esc(o.inviterName) + " convidou você" : "Você foi convidado(a)"} para entrar em <strong>${esc(o.orgName)}</strong> como <strong>${roleLabel}</strong>.`) +
        p("Clique abaixo para aceitar o convite e acessar o CRM."),
      cta: { label: "Aceitar convite", url: o.inviteUrl },
      footnote: "Este convite expira em 7 dias.",
    }),
  };
}

export function portalInviteEmail(o: {
  brand?: EmailBrand; orgName: string; clientName: string; portalUrl: string;
}): EmailContent {
  return {
    subject: `Acesse seu portal — ${o.orgName}`,
    html: emailLayout({
      brand: o.brand, orgName: o.orgName,
      preheader: `Seu portal de cliente na ${o.orgName} está pronto.`,
      heading: `Bem-vindo(a) ao portal, ${esc(o.clientName)}`,
      bodyHtml:
        p(`A <strong>${esc(o.orgName)}</strong> criou um acesso para você acompanhar propostas, projetos, entregas, documentos e faturas em um só lugar.`) +
        p("Defina sua senha e acesse pelo botão abaixo."),
      cta: { label: "Acessar portal", url: o.portalUrl },
      footnote: "Se você não reconhece este convite, ignore este e-mail.",
    }),
  };
}

export function proposalEmail(o: {
  brand?: EmailBrand; orgName: string; contactName?: string; dealTitle: string; total?: number; proposalUrl: string;
}): EmailContent {
  const valor = typeof o.total === "number" ? p(`Valor total: <strong>${brl(o.total)}</strong>.`) : "";
  return {
    subject: `Proposta comercial — ${o.dealTitle}`,
    html: emailLayout({
      brand: o.brand, orgName: o.orgName,
      preheader: `Sua proposta "${o.dealTitle}" está disponível.`,
      heading: "Sua proposta comercial",
      bodyHtml:
        p(`${o.contactName ? "Olá " + esc(o.contactName) + ", a" : "A"} <strong>${esc(o.orgName)}</strong> preparou a proposta <strong>${esc(o.dealTitle)}</strong> para você.`) +
        valor +
        p("Você pode visualizar a proposta completa e baixar o PDF pelo botão abaixo (o PDF também vai anexo)."),
      cta: { label: "Ver proposta", url: o.proposalUrl },
    }),
  };
}

export function contractSignEmail(o: {
  brand?: EmailBrand; orgName: string; signerName?: string; title: string; reference: string; value?: number; signUrl: string;
}): EmailContent {
  const valor = typeof o.value === "number" ? p(`Valor: <strong>${brl(o.value)}</strong>.`) : "";
  return {
    subject: `Assinatura de contrato — ${o.reference}`,
    html: emailLayout({
      brand: o.brand, orgName: o.orgName,
      preheader: `Contrato ${o.reference} aguardando sua assinatura.`,
      heading: "Contrato para assinatura",
      bodyHtml:
        p(`${o.signerName ? "Olá " + esc(o.signerName) + ", a" : "A"} <strong>${esc(o.orgName)}</strong> enviou o contrato <strong>${esc(o.title)}</strong> (${esc(o.reference)}) para sua assinatura.`) +
        valor +
        p("Revise as cláusulas e assine com segurança pelo botão abaixo."),
      cta: { label: "Revisar e assinar", url: o.signUrl },
    }),
  };
}

export function invoiceEmail(o: {
  brand?: EmailBrand; orgName: string; clientName?: string; number: string; amount: number; dueDate?: string; paymentUrl?: string; invoiceUrl?: string; overdue?: boolean;
}): EmailContent {
  const url = o.paymentUrl || o.invoiceUrl;
  const venc = o.dueDate ? p(`Vencimento: <strong>${esc(o.dueDate)}</strong>${o.overdue ? " (em atraso)" : ""}.`) : "";
  const abertura = o.overdue
    ? p(`${o.clientName ? "Olá " + esc(o.clientName) + ". Identificamos" : "Identificamos"} que a fatura <strong>${esc(o.number)}</strong> de <strong>${brl(o.amount)}</strong> está <strong>em atraso</strong>.`)
    : p(`${o.clientName ? "Olá " + esc(o.clientName) + ", segue" : "Segue"} sua fatura no valor de <strong>${brl(o.amount)}</strong>.`);
  return {
    subject: o.overdue ? `Fatura ${o.number} em atraso — ${o.orgName}` : `Fatura ${o.number} — ${o.orgName}`,
    html: emailLayout({
      brand: o.brand, orgName: o.orgName,
      preheader: o.overdue ? `Fatura ${o.number} em atraso (${brl(o.amount)}).` : `Fatura ${o.number} no valor de ${brl(o.amount)}.`,
      heading: o.overdue ? `Fatura ${esc(o.number)} em atraso` : `Fatura ${esc(o.number)}`,
      bodyHtml:
        abertura +
        venc +
        (url ? p("Use o botão abaixo para regularizar o pagamento.") : p("Em breve enviaremos o link de pagamento.")),
      cta: url ? { label: o.overdue ? "Regularizar pagamento" : "Pagar fatura", url } : undefined,
    }),
  };
}

export function cadenceFollowupEmail(o: {
  brand?: EmailBrand; orgName: string; contactName?: string; message: string; ctaUrl?: string; ctaLabel?: string;
}): EmailContent {
  return {
    subject: `Acompanhamento — ${o.orgName}`,
    html: emailLayout({
      brand: o.brand, orgName: o.orgName,
      preheader: o.message.slice(0, 90),
      heading: `${o.contactName ? "Olá " + esc(o.contactName) : "Olá"}`,
      bodyHtml: p(esc(o.message)),
      cta: o.ctaUrl ? { label: o.ctaLabel || "Ver detalhes", url: o.ctaUrl } : undefined,
    }),
  };
}

export function deliverableEmail(o: {
  brand?: EmailBrand; orgName: string; clientName?: string; title: string; url?: string;
}): EmailContent {
  return {
    subject: `Nova entrega — ${o.title}`,
    html: emailLayout({
      brand: o.brand, orgName: o.orgName,
      preheader: `Nova entrega disponível: ${o.title}.`,
      heading: "Nova entrega disponível",
      bodyHtml:
        p(`${o.clientName ? "Olá " + esc(o.clientName) + ", a" : "A"} <strong>${esc(o.orgName)}</strong> disponibilizou: <strong>${esc(o.title)}</strong>.`) +
        (o.url ? p("Acesse pelo botão abaixo.") : ""),
      cta: o.url ? { label: "Abrir entrega", url: o.url } : undefined,
    }),
  };
}

"use client";

import * as React from "react";
import { SiteModal } from "./modal";
import { SiteButton } from "./button";
import { SiteInput, SiteTextarea } from "./input";
import { WhatsappGlyph } from "./whatsapp-icon";
import { trackSiteEvent } from "@/lib/site/track";
import { LEAD_LIMITS, cleanLead, validateLead, type LeadErrors } from "@/lib/site/lead-form";
import { bookingWhatsappMessage, formatWhatsappNumber, whatsappUrl } from "@/lib/site/whatsapp";

// Modal de agendamento. NÃO grava em banco: ao enviar, o navegador abre o
// WhatsApp com a mensagem pronta e, em segundo plano, a equipe é avisada por
// e-mail (Brevo — app/api/site/leads). Estado: formulário → enviado.
//
// Por que abre direto, sem segundo clique: o WhatsApp é aberto de forma SÍNCRONA
// dentro do clique de enviar (um gesto do usuário), antes de qualquer espera de
// rede — então bloqueador de pop-up não engole. O aviso por e-mail é a rede de
// segurança de quem fechar o WhatsApp sem enviar; falhar não muda nada para
// quem está na conversa.

/** Abre o WhatsApp na hora. Nova aba; se o navegador não permitir, segue na mesma aba. */
function openWhatsapp(href: string) {
  if (!href) return;
  try {
    const win = window.open(href, "_blank");
    if (win) {
      win.opener = null;
      return;
    }
  } catch {
    /* cai na navegação abaixo */
  }
  // Sem nova aba (bloqueio, navegador embutido do Instagram/Facebook).
  window.location.assign(href);
}

/**
 * Avisa a equipe em segundo plano (e-mail). `keepalive` sobrevive à navegação da
 * mesma aba. O cabeçalho `x-lead-notify` marca o cliente NOVO: a versão antiga do
 * formulário (que gravava em banco) não o manda, e uma regra de roteamento da
 * Vercel desvia só essas chamadas antigas enquanto houver página em cache.
 */
function notifyTeam(payload: Record<string, string>) {
  try {
    void fetch("/api/site/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-lead-notify": "1" },
      body: JSON.stringify({ ...payload, path: window.location.pathname }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* rede de segurança: nunca atrapalha o WhatsApp */
  }
}

export function BookingModal({
  open,
  onClose,
  whatsappNumber,
}: {
  open: boolean;
  onClose: () => void;
  whatsappNumber: string;
}) {
  const [errors, setErrors] = React.useState<LeadErrors>({});
  const [sent, setSent] = React.useState(false);
  const [waHref, setWaHref] = React.useState("");

  // Cada abertura recomeça limpa.
  React.useEffect(() => {
    if (open) {
      setErrors({});
      setSent(false);
      setWaHref("");
    }
  }, [open]);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const lead = cleanLead({
      name: form.get("name"),
      email: form.get("email"),
      phone: form.get("phone"),
      message: form.get("message"),
    });

    const found = validateLead(lead);
    setErrors(found);
    if (Object.keys(found).length) return;

    const href = whatsappUrl(whatsappNumber, bookingWhatsappMessage(lead));
    openWhatsapp(href);
    // `website` é o campo-isca: invisível para gente, robô preenche.
    notifyTeam({ ...lead, website: String(form.get("website") ?? "") });

    setWaHref(href);
    setSent(true);
    trackSiteEvent("form_submit", "booking");
  }

  return (
    <SiteModal
      open={open}
      onClose={onClose}
      title={sent ? (waHref ? "Abrimos o WhatsApp" : "Recebemos seu contato") : "Agendar sessão"}
      description={
        sent ? undefined : "Conte o que você quer gravar. Respondemos no mesmo dia útil."
      }
    >
      {sent ? (
        <div className="flex flex-col gap-6">
          <p className="text-site-base text-site-text-primary/85">
            {waHref
              ? "A sua mensagem já está pronta no WhatsApp: é só tocar em enviar por lá. É pela conversa que combinamos data, formato e visita ao estúdio."
              : "Obrigado. Nossa equipe entra em contato para combinar a visita ao estúdio."}
          </p>

          {waHref && (
            <a
              href={waHref}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => trackSiteEvent("cta_click", "whatsapp_booking")}
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-site-md bg-site-text-inverse px-6 py-3 text-site-base font-medium text-site-surface-base transition-all duration-fast hover:brightness-110 hover:shadow-site-3 active:scale-[0.98]"
            >
              <WhatsappGlyph className="h-5 w-5" />
              Abrir o WhatsApp
            </a>
          )}

          {waHref && (
            <p className="text-site-sm text-site-text-primary/70">
              O WhatsApp não abriu? Use o botão acima ou chame direto em{" "}
              <span className="whitespace-nowrap">{formatWhatsappNumber(whatsappNumber)}</span>.
            </p>
          )}

          <SiteButton type="button" variant="ghost" onClick={onClose}>
            Fechar
          </SiteButton>
        </div>
      ) : (
        <form className="flex flex-col gap-5" onSubmit={onSubmit} noValidate>
          <SiteInput
            id="booking-name"
            name="name"
            label="Nome"
            placeholder="Ex.: Ana Furtado"
            autoComplete="name"
            maxLength={LEAD_LIMITS.name}
            required
            error={errors.name}
          />
          <SiteInput
            id="booking-email"
            name="email"
            type="email"
            label="E-mail"
            placeholder="Ex.: nome@empresa.com.br"
            autoComplete="email"
            maxLength={LEAD_LIMITS.email}
            helper="Opcional — para retornarmos se a conversa no WhatsApp não acontecer."
            error={errors.email}
          />
          <SiteInput
            id="booking-phone"
            name="phone"
            type="tel"
            label="WhatsApp"
            placeholder="Ex.: (65) 90000-0000"
            autoComplete="tel"
            maxLength={LEAD_LIMITS.phone}
            helper="Opcional — se preferir que a gente chame você."
          />
          <SiteTextarea
            id="booking-message"
            name="message"
            label="Sobre o projeto"
            placeholder="Ex.: série institucional mensal, 2 episódios, gravação na nossa sede"
            maxLength={LEAD_LIMITS.message}
          />

          {/* Campo-isca anti-spam: fora da tela e fora da leitura de tela. Quem
              preenche é robô; a rota descarta o aviso sem gastar e-mail. */}
          <div aria-hidden="true" className="absolute -left-[9999px] top-auto h-px w-px overflow-hidden">
            <label htmlFor="booking-website">Não preencha este campo</label>
            <input id="booking-website" name="website" type="text" tabIndex={-1} autoComplete="off" />
          </div>

          <SiteButton type="submit" block>
            Enviar e continuar no WhatsApp
          </SiteButton>

          <p className="text-site-sm text-site-text-primary/70">
            Ao enviar, abrimos o WhatsApp com a sua mensagem pronta e avisamos nossa equipe por e-mail com
            esses dados.
          </p>
        </form>
      )}
    </SiteModal>
  );
}

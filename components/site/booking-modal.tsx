"use client";

import * as React from "react";
import { SiteModal } from "./modal";
import { SiteButton } from "./button";
import { SiteInput, SiteTextarea } from "./input";
import { trackSiteEvent } from "@/lib/site/track";

// Modal de agendamento. Estado do formulário: idle → loading → success | error.
// Erros por campo vêm do servidor (fonte da verdade) e do check local.

type Errors = Partial<Record<"name" | "email", string>>;

export function BookingModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [loading, setLoading] = React.useState(false);
  const [errors, setErrors] = React.useState<Errors>({});
  const [sent, setSent] = React.useState(false);
  const [failure, setFailure] = React.useState<string | null>(null);

  // Cada abertura recomeça limpa.
  React.useEffect(() => {
    if (open) {
      setErrors({});
      setSent(false);
      setFailure(null);
    }
  }, [open]);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = {
      name: String(form.get("name") ?? ""),
      email: String(form.get("email") ?? ""),
      phone: String(form.get("phone") ?? ""),
      message: String(form.get("message") ?? ""),
    };

    setLoading(true);
    setFailure(null);
    try {
      const res = await fetch("/api/site/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 422) {
        setErrors(data.errors ?? {});
        return;
      }
      if (!res.ok) {
        setFailure(data.error ?? "Não foi possível enviar agora.");
        return;
      }
      setErrors({});
      setSent(true);
      trackSiteEvent("form_submit", "booking");
    } catch {
      setFailure("Sem conexão. Tente de novo em instantes.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <SiteModal
      open={open}
      onClose={onClose}
      title={sent ? "Recebemos seu contato" : "Agendar sessão"}
      description={
        sent
          ? undefined
          : "Conte o que você quer gravar. Respondemos no mesmo dia útil."
      }
    >
      {sent ? (
        <div className="flex flex-col gap-6">
          <p className="text-site-base text-site-text-primary/85">
            Obrigado. Nossa equipe entra em contato para combinar a visita ao estúdio.
          </p>
          <SiteButton type="button" variant="secondary" onClick={onClose}>
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
            required
            error={errors.email}
          />
          <SiteInput
            id="booking-phone"
            name="phone"
            type="tel"
            label="WhatsApp"
            placeholder="Ex.: (65) 90000-0000"
            autoComplete="tel"
            helper="Opcional — é por onde respondemos mais rápido."
          />
          <SiteTextarea
            id="booking-message"
            name="message"
            label="Sobre o projeto"
            placeholder="Ex.: série institucional mensal, 2 episódios, gravação na nossa sede"
          />

          {failure && (
            <p role="alert" className="text-site-sm text-site-danger">
              {failure}
            </p>
          )}

          <SiteButton type="submit" loading={loading} block>
            Enviar pedido de sessão
          </SiteButton>
        </form>
      )}
    </SiteModal>
  );
}

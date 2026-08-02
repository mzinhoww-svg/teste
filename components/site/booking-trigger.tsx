"use client";

import * as React from "react";
import { SiteButton, type SiteButtonProps } from "./button";
import { BookingModal } from "./booking-modal";
import { trackSiteEvent } from "@/lib/site/track";

/**
 * Botão que abre o modal de agendamento. Cada gatilho carrega seu próprio
 * modal (isolado), e o `label` identifica a origem do clique nos KPIs.
 */
export function BookingTrigger({
  label,
  children,
  ...buttonProps
}: SiteButtonProps & { label: string }) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <SiteButton
        {...buttonProps}
        onClick={() => {
          setOpen(true);
          trackSiteEvent("cta_click", label);
        }}
      >
        {children}
      </SiteButton>
      <BookingModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}

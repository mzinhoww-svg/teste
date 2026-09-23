import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// Badge / eyebrow do site público.
//  - accent: "Mais popular" (pill, fundo text.inverse a 12%)
//  - eyebrow: rótulo de seção (uppercase, tracking 0.12em, text.inverse)
//  - info: badge informativo (text.tertiary)

const siteBadgeVariants = cva("inline-flex items-center gap-s7 font-medium uppercase", {
  variants: {
    variant: {
      accent: "rounded-site-step7 bg-site-text-inverse/[0.12] px-3 py-1 font-borna text-site-xs text-site-text-inverse",
      // Kicker: o padrão "01 — Título" repetido no topo de cada seção do
      // manual de marca — mono, tracking largo. Único variant em DM Mono; os
      // outros (pill) seguem em DM Sans (font-borna), mais legível em texto
      // corrido curto.
      eyebrow: "font-manual-mono text-site-xs tracking-[0.14em] text-site-text-inverse",
      info: "rounded-site-step7 bg-site-text-tertiary/20 px-3 py-1 font-borna text-site-xs text-site-text-primary",
    },
  },
  defaultVariants: { variant: "eyebrow" },
});

export type SiteBadgeProps = React.HTMLAttributes<HTMLSpanElement> &
  VariantProps<typeof siteBadgeVariants>;

export function SiteBadge({ className, variant, ...props }: SiteBadgeProps) {
  return <span className={cn(siteBadgeVariants({ variant }), className)} {...props} />;
}

export { siteBadgeVariants };

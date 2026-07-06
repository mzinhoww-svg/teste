"use client";

import { useEffect } from "react";
import { buildBrandRamp, readableOnChannels, toAccentChannels } from "@/lib/brand-ramp";

// Tema por tenant: a partir da cor primária da marca, injeta a ESCALA brand-*
// INTEIRA (50→950) como variáveis CSS + o accent (realce) e seu foreground
// legível. Assim CADA tenant re-tinta o app inteiro — botões, chips, rings,
// barras e tints de dark — sem tocar em componente. Sem cores, mantém o índigo
// padrão (os fallbacks do tailwind.config).
//
// Aplicado pós-mount (sem mismatch de hidratação); limpa ao sair da área logada.
// Determinístico (sem Math.random) — ver lib/brand-ramp.ts.
export function TenantThemeVars({ primary, accent }: { primary?: string; accent?: string }) {
  useEffect(() => {
    const root = document.documentElement;
    const ramp = buildBrandRamp(primary);

    if (!ramp) {
      root.removeAttribute("data-tenant-themed");
      return;
    }

    for (const [key, value] of Object.entries(ramp)) root.style.setProperty(key, value);
    // Accent = realce (dourado). Nunca é fundo de texto branco: publicamos os
    // canais da cor e um foreground legível calculado por contraste (corrige o
    // hover ilegível). Canais "R G B" para casar com rgb(var(--accent)/…).
    const accentChannels = toAccentChannels(accent) ?? ramp["--brand-600"];
    root.style.setProperty("--accent", accentChannels);
    root.style.setProperty("--accent-foreground", readableOnChannels(accent || null));
    root.setAttribute("data-tenant-themed", "");

    return () => {
      root.removeAttribute("data-tenant-themed");
      for (const key of Object.keys(ramp)) root.style.removeProperty(key);
      root.style.removeProperty("--accent");
      root.style.removeProperty("--accent-foreground");
    };
  }, [primary, accent]);
  return null;
}

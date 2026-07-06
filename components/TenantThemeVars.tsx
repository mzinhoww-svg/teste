"use client";

import { useEffect } from "react";

// Tema por tenant: injeta as cores da marca ativa como variáveis CSS e marca o
// documento com data-tenant-themed. O globals.css remapeia as classes brand-*
// principais para essas variáveis — assim CADA tenant re-tematiza o app sem
// tocar em componente nenhum. Sem cores configuradas, mantém o padrão (índigo).
//
// Aplicado pós-mount (sem mismatch de hidratação); limpa ao sair da área logada.
export function TenantThemeVars({ primary, accent }: { primary?: string; accent?: string }) {
  useEffect(() => {
    const root = document.documentElement;
    if (!primary && !accent) { root.removeAttribute("data-tenant-themed"); return; }
    root.style.setProperty("--tenant-primary", primary || accent!);
    root.style.setProperty("--tenant-accent", accent || primary!);
    root.setAttribute("data-tenant-themed", "");
    return () => {
      root.removeAttribute("data-tenant-themed");
      root.style.removeProperty("--tenant-primary");
      root.style.removeProperty("--tenant-accent");
    };
  }, [primary, accent]);
  return null;
}

import type { Metadata } from "next";
import { publicBaseUrl } from "@/lib/urls";

// SEO do site público. Regra: SÓ a vitrine do estúdio é indexável
// (`/` e `/portfolio`). Todo o resto — CRM, portal do cliente, admin, login e
// as páginas por token — fica fora de buscador e sem link a partir do site.
//
// A defesa é em três camadas, porque nenhuma sozinha basta:
//   1. robots.txt   → pede que o crawler nem visite (app/robots.ts);
//   2. meta robots  → noindex/nofollow em cada área privada (NOINDEX abaixo);
//   3. sem links    → o rodapé do site não aponta mais para /crm.
// robots.txt sozinho não desindexa: uma URL bloqueada mas linkada de fora ainda
// aparece no índice "sem descrição". O noindex é o que efetivamente remove.

/** Domínio público canônico. Sem env configurada, cai no domínio de produção. */
export function siteBaseUrl(): string {
  return publicBaseUrl() || "https://reiners.agency";
}

/** Prefixos que nunca devem ser rastreados nem indexados. */
export const PRIVATE_PATHS = [
  "/crm",
  "/app",
  "/admin",
  "/portal",
  "/login",
  "/convite",
  "/proposta",
  "/sign",
  "/api",
] as const;

/** Rotas públicas do estúdio — as únicas que entram no sitemap. */
export const PUBLIC_PATHS = ["/", "/portfolio"] as const;

/**
 * Metadata de área privada. Além de noindex/nofollow, pede aos buscadores que
 * não guardem cache nem snippet — se a URL já foi indexada antes, isso acelera
 * a remoção.
 */
export const NOINDEX: Metadata = {
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false, noimageindex: true },
  },
};

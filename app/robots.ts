import type { MetadataRoute } from "next";
import { PRIVATE_PATHS, siteBaseUrl } from "@/lib/site/seo";

// robots.txt gerado no build. Libera só a vitrine do estúdio; CRM, portal,
// admin, login e páginas por token ficam fora do rastreamento.
//
// Isto é uma instrução, não um cadeado: robots.txt evita o rastreamento, e o
// `noindex` de cada área (lib/site/seo.ts) é o que garante a não indexação.
export default function robots(): MetadataRoute.Robots {
  const base = siteBaseUrl();
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Prefixo sem barra final já cobre a rota e tudo abaixo dela.
        disallow: [...PRIVATE_PATHS],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}

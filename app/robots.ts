import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { PRIVATE_PATHS, siteBaseUrl } from "@/lib/site/seo";
import { subdomainFor } from "@/lib/supabase/middleware";

// robots.txt POR HOST — e é por isso que precisa ser dinâmico.
//
// robots.txt vale para o host que o serviu, e cada host aqui expõe uma raiz
// diferente: no apex `/` é a vitrine do estúdio, mas em crm.<root> `/` é a
// landing do CRM e em app.<root> é o portal. Um robots.txt único dizendo
// "Allow: /" liberava justamente o que se quer esconder nos subdomínios.
export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  const base = siteBaseUrl();
  const sub = subdomainFor(headers().get("host"), process.env.NEXT_PUBLIC_ROOT_DOMAIN);

  // Qualquer subdomínio (crm., app., tenant.) serve área privada na raiz:
  // nada ali deve ser rastreado.
  if (sub) {
    return { rules: [{ userAgent: "*", disallow: "/" }] };
  }

  // Apex e www: a vitrine é liberada, o resto não.
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

import type { MetadataRoute } from "next";
import { PUBLIC_PATHS, siteBaseUrl } from "@/lib/site/seo";

// Sitemap com as rotas do ESTÚDIO apenas. Nenhuma URL de CRM, portal ou admin
// entra aqui — o que não é vitrine não é para ser encontrado.
export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteBaseUrl();
  const now = new Date();

  return PUBLIC_PATHS.map((path) => ({
    url: `${base}${path}`,
    lastModified: now,
    changeFrequency: "weekly" as const,
    priority: path === "/" ? 1 : 0.8,
  }));
}

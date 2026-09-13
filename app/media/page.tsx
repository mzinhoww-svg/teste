import type { Metadata } from "next";
import { getSiteConfig } from "@/lib/site/data";
import { SiteLanding } from "@/components/site/landing";
import { siteBaseUrl } from "@/lib/site/seo";

// Endereço alternativo da landing, para ferramentas externas que pedem uma URL
// específica em vez do domínio. Serve exatamente a mesma composição de `/`.
//
// O `canonical` aponta para `/`: para o buscador isto não é conteúdo duplicado,
// é a mesma página com dois endereços, e os sinais consolidam na raiz. Por isso
// `/media` também fica FORA do sitemap — sitemap lista canônicas.
export const revalidate = 300;

export async function generateMetadata(): Promise<Metadata> {
  const config = await getSiteConfig();
  return {
    title: config.seoTitle ?? `${config.siteName} — ${config.tagline}`,
    description: config.seoDescription ?? undefined,
    alternates: { canonical: `${siteBaseUrl()}/` },
    openGraph: {
      title: config.seoTitle ?? config.siteName,
      description: config.seoDescription ?? undefined,
      url: `${siteBaseUrl()}/`,
      type: "website",
    },
  };
}

export default function MediaLandingPage() {
  return <SiteLanding />;
}

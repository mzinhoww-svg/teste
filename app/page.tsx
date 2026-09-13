import type { Metadata } from "next";
import { getSiteConfig } from "@/lib/site/data";
import { SiteLanding } from "@/components/site/landing";
import { siteBaseUrl } from "@/lib/site/seo";

// Landing pública da Reiners Media (apex: reiners.agency). Esta é a rota
// CANÔNICA do site; `/media` serve a mesma composição como endereço
// alternativo. A composição vive em components/site/landing.tsx.
//
// Revalida a cada 5 min: o conteúdo vem do CMS (/admin/site) mas a página
// continua estática entre revalidações.
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
      // Sem isto o link compartilhado sai sem card no WhatsApp e no LinkedIn.
      images: config.ogImageUrl ? [{ url: config.ogImageUrl, width: 1200, height: 630 }] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title: config.seoTitle ?? config.siteName,
      description: config.seoDescription ?? undefined,
      images: config.ogImageUrl ? [config.ogImageUrl] : undefined,
    },
  };
}

export default function LandingPage() {
  return <SiteLanding />;
}

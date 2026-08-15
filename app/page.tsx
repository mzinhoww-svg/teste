import type { Metadata } from "next";
import { getPlans, getPrograms, getSiteConfig, getTestimonials } from "@/lib/site/data";
import { SiteNavbar } from "@/components/site/navbar";
import { SitePageView } from "@/components/site/page-view";
import { HeroSection } from "@/components/site/sections/hero";
import { PlansSection } from "@/components/site/sections/plans";
import { PortfolioTeaserSection } from "@/components/site/sections/portfolio-teaser";
import { TestimonialsSection } from "@/components/site/sections/testimonials";
import { AboutSection } from "@/components/site/sections/about";
import { FinalCtaSection } from "@/components/site/sections/final-cta";
import { FooterSection } from "@/components/site/sections/footer";
import { WhatsappFab } from "@/components/site/whatsapp-fab";
import { ApolloTracker } from "@/components/site/apollo-tracker";

// Landing pública da Reiners Media (apex: reiners.agency).
// A landing do CRM foi para /crm (também servida em crm.reiners.agency) —
// ver docs/vercel-domain.md.
//
// Revalida a cada 5 min: o conteúdo vem do CMS (/admin/site) mas a página
// continua estática entre revalidações.
export const revalidate = 300;

export async function generateMetadata(): Promise<Metadata> {
  const config = await getSiteConfig();
  return {
    title: config.seoTitle ?? `${config.siteName} — ${config.tagline}`,
    description: config.seoDescription ?? undefined,
    openGraph: {
      title: config.seoTitle ?? config.siteName,
      description: config.seoDescription ?? undefined,
      type: "website",
    },
  };
}

export default async function LandingPage() {
  const [config, plans, programs, testimonials] = await Promise.all([
    getSiteConfig(),
    getPlans(),
    getPrograms({ featuredOnly: true }),
    getTestimonials(),
  ]);

  return (
    <div className="site-root min-h-screen">
      <a href="#conteudo" className="site-skip-link">
        Pular para conteúdo principal
      </a>

      <SiteNavbar siteName={config.siteName} whatsappNumber={config.whatsappNumber} />

      <main id="conteudo">
        <HeroSection config={config} />
        <PlansSection plans={plans} whatsappNumber={config.whatsappNumber} />
        <PortfolioTeaserSection programs={programs} />
        <TestimonialsSection testimonials={testimonials} />
        <AboutSection />
        <FinalCtaSection
          whatsappNumber={config.whatsappNumber}
          location={config.location}
        />
      </main>

      <FooterSection config={config} programs={programs} />
      <WhatsappFab number={config.whatsappNumber} />
      <SitePageView />
      <ApolloTracker />
    </div>
  );
}

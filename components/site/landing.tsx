import { getGuests, getPlans, getPrograms, getServices, getSiteConfig, getTestimonials } from "@/lib/site/data";
import { SiteNavbar } from "@/components/site/navbar";
import { SitePageView } from "@/components/site/page-view";
import { HeroSection } from "@/components/site/sections/hero";
import { ServicesSection } from "@/components/site/sections/services";
import { PlansSection } from "@/components/site/sections/plans";
import { PortfolioTeaserSection } from "@/components/site/sections/portfolio-teaser";
import { TestimonialsSection } from "@/components/site/sections/testimonials";
import { AboutSection } from "@/components/site/sections/about";
import { GuestsSection } from "@/components/site/sections/guests";
import { FinalCtaSection } from "@/components/site/sections/final-cta";
import { FooterSection } from "@/components/site/sections/footer";
import { WhatsappFab } from "@/components/site/whatsapp-fab";
import { ApolloTracker } from "@/components/site/apollo-tracker";

// Composição da landing, compartilhada por `/` e por `/media`.
//
// As duas rotas servem o MESMO conteúdo de propósito: `/media` é um endereço
// alternativo para ferramentas externas que pedem uma URL específica em vez do
// domínio. Por isso a composição vive aqui e não duplicada em cada page.tsx —
// uma seção nova entra uma vez só e as duas rotas acompanham.
//
// Quem é canônica é `/`: ver `alternates.canonical` em app/media/page.tsx.
export async function SiteLanding() {
  const [config, services, plans, programs, testimonials, guests] = await Promise.all([
    getSiteConfig(),
    getServices(),
    getPlans(),
    getPrograms({ featuredOnly: true }),
    getTestimonials(),
    getGuests(),
  ]);

  return (
    <div className="site-root min-h-screen">
      <a href="#conteudo" className="site-skip-link">
        Pular para conteúdo principal
      </a>

      <SiteNavbar siteName={config.siteName} whatsappNumber={config.whatsappNumber} />

      <main id="conteudo">
        <HeroSection config={config} />
        <ServicesSection services={services} />
        <PlansSection plans={plans} whatsappNumber={config.whatsappNumber} />
        <PortfolioTeaserSection programs={programs} />
        <GuestsSection guests={guests} />
        <TestimonialsSection testimonials={testimonials} />
        <AboutSection imageUrl={config.aboutImageUrl} />
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

import type { Metadata } from "next";
import { getPrograms, getSiteConfig } from "@/lib/site/data";
import { SiteNavbar } from "@/components/site/navbar";
import { SitePageView } from "@/components/site/page-view";
import { SiteBadge } from "@/components/site/badge";
import { SiteCard, SiteCardEmpty } from "@/components/site/card";
import { SiteLink } from "@/components/site/link";
import { FooterSection } from "@/components/site/sections/footer";
import { FinalCtaSection } from "@/components/site/sections/final-cta";
import { WhatsappFab } from "@/components/site/whatsapp-fab";

// Portfólio completo (reiners.agency/portfolio). Mesmo design system da
// landing; cada programa tem âncora própria (#slug) usada pelos posters.
export const revalidate = 300;

export const metadata: Metadata = {
  title: "Portfólio — Reiners Media",
  description: "Programas de podcast produzidos pelo estúdio da Reiners Media.",
};

export default async function PortfolioPage() {
  const [config, programs] = await Promise.all([getSiteConfig(), getPrograms()]);

  return (
    <div className="site-root min-h-screen">
      <a href="#conteudo" className="site-skip-link">
        Pular para conteúdo principal
      </a>

      <SiteNavbar siteName={config.siteName} whatsappNumber={config.whatsappNumber} />

      <main id="conteudo">
        <section className="bg-site-surface-base px-6 pb-16 pt-24" aria-labelledby="portfolio-title">
          <div className="mx-auto max-w-6xl">
            <SiteBadge>Portfólio</SiteBadge>
            <h1 id="portfolio-title" className="mt-4 text-site-display font-medium text-site-text-primary">
              Programas que criamos
            </h1>
            <p className="mt-6 max-w-[520px] text-site-base text-site-text-primary/70">
              Séries institucionais, videocasts e episódios in loco produzidos de ponta a ponta —
              da pauta à distribuição.
            </p>
          </div>
        </section>

        <section className="bg-site-surface-raised px-6 py-24">
          <div className="mx-auto max-w-6xl">
            {programs.length === 0 ? (
              <SiteCardEmpty>Programas em breve.</SiteCardEmpty>
            ) : (
              <ul className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {programs.map((program) => (
                  <li key={program.id} id={program.slug} className="scroll-mt-24">
                    <SiteCard variant="plan" interactive className="flex h-full flex-col">
                      <div
                        aria-hidden="true"
                        className="mb-6 aspect-[16/9] overflow-hidden rounded-site-sm border border-site-border-muted/[0.06] bg-site-surface-raised bg-[radial-gradient(circle_at_30%_20%,rgb(var(--site-text-inverse)/0.16),transparent_60%)]"
                      >
                        {program.posterUrl && (
                          // eslint-disable-next-line @next/next/no-img-element -- URL vinda do CMS (host livre)
                          <img
                            src={program.posterUrl}
                            alt=""
                            className="h-full w-full object-cover"
                            loading="lazy"
                          />
                        )}
                      </div>

                      {program.category && <SiteBadge>{program.category}</SiteBadge>}

                      <h2 className="mt-3 text-site-2xl font-medium text-site-text-primary">
                        {program.title}
                      </h2>
                      {program.client && (
                        <p className="mt-1 text-site-sm text-site-text-primary/50">{program.client}</p>
                      )}
                      {program.description && (
                        <p className="mt-4 text-site-base text-site-text-primary/75">
                          {program.description}
                        </p>
                      )}

                      {program.listenUrl && (
                        <p className="mt-auto pt-6">
                          <SiteLink href={program.listenUrl} variant="cta" touch>
                            Ouvir episódio
                          </SiteLink>
                        </p>
                      )}
                    </SiteCard>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <FinalCtaSection
          whatsappNumber={config.whatsappNumber}
          location={config.location}
        />
      </main>

      <FooterSection config={config} programs={programs} />
      <WhatsappFab number={config.whatsappNumber} />
      <SitePageView />
    </div>
  );
}

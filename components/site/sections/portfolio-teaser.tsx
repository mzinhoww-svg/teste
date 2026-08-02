import { ArrowRight } from "lucide-react";
import { SiteBadge } from "../badge";
import { SiteCardEmpty } from "../card";
import { SiteLink } from "../link";
import { SitePoster } from "../poster";
import type { Program } from "@/lib/site/content";

// Seção 3 — Teaser do portfólio. Grade de posters 2:3 + link para /portfolio.

export function PortfolioTeaserSection({ programs }: { programs: Program[] }) {
  return (
    <section className="bg-site-surface-base px-6 py-24" aria-labelledby="portfolio-title">
      <div className="mx-auto max-w-6xl">
        <SiteBadge>Portfólio</SiteBadge>
        <h2 id="portfolio-title" className="mt-4 text-site-h2 font-medium text-site-text-primary">
          Programas que criamos
        </h2>
        <p className="mt-3 max-w-[520px] text-site-base text-site-text-primary/70">
          Conheça os podcasts produzidos pelo nosso estúdio.
        </p>

        {programs.length === 0 ? (
          <SiteCardEmpty>Programas em breve.</SiteCardEmpty>
        ) : (
          <div className="mt-12 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {programs.slice(0, 5).map((program) => (
              <SitePoster key={program.id} program={program} />
            ))}
          </div>
        )}

        <p className="mt-10">
          <SiteLink href="/portfolio" variant="inline" touch className="inline-flex items-center gap-2">
            Ver portfólio completo
            <ArrowRight className="h-4 w-4" aria-hidden />
          </SiteLink>
        </p>
      </div>
    </section>
  );
}

import { SiteBadge } from "../badge";
import { SiteButtonLink } from "../button";
import { HeroMedia } from "../hero-media";
import type { SiteConfig } from "@/lib/site/content";

// Seção 1 — Hero. Ocupa a viewport (mín. 600px), mídia de fundo a 35% e dois
// gradientes de leitura (topo e base) para o texto manter contraste sobre
// qualquer vídeo.
//
// Banda escura de propósito (como a capa do manual de marca): o vídeo do
// HeroMedia é sempre renderizado a 35% de opacidade, então o fundo da seção
// PRECISA ser escuro (bg-manual-navy) — sobre o Creme do resto do site, o
// vídeo a 35% ficaria lavado/pastel. Texto/ícones aqui usam os tokens
// `manual-*` (creme/ouro-claro), não `site-*` — são a exceção "banda escura"
// do site, junto com Final CTA e Footer.

export function HeroSection({ config }: { config: SiteConfig }) {
  return (
    <section className="relative flex min-h-[600px] items-center overflow-hidden bg-manual-navy lg:min-h-[calc(100vh-4rem)]">
      <HeroMedia videoUrl={config.heroVideoUrl} imageUrl={config.heroImageUrl} />

      <span
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-1/3 bg-gradient-to-b from-manual-navy/70 to-transparent"
      />
      <span
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-manual-navy/90 to-transparent"
      />

      <div className="relative mx-auto w-full max-w-6xl px-6 py-24">
        <SiteBadge className="text-manual-ouro-claro">
          {config.tagline} · {config.location}
        </SiteBadge>

        <h1 className="mt-6 max-w-[640px] font-serif text-site-display font-normal text-manual-creme">
          Seu podcast com produção de nível internacional
        </h1>

        <p className="mt-6 max-w-[520px] text-site-base text-manual-creme/80">
          Gravação, edição, mixagem, identidade visual e distribuição. Tudo em um só lugar.
        </p>

        <div className="mt-10 flex flex-wrap gap-4">
          <SiteButtonLink
            href={config.ctaPrimaryUrl}
            variant="primary"
            className="bg-manual-ouro-claro text-manual-navy"
          >
            {config.ctaPrimaryText}
          </SiteButtonLink>
          <SiteButtonLink
            href={config.ctaSecondaryUrl}
            variant="secondary"
            className="border-manual-creme/25 text-manual-creme hover:border-manual-ouro-claro hover:text-manual-ouro-claro"
          >
            {config.ctaSecondaryText}
          </SiteButtonLink>
        </div>
      </div>

      <a
        href="#planos"
        aria-label="Ir para os planos"
        className="absolute bottom-6 left-1/2 grid h-11 w-11 -translate-x-1/2 place-items-center rounded-site-step8 text-manual-creme/40 transition-colors duration-fast hover:text-manual-ouro-claro"
      >
        <svg
          viewBox="0 0 24 24"
          className="h-6 w-6 animate-site-bounce-down"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          aria-hidden="true"
        >
          <path d="M12 5v14M6 13l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </a>
    </section>
  );
}

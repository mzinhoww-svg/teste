import { SiteBadge } from "../badge";
import { SiteCarousel } from "../carousel";
import { BACKSTAGE_PHOTOS } from "@/lib/site/gallery";

// Seção — Bastidores. Fotos de gravações reais com clientes, sem legenda e
// sem nome: quem aparece não é identificado no site. Prova social por
// imagem, no mesmo carrossel nativo (scroll-snap) das demais seções.
//
// Fundo branco (surface-raised) para manter a alternância de fundos da
// landing depois do teaser do portfólio, que é creme.

export function BackstageSection() {
  return (
    <section id="bastidores" className="bg-site-surface-raised px-6 py-24" aria-labelledby="bastidores-title">
      <div className="mx-auto max-w-6xl">
        <SiteBadge>Bastidores</SiteBadge>
        <h2 id="bastidores-title" className="mt-4 max-w-[640px] font-serif text-site-h2 font-semibold text-site-text-primary">
          Por dentro de uma gravação
        </h2>
        <p className="mt-4 max-w-[560px] text-site-base text-site-text-primary/70">
          Luz, câmeras, monitores e equipe: os bastidores de gravações com clientes no estúdio.
        </p>

        <div className="mt-12">
          <SiteCarousel
            label="Bastidores de gravações com clientes"
            itemClassName="w-[62vw] sm:w-[36vw] md:w-[calc((100%-4.5rem)/4)]"
          >
            {BACKSTAGE_PHOTOS.map((p) => (
              <div
                key={p.src}
                className="aspect-[4/5] overflow-hidden rounded-site-sm border border-site-border-muted/[0.06] bg-site-surface-base"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- WebP estático já dimensionado em /public */}
                <img
                  src={p.src}
                  width={p.width}
                  height={p.height}
                  alt={p.alt}
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover"
                  style={p.position ? { objectPosition: p.position } : undefined}
                />
              </div>
            ))}
          </SiteCarousel>
        </div>
      </div>
    </section>
  );
}

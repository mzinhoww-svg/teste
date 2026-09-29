import { SiteBadge } from "../badge";
import { SiteCarousel } from "../carousel";
import { SCENARIOS } from "@/lib/site/gallery";

// Seção — Cenários do estúdio. Cinco fotos 2:3, cada uma com nome e uma linha
// sobre o formato de podcast que o cenário atende.
//
// Banda escura de propósito (Navy, como Hero e CTA final): fotos de tons
// quentes ganham profundidade sobre o navy, e a alternância de fundos da
// landing (creme → branco → navy → creme → branco → creme → navy) se mantém.
// Por isso os tokens `manual-*` em vez de `site-*` (que são a versão clara).
//
// Do `md` em diante os cinco cabem lado a lado e o carrossel nem mostra os
// botões; no mobile é rolagem nativa com snap.

export function ScenariosSection() {
  return (
    <section id="cenarios" className="bg-manual-navy px-6 py-24" aria-labelledby="cenarios-title">
      <div className="mx-auto max-w-6xl">
        <SiteBadge className="text-manual-ouro-claro">Cenários</SiteBadge>
        <h2 id="cenarios-title" className="mt-4 max-w-[640px] font-serif text-site-h2 font-semibold text-manual-creme">
          Um estúdio, vários cenários
        </h2>
        <p className="mt-4 max-w-[560px] text-site-base text-manual-creme/80">
          Aqui não existe cenário fixo: o acervo de direção de arte tem móveis e decoração para compor o
          ambiente do seu programa. Você escolhe e deixamos tudo pronto para te receber.
        </p>

        <div className="mt-12">
          <SiteCarousel
            label="Cenários do estúdio"
            itemClassName="w-[62vw] sm:w-[36vw] md:w-[calc((100%-6rem)/5)]"
          >
            {SCENARIOS.map((s, i) => (
              <figure key={s.id} className="flex flex-col gap-4">
                <div className="aspect-[2/3] overflow-hidden rounded-site-sm border border-manual-creme/10 bg-manual-tinta">
                  {/* eslint-disable-next-line @next/next/no-img-element -- WebP estático já dimensionado em /public */}
                  <img
                    src={s.src}
                    width={s.width}
                    height={s.height}
                    alt={s.alt}
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover"
                    style={s.position ? { objectPosition: s.position } : undefined}
                  />
                </div>
                <figcaption>
                  <span className="block font-manual-mono text-[11px] font-semibold uppercase leading-none tracking-[0.16em] text-manual-ouro-claro">
                    {String(i + 1).padStart(2, "0")} — {s.name}
                  </span>
                  <span className="mt-2 block text-[15px] leading-snug text-manual-creme/80">{s.description}</span>
                </figcaption>
              </figure>
            ))}
          </SiteCarousel>
        </div>
      </div>
    </section>
  );
}

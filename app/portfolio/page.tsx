import { Suspense } from "react";
import { listPodcasts, getSiteConfig } from "@/lib/portfolio/data";
import { CatalogGrid } from "@/components/portfolio/CatalogGrid";
import { FeaturedCarousel } from "@/components/portfolio/FeaturedCarousel";
import { PageViewTracker } from "@/components/portfolio/PageViewTracker";
import { SkeletonGrid } from "@/components/portfolio/PodcastPoster";

export const dynamic = "force-dynamic";

/**
 * O skeleton fica em um <Suspense> AQUI, e não em um `loading.tsx`.
 *
 * `app/portfolio/loading.tsx` criaria um boundary de Suspense sobre o segmento
 * inteiro — incluindo `/portfolio/[slug]`. O Next então enviaria o shell com
 * status 200 antes de a página resolver, e um `notFound()` em um slug
 * inexistente respondia **200** com a UI de 404: mentira para buscadores e
 * monitoramento. Escopando o boundary à página índice, o skeleton continua
 * aparecendo e `/portfolio/slug-inexistente` volta a responder 404.
 */
export default function PortfolioPage() {
  return (
    <main>
      <PageViewTracker page="/portfolio" />

      {/* Hero — estático, renderiza imediatamente */}
      <section className="relative flex min-h-[280px] items-end overflow-hidden px-6 pb-12 pt-16">
        <div aria-hidden className="pf-hero-overlay absolute inset-0" />
        <div className="relative mx-auto w-full max-w-6xl">
          <p className="text-pf-xs uppercase tracking-pf-meta text-pf-inverse">Portfólio</p>
          <h1 className="mt-3 text-pf-hero font-medium text-pf-primary">Nossos programas</h1>
          <p className="mt-4 max-w-2xl text-pf-base text-pf-primary/70">
            Cada podcast é uma identidade sonora e visual única.
          </p>
        </div>
      </section>

      <Suspense fallback={<CatalogFallback />}>
        <CatalogSections />
      </Suspense>
    </main>
  );
}

function CatalogFallback() {
  return (
    <section className="px-6 py-8">
      <div className="mx-auto max-w-6xl">
        <div className="pf-skeleton h-5 w-40 rounded-pf-xs" />
        <div className="mt-6">
          <SkeletonGrid count={10} />
        </div>
      </div>
    </section>
  );
}

async function CatalogSections() {
  const [podcasts, config] = await Promise.all([listPodcasts(), getSiteConfig()]);
  const featured = podcasts.filter((p) => p.featured).slice(0, 3);

  return (
    <>
      {featured.length > 0 && (
        <section aria-labelledby="destaques" className="px-6 py-8">
          <div className="mx-auto max-w-6xl">
            <h2 id="destaques" className="mb-4 text-pf-2xl font-medium text-pf-primary">
              Destaques
            </h2>
            <FeaturedCarousel podcasts={featured} />
          </div>
        </section>
      )}

      <section aria-labelledby="programas-titulo" className="px-6 py-8" id="programas">
        <div className="mx-auto max-w-6xl">
          <h2 id="programas-titulo" className="mb-4 text-pf-2xl font-medium text-pf-primary">
            Todos os programas
          </h2>
          <p className="mb-6 max-w-2xl text-pf-sm text-pf-primary/60">
            Clique em um programa para abrir os detalhes aqui mesmo. Duplo clique — ou o botão
            &ldquo;Ver página&rdquo; — abre a página completa.
          </p>
          <CatalogGrid podcasts={podcasts} />
        </div>
      </section>

      <section aria-labelledby="sobre-titulo" className="px-6 py-12" id="sobre">
        <div className="mx-auto grid max-w-6xl gap-8 md:grid-cols-2">
          <div>
            <h2 id="sobre-titulo" className="text-pf-2xl font-medium text-pf-primary">
              Sobre
            </h2>
            <p className="mt-3 text-pf-base text-pf-primary/70">
              A {config.siteName} produz comunicação institucional contínua: o estúdio vai até a
              organização e transforma bastidor em presença de marca. Cada programa deste catálogo
              nasce de um diagnóstico e segue uma cadência própria de publicação.
            </p>
          </div>
          <div id="contato">
            <h2 className="text-pf-2xl font-medium text-pf-primary">Contato</h2>
            <p className="mt-3 text-pf-base text-pf-primary/70">
              Para levar um programa à sua operação, fale com a equipe comercial.
            </p>
            <a
              href="/"
              className="mt-4 inline-flex min-h-[44px] items-center rounded-pf-md bg-pf-inverse px-4 text-pf-xl font-medium text-pf-base transition-shadow duration-pf-fast ease-pf hover:shadow-pf-3"
            >
              Falar com a {config.siteName}
            </a>
          </div>
        </div>
      </section>
    </>
  );
}

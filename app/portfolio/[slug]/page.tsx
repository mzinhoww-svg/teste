import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPodcastBySlug } from "@/lib/portfolio/data";
import { PosterArt } from "@/components/portfolio/PodcastPoster";
import { PodcastTabs } from "@/components/portfolio/PodcastTabs";
import { PageViewTracker } from "@/components/portfolio/PageViewTracker";
import { MetaLine, StatusBadge } from "@/components/portfolio/primitives";
import { accentStyle } from "@/lib/portfolio/tokens";

// O catálogo é editável pelo admin e revalidado por `revalidatePath`, então a
// página é sempre dinâmica.
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const podcast = await getPodcastBySlug(params.slug);
  if (!podcast) notFound();

  const description = podcast.tagline ?? podcast.description.slice(0, 160);
  return {
    title: `${podcast.title} — Portfólio`,
    description,
    openGraph: {
      title: podcast.title,
      description,
      type: "website",
      images: podcast.heroImage ?? podcast.coverImage ?? undefined,
    },
  };
}

export default async function PodcastPage({ params }: { params: { slug: string } }) {
  const podcast = await getPodcastBySlug(params.slug);
  if (!podcast) notFound();

  return (
    <main style={accentStyle(podcast.accentColor)}>
      <PageViewTracker page="/portfolio/[slug]" slug={podcast.slug} />

      {/* Hero — cover art 21:9 com overlay surface.base → transparente */}
      <section className="relative">
        <div className="relative aspect-[21/9] max-h-[520px] w-full overflow-hidden">
          <PosterArt
            visualStyle={podcast.visualStyle}
            coverImage={podcast.heroImage || podcast.coverImage || undefined}
            title={podcast.title}
          />
          <div aria-hidden className="pf-hero-overlay absolute inset-0" />
        </div>

        <div className="mx-auto -mt-24 max-w-6xl px-6 pb-6">
          <Link
            href="/portfolio"
            className="inline-flex min-h-[44px] items-center text-pf-xs uppercase tracking-pf-meta text-pf-primary/50 transition-colors duration-pf-fast ease-pf hover:text-pf-inverse"
          >
            ← Voltar ao catálogo
          </Link>
          <h1 className="mt-2 text-pf-program font-medium text-pf-primary">{podcast.title}</h1>
          {podcast.tagline ? (
            <p className="mt-2 max-w-2xl text-pf-base text-pf-primary/70">{podcast.tagline}</p>
          ) : null}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <StatusBadge status={podcast.status} />
            <MetaLine items={[podcast.category, podcast.year, `${podcast.episodes.length} episódios`]} />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-16">
        <PodcastTabs podcast={podcast} />
      </section>
    </main>
  );
}

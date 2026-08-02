import Link from "next/link";
import { listAllEpisodes, listPodcasts } from "@/lib/portfolio/data";
import { PageTitle } from "@/components/portfolio/admin/AdminUI";
import { EpisodeList } from "@/components/portfolio/admin/EpisodeList";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

export default async function EpisodiosPage({
  searchParams,
}: {
  searchParams: { page?: string };
}) {
  const page = Math.max(1, Number(searchParams.page ?? 1) || 1);
  // Nunca carrega tudo: uma página por vez (anti-pattern §7).
  const [episodes, podcasts] = await Promise.all([
    listAllEpisodes({ skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE + 1 }),
    listPodcasts({ episodesPerPodcast: 0 }),
  ]);

  const hasNext = episodes.length > PAGE_SIZE;
  const rows = episodes.slice(0, PAGE_SIZE);

  return (
    <>
      <PageTitle
        title="Episódios"
        action={
          <Link
            href="/admin/portfolio/episodios/novo"
            className="inline-flex min-h-[44px] items-center rounded-pf-md bg-pf-inverse px-4 text-pf-xl font-medium text-pf-base"
          >
            Novo episódio
          </Link>
        }
      />

      <p className="mb-6 text-pf-sm text-pf-primary/60">
        {podcasts.length} programa(s) · página {page}
      </p>

      <EpisodeList episodes={rows} />

      <nav aria-label="Paginação" className="mt-6 flex gap-3">
        {page > 1 ? (
          <Link
            href={`/admin/portfolio/episodios?page=${page - 1}`}
            className="inline-flex min-h-[44px] items-center rounded-pf-md border border-pf-muted/[0.15] px-4 text-pf-xl text-pf-primary hover:border-pf-inverse hover:text-pf-inverse"
          >
            ← Anterior
          </Link>
        ) : null}
        {hasNext ? (
          <Link
            href={`/admin/portfolio/episodios?page=${page + 1}`}
            className="inline-flex min-h-[44px] items-center rounded-pf-md border border-pf-muted/[0.15] px-4 text-pf-xl text-pf-primary hover:border-pf-inverse hover:text-pf-inverse"
          >
            Próxima →
          </Link>
        ) : null}
      </nav>
    </>
  );
}

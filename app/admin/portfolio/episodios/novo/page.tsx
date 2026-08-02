import { listPodcasts } from "@/lib/portfolio/data";
import { PageTitle } from "@/components/portfolio/admin/AdminUI";
import { EpisodeForm } from "@/components/portfolio/admin/EpisodeForm";

export const dynamic = "force-dynamic";

export default async function NovoEpisodioPage({
  searchParams,
}: {
  searchParams: { podcastId?: string };
}) {
  const podcasts = await listPodcasts({ episodesPerPodcast: 0 });

  return (
    <>
      <PageTitle title="Novo episódio" />
      <EpisodeForm
        podcasts={podcasts.map((p) => ({ id: p.id, title: p.title }))}
        defaultPodcastId={searchParams.podcastId}
      />
    </>
  );
}

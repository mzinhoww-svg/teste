import { notFound } from "next/navigation";
import { getEpisodeById, listPodcasts } from "@/lib/portfolio/data";
import { PageTitle } from "@/components/portfolio/admin/AdminUI";
import { EpisodeForm } from "@/components/portfolio/admin/EpisodeForm";

export const dynamic = "force-dynamic";

export default async function EditarEpisodioPage({ params }: { params: { id: string } }) {
  const [episode, podcasts] = await Promise.all([
    getEpisodeById(params.id),
    listPodcasts({ episodesPerPodcast: 0 }),
  ]);
  if (!episode) notFound();

  return (
    <>
      <PageTitle title={`Editar — ${episode.title}`} />
      <EpisodeForm
        episode={episode}
        podcasts={podcasts.map((p) => ({ id: p.id, title: p.title }))}
      />
    </>
  );
}

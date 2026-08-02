import { notFound } from "next/navigation";
import { getPodcastById } from "@/lib/portfolio/data";
import { PageTitle } from "@/components/portfolio/admin/AdminUI";
import { PodcastForm } from "@/components/portfolio/admin/PodcastForm";

export const dynamic = "force-dynamic";

export default async function EditarProgramaPage({ params }: { params: { id: string } }) {
  const podcast = await getPodcastById(params.id);
  if (!podcast) notFound();

  return (
    <>
      <PageTitle title={`Editar — ${podcast.title}`} />
      <PodcastForm podcast={podcast} />
    </>
  );
}

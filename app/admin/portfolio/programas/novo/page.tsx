import { PageTitle } from "@/components/portfolio/admin/AdminUI";
import { PodcastForm } from "@/components/portfolio/admin/PodcastForm";

export const dynamic = "force-dynamic";

export default function NovoProgramaPage() {
  return (
    <>
      <PageTitle title="Novo programa" />
      <PodcastForm />
    </>
  );
}

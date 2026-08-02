import Link from "next/link";
import { listPodcasts } from "@/lib/portfolio/data";
import { getPortfolioSession } from "@/lib/portfolio/auth";
import { PageTitle } from "@/components/portfolio/admin/AdminUI";
import { PodcastList } from "@/components/portfolio/admin/PodcastList";

export const dynamic = "force-dynamic";

export default async function ProgramasPage() {
  const [podcasts, session] = await Promise.all([listPodcasts(), getPortfolioSession()]);

  return (
    <>
      <PageTitle
        title="Programas"
        action={
          <Link
            href="/admin/portfolio/programas/novo"
            className="inline-flex min-h-[44px] items-center rounded-pf-md bg-pf-inverse px-4 text-pf-xl font-medium text-pf-base"
          >
            Novo programa
          </Link>
        }
      />
      <p className="mb-6 text-pf-sm text-pf-primary/60">
        Arraste para reordenar (ou use ↑ / ↓). A ordem define a sequência no grid público.
      </p>
      <PodcastList podcasts={podcasts} canDelete={session?.role === "ADMIN"} />
    </>
  );
}

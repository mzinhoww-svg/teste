import Link from "next/link";
import { getDashboardStats } from "@/lib/portfolio/data";
import { Card, PageTitle } from "@/components/portfolio/admin/AdminUI";
import { DashboardChart } from "@/components/portfolio/admin/DashboardChart";

export const dynamic = "force-dynamic";

function Kpi({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <p className="text-pf-xs uppercase tracking-pf-meta text-pf-primary/50">{label}</p>
      <p className="pf-tabular mt-2 text-pf-panel font-medium text-pf-primary">{value}</p>
    </Card>
  );
}

export default async function PortfolioDashboard() {
  const stats = await getDashboardStats();

  return (
    <>
      <PageTitle
        title="Dashboard"
        action={
          <Link
            href="/admin/portfolio/programas/novo"
            className="inline-flex min-h-[44px] items-center rounded-pf-md bg-pf-inverse px-4 text-pf-xl font-medium text-pf-base"
          >
            Novo programa
          </Link>
        }
      />

      {!stats.databaseConfigured && (
        <p className="mb-6 rounded-pf-md border border-pf-inverse/25 bg-pf-inverse/[0.12] px-4 py-3 text-pf-sm text-pf-inverse">
          Sem <code>DATABASE_URL</code>: o catálogo está exibindo o dataset de demonstração e a
          gravação está desativada. Configure o banco e rode <code>npm run portfolio:seed</code>.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Total de programas" value={stats.totalPodcasts} />
        <Kpi label="Total de episódios" value={stats.totalEpisodes} />
        <Kpi label="Episódios no mês" value={stats.episodesThisMonth} />
        <Kpi label="Em destaque" value={stats.featuredCount} />
      </div>

      <section className="mt-6">
        <Card>
          <h2 className="mb-4 text-pf-2xl font-medium text-pf-primary">Últimos 30 dias</h2>
          <DashboardChart data={stats.series} />
          <div className="mt-4 flex flex-wrap gap-6">
            <span className="flex items-center gap-2 text-pf-xs uppercase tracking-pf-meta text-pf-primary/50">
              <span aria-hidden className="h-[2px] w-6 bg-pf-inverse" /> Visualizações
            </span>
            <span className="flex items-center gap-2 text-pf-xs uppercase tracking-pf-meta text-pf-primary/50">
              <span aria-hidden className="h-[2px] w-6 bg-pf-primary/30" /> Expansões de card
            </span>
          </div>
        </Card>
      </section>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-4 text-pf-2xl font-medium text-pf-primary">Cliques por trilha</h2>
          <dl className="flex gap-8">
            <div>
              <dt className="text-pf-xs uppercase tracking-pf-meta text-pf-primary/50">YouTube</dt>
              <dd className="pf-tabular mt-1 text-pf-panel font-medium text-pf-primary">
                {stats.trackClicks.youtube}
              </dd>
            </div>
            <div>
              <dt className="text-pf-xs uppercase tracking-pf-meta text-pf-primary/50">Spotify</dt>
              <dd className="pf-tabular mt-1 text-pf-panel font-medium text-pf-primary">
                {stats.trackClicks.spotify}
              </dd>
            </div>
          </dl>
        </Card>

        <Card>
          <h2 className="mb-4 text-pf-2xl font-medium text-pf-primary">Programas mais clicados</h2>
          {stats.topPodcasts.length ? (
            <ol className="flex flex-col gap-2">
              {stats.topPodcasts.map((p) => (
                <li key={p.title} className="flex items-center justify-between gap-4">
                  <span className="truncate text-pf-base text-pf-primary">{p.title}</span>
                  <span className="pf-tabular text-pf-sm text-pf-primary/60">{p.clicks}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-pf-sm text-pf-primary/30">Ainda sem cliques registrados</p>
          )}
        </Card>
      </div>
    </>
  );
}

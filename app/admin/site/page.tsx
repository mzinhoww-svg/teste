import { getSiteKpis } from "@/lib/site/admin";
import { getPlans, getPrograms, getTestimonials } from "@/lib/site/data";
import { SiteCard } from "@/components/site/card";
import { KpiChart } from "@/components/site/admin/kpi-chart";

export const dynamic = "force-dynamic";

function Kpi({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <SiteCard variant="plain">
      <p className="text-site-xs font-medium uppercase text-site-text-inverse">{label}</p>
      <p className="mt-2 text-site-h2 font-medium text-site-text-primary">{value}</p>
      {hint && <p className="mt-1 text-site-sm text-site-text-primary/50">{hint}</p>}
    </SiteCard>
  );
}

export default async function SiteAdminDashboard() {
  const [kpis, plans, testimonials, programs] = await Promise.all([
    getSiteKpis(),
    getPlans(),
    getTestimonials(),
    getPrograms(),
  ]);

  const conversion = kpis.pageViews
    ? `${((kpis.ctaClicks / kpis.pageViews) * 100).toFixed(1)}%`
    : "—";

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-site-h2 font-medium text-site-text-primary">Dashboard</h1>
      <p className="mt-2 text-site-base text-site-text-primary/60">
        Últimos 14 dias. Coleta própria, sem cookies e sem terceiros.
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Visitas" value={kpis.pageViews} />
        <Kpi label="Cliques em CTA" value={kpis.ctaClicks} hint={`Conversão ${conversion}`} />
        <Kpi label="Formulários" value={kpis.formSubmits} hint="Pedidos de sessão" />
        <Kpi
          label="Conteúdo"
          value={`${plans.length}/${testimonials.length}/${programs.length}`}
          hint="Planos / depoimentos / programas"
        />
      </div>

      <SiteCard variant="plain" className="mt-6">
        <h2 className="text-site-2xl font-medium text-site-text-primary">Visitas e cliques por dia</h2>
        <div className="mt-6">
          <KpiChart data={kpis.series} />
        </div>
      </SiteCard>
    </div>
  );
}

import Link from "next/link";
import { AlertTriangle, TrendingUp, Target, Trophy } from "lucide-react";
import { getManagementData } from "@/lib/db";
import { brl } from "@/lib/format";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata = { title: "Pipeline review — CRM AI Studio" };
export const dynamic = "force-dynamic";

function Stat({ label, value, hint, icon: Icon }: { label: string; value: string; hint?: string; icon: any }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-500"><Icon className="h-3.5 w-3.5" aria-hidden /> {label}</div>
      <div className="mt-1 text-2xl font-bold text-slate-900 dark:text-slate-100">{value}</div>
      {hint && <div className="text-xs text-slate-400">{hint}</div>}
    </div>
  );
}

export default async function PipelineReviewPage() {
  const data = await getManagementData();
  if (!data) return <main className="p-6"><EmptyState icon={AlertTriangle} title="Sem dados" description="Configure o funil e crie deals." /></main>;

  const atingimento = data.goalRevenue > 0 ? Math.round((data.wonValueMonth / data.goalRevenue) * 100) : null;

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      <div className="mb-5">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Pipeline review</h1>
        <p className="text-sm text-slate-500 capitalize">{data.monthLabel}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat icon={Trophy} label="Ganho no mês" value={brl(data.wonValueMonth)} hint={`${data.wonCountMonth} deal(s)`} />
        <Stat icon={TrendingUp} label="Forecast (aberto)" value={brl(data.forecastOpen)} hint="Σ valor × probabilidade" />
        <Stat icon={Target} label="Meta do mês" value={data.goalRevenue ? brl(data.goalRevenue) : "—"} hint={atingimento != null ? `${atingimento}% atingido` : "defina em Metas"} />
        <Stat icon={AlertTriangle} label="Deals em risco" value={String(data.atRisk.length)} hint="parados / sem ação" />
      </div>

      <section className="mt-8">
        <h2 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">Ranking por vendedor</h2>
        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500 dark:bg-slate-800/50">
              <tr><th className="px-3 py-2">Vendedor</th><th className="px-3 py-2 text-right">Ganho no mês</th><th className="px-3 py-2 text-right">Ganhos</th><th className="px-3 py-2 text-right">Abertos</th><th className="px-3 py-2 text-right">Forecast</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {data.sellers.map((s) => (
                <tr key={s.userId}>
                  <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{s.email}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium">{brl(s.wonValue)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{s.wonCount}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{s.openCount} · {brl(s.openValue)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-500">{brl(s.forecast)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">Deals em risco</h2>
        {data.atRisk.length === 0 ? (
          <p className="text-sm text-slate-400">Nenhum deal em risco. 🎉</p>
        ) : (
          <ul className="space-y-2">
            {data.atRisk.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
                <div className="min-w-0">
                  <Link href={`/app?deal=${d.id}`} className="text-sm font-medium text-brand-600 hover:underline dark:text-brand-300">{d.title}</Link>
                  <div className="text-xs text-slate-400">{d.stage}{d.ownerEmail ? ` · ${d.ownerEmail}` : ""}</div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="rounded-full bg-rose-100 px-2.5 py-1 text-[11px] font-medium text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">{d.reason}</span>
                  <span className="tabular-nums text-sm font-semibold text-slate-700 dark:text-slate-300">{brl(d.amount)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

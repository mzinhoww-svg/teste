import { Nav } from "@/components/Nav";
import { maturity, metrics, workflow } from "@/lib/product";

export const metadata = { title: "Como funciona — CRM AI Studio" };

export default function HowItWorksPage() {
  return (
    <div className="min-h-screen">
      <Nav active="how" />
      <main className="mx-auto max-w-5xl px-6 py-6">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-slate-900">Como funciona</h1>
          <p className="text-sm text-slate-500">
            Da entrada do lead ao onboarding do cliente — um fluxo orquestrado por agentes de IA.
          </p>
        </div>

        {/* Métricas */}
        <section className="mb-10 grid gap-4 sm:grid-cols-3">
          {metrics.map((m) => (
            <div key={m.value} className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="text-3xl font-bold text-brand-600">{m.value}</div>
              <div className="mt-1 text-sm font-medium text-slate-800">{m.label}</div>
              <div className="mt-1 text-xs text-slate-400">{m.detail}</div>
            </div>
          ))}
        </section>

        {/* Workflow de 8 passos */}
        <section className="mb-10">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">Workflow orquestrado — 8 passos</h2>
          <ol className="relative space-y-4 border-l border-slate-200 pl-6">
            {workflow.map((w) => (
              <li key={w.step} className="relative">
                <span className="absolute -left-[31px] grid h-6 w-6 place-items-center rounded-full bg-brand-600 text-xs font-bold text-white">{w.step}</span>
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <h3 className="text-sm font-semibold text-slate-800">{w.title}</h3>
                  <ul className="mt-2 space-y-1">
                    {w.points.map((p, i) => (
                      <li key={i} className="flex gap-1.5 text-sm text-slate-600"><span className="text-brand-400">•</span>{p}</li>
                    ))}
                  </ul>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* Maturidade */}
        <section>
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">Maturidade da operação — tempo de ciclo</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {maturity.map((m) => (
              <div
                key={m.level}
                className={`rounded-xl border p-4 ${m.highlight ? "border-brand-300 bg-brand-50" : "border-slate-200 bg-white"}`}
              >
                <div className="flex items-center justify-between">
                  <span className={`text-sm font-semibold ${m.highlight ? "text-brand-700" : "text-slate-700"}`}>{m.level}</span>
                  {m.reduction && <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-medium text-rose-700">{m.reduction}</span>}
                </div>
                <div className={`mt-1 text-2xl font-bold ${m.highlight ? "text-brand-700" : "text-slate-900"}`}>{m.time}</div>
                <ul className="mt-3 space-y-1">
                  {m.notes.map((n, i) => (
                    <li key={i} className="text-xs text-slate-500">{n}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

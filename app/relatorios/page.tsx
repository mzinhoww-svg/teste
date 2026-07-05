import { Nav } from "@/components/Nav";
import { createClient } from "@/lib/supabase/server";
import { getBoard, getOrgId } from "@/lib/db";
import { brl } from "@/lib/format";

export const metadata = { title: "Relatórios — CRM AI Studio" };

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-bold text-slate-900">{value}</div>
      {hint && <div className="text-xs text-slate-400">{hint}</div>}
    </div>
  );
}

const AGENT_LABEL: Record<string, string> = {
  "lead-nurturing": "Nutrição", "lead-scoring": "Lead Scoring", "sales-copilot": "Copiloto de Vendas",
  proposal: "Proposta", "legal-contract": "Jurídico/Contratos", activities: "Atividades",
  coaching: "Coaching", "sales-feedback": "Feedback", "support-copilot": "Atendimento",
};

export default async function ReportsPage() {
  const supabase = createClient();
  const orgId = await getOrgId();
  const { pipeline, deals } = await getBoard();

  const [{ data: runs }, { count: contractCount }, { count: proposalCount }, { count: msgCount }] = await Promise.all([
    supabase.from("agent_runs").select("agent_kind, source, created_at, input").eq("org_id", orgId ?? "").order("created_at", { ascending: false }).limit(200),
    supabase.from("contracts").select("id", { count: "exact", head: true }).eq("org_id", orgId ?? ""),
    supabase.from("proposals").select("id", { count: "exact", head: true }).eq("org_id", orgId ?? ""),
    supabase.from("messages").select("id", { count: "exact", head: true }).eq("org_id", orgId ?? ""),
  ]);

  const allRuns = runs ?? [];
  const llmRuns = allRuns.filter((r) => r.source === "llm").length;
  const autoRuns = allRuns.filter((r) => (r.input as any)?.via === "automation").length;

  const byAgent = new Map<string, number>();
  for (const r of allRuns) byAgent.set(r.agent_kind, (byAgent.get(r.agent_kind) ?? 0) + 1);
  const agentRows = [...byAgent.entries()].sort((a, b) => b[1] - a[1]);
  const maxRuns = agentRows[0]?.[1] ?? 1;

  const stages = pipeline?.stages ?? [];
  const wonStage = stages.find((s) => s.name === "Ganho");
  const lostStage = stages.find((s) => s.name === "Descarte");
  const won = deals.filter((d) => d.stageId === wonStage?.id);
  const lost = deals.filter((d) => d.stageId === lostStage?.id);
  const closed = won.length + lost.length;
  const winRate = closed ? Math.round((won.length / closed) * 100) : null;
  const totalValue = deals.reduce((s, d) => s + d.amount, 0);
  const maxStage = Math.max(1, ...stages.map((s) => deals.filter((d) => d.stageId === s.id).length));

  return (
    <div className="min-h-screen">
      <Nav active="reports" />
      <main className="mx-auto max-w-5xl px-6 py-6">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-slate-900">Relatórios</h1>
          <p className="text-sm text-slate-500">Visão executiva do funil e de tudo que os agentes executaram.</p>
        </div>

        <section className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Pipeline" value={brl(totalValue)} hint={`${deals.length} deals`} />
          <Stat label="Win rate" value={winRate == null ? "—" : `${winRate}%`} hint={closed ? `${won.length} ganhos / ${lost.length} perdidos` : "sem deals fechados"} />
          <Stat label="Execuções de agentes" value={String(allRuns.length)} hint={`${llmRuns} via IA · ${autoRuns} por automação`} />
          <Stat label="Documentos" value={String((contractCount ?? 0) + (proposalCount ?? 0))} hint={`${proposalCount ?? 0} propostas · ${contractCount ?? 0} contratos · ${msgCount ?? 0} msgs`} />
        </section>

        <section className="mb-8 grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="mb-3 text-sm font-semibold text-slate-800">Deals por estágio</h2>
            <div className="space-y-2">
              {stages.map((s) => {
                const n = deals.filter((d) => d.stageId === s.id).length;
                return (
                  <div key={s.id} className="flex items-center gap-2 text-sm">
                    <span className="w-24 shrink-0 text-xs text-slate-500">{s.name}</span>
                    <div className="h-4 flex-1 overflow-hidden rounded bg-slate-100">
                      <div className="h-full rounded" style={{ width: `${(n / maxStage) * 100}%`, background: s.accent }} />
                    </div>
                    <span className="w-6 text-right text-xs tabular-nums text-slate-500">{n}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="mb-3 text-sm font-semibold text-slate-800">Execuções por agente</h2>
            {agentRows.length === 0 ? (
              <p className="text-sm text-slate-400">Nenhuma execução ainda.</p>
            ) : (
              <div className="space-y-2">
                {agentRows.map(([kind, n]) => (
                  <div key={kind} className="flex items-center gap-2 text-sm">
                    <span className="w-32 shrink-0 text-xs text-slate-500">{AGENT_LABEL[kind] ?? kind}</span>
                    <div className="h-4 flex-1 overflow-hidden rounded bg-slate-100">
                      <div className="h-full rounded bg-brand-400" style={{ width: `${(n / maxRuns) * 100}%` }} />
                    </div>
                    <span className="w-6 text-right text-xs tabular-nums text-slate-500">{n}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-800">Últimas execuções</h2>
            <a href="/api/export" className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
              ⬇ Exportar dados (LGPD)
            </a>
          </div>
          {allRuns.length === 0 ? (
            <p className="text-sm text-slate-400">Nenhuma execução registrada.</p>
          ) : (
            <ul className="divide-y divide-slate-50">
              {allRuns.slice(0, 15).map((r, i) => (
                <li key={i} className="flex items-center justify-between py-2 text-sm">
                  <div>
                    <span className="font-medium text-slate-700">{AGENT_LABEL[r.agent_kind] ?? r.agent_kind}</span>
                    <span className="ml-2 text-xs text-slate-400">{(r.input as any)?.title ?? ""}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    {(r.input as any)?.via === "automation" && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-700">auto</span>}
                    <span className={`rounded-full px-2 py-0.5 ${r.source === "llm" ? "bg-brand-100 text-brand-700" : "bg-slate-100 text-slate-500"}`}>
                      {r.source === "llm" ? "IA · GLM" : "heurística"}
                    </span>
                    <span className="text-slate-400">{String(r.created_at).slice(0, 16).replace("T", " ")}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}

import { Download } from "lucide-react";
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

  const [{ data: runs }, { count: contractCount }, { count: proposalCount }, { count: msgCount }, { data: dealRows }] = await Promise.all([
    supabase.from("agent_runs").select("agent_kind, source, created_at, input").eq("org_id", orgId ?? "").order("created_at", { ascending: false }).limit(200),
    supabase.from("contracts").select("id", { count: "exact", head: true }).eq("org_id", orgId ?? ""),
    supabase.from("proposals").select("id", { count: "exact", head: true }).eq("org_id", orgId ?? ""),
    supabase.from("messages").select("id", { count: "exact", head: true }).eq("org_id", orgId ?? ""),
    supabase.from("deals").select("stage_id, amount, probability, lost_reason, created_at, updated_at").eq("org_id", orgId ?? ""),
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

  // ---- Métricas avançadas (query direta a deals) ----
  const dRows = dealRows ?? [];

  // Conversão entre estágios consecutivos: quantos deals já passaram (estão em
  // ou depois de) cada estágio, na ordem do funil.
  const stageIndex = new Map(stages.map((s, i) => [s.id, i]));
  const reachedAtLeast = stages.map((_, i) =>
    dRows.filter((d) => (stageIndex.get(d.stage_id ?? "") ?? -1) >= i).length,
  );
  const conversion = stages.map((s, i) => ({
    name: s.name,
    reached: reachedAtLeast[i],
    rate: i === 0 ? 100 : reachedAtLeast[i - 1] ? Math.round((reachedAtLeast[i] / reachedAtLeast[i - 1]) * 100) : 0,
  }));

  // Ciclo médio de vendas: created_at → updated_at dos deals ganhos (dias).
  const wonIds = new Set([wonStage?.id]);
  const wonRows = dRows.filter((d) => wonIds.has(d.stage_id ?? ""));
  const cycleDays = wonRows
    .map((d) => (new Date(d.updated_at).getTime() - new Date(d.created_at).getTime()) / 86_400_000)
    .filter((n) => n >= 0);
  const avgCycle = cycleDays.length ? Math.round(cycleDays.reduce((a, b) => a + b, 0) / cycleDays.length) : null;

  // Forecast ponderado: deals abertos (nem ganho nem descarte) × probabilidade.
  // Sem probabilidade explícita, usa a posição no funil como proxy.
  const openRows = dRows.filter((d) => d.stage_id !== wonStage?.id && d.stage_id !== lostStage?.id);
  const stageProb = (stageId: string | null) => {
    const i = stageIndex.get(stageId ?? "") ?? 0;
    const n = Math.max(1, stages.length - 1);
    return Math.round((i / n) * 80) + 10; // 10%..90%
  };
  const forecast = openRows.reduce(
    (s, d) => s + Number(d.amount ?? 0) * ((d.probability ?? stageProb(d.stage_id)) / 100),
    0,
  );

  // Motivos de perda (deals.lost_reason).
  const lossMap = new Map<string, number>();
  for (const d of dRows.filter((d) => d.stage_id === lostStage?.id)) {
    const reason = (d.lost_reason ?? "").trim() || "Sem motivo informado";
    lossMap.set(reason, (lossMap.get(reason) ?? 0) + 1);
  }
  const lossRows = [...lossMap.entries()].sort((a, b) => b[1] - a[1]);
  const maxLoss = lossRows[0]?.[1] ?? 1;

  // Custo estimado de IA: não gravamos tokens por execução, então estimamos
  // ~1,5k tokens/execução ao preço aproximado do GLM 5.2 (US$0,60/1M tokens).
  const AVG_TOKENS_PER_RUN = 1500;
  const USD_PER_1M = 0.6;
  const USD_BRL = 5.4;
  const estTokens = llmRuns * AVG_TOKENS_PER_RUN;
  const estCostBRL = (estTokens / 1_000_000) * USD_PER_1M * USD_BRL;

  return (
    <div className="min-h-screen">
      <Nav active="reports" />
      <main className="mx-auto max-w-5xl px-6 py-6">
        <div className="mb-6 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Relatórios</h1>
            <p className="text-sm text-slate-500">Visão executiva do funil e de tudo que os agentes executaram.</p>
          </div>
          <a href="/api/export/reports" className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
            <Download className="mr-1 inline h-3.5 w-3.5" aria-hidden /> Exportar CSV
          </a>
        </div>

        <section className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Pipeline" value={brl(totalValue)} hint={`${deals.length} deals`} />
          <Stat label="Forecast ponderado" value={brl(forecast)} hint={`${openRows.length} deals abertos`} />
          <Stat label="Win rate" value={winRate == null ? "—" : `${winRate}%`} hint={closed ? `${won.length} ganhos / ${lost.length} perdidos` : "sem fechados"} />
          <Stat label="Ciclo médio" value={avgCycle == null ? "—" : `${avgCycle}d`} hint={avgCycle == null ? "sem ganhos" : `${wonRows.length} ganhos`} />
          <Stat label="Execuções IA" value={String(allRuns.length)} hint={`${llmRuns} IA · ${autoRuns} auto`} />
          <Stat label="Custo IA (est.)" value={brl(estCostBRL)} hint={`~${(estTokens / 1000).toFixed(0)}k tokens`} />
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

        <section className="mb-8 grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="mb-1 text-sm font-semibold text-slate-800">Conversão por etapa</h2>
            <p className="mb-3 text-xs text-slate-400">% dos deals que avançam de cada etapa para a seguinte.</p>
            <div className="space-y-2">
              {conversion.map((c, i) => (
                <div key={c.name} className="flex items-center gap-2 text-sm">
                  <span className="w-24 shrink-0 truncate text-xs text-slate-500" title={c.name}>{c.name}</span>
                  <div className="h-4 flex-1 overflow-hidden rounded bg-slate-100">
                    <div className="h-full rounded bg-brand-500" style={{ width: `${Math.min(100, c.rate)}%` }} />
                  </div>
                  <span className="w-16 text-right text-xs tabular-nums text-slate-500">
                    {i === 0 ? `${c.reached}` : `${c.rate}%`}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="mb-1 text-sm font-semibold text-slate-800">Motivos de perda</h2>
            <p className="mb-3 text-xs text-slate-400">Deals no estágio de descarte, agrupados por motivo.</p>
            {lossRows.length === 0 ? (
              <p className="text-sm text-slate-400">Nenhum deal perdido registrado.</p>
            ) : (
              <div className="space-y-2">
                {lossRows.map(([reason, n]) => (
                  <div key={reason} className="flex items-center gap-2 text-sm">
                    <span className="w-32 shrink-0 truncate text-xs text-slate-500" title={reason}>{reason}</span>
                    <div className="h-4 flex-1 overflow-hidden rounded bg-slate-100">
                      <div className="h-full rounded bg-rose-400" style={{ width: `${(n / maxLoss) * 100}%` }} />
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
              <Download className="mr-1 inline h-3.5 w-3.5" aria-hidden /> Exportar dados (LGPD)
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

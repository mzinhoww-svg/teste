"use client";

import { useState, useTransition } from "react";
import { moveDeal } from "@/app/actions";
import { brl, tempColor, tempLabel } from "@/lib/format";
import type { Agent, Contact, Deal, Stage } from "@/lib/types";

async function runAgent(dealId: string, kind: string) {
  const res = await fetch("/api/agents/run", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ dealId, kind }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function SourceTag({ source }: { source?: string }) {
  if (!source || source === "n/a") return null;
  const live = source === "llm";
  return (
    <span className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-medium ${live ? "bg-brand-100 text-brand-700" : "bg-slate-100 text-slate-500"}`}>
      {live ? "IA · GLM" : "heurística"}
    </span>
  );
}

function AgentResult({ kind, r }: { kind: string; r: any }) {
  if (kind === "lead-scoring") {
    return (
      <div className="mt-3">
        <div className="flex items-center gap-3">
          <div className="text-3xl font-bold text-slate-900">{r.score}</div>
          <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${tempColor(r.temperature)}`}>{tempLabel(r.temperature)}</span>
          <SourceTag source={r.source} />
        </div>
        <p className="mt-2 text-sm text-slate-600">{r.reason}</p>
      </div>
    );
  }
  if (kind === "sales-copilot") {
    return (
      <div className="mt-3 space-y-2">
        <p className="text-sm font-medium text-slate-800">→ {r.nextAction}<SourceTag source={r.source} /></p>
        <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
          <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-slate-400">Mensagem · {r.channel}</div>
          {r.message}
        </div>
        {r.waLink && (
          <a href={r.waLink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700">
            Abrir no WhatsApp ↗
          </a>
        )}
      </div>
    );
  }
  if (kind === "proposal") {
    return (
      <div className="mt-3 space-y-3">
        <p className="text-sm text-slate-600">{r.summary}<SourceTag source={r.source} /></p>
        <table className="w-full text-sm">
          <tbody>
            {r.items.map((it: any, i: number) => (
              <tr key={i} className="border-b border-slate-100">
                <td className="py-1.5 pr-2 text-slate-600">{it.name}</td>
                <td className="py-1.5 text-right tabular-nums text-slate-800">{brl(it.qty * it.unitPrice)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-500">Desconto {r.discountPct}%</span>
          <span className="text-lg font-bold text-emerald-700">{brl(r.total)}</span>
        </div>
        <p className="text-xs text-slate-400">{r.terms}</p>
      </div>
    );
  }
  if (kind === "legal-contract") {
    return (
      <div className="mt-3 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-slate-800">{r.title}</span><SourceTag source={r.source} />
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-slate-100 px-2.5 py-1 font-mono text-slate-600">{r.reference}</span>
          <span className="rounded-full bg-emerald-50 px-2.5 py-1 font-medium text-emerald-700">{brl(r.value)}</span>
          <span className="rounded-full bg-amber-50 px-2.5 py-1 font-medium text-amber-700">✍️ {r.signatureStatus}</span>
        </div>
        <div className="space-y-2">
          {r.clauses.map((c: any, i: number) => (
            <div key={i} className="rounded-lg bg-slate-50 p-2.5">
              <div className="text-xs font-semibold text-slate-700">{c.heading}</div>
              <div className="text-xs text-slate-500">{c.body}</div>
            </div>
          ))}
        </div>
        <p className="text-xs text-slate-400">Gerir em <a href="/contracts" className="text-brand-600 underline">Contratos</a> · {r.signatureProvider}</p>
      </div>
    );
  }
  // Advisory (nutrição, atividades, coaching, feedback, atendimento)
  return (
    <div className="mt-3">
      <p className="text-sm font-medium text-slate-800">{r.headline}<SourceTag source={r.source} /></p>
      <ul className="mt-2 space-y-1">
        {(r.items ?? []).map((it: string, i: number) => (
          <li key={i} className="flex gap-1.5 text-sm text-slate-600"><span className="text-brand-400">•</span>{it}</li>
        ))}
      </ul>
    </div>
  );
}

const groupOrder: Record<string, number> = { "aquisição": 0, vendas: 1, "pós-venda": 2 };

export function DealDrawer({ deal, contact, agents, stages, onClose }: {
  deal: Deal; contact: Contact | null; agents: Agent[]; stages: Stage[]; onClose: () => void;
}) {
  const [loading, setLoading] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, any>>({});
  const [, startMove] = useTransition();

  async function run(kind: string) {
    setLoading(kind);
    try {
      const r = await runAgent(deal.id, kind);
      setResults((prev) => ({ ...prev, [kind]: r }));
    } catch {
      /* silencioso */
    } finally {
      setLoading(null);
    }
  }

  const runnable = agents.filter((a) => a.runnable).sort((a, b) => (groupOrder[a.group] ?? 9) - (groupOrder[b.group] ?? 9));

  return (
    <div className="fixed inset-0 z-30 flex justify-end">
      <div className="absolute inset-0 bg-slate-900/30" onClick={onClose} />
      <aside className="relative flex h-full w-full max-w-lg flex-col overflow-y-auto bg-white shadow-2xl">
        <div className="sticky top-0 z-10 border-b border-slate-100 bg-white px-6 py-4">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">{deal.title}</h2>
              <p className="text-sm text-slate-500">
                {contact ? `${contact.name} · ${contact.company}${contact.role ? " · " + contact.role : ""}` : "Sem contato"}
              </p>
            </div>
            <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100">✕</button>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 font-medium text-emerald-700">{brl(deal.amount)}</span>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">Engaj. {deal.engagement}</span>
            <label className="ml-auto flex items-center gap-1 text-slate-500">
              Estágio:
              <select
                defaultValue={deal.stageId}
                onChange={(e) => startMove(() => moveDeal(deal.id, e.target.value))}
                className="rounded-md border border-slate-300 px-2 py-1 text-xs outline-none focus:border-brand-400"
              >
                {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
          </div>
        </div>

        <div className="space-y-4 px-6 py-5">
          {runnable.map((agent) => (
            <section key={agent.id} className="rounded-xl border border-slate-200 p-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-slate-800">{agent.name}</h3>
                  <span className="text-[11px] text-slate-400">{agent.role}</span>
                </div>
                <button
                  onClick={() => run(agent.id)}
                  disabled={loading === agent.id || !agent.enabled}
                  className="shrink-0 rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                >
                  {loading === agent.id ? "Executando…" : agent.enabled ? "Executar" : "inativo"}
                </button>
              </div>
              {results[agent.id] && <AgentResult kind={agent.id} r={results[agent.id]} />}
            </section>
          ))}

          <section>
            <h3 className="mb-2 text-sm font-semibold text-slate-800">Atividades</h3>
            {deal.activities.length === 0 && <p className="text-sm text-slate-400">Sem atividades ainda.</p>}
            <ul className="space-y-2">
              {deal.activities.map((a) => (
                <li key={a.id} className="flex gap-3 text-sm">
                  <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-brand-400" />
                  <div>
                    <span className="text-slate-700">{a.summary}</span>
                    <div className="text-xs text-slate-400">{a.at} · {a.type} · {a.author}</div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </aside>
    </div>
  );
}

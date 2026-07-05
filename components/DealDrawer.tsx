"use client";

import { useState } from "react";
import type { Contact, Deal } from "@/lib/types";
import type { ContractResult, CopilotResult, ProposalResult, ScoreResult } from "@/lib/agents";
import { brl, tempColor, tempLabel } from "@/lib/format";

type Panel = "score" | "copilot" | "proposal" | "contract";

async function post<T>(url: string, dealId: string): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ dealId }),
  });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as T;
}

function SourceTag({ source }: { source?: "llm" | "heuristic" }) {
  if (!source) return null;
  const live = source === "llm";
  return (
    <span
      className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-medium ${live ? "bg-brand-100 text-brand-700" : "bg-slate-100 text-slate-500"}`}
      title={live ? "Gerado por IA (GLM 5.2 via OpenRouter)" : "Heurística (configure OPENROUTER_API_KEY para IA ao vivo)"}
    >
      {live ? "IA · GLM" : "heurística"}
    </span>
  );
}

export function DealDrawer({
  deal,
  contact,
  onClose,
}: {
  deal: Deal;
  contact: Contact;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState<Panel | null>(null);
  const [score, setScore] = useState<ScoreResult | null>(deal.score ? { score: deal.score, temperature: deal.temperature!, reason: deal.scoreReason ?? "", source: "heuristic" } : null);
  const [copilot, setCopilot] = useState<CopilotResult | null>(null);
  const [proposal, setProposal] = useState<ProposalResult | null>(null);
  const [contract, setContract] = useState<ContractResult | null>(null);

  async function run(panel: Panel) {
    setLoading(panel);
    try {
      if (panel === "score") setScore(await post<ScoreResult>("/api/agents/lead-scoring", deal.id));
      if (panel === "copilot") setCopilot(await post<CopilotResult>("/api/agents/copilot", deal.id));
      if (panel === "proposal") setProposal(await post<ProposalResult>("/api/agents/proposal", deal.id));
      if (panel === "contract") setContract(await post<ContractResult>("/api/agents/contract", deal.id));
    } catch {
      /* silencioso na demo */
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex justify-end">
      <div className="absolute inset-0 bg-slate-900/30" onClick={onClose} />
      <aside className="relative flex h-full w-full max-w-lg flex-col overflow-y-auto bg-white shadow-2xl">
        <div className="sticky top-0 border-b border-slate-100 bg-white px-6 py-4">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">{deal.title}</h2>
              <p className="text-sm text-slate-500">
                {contact.name} · {contact.company} · {contact.role}
              </p>
            </div>
            <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100">✕</button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 font-medium text-emerald-700">{brl(deal.amount)}</span>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">Engajamento {deal.engagement}/100</span>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">Canal: {contact.channel}</span>
          </div>
        </div>

        <div className="space-y-5 px-6 py-5">
          {/* Lead Scoring */}
          <section className="rounded-xl border border-slate-200 p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-800">Lead Scoring Agent</h3>
              <button
                onClick={() => run("score")}
                disabled={loading === "score"}
                className="rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {loading === "score" ? "Analisando…" : "Pontuar lead"}
              </button>
            </div>
            {score && (
              <div className="mt-3">
                <div className="flex items-center gap-3">
                  <div className="text-3xl font-bold text-slate-900">{score.score}</div>
                  <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${tempColor(score.temperature)}`}>
                    {tempLabel(score.temperature)}
                  </span>
                  <SourceTag source={score.source} />
                </div>
                <p className="mt-2 text-sm text-slate-600">{score.reason}</p>
              </div>
            )}
          </section>

          {/* Sales Copilot */}
          <section className="rounded-xl border border-slate-200 p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-800">Sales Copilot</h3>
              <button
                onClick={() => run("copilot")}
                disabled={loading === "copilot"}
                className="rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {loading === "copilot" ? "Pensando…" : "Sugerir próximo passo"}
              </button>
            </div>
            {copilot && (
              <div className="mt-3 space-y-2">
                <p className="text-sm font-medium text-slate-800">
                  → {copilot.nextAction}
                  <SourceTag source={copilot.source} />
                </p>
                <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
                  <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-slate-400">Mensagem sugerida · {copilot.channel}</div>
                  {copilot.message}
                </div>
              </div>
            )}
          </section>

          {/* Proposal */}
          <section className="rounded-xl border border-slate-200 p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-800">Sales Proposal Agent</h3>
              <button
                onClick={() => run("proposal")}
                disabled={loading === "proposal"}
                className="rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {loading === "proposal" ? "Gerando…" : "Gerar proposta"}
              </button>
            </div>
            {proposal && (
              <div className="mt-3 space-y-3">
                <p className="text-sm text-slate-600">
                  {proposal.summary}
                  <SourceTag source={proposal.source} />
                </p>
                <table className="w-full text-sm">
                  <tbody>
                    {proposal.items.map((it, i) => (
                      <tr key={i} className="border-b border-slate-100">
                        <td className="py-1.5 pr-2 text-slate-600">{it.name}</td>
                        <td className="py-1.5 text-right tabular-nums text-slate-800">{brl(it.qty * it.unitPrice)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">Desconto {proposal.discountPct}%</span>
                  <span className="text-lg font-bold text-emerald-700">{brl(proposal.total)}</span>
                </div>
                <p className="text-xs text-slate-400">{proposal.terms}</p>
              </div>
            )}
          </section>

          {/* Contrato / Jurídico */}
          <section className="rounded-xl border border-slate-200 p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-800">Agente Jurídico / de Contratos</h3>
              <button
                onClick={() => run("contract")}
                disabled={loading === "contract"}
                className="rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {loading === "contract" ? "Redigindo…" : "Gerar contrato + assinatura"}
              </button>
            </div>
            {contract && (
              <div className="mt-3 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-slate-800">{contract.title}</span>
                  <SourceTag source={contract.source} />
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 font-mono text-slate-600">{contract.reference}</span>
                  <span className="rounded-full bg-emerald-50 px-2.5 py-1 font-medium text-emerald-700">{brl(contract.value)}</span>
                  <span className="rounded-full bg-amber-50 px-2.5 py-1 font-medium text-amber-700">
                    {contract.signatureStatus === "assinado" ? "✅ assinado" : "✍️ enviado p/ assinatura"}
                  </span>
                </div>
                <div className="space-y-2">
                  {contract.clauses.map((c, i) => (
                    <div key={i} className="rounded-lg bg-slate-50 p-2.5">
                      <div className="text-xs font-semibold text-slate-700">{c.heading}</div>
                      <div className="text-xs text-slate-500">{c.body}</div>
                    </div>
                  ))}
                </div>
                <div>
                  <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Assinatura digital · {contract.signatureProvider}</div>
                  <ul className="mt-1 space-y-1">
                    {contract.signatories.map((s, i) => (
                      <li key={i} className="flex items-center justify-between text-xs text-slate-600">
                        <span>{s.name} — {s.role} <span className="text-slate-400">({s.party})</span></span>
                        <span className="text-slate-400">{s.email}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </section>

          {/* Timeline */}
          <section>
            <h3 className="mb-2 text-sm font-semibold text-slate-800">Atividades</h3>
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

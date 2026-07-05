"use client";

import { useEffect, useState, useTransition } from "react";
import { CheckCircle2, FileSignature, MessageCircle, Play } from "lucide-react";
import { toast } from "sonner";
import { moveDeal } from "@/app/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { brl, tempColor, tempLabel } from "@/lib/format";
import type { Agent, Contact, Deal, Stage } from "@/lib/types";

async function runAgent(dealId: string, kind: string) {
  const res = await fetch("/api/agents/run", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ dealId, kind }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error ?? `Erro ${res.status}`);
  return body;
}

function SourceTag({ source }: { source?: string }) {
  if (!source || source === "n/a") return null;
  const live = source === "llm";
  return (
    <Badge variant={live ? "brand" : "muted"} className="ml-2 text-[10px]">
      {live ? "IA · GLM" : "heurística"}
    </Badge>
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
          <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-slate-500">Mensagem · {r.channel}</div>
          {r.message}
        </div>
        {r.waLink && (
          <a href={r.waLink} target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400">
            <MessageCircle className="h-3.5 w-3.5" aria-hidden /> Abrir no WhatsApp
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
          <Badge variant="success">{brl(r.value)}</Badge>
          <Badge variant="warning"><FileSignature className="h-3 w-3" aria-hidden /> {r.signatureStatus}</Badge>
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

function RunningSkeleton() {
  return (
    <div className="mt-3 space-y-2" aria-label="Executando agente">
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-4 w-1/2" />
      <Skeleton className="h-16 w-full" />
    </div>
  );
}

const groupOrder: Record<string, number> = { "aquisição": 0, vendas: 1, "pós-venda": 2 };

export function DealDrawer({ deal, contact, agents, stages, onClose }: {
  deal: Deal; contact: Contact | null; agents: Agent[]; stages: Stage[]; onClose: () => void;
}) {
  const [loading, setLoading] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, any>>({});
  const [hydrating, setHydrating] = useState(true);
  const [, startMove] = useTransition();

  // Reidrata a última execução de cada agente (persistida em agent_runs).
  useEffect(() => {
    let alive = true;
    fetch(`/api/agents/run?dealId=${deal.id}`)
      .then((r) => (r.ok ? r.json() : { latest: {} }))
      .then((b) => { if (alive) setResults(b.latest ?? {}); })
      .catch(() => {})
      .finally(() => { if (alive) setHydrating(false); });
    return () => { alive = false; };
  }, [deal.id]);

  async function run(kind: string) {
    setLoading(kind);
    try {
      const r = await runAgent(deal.id, kind);
      setResults((prev) => ({ ...prev, [kind]: r }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao executar agente");
    } finally {
      setLoading(null);
    }
  }

  const runnable = agents.filter((a) => a.runnable).sort((a, b) => (groupOrder[a.group] ?? 9) - (groupOrder[b.group] ?? 9));

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent aria-describedby={undefined}>
        <div className="sticky top-0 z-10 border-b border-slate-100 bg-white px-6 py-4">
          <SheetTitle className="pr-8 text-lg font-semibold text-slate-900">{deal.title}</SheetTitle>
          <SheetDescription className="text-sm text-slate-500">
            {contact ? `${contact.name} · ${contact.company}${contact.role ? " · " + contact.role : ""}` : "Sem contato"}
          </SheetDescription>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <Badge variant="success">{brl(deal.amount)}</Badge>
            <Badge variant="muted">Engaj. {deal.engagement}</Badge>
            <label className="ml-auto flex items-center gap-1.5 text-slate-500">
              Estágio:
              <Select
                defaultValue={deal.stageId}
                onChange={(e) => startMove(() => moveDeal(deal.id, e.target.value))}
                className="h-7 w-auto py-0 text-xs"
                aria-label="Mover deal para outro estágio"
              >
                {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </label>
          </div>
        </div>

        <div className="space-y-4 px-6 py-5">
          {runnable.map((agent) => (
            <section key={String(agent.id)} className="rounded-xl border border-slate-200 p-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-slate-800">{agent.name}</h3>
                  <span className="text-[11px] text-slate-500">{agent.role}</span>
                </div>
                <Button
                  size="xs"
                  onClick={() => run(String(agent.id))}
                  disabled={!agent.enabled}
                  loading={loading === agent.id}
                >
                  {loading === agent.id ? "Executando" : agent.enabled ? (<><Play className="h-3 w-3" aria-hidden /> Executar</>) : "inativo"}
                </Button>
              </div>
              {loading === agent.id ? (
                <RunningSkeleton />
              ) : hydrating ? (
                <Skeleton className="mt-3 h-4 w-2/3" />
              ) : (
                results[String(agent.id)] && <AgentResult kind={String(agent.id)} r={results[String(agent.id)]} />
              )}
            </section>
          ))}

          <section>
            <h3 className="mb-2 text-sm font-semibold text-slate-800">Atividades</h3>
            {deal.activities.length === 0 && <p className="text-sm text-slate-400">Sem atividades ainda.</p>}
            <ul className="space-y-2">
              {deal.activities.map((a) => (
                <li key={a.id} className="flex gap-3 text-sm">
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-400" aria-hidden />
                  <div>
                    <span className="text-slate-700">{a.summary}</span>
                    <div className="text-xs text-slate-400">{a.at} · {a.type} · {a.author}</div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}

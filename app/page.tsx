"use client";

import { useMemo, useState } from "react";
import { Nav } from "@/components/Nav";
import { DealDrawer } from "@/components/DealDrawer";
import { agents, contacts, deals as seedDeals, pipelines } from "@/lib/seed";
import { brl } from "@/lib/format";
import type { Deal } from "@/lib/types";

const pipeline = pipelines[0];

function KpiCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-1 text-2xl font-bold text-slate-900">{value}</div>
      {hint && <div className="text-xs text-slate-400">{hint}</div>}
    </div>
  );
}

function DealCard({ deal, onClick }: { deal: Deal; onClick: () => void }) {
  const contact = contacts.find((c) => c.id === deal.contactId)!;
  return (
    <button
      onClick={onClick}
      className="w-full rounded-lg border border-slate-200 bg-white p-3 text-left transition hover:border-brand-300 hover:shadow-sm"
    >
      <div className="text-sm font-medium text-slate-800">{deal.title}</div>
      <div className="mt-0.5 text-xs text-slate-400">{contact.company}</div>
      <div className="mt-2 flex items-center justify-between">
        <span className="text-sm font-semibold text-emerald-700">{brl(deal.amount)}</span>
        <div className="flex items-center gap-1">
          <div className="h-1.5 w-14 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-brand-400" style={{ width: `${deal.engagement}%` }} />
          </div>
          <span className="text-[10px] text-slate-400">{deal.engagement}</span>
        </div>
      </div>
      {deal.tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {deal.tags.map((t) => (
            <span key={t} className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">{t}</span>
          ))}
        </div>
      )}
    </button>
  );
}

export default function BoardPage() {
  const [openId, setOpenId] = useState<string | null>(null);

  const totals = useMemo(() => {
    const value = seedDeals.reduce((s, d) => s + d.amount, 0);
    const hot = seedDeals.filter((d) => d.engagement >= 75).length;
    const won = seedDeals.filter((d) => d.stageId === "won").reduce((s, d) => s + d.amount, 0);
    return { value, hot, won };
  }, []);

  const open = openId ? seedDeals.find((d) => d.id === openId) ?? null : null;
  const openContact = open ? contacts.find((c) => c.id === open.contactId) ?? null : null;

  return (
    <div className="min-h-screen">
      <Nav active="board" />
      <main className="mx-auto max-w-7xl px-6 py-6">
        <div className="mb-5 flex items-end justify-between">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">{pipeline.name}</h1>
            <p className="text-sm text-slate-500">Marketing · Vendas · Customer Success em um só fluxo, orquestrado por agentes de IA.</p>
          </div>
        </div>

        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiCard label="Pipeline" value={brl(totals.value)} hint={`${seedDeals.length} deals ativos`} />
          <KpiCard label="Leads quentes" value={String(totals.hot)} hint="engajamento ≥ 75" />
          <KpiCard label="Fechado (ganho)" value={brl(totals.won)} />
          <KpiCard label="Agentes ativos" value={String(agents.filter((a) => a.enabled).length)} hint={`de ${agents.length} no Studio`} />
        </div>

        <div className="flex gap-4 overflow-x-auto pb-4">
          {pipeline.stages.map((stage) => {
            const stageDeals = seedDeals.filter((d) => d.stageId === stage.id);
            const stageValue = stageDeals.reduce((s, d) => s + d.amount, 0);
            return (
              <div key={stage.id} className="w-72 shrink-0">
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: stage.accent }} />
                    <span className="text-sm font-semibold text-slate-700">{stage.name}</span>
                    <span className="text-xs text-slate-400">{stageDeals.length}</span>
                  </div>
                  <span className="text-[11px] text-slate-400">{brl(stageValue)}</span>
                </div>
                <div className="space-y-2 rounded-xl bg-slate-100/60 p-2">
                  {stageDeals.length === 0 && (
                    <div className="py-6 text-center text-xs text-slate-400">vazio</div>
                  )}
                  {stageDeals.map((d) => (
                    <DealCard key={d.id} deal={d} onClick={() => setOpenId(d.id)} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </main>

      {open && openContact && (
        <DealDrawer deal={open} contact={openContact} onClose={() => setOpenId(null)} />
      )}
    </div>
  );
}

"use client";

import { useMemo, useState, useTransition } from "react";
import { createLead } from "@/app/actions";
import { DealDrawer } from "@/components/DealDrawer";
import { brl } from "@/lib/format";
import type { Agent, Contact, Deal, Pipeline } from "@/lib/types";

function KpiCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-bold text-slate-900">{value}</div>
      {hint && <div className="text-xs text-slate-400">{hint}</div>}
    </div>
  );
}

function DealCard({ deal, contact, onClick }: { deal: Deal; contact?: Contact; onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-full rounded-lg border border-slate-200 bg-white p-3 text-left transition hover:border-brand-300 hover:shadow-sm">
      <div className="text-sm font-medium text-slate-800">{deal.title}</div>
      <div className="mt-0.5 text-xs text-slate-400">{contact?.company || contact?.name || "—"}</div>
      <div className="mt-2 flex items-center justify-between">
        <span className="text-sm font-semibold text-emerald-700">{brl(deal.amount)}</span>
        <div className="flex items-center gap-1">
          {deal.score != null && (
            <span className="rounded bg-brand-50 px-1.5 py-0.5 text-[10px] font-medium text-brand-700">{deal.score}</span>
          )}
          <div className="h-1.5 w-12 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-brand-400" style={{ width: `${deal.engagement}%` }} />
          </div>
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

function NewLeadModal({ onClose }: { onClose: () => void }) {
  const [pending, start] = useTransition();
  function submit(fd: FormData) {
    start(async () => {
      await createLead(fd);
      onClose();
    });
  }
  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-slate-900/30 px-4">
      <form action={submit} className="w-full max-w-md space-y-3 rounded-xl bg-white p-5 shadow-xl">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-900">Novo lead</h3>
          <button type="button" onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100">✕</button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="col-span-2 text-xs font-medium text-slate-500">Nome*
            <input name="name" required className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 outline-none focus:border-brand-400" />
          </label>
          <label className="text-xs font-medium text-slate-500">Empresa
            <input name="company" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 outline-none focus:border-brand-400" />
          </label>
          <label className="text-xs font-medium text-slate-500">Canal
            <select name="channel" defaultValue="whatsapp" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 outline-none focus:border-brand-400">
              <option value="whatsapp">WhatsApp</option>
              <option value="email">E-mail</option>
              <option value="voice">Voz</option>
              <option value="portal">Portal</option>
              <option value="form">Formulário</option>
            </select>
          </label>
          <label className="text-xs font-medium text-slate-500">E-mail
            <input name="email" type="email" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 outline-none focus:border-brand-400" />
          </label>
          <label className="text-xs font-medium text-slate-500">Telefone (WhatsApp)
            <input name="phone" placeholder="+55 11 90000-0000" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 outline-none focus:border-brand-400" />
          </label>
          <label className="text-xs font-medium text-slate-500">Título da oportunidade
            <input name="title" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 outline-none focus:border-brand-400" />
          </label>
          <label className="text-xs font-medium text-slate-500">Valor (R$)
            <input name="amount" type="number" min="0" step="1000" defaultValue="0" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 outline-none focus:border-brand-400" />
          </label>
        </div>
        <button disabled={pending} className="w-full rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">
          {pending ? "Criando…" : "Criar lead"}
        </button>
      </form>
    </div>
  );
}

export function Board({ pipeline, deals, contacts, agents }: { pipeline: Pipeline; deals: Deal[]; contacts: Contact[]; agents: Agent[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const contactById = useMemo(() => new Map(contacts.map((c) => [c.id, c])), [contacts]);

  const totals = useMemo(() => {
    const value = deals.reduce((s, d) => s + d.amount, 0);
    const hot = deals.filter((d) => d.temperature === "hot" || d.engagement >= 75).length;
    const wonStage = pipeline.stages.find((s) => s.name.toLowerCase() === "ganho");
    const won = deals.filter((d) => d.stageId === wonStage?.id).reduce((s, d) => s + d.amount, 0);
    return { value, hot, won };
  }, [deals, pipeline.stages]);

  const open = openId ? deals.find((d) => d.id === openId) ?? null : null;
  const openContact = open ? contactById.get(open.contactId) : undefined;

  return (
    <>
      <div className="mb-5 flex items-end justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">{pipeline.name}</h1>
          <p className="text-sm text-slate-500">Do lead ao pós-venda, orquestrado por agentes de IA.</p>
        </div>
        <button onClick={() => setNewOpen(true)} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">+ Novo lead</button>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard label="Pipeline" value={brl(totals.value)} hint={`${deals.length} deals`} />
        <KpiCard label="Leads quentes" value={String(totals.hot)} />
        <KpiCard label="Fechado (ganho)" value={brl(totals.won)} />
        <KpiCard label="Agentes" value={String(agents.filter((a) => a.enabled).length)} hint={`de ${agents.length} no Studio`} />
      </div>

      <div className="flex gap-4 overflow-x-auto pb-4">
        {pipeline.stages.map((stage) => {
          const stageDeals = deals.filter((d) => d.stageId === stage.id);
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
                {stageDeals.length === 0 && <div className="py-6 text-center text-xs text-slate-400">vazio</div>}
                {stageDeals.map((d) => (
                  <DealCard key={d.id} deal={d} contact={contactById.get(d.contactId)} onClick={() => setOpenId(d.id)} />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {open && (
        <DealDrawer deal={open} contact={openContact ?? null} agents={agents} stages={pipeline.stages} onClose={() => setOpenId(null)} />
      )}
      {newOpen && <NewLeadModal onClose={() => setNewOpen(false)} />}
    </>
  );
}

"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { createLead, moveDeal } from "@/app/actions";
import { DealDrawer } from "@/components/DealDrawer";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input, Label, Select } from "@/components/ui/input";
import { brl } from "@/lib/format";
import type { PipelineListItem, ProductListItem } from "@/lib/db";
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

function DealCard({ deal, contact, onClick, onDragStart }: {
  deal: Deal; contact?: Contact; onClick: () => void; onDragStart: (e: React.DragEvent) => void;
}) {
  return (
    <button
      onClick={onClick}
      draggable
      onDragStart={onDragStart}
      className="w-full cursor-grab rounded-lg border border-slate-200 bg-white p-3 text-left transition-all duration-150 hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-sm active:cursor-grabbing motion-reduce:hover:translate-y-0"
    >
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

function NewLeadModal({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [pending, start] = useTransition();
  function submit(fd: FormData) {
    start(async () => {
      try {
        await createLead(fd);
        onOpenChange(false);
        toast.success("Lead criado no primeiro estágio do funil");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Falha ao criar lead");
      }
    });
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined}>
        <DialogTitle>Novo lead</DialogTitle>
        <form action={submit} className="mt-3 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label htmlFor="nl-name">Nome*</Label>
              <Input id="nl-name" name="name" required autoFocus />
            </div>
            <div>
              <Label htmlFor="nl-company">Empresa</Label>
              <Input id="nl-company" name="company" />
            </div>
            <div>
              <Label htmlFor="nl-channel">Canal</Label>
              <Select id="nl-channel" name="channel" defaultValue="whatsapp">
                <option value="whatsapp">WhatsApp</option>
                <option value="email">E-mail</option>
                <option value="voice">Voz</option>
                <option value="portal">Portal</option>
                <option value="form">Formulário</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="nl-email">E-mail</Label>
              <Input id="nl-email" name="email" type="email" />
            </div>
            <div>
              <Label htmlFor="nl-phone">Telefone (WhatsApp)</Label>
              <Input id="nl-phone" name="phone" placeholder="+55 65 99999-0000" />
            </div>
            <div>
              <Label htmlFor="nl-title">Título da oportunidade</Label>
              <Input id="nl-title" name="title" />
            </div>
            <div>
              <Label htmlFor="nl-amount">Valor (R$)</Label>
              <Input id="nl-amount" name="amount" type="number" min="0" step="100" defaultValue="0" />
            </div>
          </div>
          <Button type="submit" loading={pending} className="w-full">
            {pending ? "Criando" : "Criar lead"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function Board({ pipeline, pipelines, deals, contacts, agents, products, myRole, orgName }: {
  pipeline: Pipeline; pipelines: PipelineListItem[]; deals: Deal[]; contacts: Contact[];
  agents: Agent[]; products: ProductListItem[]; myRole: string; orgName: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [openId, setOpenId] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [, startMove] = useTransition();
  const contactById = useMemo(() => new Map(contacts.map((c) => [c.id, c])), [contacts]);

  // Busca/filtros/ordenação persistidos na URL
  const q = params.get("q") ?? "";
  const temp = params.get("temp") ?? "";
  const sort = params.get("sort") ?? "recent";

  function setParam(key: string, value: string) {
    const p = new URLSearchParams(params.toString());
    if (value) p.set(key, value); else p.delete(key);
    router.replace(`/app?${p.toString()}`, { scroll: false });
  }

  const filtered = useMemo(() => {
    let list = deals;
    if (q) {
      const needle = q.toLowerCase();
      list = list.filter((d) => {
        const c = contactById.get(d.contactId);
        return (
          d.title.toLowerCase().includes(needle) ||
          (c?.name ?? "").toLowerCase().includes(needle) ||
          (c?.company ?? "").toLowerCase().includes(needle) ||
          d.tags.some((t) => t.toLowerCase().includes(needle))
        );
      });
    }
    if (temp) list = list.filter((d) => d.temperature === temp);
    const sorted = [...list];
    if (sort === "value") sorted.sort((a, b) => b.amount - a.amount);
    else if (sort === "engagement") sorted.sort((a, b) => b.engagement - a.engagement);
    else if (sort === "next") sorted.sort((a, b) => (a.nextActionAt ?? "9999").localeCompare(b.nextActionAt ?? "9999"));
    return sorted;
  }, [deals, q, temp, sort, contactById]);

  const totals = useMemo(() => {
    const value = filtered.reduce((s, d) => s + d.amount, 0);
    const hot = filtered.filter((d) => d.temperature === "hot" || d.engagement >= 75).length;
    const wonStage = pipeline.stages.find((s) => ["Ganho", "Fechado", "Concluído", "Entregue"].includes(s.name));
    const won = filtered.filter((d) => d.stageId === wonStage?.id).reduce((s, d) => s + d.amount, 0);
    return { value, hot, won };
  }, [filtered, pipeline.stages]);

  function dropOn(stageId: string, e: React.DragEvent) {
    e.preventDefault();
    setDragOver(null);
    const dealId = e.dataTransfer.getData("text/deal-id");
    if (!dealId) return;
    const deal = deals.find((d) => d.id === dealId);
    if (!deal || deal.stageId === stageId) return;
    startMove(async () => {
      try {
        await moveDeal(dealId, stageId);
        toast.success("Deal movido");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Falha ao mover");
      }
    });
  }

  const open = openId ? deals.find((d) => d.id === openId) ?? null : null;
  const openContact = open ? contactById.get(open.contactId) : undefined;

  return (
    <>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold text-slate-900">{pipeline.name}</h1>
            {pipelines.length > 1 && (
              <Select
                value={pipeline.id}
                onChange={(e) => setParam("pipeline", e.target.value)}
                className="h-8 w-auto text-xs"
                aria-label="Trocar de funil"
              >
                {pipelines.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            )}
          </div>
          <p className="text-sm text-slate-500">Arraste os cards entre estágios — ou use o seletor dentro do deal.</p>
        </div>
        <Button onClick={() => setNewOpen(true)}><Plus className="h-4 w-4" aria-hidden /> Novo lead</Button>
      </div>

      {/* Busca e filtros (persistidos na URL) */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <Input
            defaultValue={q}
            onChange={(e) => setParam("q", e.target.value)}
            placeholder="Buscar por deal, contato, empresa ou tag"
            className="pl-9"
            aria-label="Buscar deals"
          />
        </div>
        <Select value={temp} onChange={(e) => setParam("temp", e.target.value)} className="w-36" aria-label="Filtrar por temperatura">
          <option value="">Temperatura: todas</option>
          <option value="hot">Quente</option>
          <option value="warm">Morno</option>
          <option value="cold">Frio</option>
        </Select>
        <Select value={sort} onChange={(e) => setParam("sort", e.target.value)} className="w-44" aria-label="Ordenar">
          <option value="recent">Mais recentes</option>
          <option value="value">Maior valor</option>
          <option value="engagement">Maior engajamento</option>
          <option value="next">Próxima ação</option>
        </Select>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard label="Pipeline" value={brl(totals.value)} hint={`${filtered.length} deals no filtro`} />
        <KpiCard label="Leads quentes" value={String(totals.hot)} />
        <KpiCard label="Fechado (ganho)" value={brl(totals.won)} />
        <KpiCard label="Agentes" value={String(agents.filter((a) => a.enabled).length)} hint={`de ${agents.length} no Studio`} />
      </div>

      <div className="flex gap-4 overflow-x-auto pb-4">
        {pipeline.stages.map((stage) => {
          const stageDeals = filtered.filter((d) => d.stageId === stage.id);
          const stageValue = stageDeals.reduce((s, d) => s + d.amount, 0);
          return (
            <div
              key={stage.id}
              className="w-72 shrink-0"
              onDragOver={(e) => { e.preventDefault(); setDragOver(stage.id); }}
              onDragLeave={() => setDragOver((cur) => (cur === stage.id ? null : cur))}
              onDrop={(e) => dropOn(stage.id, e)}
            >
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: stage.accent }} />
                  <span className="text-sm font-semibold text-slate-700">{stage.name}</span>
                  <span className="text-xs text-slate-400">{stageDeals.length}</span>
                </div>
                <span className="text-[11px] text-slate-400">{brl(stageValue)}</span>
              </div>
              <div className={`space-y-2 rounded-xl p-2 transition-colors ${dragOver === stage.id ? "bg-brand-50 ring-2 ring-brand-200" : "bg-slate-100/60"}`}>
                {stageDeals.length === 0 && <div className="py-6 text-center text-xs text-slate-400">solte um card aqui</div>}
                {stageDeals.map((d) => (
                  <DealCard
                    key={d.id}
                    deal={d}
                    contact={contactById.get(d.contactId)}
                    onClick={() => setOpenId(d.id)}
                    onDragStart={(e) => e.dataTransfer.setData("text/deal-id", d.id)}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {open && (
        <DealDrawer
          deal={open}
          contact={openContact ?? null}
          agents={agents}
          stages={pipeline.stages}
          products={products}
          myRole={myRole}
          orgName={orgName}
          onClose={() => setOpenId(null)}
        />
      )}
      <NewLeadModal open={newOpen} onOpenChange={setNewOpen} />
    </>
  );
}

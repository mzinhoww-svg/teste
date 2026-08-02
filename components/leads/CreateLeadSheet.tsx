"use client";

import { useMemo, useState, useTransition } from "react";
import { AlertTriangle, MessageCircle, Sparkles, UserPlus, Zap } from "lucide-react";
import { toast } from "sonner";
import { createLead, findLeadDuplicates, type CreateLeadInput } from "@/app/actions";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Select, Label } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { AGENT_LABEL_BY_KIND, suggestAgentKind } from "@/lib/agent-suggest";
import { normalizePhoneBR, waMeLink } from "@/lib/whatsapp";

export const REINERS_PRODUCTS = [
  "Diagnóstico de Presença Institucional",
  "Gravação de Podcast In Loco",
  "Hora de Estúdio Fixo",
  "Campanha Viva",
  "Podcast e Domo Geodésico em Eventos",
  "Studio Corporativo Permanente",
  "BTS ou recorrência institucional",
  "Ainda não definido",
];
const CLIENT_TYPES = ["cooperativa", "indústria", "associação", "candidato", "organizador de evento", "patrocinador", "empresário", "liderança pública", "profissional liberal", "cliente atual", "parceiro", "indefinido"];
const CHANNELS = ["whatsapp", "indicação", "evento", "linkedin", "instagram", "site", "ligação", "rede pessoal", "parceiro", "outro"];
const NEXT_ACTIONS = ["chamar no WhatsApp", "ligar", "agendar reunião", "enviar diagnóstico", "preparar proposta", "pedir dados", "enviar contrato", "follow-up", "outro"];
const TEMPS = [{ v: "cold", l: "Frio" }, { v: "warm", l: "Morno" }, { v: "hot", l: "Quente" }, { v: "strategic", l: "Estratégico" }];

// Sugere produto por tipo de cliente (heurística leve, não substitui o agente).
function suggestProduct(clientType: string, hasEvent: boolean): string | null {
  if (hasEvent) return "Podcast e Domo Geodésico em Eventos";
  if (["cooperativa", "indústria", "associação"].includes(clientType)) return "Studio Corporativo Permanente";
  if (clientType === "candidato" || clientType === "liderança pública") return "Campanha Viva";
  if (clientType === "empresário" || clientType === "profissional liberal") return "Gravação de Podcast In Loco";
  if (clientType) return "Diagnóstico de Presença Institucional";
  return null;
}

interface StageOpt { id: string; name: string; key?: string }

export function CreateLeadSheet({ open, onOpenChange, pipelineId, stages, onCreated }: {
  open: boolean; onOpenChange: (o: boolean) => void; pipelineId: string;
  stages: StageOpt[]; onCreated: (dealId: string) => void;
}) {
  const [mode, setMode] = useState<"quick" | "full">("quick");
  const [f, setF] = useState<CreateLeadInput>({ name: "", channel: "whatsapp", createNotification: true });
  const [dupes, setDupes] = useState<{ id: string; name: string; company: string | null }[]>([]);
  const [pending, start] = useTransition();
  const set = (patch: Partial<CreateLeadInput>) => setF((prev) => ({ ...prev, ...patch }));

  const normalized = f.phone ? normalizePhoneBR(f.phone) : null;
  const hasEvent = Boolean(f.eventDate) || (f.productLabel ?? "").includes("Domo");
  const suggestedProduct = useMemo(() => suggestProduct(f.clientType ?? "", hasEvent), [f.clientType, hasEvent]);
  const missing = useMemo(() => {
    const m: string[] = [];
    if (!normalized && !f.email) m.push("canal de contato");
    if (!f.productLabel || f.productLabel === "Ainda não definido") m.push("produto");
    if (!f.nextAction) m.push("próxima ação");
    if (f.decisor === "nao" || f.decisor === "nao_sei") m.push("decisor");
    return m;
  }, [normalized, f.email, f.productLabel, f.nextAction, f.decisor]);
  const suggestion = suggestAgentKind({ stageKey: stages[0]?.key, hasDecisor: f.decisor === "sim", hasBudget: Boolean(f.budget), complete: missing.length === 0 });

  async function checkDupes() {
    if (!f.name && !f.phone && !f.email) return;
    try {
      const d = await findLeadDuplicates({ name: f.name, email: f.email, phone: f.phone, company: f.company });
      setDupes(d);
    } catch { /* silencioso */ }
  }

  function submit(after: "open" | "whatsapp" | "close") {
    if (!f.name.trim()) { toast.error("Nome do contato é obrigatório"); return; }
    start(async () => {
      try {
        const { dealId } = await createLead({ ...f, pipelineId });
        toast.success("Lead criado");
        onOpenChange(false);
        if (after === "whatsapp" && normalized) {
          const link = waMeLink(normalized, `Olá ${f.name.split(" ")[0]}, tudo bem?`);
          if (link) window.open(link, "_blank");
        }
        setF({ name: "", channel: "whatsapp", createNotification: true });
        setDupes([]);
        if (after !== "close") onCreated(dealId);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Falha ao criar lead");
      }
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent aria-describedby={undefined} className="sm:max-w-2xl">
        <div className="sticky top-0 z-10 border-b border-slate-100 bg-white px-6 py-4 dark:border-slate-800">
          <div className="flex items-center justify-between gap-2">
            <div>
              <SheetTitle className="text-lg font-semibold text-slate-900">Novo lead</SheetTitle>
              <SheetDescription className="text-sm text-slate-500">
                Registre contexto suficiente para o CRM sugerir próxima ação, agente ideal e cadência.
              </SheetDescription>
            </div>
            <div className="inline-flex rounded-lg border border-slate-200 p-0.5 text-xs dark:border-slate-700">
              <button onClick={() => setMode("quick")} className={`rounded-md px-2.5 py-1 font-medium ${mode === "quick" ? "bg-brand-600 text-white" : "text-slate-500"}`}>Rápido</button>
              <button onClick={() => setMode("full")} className={`rounded-md px-2.5 py-1 font-medium ${mode === "full" ? "bg-brand-600 text-white" : "text-slate-500"}`}>Completo</button>
            </div>
          </div>
        </div>

        <div className="grid gap-5 px-6 py-5 lg:grid-cols-[1fr_260px]">
          <div className="space-y-5">
            {/* Identidade */}
            <Section title="Identidade do contato">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2"><Label>Nome*</Label><Input value={f.name} onChange={(e) => set({ name: e.target.value })} onBlur={checkDupes} autoFocus /></div>
                <div><Label>Empresa / organização</Label><Input value={f.company ?? ""} onChange={(e) => set({ company: e.target.value })} onBlur={checkDupes} /></div>
                <div><Label>Telefone (WhatsApp)</Label><Input value={f.phone ?? ""} onChange={(e) => set({ phone: e.target.value })} onBlur={checkDupes} placeholder="+55 65 99999-0000" /></div>
                {mode === "full" && <>
                  <div><Label>Cargo / papel</Label><Input value={f.jobTitle ?? ""} onChange={(e) => set({ jobTitle: e.target.value })} /></div>
                  <div><Label>E-mail</Label><Input type="email" value={f.email ?? ""} onChange={(e) => set({ email: e.target.value })} onBlur={checkDupes} /></div>
                  <div><Label>Canal de origem</Label><Select value={f.channel} onChange={(e) => set({ channel: e.target.value })}>{CHANNELS.map((c) => <option key={c} value={c}>{c}</option>)}</Select></div>
                  <div><Label>Origem detalhada</Label><Input value={f.originDetail ?? ""} onChange={(e) => set({ originDetail: e.target.value })} /></div>
                  <div><Label>Cidade</Label><Input value={f.city ?? ""} onChange={(e) => set({ city: e.target.value })} /></div>
                  <div><Label>Segmento</Label><Input value={f.segment ?? ""} onChange={(e) => set({ segment: e.target.value })} /></div>
                </>}
              </div>
            </Section>

            {/* Oportunidade */}
            <Section title="Oportunidade">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2"><Label>Produto de interesse</Label><Select value={f.productLabel ?? ""} onChange={(e) => set({ productLabel: e.target.value })}><option value="">Selecione…</option>{REINERS_PRODUCTS.map((p) => <option key={p} value={p}>{p}</option>)}</Select></div>
                <div className="col-span-2"><Label>Título da oportunidade</Label><Input value={f.title ?? ""} onChange={(e) => set({ title: e.target.value })} placeholder={`${f.company || f.name || "Cliente"} — ${f.productLabel || "oportunidade"}`} /></div>
                <div><Label>Valor estimado (R$)</Label><Input type="number" min="0" step="100" value={f.amount ?? ""} onChange={(e) => set({ amount: Number(e.target.value) })} /></div>
                <div><Label>Estágio inicial</Label><Select value={f.stageId ?? stages[0]?.id} onChange={(e) => set({ stageId: e.target.value })}>{stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></div>
                {mode === "full" && <>
                  <div><Label>Probabilidade (%)</Label><Input type="number" min="0" max="100" value={f.probability ?? ""} onChange={(e) => set({ probability: Number(e.target.value) })} /></div>
                  <div><Label>Temperatura</Label><Select value={f.temperature ?? ""} onChange={(e) => set({ temperature: e.target.value })}><option value="">—</option>{TEMPS.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}</Select></div>
                  <div className="col-span-2"><Label>Tipo de cliente</Label><Select value={f.clientType ?? ""} onChange={(e) => set({ clientType: e.target.value })}><option value="">—</option>{CLIENT_TYPES.map((c) => <option key={c} value={c}>{c}</option>)}</Select></div>
                </>}
              </div>
            </Section>

            {mode === "full" && <>
              <Section title="Contexto comercial">
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2"><Label>Dor percebida</Label><Textarea rows={2} value={f.pain ?? ""} onChange={(e) => set({ pain: e.target.value })} /></div>
                  <div><Label>Objetivo do cliente</Label><Input value={f.objective ?? ""} onChange={(e) => set({ objective: e.target.value })} /></div>
                  <div><Label>Objeção inicial</Label><Input value={f.objection ?? ""} onChange={(e) => set({ objection: e.target.value })} /></div>
                  <div><Label>Decisor identificado</Label><Select value={f.decisor ?? ""} onChange={(e) => set({ decisor: e.target.value })}><option value="">—</option><option value="sim">Sim</option><option value="nao">Não</option><option value="nao_sei">Não sei</option></Select></div>
                  <div><Label>Nome do decisor</Label><Input value={f.decisorName ?? ""} onChange={(e) => set({ decisorName: e.target.value })} /></div>
                  <div><Label>Orçamento estimado</Label><Input value={f.budget ?? ""} onChange={(e) => set({ budget: e.target.value })} /></div>
                  <div><Label>Urgência</Label><Input value={f.urgency ?? ""} onChange={(e) => set({ urgency: e.target.value })} /></div>
                  <div><Label>Data (evento/gravação/reunião)</Label><Input type="date" value={f.eventDate ?? ""} onChange={(e) => set({ eventDate: e.target.value })} /></div>
                  <div><Label>Local</Label><Input value={f.location ?? ""} onChange={(e) => set({ location: e.target.value })} /></div>
                  <div className="col-span-2"><Label>CNPJ (para enriquecer)</Label><Input value={f.cnpj ?? ""} onChange={(e) => set({ cnpj: e.target.value })} placeholder="00.000.000/0000-00" /></div>
                  <div className="col-span-2"><Label>Observações da conversa</Label><Textarea rows={2} value={f.notes ?? ""} onChange={(e) => set({ notes: e.target.value })} /></div>
                  <div className="col-span-2"><Label>Tags (vírgula)</Label><Input value={(f.tags ?? []).join(", ")} onChange={(e) => set({ tags: e.target.value.split(",").map((t) => t.trim()).filter(Boolean) })} /></div>
                </div>
              </Section>

              <Section title="Próxima ação">
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Próxima ação</Label><Select value={f.nextAction ?? ""} onChange={(e) => set({ nextAction: e.target.value })}><option value="">—</option>{NEXT_ACTIONS.map((a) => <option key={a} value={a}>{a}</option>)}</Select></div>
                  <div><Label>Data da próxima ação</Label><Input type="date" value={f.nextActionAt ?? ""} onChange={(e) => set({ nextActionAt: e.target.value })} /></div>
                  <label className="col-span-2 flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={f.createNotification ?? true} onChange={(e) => set({ createNotification: e.target.checked })} className="h-4 w-4 accent-brand-600" /> Criar notificação in-app com agente sugerido</label>
                </div>
              </Section>
            </>}
          </div>

          {/* Enriquecimento / IA */}
          <aside className="space-y-3">
            <div className="rounded-xl border border-brand-200 bg-brand-50/50 p-3 dark:border-brand-900 dark:bg-brand-950/30">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-brand-700 dark:text-brand-300"><Sparkles className="h-3.5 w-3.5" aria-hidden /> Leitura do CRM</div>
              <dl className="mt-2 space-y-1.5 text-[11px]">
                <Row k="Telefone wa.me" v={normalized ?? "—"} />
                <Row k="Produto sugerido" v={suggestedProduct ?? "definir"} />
                <Row k="Agente recomendado" v={AGENT_LABEL_BY_KIND[suggestion.kind]} />
              </dl>
              <p className="mt-2 text-[10px] text-slate-500">{suggestion.reason}</p>
            </div>

            {missing.length > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] text-amber-800 dark:border-amber-900 dark:bg-amber-950/30">
                <div className="flex items-center gap-1.5 font-semibold"><AlertTriangle className="h-3.5 w-3.5" aria-hidden /> Faltam para proposta</div>
                <ul className="mt-1 list-disc pl-4">{missing.map((m) => <li key={m}>{m}</li>)}</ul>
              </div>
            )}

            {dupes.length > 0 && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-[11px] dark:border-rose-900 dark:bg-rose-950/30">
                <div className="font-semibold text-rose-700">Possível duplicidade</div>
                <ul className="mt-1 space-y-1">{dupes.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-2">
                    <span className="truncate text-slate-600">{d.name}{d.company ? ` · ${d.company}` : ""}</span>
                    <a href={`/app?deal=${d.id}`} className="shrink-0 text-brand-600 underline">abrir</a>
                  </li>
                ))}</ul>
                <p className="mt-1 text-[10px] text-rose-600">Você ainda pode criar mesmo assim.</p>
              </div>
            )}
          </aside>
        </div>

        <div className="sticky bottom-0 z-10 flex flex-wrap gap-2 border-t border-slate-100 bg-white px-6 py-3 dark:border-slate-800">
          <Button onClick={() => submit("open")} loading={pending}><UserPlus className="h-3.5 w-3.5" aria-hidden /> Criar e abrir lead</Button>
          {normalized && <Button variant="success" onClick={() => submit("whatsapp")} disabled={pending}><MessageCircle className="h-3.5 w-3.5" aria-hidden /> Criar e abrir WhatsApp</Button>}
          <Button variant="outline" onClick={() => submit("close")} disabled={pending}><Zap className="h-3.5 w-3.5" aria-hidden /> Criar sem abrir</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
      {children}
    </section>
  );
}
function Row({ k, v }: { k: string; v: string }) {
  return <div className="flex items-center justify-between gap-2"><dt className="text-slate-500">{k}</dt><dd className="truncate font-medium text-slate-800 dark:text-slate-200">{v}</dd></div>;
}

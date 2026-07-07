"use client";

import { useEffect, useState, useTransition } from "react";
import { CheckCircle2, Copy, FileSignature, FileText, FlaskConical, Mail, MessageCircle, Pencil, Play, ShieldCheck, Trash2, UserRound } from "lucide-react";
import { toast } from "sonner";
import { approveProposal, completeActivity, createActivity, deleteContact, deleteDeal, moveDeal, rejectProposal, sendProposalEmail, updateContact, updateDealFull } from "@/app/actions";
import { publicBaseUrl } from "@/lib/urls";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { brl, tempColor, tempLabel } from "@/lib/format";
import { waMeLink, buildWaTemplate } from "@/lib/whatsapp";
import { EnrichmentPanel } from "@/components/EnrichmentPanel";
import { REINERS_PRODUCTS } from "@/components/leads/CreateLeadSheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { AGENT_LABEL_BY_KIND, suggestAgentKind } from "@/lib/agent-suggest";
import { nextBestAction } from "@/lib/nba";
import { WA_TEMPLATES } from "@/lib/whatsapp";
import type { Agent, Contact, Deal, Stage } from "@/lib/types";
import type { ProductListItem } from "@/lib/db";

async function runAgent(dealId: string, kind: string, dryRun = false) {
  const res = await fetch("/api/agents/run", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ dealId, kind, dryRun }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error ?? `Erro ${res.status}`);
  return body;
}

function SourceTag({ source, llmError }: { source?: string; llmError?: string }) {
  if (!source || source === "n/a") return null;
  const live = source === "llm";
  return (
    <Badge
      variant={live ? "brand" : "muted"}
      className="ml-2 text-[10px]"
      title={!live && llmError ? `IA indisponível: ${llmError}` : undefined}
    >
      {live ? "IA · GLM" : llmError ? "heurística (IA falhou)" : "heurística"}
    </Badge>
  );
}

// Aviso âmbar quando a IA ao vivo estava ligada mas falhou (mostra o motivo).
function LlmErrorNote({ llmError }: { llmError?: string }) {
  if (!llmError) return null;
  return (
    <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
      IA indisponível — usando heurística. Motivo: {llmError}. Verifique em <code>/api/health?probe=1</code>.
    </p>
  );
}

function ProposalEmailButton({ proposalId, hasEmail }: { proposalId: string; hasEmail: boolean }) {
  const [pending, start] = useTransition();
  return (
    <button
      disabled={pending}
      title={hasEmail ? "Enviar a proposta por e-mail ao contato" : "Contato sem e-mail cadastrado"}
      onClick={() => start(async () => {
        try {
          const r = await sendProposalEmail(proposalId);
          if (r.ok) toast.success("Proposta enviada por e-mail");
          else toast.error(r.error ?? "Falha ao enviar e-mail");
        } catch (e) { toast.error(e instanceof Error ? e.message : "Falha ao enviar e-mail"); }
      })}
      className="inline-flex h-7 items-center gap-1 rounded-lg border border-slate-200 px-2.5 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700"
    >
      <Mail className="h-3 w-3" aria-hidden /> {pending ? "Enviando…" : "E-mail"}
    </button>
  );
}

function ProposalApproval({ proposalId, status, discountPct, isAdmin }: { proposalId: string; status?: string; discountPct?: number; isAdmin: boolean }) {
  const [pending, start] = useTransition();
  const [local, setLocal] = useState(status);
  if (!local || local === "aprovada") return null;
  if (local === "rejeitada") return <div className="mt-2 rounded-lg bg-rose-50 px-2.5 py-1.5 text-[11px] text-rose-700 dark:bg-rose-950/30 dark:text-rose-300">Desconto rejeitado — gere nova proposta.</div>;
  // pendente
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
      <span>Desconto de {discountPct ?? 0}% aguarda aprovação — envio bloqueado.</span>
      {isAdmin && (
        <span className="flex gap-1.5">
          <button disabled={pending} onClick={() => start(async () => { try { await approveProposal(proposalId); setLocal("aprovada"); toast.success("Desconto aprovado"); } catch (e) { toast.error(e instanceof Error ? e.message : "Falha"); } })}
            className="rounded bg-emerald-600 px-2 py-0.5 font-medium text-white hover:bg-emerald-700 disabled:opacity-50">Aprovar</button>
          <button disabled={pending} onClick={() => start(async () => { try { await rejectProposal(proposalId); setLocal("rejeitada"); toast.success("Desconto rejeitado"); } catch (e) { toast.error(e instanceof Error ? e.message : "Falha"); } })}
            className="rounded border border-rose-300 px-2 py-0.5 font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-50 dark:border-rose-800 dark:text-rose-300">Rejeitar</button>
        </span>
      )}
    </div>
  );
}

function ProposalShare({ token, phone, name }: { token: string; phone?: string | null; name?: string | null }) {
  const [origin, setOrigin] = useState(publicBaseUrl());
  useEffect(() => { if (!publicBaseUrl()) setOrigin(window.location.origin); }, []);
  if (!origin) return null;
  const link = `${origin.replace(/\/$/, "")}/proposta/${token}`;
  const wa = phone
    ? waMeLink(phone, buildWaTemplate("envio_proposta", { nome: (name ?? "").split(" ")[0], link }))
    : null;
  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2">
      <a href={link} target="_blank" rel="noreferrer" className="inline-flex h-7 items-center gap-1 rounded-lg border border-slate-200 px-2.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
        <FileText className="h-3 w-3" aria-hidden /> Abrir
      </a>
      <a href={`${origin.replace(/\/$/, "")}/api/proposta/${token}/pdf`} target="_blank" rel="noreferrer" className="inline-flex h-7 items-center gap-1 rounded-lg border border-slate-200 px-2.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
        <FileText className="h-3 w-3" aria-hidden /> PDF
      </a>
      <button onClick={() => { navigator.clipboard.writeText(link); toast.success("Link da proposta copiado"); }}
        className="inline-flex h-7 items-center gap-1 rounded-lg border border-slate-200 px-2.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
        <Copy className="h-3 w-3" aria-hidden /> Copiar link
      </button>
      {wa ? (
        <a href={wa} target="_blank" rel="noreferrer" className="inline-flex h-7 items-center gap-1 rounded-lg bg-emerald-600 px-2.5 text-xs font-medium text-white hover:bg-emerald-700">
          <MessageCircle className="h-3 w-3" aria-hidden /> Enviar por WhatsApp
        </a>
      ) : <span className="text-[10px] text-slate-400">sem telefone do contato</span>}
    </div>
  );
}

function AgentResult({ kind, r, contactPhone, contactName }: { kind: string; r: any; contactPhone?: string | null; contactName?: string | null }) {
  const body = (() => {
    if (kind === "lead-scoring") {
      return (
        <div className="mt-3">
          <div className="flex items-center gap-3">
            <div className="text-3xl font-bold text-slate-900">{r.score}</div>
            <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${tempColor(r.temperature)}`}>{tempLabel(r.temperature)}</span>
            <SourceTag source={r.source} llmError={r.llmError} />
          </div>
          <p className="mt-2 text-sm text-slate-600">{r.reason}</p>
        </div>
      );
    }
    if (kind === "sales-copilot") {
      return (
        <div className="mt-3 space-y-2">
          <p className="text-sm font-medium text-slate-800">→ {r.nextAction}<SourceTag source={r.source} llmError={r.llmError} /></p>
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
          <p className="text-sm text-slate-600">{r.summary}<SourceTag source={r.source} llmError={r.llmError} /></p>
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
          {r.shareToken && <ProposalShare token={r.shareToken} phone={contactPhone} name={contactName} />}
          {r.dryRun && !r.shareToken && <p className="text-xs text-amber-600">Prévia — execute (sem dry-run) para gerar o link compartilhável da proposta.</p>}
        </div>
      );
    }
    if (kind === "legal-contract") {
      return (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-slate-800">{r.title}</span><SourceTag source={r.source} llmError={r.llmError} />
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
          <p className="text-xs text-slate-400">Gerir em <a href="/app/contracts" className="text-brand-600 underline">Contratos</a> · {r.signatureProvider}</p>
        </div>
      );
    }
    return (
      <div className="mt-3">
        <p className="text-sm font-medium text-slate-800">{r.headline}<SourceTag source={r.source} llmError={r.llmError} /></p>
        <ul className="mt-2 space-y-1">
          {(r.items ?? []).map((it: string, i: number) => (
            <li key={i} className="flex gap-1.5 text-sm text-slate-600"><span className="text-brand-400">•</span>{it}</li>
          ))}
        </ul>
      </div>
    );
  })();

  return <>{body}<LlmErrorNote llmError={r.llmError} /></>;
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

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700">
      <div className="text-[10px] font-medium uppercase tracking-wide text-slate-400">{label}</div>
      <div className="truncate text-sm font-medium text-slate-800 dark:text-slate-200">{value}</div>
    </div>
  );
}

// Aba WhatsApp: templates por contexto + envio manual via wa.me (registra timeline
// no servidor via logWhatsappOpened não é chamado aqui para não bloquear o link;
// o wa.me apenas abre a conversa — nada automático).
const WA_TAB_KEYS = ["primeiro_contato", "confirmacao_reuniao", "envio_proposta", "followup_48h", "ligacao_5d", "ultimo_contato_10d", "posvenda", "upsell"] as const;

function WhatsAppTab({ phone, name, company }: { phone?: string | null; name?: string | null; company?: string | null }) {
  if (!phone) {
    return <p className="text-sm text-slate-400">Sem telefone no contato. Adicione um número (aba Visão geral → Contato) para enviar pelo WhatsApp.</p>;
  }
  const ctx = { nome: (name ?? "").split(" ")[0], empresa: company ?? undefined };
  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-500">Envio manual via wa.me — a mensagem abre pré-preenchida no seu WhatsApp. Nada é enviado automaticamente.</p>
      {WA_TAB_KEYS.map((k) => {
        const tpl = WA_TEMPLATES[k];
        if (!tpl) return null;
        const msg = buildWaTemplate(k, ctx);
        const link = waMeLink(phone, msg);
        return (
          <a key={k} href={link ?? "#"} target="_blank" rel="noreferrer"
            className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2 text-sm hover:border-emerald-300 hover:bg-emerald-50/40 dark:border-slate-700">
            <span className="min-w-0"><span className="font-medium text-slate-700 dark:text-slate-200">{tpl.label}</span><span className="ml-2 truncate text-xs text-slate-400">{msg.slice(0, 48)}…</span></span>
            <MessageCircle className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
          </a>
        );
      })}
    </div>
  );
}

export function DealDrawer({ deal, contact, agents, stages, products = [], myRole = "member", orgName = "", onClose }: {
  deal: Deal; contact: Contact | null; agents: Agent[]; stages: Stage[];
  products?: ProductListItem[]; myRole?: string; orgName?: string; onClose: () => void;
}) {
  // Agentes rodando AGORA (por id) — permite disparar vários em paralelo sem que
  // um bloqueie ou apague o indicador do outro.
  const [running, setRunning] = useState<Record<string, boolean>>({});
  const isRunning = (kind: string) => Boolean(running[kind]);
  const [results, setResults] = useState<Record<string, any>>({});
  const [hydrating, setHydrating] = useState(true);
  const [panels, setPanels] = useState<{ proposals: any[]; contracts: any[] }>({ proposals: [], contracts: [] });
  const [timeline, setTimeline] = useState<any[]>([]);
  const [editOpen, setEditOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmDeleteContact, setConfirmDeleteContact] = useState(false);
  const [pendingEdit, startEdit] = useTransition();
  const [, startMove] = useTransition();
  const isAdmin = myRole === "owner" || myRole === "admin";

  function submitEdit(fd: FormData) {
    startEdit(async () => {
      try {
        const probRaw = String(fd.get("probability") ?? "");
        await updateDealFull(deal.id, {
          title: String(fd.get("title") ?? deal.title),
          amount: Number(fd.get("amount") ?? deal.amount) || 0,
          engagement: Math.max(0, Math.min(100, Number(fd.get("engagement") ?? deal.engagement) || 0)),
          origin: String(fd.get("origin") ?? ""),
          nextActionAt: String(fd.get("nextActionAt") ?? "") || null,
          temperature: String(fd.get("temperature") ?? "") || null,
          productId: String(fd.get("productId") ?? "") || null,
          productLabel: String(fd.get("productLabel") ?? "") || null,
          probability: probRaw === "" ? null : Math.max(0, Math.min(100, Number(probRaw) || 0)),
          stageId: String(fd.get("stageId") ?? "") || undefined,
          lostReason: String(fd.get("lostReason") ?? "") || null,
          tags: String(fd.get("tags") ?? "").split(",").map((t) => t.trim()).filter(Boolean),
          custom: {
            pain: String(fd.get("pain") ?? ""), objective: String(fd.get("objective") ?? ""),
            objection: String(fd.get("objection") ?? ""), decisor: String(fd.get("decisor") ?? ""),
            budget: String(fd.get("budget") ?? ""), urgency: String(fd.get("urgency") ?? ""),
            event_date: String(fd.get("eventDate") ?? ""), location: String(fd.get("location") ?? ""),
          },
        });
        setEditOpen(false);
        toast.success("Deal atualizado");
      } catch (e) { toast.error(e instanceof Error ? e.message : "Falha ao salvar"); }
    });
  }

  function submitContact(fd: FormData) {
    if (!contact) return;
    startEdit(async () => {
      try {
        await updateContact(contact.id, {
          name: String(fd.get("name") ?? contact.name),
          company: String(fd.get("company") ?? ""),
          email: String(fd.get("email") ?? ""),
          phone: String(fd.get("phone") ?? ""),
          jobTitle: String(fd.get("jobTitle") ?? ""),
          city: String(fd.get("city") ?? ""),
          notes: String(fd.get("notes") ?? ""),
        });
        setContactOpen(false);
        toast.success("Contato atualizado");
      } catch (e) { toast.error(e instanceof Error ? e.message : "Falha ao salvar contato"); }
    });
  }

  // Reidrata a última execução de cada agente (persistida em agent_runs).
  useEffect(() => {
    let alive = true;
    fetch(`/api/agents/run?dealId=${deal.id}`)
      .then((r) => (r.ok ? r.json() : { latest: {} }))
      .then((b) => { if (alive) setResults(b.latest ?? {}); })
      .catch(() => {})
      .finally(() => { if (alive) setHydrating(false); });
    fetch(`/api/deals/${deal.id}/panels`)
      .then((r) => (r.ok ? r.json() : { proposals: [], contracts: [] }))
      .then((b) => { if (alive) setPanels(b); })
      .catch(() => {});
    fetch(`/api/deals/${deal.id}/timeline`)
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((b) => { if (alive) setTimeline(b.items ?? []); })
      .catch(() => {});
    return () => { alive = false; };
  }, [deal.id]);

  async function run(kind: string, dryRun = false) {
    if (isRunning(kind)) return; // evita duplo clique no MESMO agente
    setRunning((prev) => ({ ...prev, [kind]: true }));
    try {
      const r = await runAgent(deal.id, kind, dryRun);
      setResults((prev) => ({ ...prev, [kind]: r }));
      if (dryRun) toast.info("Prévia gerada — nada foi salvo neste deal");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao executar agente");
    } finally {
      // Limpa só o próprio agente — não interfere nos outros que ainda rodam.
      setRunning((prev) => { const next = { ...prev }; delete next[kind]; return next; });
    }
  }

  const runnable = agents.filter((a) => a.runnable).sort((a, b) => (groupOrder[a.group] ?? 9) - (groupOrder[b.group] ?? 9));

  // Resumo operacional da aba "Visão geral".
  const missingOverview = (() => {
    const m: string[] = [];
    if (!contact?.phone && !contact?.email) m.push("canal de contato");
    if (!deal.custom?.product_interest && !deal.productId) m.push("produto");
    if (!deal.nextActionAt && !deal.custom?.next_action) m.push("próxima ação");
    if (deal.custom?.decisor === "nao" || deal.custom?.decisor === "nao_sei") m.push("decisor");
    return m;
  })();
  const overviewSuggestion = suggestAgentKind({
    stageKey: deal.stageKey, hasDecisor: deal.custom?.decisor === "sim",
    hasBudget: Boolean(deal.custom?.budget), complete: missingOverview.length === 0,
  });
  const nba = nextBestAction(deal);

  // Status operacional pela próxima ação.
  const today = new Date().toISOString().slice(0, 10);
  const nextAction = deal.nextActionAt ?? null;
  const actionStatus = !nextAction
    ? { label: "sem próxima ação", cls: "bg-amber-100 text-amber-700" }
    : nextAction < today
      ? { label: "atrasado", cls: "bg-rose-100 text-rose-700" }
      : { label: "em dia", cls: "bg-emerald-100 text-emerald-700" };

  const [acts, setActs] = useState(deal.activities);
  const [actText, setActText] = useState("");
  const [actType, setActType] = useState("note");
  const [actNext, setActNext] = useState("");
  const [pendingAct, startAct] = useTransition();
  function addActivity() {
    const summary = actText.trim();
    if (!summary) return;
    startAct(async () => {
      try {
        await createActivity(deal.id, { type: actType, summary, nextActionAt: actNext || undefined });
        setActs((prev) => [{ id: `tmp-${Date.now()}`, summary, type: actType, at: today, author: "Você" } as any, ...prev]);
        setActText(""); setActNext("");
        toast.success("Atividade registrada");
      } catch (e) { toast.error(e instanceof Error ? e.message : "Falha ao registrar"); }
    });
  }

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
            <Button variant="outline" size="xs" onClick={() => setEditOpen(true)}>
              <Pencil className="h-3 w-3" aria-hidden /> Editar
            </Button>
            {isAdmin && (
              <Button variant="destructive-ghost" size="xs" onClick={() => setConfirmDelete(true)}>
                <Trash2 className="h-3 w-3" aria-hidden /> Excluir
              </Button>
            )}
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

        <Tabs defaultValue="overview" className="px-6 py-3">
          <TabsList>
            <TabsTrigger value="overview">Visão geral</TabsTrigger>
            <TabsTrigger value="agents">Agentes</TabsTrigger>
            <TabsTrigger value="proposal">Proposta{panels.proposals.length ? ` (${panels.proposals.length})` : ""}</TabsTrigger>
            <TabsTrigger value="contracts">Contratos{panels.contracts.length ? ` (${panels.contracts.length})` : ""}</TabsTrigger>
            <TabsTrigger value="whatsapp">WhatsApp</TabsTrigger>
            <TabsTrigger value="activity">Atividades</TabsTrigger>
            <TabsTrigger value="history">Histórico</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
              <Field label="Valor" value={brl(deal.amount)} />
              <Field label="Temperatura" value={deal.temperature ? tempLabel(deal.temperature) : "—"} />
              <Field label="Probabilidade" value={deal.probability != null ? `${deal.probability}%` : "—"} />
              <Field label="Produto" value={deal.custom?.product_interest ?? "—"} />
              <Field label="Score" value={deal.score != null ? String(deal.score) : "—"} />
              <Field label="Próxima ação" value={deal.nextActionAt ?? deal.custom?.next_action ?? "—"} />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium ${actionStatus.cls}`}>{actionStatus.label}</span>
              {missingOverview.length > 0 && (
                <span className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1 text-xs text-amber-800">Falta para proposta: {missingOverview.join(", ")}.</span>
              )}
            </div>
            <div className={`rounded-lg border px-3 py-2 text-xs ${nba.urgency === "alta" ? "border-rose-200 bg-rose-50 dark:border-rose-900 dark:bg-rose-950/30" : "border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900"}`}>
              <span className="font-semibold text-slate-700 dark:text-slate-200">Próxima melhor ação:</span> {nba.label}
              <span className="ml-1 text-slate-400">· urgência {nba.urgency}</span>
            </div>
            <div className="rounded-lg border border-brand-200 bg-brand-50/60 px-3 py-2 text-xs dark:border-brand-900 dark:bg-brand-950/30">
              <span className="font-semibold text-brand-700 dark:text-brand-300">Agente recomendado:</span>{" "}
              {AGENT_LABEL_BY_KIND[overviewSuggestion.kind] ?? overviewSuggestion.kind} — {overviewSuggestion.reason}
            </div>
            <EnrichmentPanel dealId={deal.id} initialFacts={(panels as any).enrichment} />

            {contact && (
              <section className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <UserRound className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-slate-800 dark:text-slate-200">{contact.name}</div>
                      <div className="truncate text-xs text-slate-400">{[contact.company, contact.email, contact.phone].filter(Boolean).join(" · ") || "sem dados de contato"}</div>
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    <Button variant="outline" size="xs" onClick={() => setContactOpen(true)}><Pencil className="h-3 w-3" aria-hidden /> Contato</Button>
                    <Button variant="outline" size="xs" onClick={() => setEditOpen(true)}><Pencil className="h-3 w-3" aria-hidden /> Oportunidade</Button>
                  </div>
                </div>
              </section>
            )}
          </TabsContent>

          <TabsContent value="agents" className="space-y-4 py-4">
            {runnable.map((agent) => (
              <section key={String(agent.id)} className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">{agent.name}</h3>
                    <span className="text-[11px] text-slate-500">{agent.role}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button variant="outline" size="xs" onClick={() => run(String(agent.id), true)} disabled={!agent.enabled || isRunning(String(agent.id))} title="Gerar prévia sem salvar">
                      <FlaskConical className="h-3 w-3" aria-hidden /> Testar
                    </Button>
                    <Button size="xs" onClick={() => run(String(agent.id))} disabled={!agent.enabled || isRunning(String(agent.id))} loading={isRunning(String(agent.id))}>
                      {isRunning(String(agent.id)) ? "Executando" : agent.enabled ? (<><Play className="h-3 w-3" aria-hidden /> Executar</>) : "inativo"}
                    </Button>
                  </div>
                </div>
                {isRunning(String(agent.id)) ? <RunningSkeleton /> : hydrating ? <Skeleton className="mt-3 h-4 w-2/3" /> : (
                  results[String(agent.id)] && (
                    <>
                      {results[String(agent.id)]?.dryRun && (
                        <div className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-700">
                          <FlaskConical className="h-3 w-3" aria-hidden /> Prévia — não foi salvo neste deal
                        </div>
                      )}
                      <AgentResult kind={String(agent.id)} r={results[String(agent.id)]} contactPhone={contact?.phone} contactName={contact?.name} />
                    </>
                  )
                )}
              </section>
            ))}
          </TabsContent>

          <TabsContent value="proposal" className="space-y-2 py-4">
            {panels.proposals.length === 0 && <p className="text-sm text-slate-400">Nenhuma proposta gerada. Rode o agente de Propostas na aba Agentes.</p>}
            {panels.proposals.map((p) => {
              const link = origin ? `${origin.replace(/\/$/, "")}/proposta/${p.shareToken}` : "";
              return (
                <div key={p.id} className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0"><div className="truncate text-sm font-medium text-slate-800 dark:text-slate-200">{p.summary || "Proposta"}</div><div className="text-xs text-slate-400">{brl(p.total)} · {String(p.createdAt).slice(0, 10)}</div></div>
                    <div className="flex shrink-0 gap-1.5">
                      {link && <a href={`${origin.replace(/\/$/, "")}/api/proposta/${p.shareToken}/pdf`} target="_blank" rel="noreferrer" className="inline-flex h-7 items-center gap-1 rounded-lg border border-slate-200 px-2.5 text-xs text-slate-600 hover:bg-slate-50 dark:border-slate-700"><FileText className="h-3 w-3" aria-hidden /> PDF</a>}
                      {link && <button onClick={() => { navigator.clipboard.writeText(link); toast.success("Link copiado"); }} className="inline-flex h-7 items-center gap-1 rounded-lg border border-slate-200 px-2.5 text-xs text-slate-600 hover:bg-slate-50 dark:border-slate-700"><Copy className="h-3 w-3" aria-hidden /> Link</button>}
                      {(p as any).approvalStatus !== "pendente" && (p as any).approvalStatus !== "rejeitada" && <ProposalEmailButton proposalId={p.id} hasEmail={Boolean(contact?.email)} />}
                    </div>
                  </div>
                  <ProposalApproval proposalId={p.id} status={(p as any).approvalStatus} discountPct={(p as any).discountPct} isAdmin={isAdmin} />
                </div>
              );
            })}
          </TabsContent>

          <TabsContent value="contracts" className="space-y-2 py-4">
            {panels.contracts.length === 0 && <p className="text-sm text-slate-400">Nenhum contrato. Rode o agente de Contratos ou gere na aba Contratos do menu.</p>}
            {panels.contracts.map((c) => {
              const link = origin && c.signToken ? `${origin.replace(/\/$/, "")}/sign/contracts/${c.signToken}` : "";
              return (
                <div key={c.id} className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-slate-800 dark:text-slate-200">{c.title}</div>
                      <div className="text-xs text-slate-400">{c.reference} · {brl(c.value)}</div>
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${c.signed ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>{c.signed ? "assinado" : (c.externalStatus ?? c.status ?? "rascunho")}</span>
                  </div>
                  {c.signers.length > 0 && <div className="mt-1.5 flex flex-wrap gap-2 text-[10px] text-slate-500">{c.signers.map((s: any, i: number) => <span key={i} className="inline-flex items-center gap-1"><span className={`h-1.5 w-1.5 rounded-full ${s.status === "signed" ? "bg-emerald-500" : "bg-slate-300"}`} />{s.name}</span>)}</div>}
                  {!c.signed && link && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <button onClick={() => { navigator.clipboard.writeText(link); toast.success("Link de assinatura copiado"); }} className="inline-flex h-7 items-center gap-1 rounded-lg border border-slate-200 px-2.5 text-xs text-slate-600 hover:bg-slate-50 dark:border-slate-700"><Copy className="h-3 w-3" aria-hidden /> Copiar link</button>
                      {contact?.phone && <a href={waMeLink(contact.phone, buildWaTemplate("link_opensign", { nome: (contact.name ?? "").split(" ")[0], link })) ?? "#"} target="_blank" rel="noreferrer" className="inline-flex h-7 items-center gap-1 rounded-lg bg-emerald-600 px-2.5 text-xs font-medium text-white hover:bg-emerald-700"><MessageCircle className="h-3 w-3" aria-hidden /> WhatsApp</a>}
                    </div>
                  )}
                  {c.signed && c.certificateUrl && <a href={c.certificateUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex h-7 items-center gap-1 rounded-lg border border-slate-200 px-2.5 text-xs text-slate-600 hover:bg-slate-50 dark:border-slate-700"><ShieldCheck className="h-3 w-3" aria-hidden /> Documento assinado</a>}
                </div>
              );
            })}
          </TabsContent>

          <TabsContent value="whatsapp" className="py-4">
            <WhatsAppTab phone={contact?.phone} name={contact?.name} company={contact?.company} />
          </TabsContent>

          <TabsContent value="activity" className="py-4">
            <div className="mb-4 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <Input value={actText} onChange={(e) => setActText(e.target.value)} placeholder="Registrar ligação, reunião, observação…" onKeyDown={(e) => { if (e.key === "Enter") addActivity(); }} />
                <Button size="sm" loading={pendingAct} onClick={addActivity}>Registrar</Button>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <Select value={actType} onChange={(e) => setActType(e.target.value)} className="h-8 w-auto text-xs">
                  <option value="note">Observação</option>
                  <option value="call">Ligação</option>
                  <option value="meeting">Reunião</option>
                  <option value="whatsapp">WhatsApp</option>
                  <option value="task">Tarefa</option>
                </Select>
                <label className="text-xs text-slate-500">Próxima ação: <Input type="date" value={actNext} onChange={(e) => setActNext(e.target.value)} className="ml-1 inline-block h-8 w-auto text-xs" /></label>
              </div>
            </div>
            {acts.length === 0 && <p className="text-sm text-slate-400">Sem atividades ainda. Registre a primeira acima.</p>}
            <ul className="space-y-2">
              {acts.map((a) => {
                const isTask = a.type === "task" || Boolean(a.dueAt);
                const overdue = isTask && !a.doneAt && a.dueAt && a.dueAt < today;
                return (
                  <li key={a.id} className="flex gap-2.5 text-sm">
                    {isTask ? (
                      <button
                        onClick={() => {
                          const done = !a.doneAt;
                          setActs((prev) => prev.map((x) => x.id === a.id ? { ...x, doneAt: done ? new Date().toISOString() : null } : x));
                          startAct(async () => { try { await completeActivity(a.id, done); } catch { setActs((prev) => prev.map((x) => x.id === a.id ? { ...x, doneAt: done ? null : new Date().toISOString() } : x)); toast.error("Falha ao atualizar tarefa"); } });
                        }}
                        className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded border ${a.doneAt ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-300 dark:border-slate-600"}`}
                        aria-label={a.doneAt ? "Reabrir tarefa" : "Concluir tarefa"}
                      >
                        {a.doneAt && <CheckCircle2 className="h-3 w-3" aria-hidden />}
                      </button>
                    ) : (
                      <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-400" aria-hidden />
                    )}
                    <div>
                      <span className={a.doneAt ? "text-slate-400 line-through" : "text-slate-700 dark:text-slate-300"}>{a.summary}</span>
                      <div className="text-xs text-slate-400">
                        {a.at} · {a.type} · {a.author}
                        {a.dueAt && <span className={`ml-1 ${overdue ? "text-rose-500" : "text-amber-600"}`}>· vence {a.dueAt}</span>}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </TabsContent>

          <TabsContent value="history" className="py-4">
            {timeline.length === 0 ? (
              <p className="text-sm text-slate-400">Sem histórico ainda. Mudanças de estágio, valor, dono, agentes, propostas e contratos aparecem aqui.</p>
            ) : (
              <ul className="space-y-2.5">
                {timeline.map((t) => (
                  <li key={t.id} className="flex gap-2.5 text-sm">
                    <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-brand-400" aria-hidden />
                    <div className="min-w-0">
                      <span className="text-slate-700 dark:text-slate-300">{t.title}</span>
                      {t.detail && <span className="text-slate-500"> — {t.detail}</span>}
                      <div className="text-xs text-slate-400">{(t.at ?? "").slice(0, 16).replace("T", " ")} · {t.source}</div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>
        </Tabs>

        {/* Editar deal */}
        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent aria-describedby={undefined}>
            <DialogTitle>Editar deal</DialogTitle>
            <form action={submitEdit} className="mt-3 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <Label htmlFor="ed-title">Título</Label>
                  <Input id="ed-title" name="title" defaultValue={deal.title} required />
                </div>
                <div>
                  <Label htmlFor="ed-amount">Valor (R$)</Label>
                  <Input id="ed-amount" name="amount" type="number" min="0" step="100" defaultValue={deal.amount} />
                </div>
                <div>
                  <Label htmlFor="ed-eng">Engajamento (0-100)</Label>
                  <Input id="ed-eng" name="engagement" type="number" min="0" max="100" defaultValue={deal.engagement} />
                </div>
                <div>
                  <Label htmlFor="ed-temp">Temperatura</Label>
                  <Select id="ed-temp" name="temperature" defaultValue={deal.temperature ?? ""}>
                    <option value="">—</option>
                    <option value="hot">Quente</option>
                    <option value="warm">Morno</option>
                    <option value="cold">Frio</option>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="ed-next">Próxima ação (data)</Label>
                  <Input id="ed-next" name="nextActionAt" type="date" defaultValue={deal.nextActionAt ?? ""} />
                </div>
                <div>
                  <Label htmlFor="ed-origin">Origem</Label>
                  <Input id="ed-origin" name="origin" defaultValue={deal.origin ?? ""} placeholder="indicação, evento, rede…" />
                </div>
                <div>
                  <Label htmlFor="ed-stage">Estágio</Label>
                  <Select id="ed-stage" name="stageId" defaultValue={deal.stageId}>
                    {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </Select>
                </div>
                <div>
                  <Label htmlFor="ed-prob">Probabilidade (%)</Label>
                  <Input id="ed-prob" name="probability" type="number" min="0" max="100" defaultValue={deal.probability ?? ""} />
                </div>
                <div>
                  <Label htmlFor="ed-product">Produto (catálogo)</Label>
                  <Select id="ed-product" name="productId" defaultValue={deal.productId ?? ""}>
                    <option value="">—</option>
                    {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </Select>
                </div>
                <div className="col-span-2">
                  <Label htmlFor="ed-productLabel">Produto de interesse</Label>
                  <Select id="ed-productLabel" name="productLabel" defaultValue={deal.custom?.product_interest ?? ""}>
                    <option value="">—</option>
                    {REINERS_PRODUCTS.map((p) => <option key={p} value={p}>{p}</option>)}
                  </Select>
                </div>
                <div className="col-span-2">
                  <Label htmlFor="ed-tags">Tags (separadas por vírgula)</Label>
                  <Input id="ed-tags" name="tags" defaultValue={deal.tags.join(", ")} />
                </div>

                <details className="col-span-2 rounded-lg border border-slate-200 p-2 dark:border-slate-700">
                  <summary className="cursor-pointer text-xs font-medium text-slate-500">Contexto comercial</summary>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <div className="col-span-2"><Label htmlFor="ed-pain">Dor</Label><Input id="ed-pain" name="pain" defaultValue={deal.custom?.pain ?? ""} /></div>
                    <div><Label htmlFor="ed-obj">Objetivo</Label><Input id="ed-obj" name="objective" defaultValue={deal.custom?.objective ?? ""} /></div>
                    <div><Label htmlFor="ed-objection">Objeção</Label><Input id="ed-objection" name="objection" defaultValue={deal.custom?.objection ?? ""} /></div>
                    <div><Label htmlFor="ed-decisor">Decisor</Label>
                      <Select id="ed-decisor" name="decisor" defaultValue={deal.custom?.decisor ?? ""}>
                        <option value="">—</option><option value="sim">Sim</option><option value="nao">Não</option><option value="nao_sei">Não sei</option>
                      </Select>
                    </div>
                    <div><Label htmlFor="ed-budget">Orçamento</Label><Input id="ed-budget" name="budget" defaultValue={deal.custom?.budget ?? ""} /></div>
                    <div><Label htmlFor="ed-urg">Urgência</Label><Input id="ed-urg" name="urgency" defaultValue={deal.custom?.urgency ?? ""} /></div>
                    <div><Label htmlFor="ed-evt">Data evento/gravação</Label><Input id="ed-evt" name="eventDate" type="date" defaultValue={deal.custom?.event_date ?? ""} /></div>
                    <div className="col-span-2"><Label htmlFor="ed-loc">Local</Label><Input id="ed-loc" name="location" defaultValue={deal.custom?.location ?? ""} /></div>
                    <div className="col-span-2"><Label htmlFor="ed-lost">Motivo de perda</Label><Input id="ed-lost" name="lostReason" defaultValue={deal.lostReason ?? ""} /></div>
                  </div>
                </details>
              </div>
              <Button type="submit" loading={pendingEdit} className="w-full">Salvar alterações</Button>
            </form>
          </DialogContent>
        </Dialog>

        {/* Editar contato */}
        {contact && (
          <Dialog open={contactOpen} onOpenChange={setContactOpen}>
            <DialogContent aria-describedby={undefined}>
              <DialogTitle>Editar contato</DialogTitle>
              <form action={submitContact} className="mt-3 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <Label htmlFor="ct-name">Nome*</Label>
                    <Input id="ct-name" name="name" defaultValue={contact.name} required />
                  </div>
                  <div>
                    <Label htmlFor="ct-company">Empresa</Label>
                    <Input id="ct-company" name="company" defaultValue={contact.company} />
                  </div>
                  <div>
                    <Label htmlFor="ct-job">Cargo</Label>
                    <Input id="ct-job" name="jobTitle" defaultValue={contact.role ?? ""} />
                  </div>
                  <div>
                    <Label htmlFor="ct-email">E-mail</Label>
                    <Input id="ct-email" name="email" type="email" defaultValue={contact.email} />
                  </div>
                  <div>
                    <Label htmlFor="ct-phone">Telefone (WhatsApp)</Label>
                    <Input id="ct-phone" name="phone" defaultValue={contact.phone ?? ""} placeholder="+55 65 99999-0000" />
                  </div>
                  <div>
                    <Label htmlFor="ct-city">Cidade</Label>
                    <Input id="ct-city" name="city" defaultValue={""} />
                  </div>
                  <div className="col-span-2">
                    <Label htmlFor="ct-notes">Observações</Label>
                    <Textarea id="ct-notes" name="notes" rows={2} defaultValue={""} />
                  </div>
                </div>
                <Button type="submit" loading={pendingEdit} className="w-full">Salvar contato</Button>
              </form>
            </DialogContent>
          </Dialog>
        )}

        <ConfirmDialog
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          title="Excluir deal?"
          itemName={deal.title}
          scopeName={orgName}
          description="Atividades, propostas e contratos vinculados também serão removidos. Esta ação não pode ser desfeita."
          confirmLabel="Excluir deal"
          destructive
          loading={pendingEdit}
          onConfirm={() => startEdit(async () => {
            try { await deleteDeal(deal.id); toast.success("Deal excluído"); onClose(); }
            catch (e) { toast.error(e instanceof Error ? e.message : "Falha ao excluir"); }
            finally { setConfirmDelete(false); }
          })}
        />

        {contact && (
          <ConfirmDialog
            open={confirmDeleteContact}
            onOpenChange={setConfirmDeleteContact}
            title="Excluir contato?"
            itemName={`${contact.name}${contact.company ? " — " + contact.company : ""}`}
            scopeName={orgName}
            description="Os deals permanecem, mas ficam sem contato vinculado."
            confirmLabel="Excluir contato"
            destructive
            loading={pendingEdit}
            onConfirm={() => startEdit(async () => {
              try { await deleteContact(contact.id); toast.success("Contato excluído"); }
              catch (e) { toast.error(e instanceof Error ? e.message : "Falha ao excluir contato"); }
              finally { setConfirmDeleteContact(false); }
            })}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

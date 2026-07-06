"use client";

import { useEffect, useState, useTransition } from "react";
import { CheckCircle2, Copy, FileSignature, FileText, FlaskConical, MessageCircle, Pencil, Play, Trash2, UserRound } from "lucide-react";
import { toast } from "sonner";
import { deleteContact, deleteDeal, moveDeal, updateContact, updateDealFull } from "@/app/actions";
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

function SourceTag({ source }: { source?: string }) {
  if (!source || source === "n/a") return null;
  const live = source === "llm";
  return (
    <Badge variant={live ? "brand" : "muted"} className="ml-2 text-[10px]">
      {live ? "IA · GLM" : "heurística"}
    </Badge>
  );
}

function ProposalShare({ token, phone, name }: { token: string; phone?: string | null; name?: string | null }) {
  const [origin, setOrigin] = useState(process.env.NEXT_PUBLIC_APP_URL || "");
  useEffect(() => { if (!process.env.NEXT_PUBLIC_APP_URL) setOrigin(window.location.origin); }, []);
  if (!origin) return null;
  const link = `${origin.replace(/\/$/, "")}/proposta/${token}`;
  const wa = phone
    ? waMeLink(phone, buildWaTemplate("envio_proposta", { nome: (name ?? "").split(" ")[0], link }))
    : null;
  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2">
      <a href={link} target="_blank" rel="noreferrer" className="inline-flex h-7 items-center gap-1 rounded-lg border border-slate-200 px-2.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
        <FileText className="h-3 w-3" aria-hidden /> Abrir / PDF
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
        {r.shareToken && <ProposalShare token={r.shareToken} phone={contactPhone} name={contactName} />}
        {r.dryRun && !r.shareToken && <p className="text-xs text-amber-600">Prévia — execute (sem dry-run) para gerar o link compartilhável da proposta.</p>}
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
        <p className="text-xs text-slate-400">Gerir em <a href="/app/contracts" className="text-brand-600 underline">Contratos</a> · {r.signatureProvider}</p>
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

export function DealDrawer({ deal, contact, agents, stages, products = [], myRole = "member", orgName = "", onClose }: {
  deal: Deal; contact: Contact | null; agents: Agent[]; stages: Stage[];
  products?: ProductListItem[]; myRole?: string; orgName?: string; onClose: () => void;
}) {
  const [loading, setLoading] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, any>>({});
  const [hydrating, setHydrating] = useState(true);
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
        await updateDealFull(deal.id, {
          title: String(fd.get("title") ?? deal.title),
          amount: Number(fd.get("amount") ?? deal.amount) || 0,
          engagement: Math.max(0, Math.min(100, Number(fd.get("engagement") ?? deal.engagement) || 0)),
          origin: String(fd.get("origin") ?? ""),
          nextActionAt: String(fd.get("nextActionAt") ?? "") || null,
          temperature: String(fd.get("temperature") ?? "") || null,
          productId: String(fd.get("productId") ?? "") || null,
          tags: String(fd.get("tags") ?? "").split(",").map((t) => t.trim()).filter(Boolean),
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
    return () => { alive = false; };
  }, [deal.id]);

  async function run(kind: string, dryRun = false) {
    setLoading(kind);
    try {
      const r = await runAgent(deal.id, kind, dryRun);
      setResults((prev) => ({ ...prev, [kind]: r }));
      if (dryRun) toast.info("Prévia gerada — nada foi salvo neste deal");
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

        <div className="space-y-4 px-6 py-5">
          {runnable.map((agent) => (
            <section key={String(agent.id)} className="rounded-xl border border-slate-200 p-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-slate-800">{agent.name}</h3>
                  <span className="text-[11px] text-slate-500">{agent.role}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="outline"
                    size="xs"
                    onClick={() => run(String(agent.id), true)}
                    disabled={!agent.enabled || loading === agent.id}
                    title="Gerar prévia sem salvar"
                  >
                    <FlaskConical className="h-3 w-3" aria-hidden /> Testar
                  </Button>
                  <Button
                    size="xs"
                    onClick={() => run(String(agent.id))}
                    disabled={!agent.enabled}
                    loading={loading === agent.id}
                  >
                    {loading === agent.id ? "Executando" : agent.enabled ? (<><Play className="h-3 w-3" aria-hidden /> Executar</>) : "inativo"}
                  </Button>
                </div>
              </div>
              {loading === agent.id ? (
                <RunningSkeleton />
              ) : hydrating ? (
                <Skeleton className="mt-3 h-4 w-2/3" />
              ) : (
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

          <EnrichmentPanel dealId={deal.id} />

          {contact && (
            <section className="rounded-xl border border-slate-200 p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <UserRound className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-slate-800">{contact.name}</div>
                    <div className="truncate text-xs text-slate-400">
                      {[contact.company, contact.email, contact.phone].filter(Boolean).join(" · ") || "sem dados de contato"}
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <Button variant="outline" size="xs" onClick={() => setContactOpen(true)}>
                    <Pencil className="h-3 w-3" aria-hidden /> Editar
                  </Button>
                  {isAdmin && (
                    <Button variant="destructive-ghost" size="xs" onClick={() => setConfirmDeleteContact(true)}>
                      <Trash2 className="h-3 w-3" aria-hidden />
                    </Button>
                  )}
                </div>
              </div>
            </section>
          )}

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
                  <Label htmlFor="ed-product">Produto</Label>
                  <Select id="ed-product" name="productId" defaultValue={deal.productId ?? ""}>
                    <option value="">—</option>
                    {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </Select>
                </div>
                <div className="col-span-2">
                  <Label htmlFor="ed-tags">Tags (separadas por vírgula)</Label>
                  <Input id="ed-tags" name="tags" defaultValue={deal.tags.join(", ")} />
                </div>
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

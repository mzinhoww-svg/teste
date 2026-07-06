"use client";

import { useEffect, useState, useTransition } from "react";
import { Check, Copy, FileSignature, MessageCircle, RefreshCw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { refreshContractStatus, sendContractForSignature, updateContractClauses, updateContractStatus } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { waMeLink } from "@/lib/whatsapp";
import { buildWaTemplate } from "@/lib/whatsapp";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { brl } from "@/lib/format";
import type { ContractView } from "@/lib/db";

const STATUSES = ["rascunho", "enviado", "assinado", "cancelado"];
const statusColor: Record<string, string> = {
  rascunho: "bg-slate-100 text-slate-600",
  enviado: "bg-amber-100 text-amber-700",
  assinado: "bg-emerald-100 text-emerald-700",
  cancelado: "bg-rose-100 text-rose-700",
};

const TERMINAL = new Set(["assinado", "cancelado"]);

export function ContractCard({ c, orgName }: { c: ContractView; orgName: string }) {
  const [open, setOpen] = useState(false);
  const [clauses, setClauses] = useState(c.clauses);
  const [status, setStatus] = useState(c.status);
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<string | null>(null);
  const [clauseToRemove, setClauseToRemove] = useState<number | null>(null);
  const sending = pending; const refreshing = pending;

  // Link SEMPRE aponta para a página interna estável /sign/contracts/[token],
  // nunca para a URL do provider (que no modo mock era example.test).
  // Origin resolvido pós-mount para não gerar mismatch de hidratação.
  const [origin, setOrigin] = useState(process.env.NEXT_PUBLIC_APP_URL || "");
  useEffect(() => { if (!process.env.NEXT_PUBLIC_APP_URL) setOrigin(window.location.origin); }, []);
  const internalLink = c.signToken && origin ? `${origin.replace(/\/$/, "")}/sign/contracts/${c.signToken}` : null;
  const isSigned = status === "assinado" || ["assinado", "completed", "signed"].includes(c.externalStatus ?? "");
  const waLink = (c.contactPhone && internalLink && !isSigned)
    ? waMeLink(c.contactPhone, buildWaTemplate("link_opensign", { nome: (c.contactName ?? "").split(" ")[0], empresa: c.company, link: internalLink }))
    : null;

  function applyStatus(s: string) {
    const prev = status;
    setStatus(s);
    start(async () => {
      try {
        await updateContractStatus(c.id, s);
        toast.success(`Contrato ${c.reference}: status "${s}"`);
      } catch (e) {
        setStatus(prev);
        toast.error(e instanceof Error ? e.message : "Falha ao alterar status");
      }
    });
  }
  function changeStatus(s: string) {
    // Estados terminais têm efeito jurídico — exigem confirmação com escopo.
    if (TERMINAL.has(s)) { setPendingStatus(s); return; }
    applyStatus(s);
  }
  function saveClauses() {
    start(async () => {
      try {
        await updateContractClauses(c.id, clauses);
        setSaved(true); setTimeout(() => setSaved(false), 2000);
        toast.success("Cláusulas salvas");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Falha ao salvar cláusulas");
      }
    });
  }
  function editClause(i: number, field: "heading" | "body", v: string) {
    setClauses((prev) => prev.map((cl, idx) => (idx === i ? { ...cl, [field]: v } : cl)));
  }
  function addClause() { setClauses((prev) => [...prev, { heading: `${prev.length + 1}. Nova cláusula`, body: "" }]); }
  function removeClause(i: number) { setClauseToRemove(i); }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">{c.title}</h3>
          <p className="text-xs text-slate-400">{c.dealTitle} · {c.company} · criado {c.createdAt}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full bg-slate-100 px-2.5 py-1 font-mono text-slate-600">{c.reference}</span>
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 font-medium text-emerald-700">{brl(c.value)}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select value={status} onChange={(e) => changeStatus(e.target.value)}
            className={`rounded-full px-3 py-1 text-xs font-medium outline-none ${statusColor[status] ?? "bg-slate-100"}`}>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <button onClick={() => setOpen((o) => !o)} className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-500 hover:bg-slate-50">
            {open ? "Fechar" : "Editar cláusulas"}
          </button>
        </div>
      </div>

      {/* Assinatura digital — link interno estável + envio manual por WhatsApp */}
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
        {isSigned ? (
          <>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-medium text-emerald-700">
              <ShieldCheck className="h-3 w-3" aria-hidden /> Assinado{c.signedAt ? ` · ${c.signedAt.slice(0, 10)}` : ""}
            </span>
            {c.certificateUrl && (
              <a href={c.certificateUrl} target="_blank" rel="noreferrer"
                className="inline-flex h-7 items-center gap-1 rounded-lg border border-slate-200 px-2.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
                <ShieldCheck className="h-3 w-3" aria-hidden /> Ver documento assinado
              </a>
            )}
          </>
        ) : (
          <>
            {c.envelopeId ? (
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-medium text-slate-600">{c.provider ?? "opensign"} · {c.externalStatus ?? "enviado"}</span>
            ) : (
              <Button size="xs" loading={sending} onClick={() => start(async () => {
                try { await sendContractForSignature(c.id); toast.success("Contrato preparado para assinatura"); }
                catch (e) { toast.error(e instanceof Error ? e.message : "Falha ao preparar"); }
              })}>
                <FileSignature className="h-3 w-3" aria-hidden /> Preparar assinatura
              </Button>
            )}

            {internalLink && (
              <>
                <Button variant="outline" size="xs" onClick={() => { navigator.clipboard.writeText(internalLink); toast.success("Link de assinatura copiado"); }}>
                  <Copy className="h-3 w-3" aria-hidden /> Copiar link
                </Button>
                {waLink ? (
                  <a href={waLink} target="_blank" rel="noreferrer"
                    className="inline-flex h-7 items-center gap-1 rounded-lg bg-emerald-600 px-2.5 text-xs font-medium text-white hover:bg-emerald-700">
                    <MessageCircle className="h-3 w-3" aria-hidden /> WhatsApp
                  </a>
                ) : !c.contactPhone && (
                  <span className="text-[10px] text-slate-400">sem telefone do contato</span>
                )}
              </>
            )}

            {c.envelopeId && (
              <Button variant="outline" size="xs" loading={refreshing} onClick={() => start(async () => {
                try { const r = await refreshContractStatus(c.id); toast.success(`Status: ${r.status}`); }
                catch (e) { toast.error(e instanceof Error ? e.message : "Falha ao atualizar"); }
              })}>
                <RefreshCw className="h-3 w-3" aria-hidden /> Atualizar status
              </Button>
            )}
          </>
        )}
      </div>

      {c.signers.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500">
          {c.signers.map((s, i) => (
            <li key={i} className="inline-flex items-center gap-1">
              <span className={`h-1.5 w-1.5 rounded-full ${s.status === "signed" ? "bg-emerald-500" : "bg-slate-300"}`} />
              {s.name} <span className="text-slate-400">· {s.status === "signed" ? "assinou" : "pendente"}</span>
            </li>
          ))}
        </ul>
      )}

      {open && (
        <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
          {clauses.map((cl, i) => (
            <div key={i} className="rounded-lg bg-slate-50 p-3">
              <div className="flex items-center gap-2">
                <input value={cl.heading} onChange={(e) => editClause(i, "heading", e.target.value)}
                  className="flex-1 rounded border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700 outline-none focus:border-brand-400" />
                <button onClick={() => removeClause(i)} className="text-xs text-rose-400 hover:text-rose-600">remover</button>
              </div>
              <textarea value={cl.body} onChange={(e) => editClause(i, "body", e.target.value)} rows={2}
                className="mt-1 w-full rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600 outline-none focus:border-brand-400" />
            </div>
          ))}
          <div className="flex items-center gap-3">
            <button onClick={addClause} className="rounded-md border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50">+ cláusula</button>
            <button onClick={saveClauses} disabled={pending} className="rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50">
              {pending ? "Salvando…" : "Salvar cláusulas"}
            </button>
            {saved && <span className="inline-flex items-center gap-1 text-xs text-emerald-600"><Check className="h-3 w-3" aria-hidden /> salvo</span>}
          </div>

          {c.signatories.length > 0 && (
            <div className="pt-2">
              <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Signatários · {c.provider}</div>
              <ul className="mt-1 space-y-1">
                {c.signatories.map((s, i) => (
                  <li key={i} className="text-xs text-slate-600">{s.name} — {s.role} <span className="text-slate-400">({s.party})</span> · {s.email}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={pendingStatus !== null}
        onOpenChange={(o) => !o && setPendingStatus(null)}
        title={pendingStatus === "assinado" ? "Marcar contrato como assinado?" : "Cancelar contrato?"}
        itemName={`${c.reference} — ${c.title}`}
        scopeName={orgName}
        description={pendingStatus === "assinado"
          ? "O contrato passa a valer como assinado para esta organização."
          : "O contrato será marcado como cancelado. Esta ação tem efeito jurídico."}
        confirmLabel={pendingStatus === "assinado" ? "Confirmar assinatura" : "Cancelar contrato"}
        destructive={pendingStatus === "cancelado"}
        loading={pending}
        onConfirm={() => { if (pendingStatus) { applyStatus(pendingStatus); setPendingStatus(null); } }}
      />

      <ConfirmDialog
        open={clauseToRemove !== null}
        onOpenChange={(o) => !o && setClauseToRemove(null)}
        title="Remover cláusula?"
        itemName={clauseToRemove !== null ? (clauses[clauseToRemove]?.heading ?? "Cláusula") : ""}
        scopeName={orgName}
        description="A remoção só é aplicada quando você salvar as cláusulas."
        confirmLabel="Remover"
        destructive
        onConfirm={() => {
          if (clauseToRemove !== null) {
            setClauses((prev) => prev.filter((_, idx) => idx !== clauseToRemove));
            setClauseToRemove(null);
          }
        }}
      />
    </div>
  );
}

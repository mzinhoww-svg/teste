"use client";

import { useState, useTransition } from "react";
import { updateContractClauses, updateContractStatus } from "@/app/actions";
import { brl } from "@/lib/format";
import type { ContractView } from "@/lib/db";

const STATUSES = ["rascunho", "enviado", "assinado", "cancelado"];
const statusColor: Record<string, string> = {
  rascunho: "bg-slate-100 text-slate-600",
  enviado: "bg-amber-100 text-amber-700",
  assinado: "bg-emerald-100 text-emerald-700",
  cancelado: "bg-rose-100 text-rose-700",
};

export function ContractCard({ c }: { c: ContractView }) {
  const [open, setOpen] = useState(false);
  const [clauses, setClauses] = useState(c.clauses);
  const [status, setStatus] = useState(c.status);
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);

  function changeStatus(s: string) {
    setStatus(s);
    start(() => updateContractStatus(c.id, s));
  }
  function saveClauses() {
    start(async () => { await updateContractClauses(c.id, clauses); setSaved(true); setTimeout(() => setSaved(false), 2000); });
  }
  function editClause(i: number, field: "heading" | "body", v: string) {
    setClauses((prev) => prev.map((cl, idx) => (idx === i ? { ...cl, [field]: v } : cl)));
  }
  function addClause() { setClauses((prev) => [...prev, { heading: `${prev.length + 1}. Nova cláusula`, body: "" }]); }
  function removeClause(i: number) { setClauses((prev) => prev.filter((_, idx) => idx !== i)); }

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
            {saved && <span className="text-xs text-emerald-600">✓ salvo</span>}
          </div>

          {c.signatories.length > 0 && (
            <div className="pt-2">
              <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Signatários · {c.provider}</div>
              <ul className="mt-1 space-y-1">
                {c.signatories.map((s, i) => (
                  <li key={i} className="text-xs text-slate-600">{s.name} — {s.role} <span className="text-slate-400">({s.party})</span> · {s.email}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

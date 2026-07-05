"use client";

import { useState, useTransition } from "react";
import { updateAgent } from "@/app/actions";
import type { Agent } from "@/lib/types";

export function AgentEditor({ agent }: { agent: Agent }) {
  const [instructions, setInstructions] = useState(agent.instructions);
  const [model, setModel] = useState(agent.model);
  const [enabled, setEnabled] = useState(agent.enabled);
  const [triggers, setTriggers] = useState(agent.triggers.join(", "));
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);

  const dirty =
    instructions !== agent.instructions ||
    model !== agent.model ||
    enabled !== agent.enabled ||
    triggers !== agent.triggers.join(", ");

  function save() {
    if (!agent.uuid) return;
    start(async () => {
      await updateAgent(agent.uuid!, {
        instructions, model, enabled,
        triggers: triggers.split(",").map((t) => t.trim()).filter(Boolean),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    });
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-base font-semibold text-slate-900">{agent.name}</h3>
          <span className="mt-1 inline-block rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">{agent.role}</span>
          {agent.runnable && <span className="ml-1 rounded-full bg-brand-100 px-2 py-0.5 text-[10px] font-medium text-brand-700">executável</span>}
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-500">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="h-4 w-4 accent-brand-600" />
          {enabled ? "ativo" : "inativo"}
        </label>
      </div>

      <p className="mt-3 text-sm text-slate-600">{agent.description}</p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg bg-rose-50/60 p-3">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-rose-600">Dores</div>
          <ul className="mt-1.5 space-y-1">{agent.pains.map((p, i) => <li key={i} className="flex gap-1.5 text-xs text-slate-600"><span className="text-rose-400">•</span>{p}</li>)}</ul>
        </div>
        <div className="rounded-lg bg-emerald-50/60 p-3">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">Atividades automatizadas</div>
          <ul className="mt-1.5 space-y-1">{agent.automatedActivities.map((a, i) => <li key={i} className="flex gap-1.5 text-xs text-slate-600"><span className="text-emerald-500">✓</span>{a}</li>)}</ul>
        </div>
      </div>

      <div className="mt-4">
        <label className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Instruções (prompt)</label>
        <textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} rows={4}
          className="mt-1 w-full rounded-lg border border-slate-300 p-3 text-sm text-slate-700 outline-none focus:border-brand-400" />
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Modelo
          <input value={model} onChange={(e) => setModel(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs text-slate-700 outline-none focus:border-brand-400" />
        </label>
        <label className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Estágios (triggers, separados por vírgula)
          <input value={triggers} onChange={(e) => setTriggers(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-700 outline-none focus:border-brand-400" />
        </label>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <button onClick={save} disabled={!dirty || pending}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-40">
          {pending ? "Salvando…" : "Salvar"}
        </button>
        {saved && <span className="text-sm text-emerald-600">✓ salvo (versão anterior guardada)</span>}
      </div>
    </div>
  );
}

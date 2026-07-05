"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { updateAgent } from "@/app/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import type { Agent } from "@/lib/types";

export function AgentEditor({ agent, orgName }: { agent: Agent; orgName: string }) {
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
      try {
        await updateAgent(agent.uuid!, {
          instructions, model, enabled,
          triggers: triggers.split(",").map((t) => t.trim()).filter(Boolean),
        });
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
        toast.success(`${agent.name} atualizado para toda a organização ${orgName ? `"${orgName}"` : ""}`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Falha ao salvar agente");
      }
    });
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-base font-semibold text-slate-900">{agent.name}</h3>
          <Badge className="mt-1">{agent.role}</Badge>
          {agent.runnable && <Badge variant="brand" className="ml-1 text-[10px]">executável</Badge>}
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
        <Textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} rows={4} className="mt-1" />
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Modelo
          <Input value={model} onChange={(e) => setModel(e.target.value)} className="mt-1 font-mono text-xs" />
        </label>
        <label className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Estágios (triggers, separados por vírgula)
          <Input value={triggers} onChange={(e) => setTriggers(e.target.value)} className="mt-1 text-xs" />
        </label>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <Button onClick={save} disabled={!dirty} loading={pending}>
          {pending ? "Salvando" : "Salvar"}
        </Button>
        {saved && <span className="text-sm text-emerald-600">✓ salvo (versão anterior guardada)</span>}
      </div>
    </div>
  );
}

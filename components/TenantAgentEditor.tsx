"use client";

import { useState, useTransition } from "react";
import { Check, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { saveTenantAgentOverride, resetTenantAgentOverride } from "@/app/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

interface Agent {
  key: string; kind: string; name: string; category: string;
  prompt: string; model: string; triggers: string[]; active: boolean;
  source: "catalog" | "platform" | "override"; templateVersion: number | null;
}

// Editor por TENANT (só quando ALLOW_TENANT_AGENT_OVERRIDES=true). Ao salvar, o
// tenant deixa de herdar o padrão da plataforma para este agente.
export function TenantAgentEditor({ agent, orgName }: { agent: Agent; orgName: string }) {
  const [prompt, setPrompt] = useState(agent.prompt);
  const [model, setModel] = useState(agent.model);
  const [triggers, setTriggers] = useState(agent.triggers.join(", "));
  const [active, setActive] = useState(agent.active);
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);
  const [confirmSave, setConfirmSave] = useState(false);

  const isOverride = agent.source === "override";
  const dirty = prompt !== agent.prompt || model !== agent.model || active !== agent.active || triggers !== agent.triggers.join(", ");

  function doSave() {
    start(async () => {
      try {
        await saveTenantAgentOverride(agent.key, {
          prompt, model, active,
          triggers: triggers.split(",").map((t) => t.trim()).filter(Boolean),
        });
        setSaved(true); setTimeout(() => setSaved(false), 2000);
        setConfirmSave(false);
        toast.success(`${agent.name} personalizado para ${orgName}`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Falha ao salvar");
      }
    });
  }

  function doReset() {
    start(async () => {
      try {
        await resetTenantAgentOverride(agent.key);
        toast.success("Voltou a herdar o padrão da plataforma");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Falha ao reverter");
      }
    });
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-base font-semibold text-slate-900">{agent.name}</h3>
          <div className="mt-1 flex items-center gap-1.5">
            <Badge>{agent.category}</Badge>
            {isOverride ? <Badge variant="warning" className="text-[10px]">personalizado neste tenant</Badge>
              : <Badge variant="brand" className="text-[10px]">herdando o padrão</Badge>}
          </div>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-500">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="h-4 w-4 accent-brand-600" />
          {active ? "ativo" : "inativo"}
        </label>
      </div>

      <div className="mt-4">
        <label className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Instruções específicas (contexto e enriquecimento são adicionados automaticamente)</label>
        <Textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={7} className="mt-1 text-xs" />
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Modelo
          <Input value={model} onChange={(e) => setModel(e.target.value)} className="mt-1 font-mono text-xs" />
        </label>
        <label className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Gatilhos (vírgula)
          <Input value={triggers} onChange={(e) => setTriggers(e.target.value)} className="mt-1 text-xs" />
        </label>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <Button onClick={() => setConfirmSave(true)} disabled={!dirty} loading={pending}>Salvar para este tenant</Button>
        {isOverride && (
          <Button variant="outline" size="sm" onClick={doReset} disabled={pending}>
            <RotateCcw className="h-3 w-3" aria-hidden /> Voltar ao padrão
          </Button>
        )}
        {saved && <span className="inline-flex items-center gap-1 text-sm text-emerald-600"><Check className="h-3.5 w-3.5" aria-hidden /> salvo</span>}
      </div>

      <ConfirmDialog
        open={confirmSave}
        onOpenChange={setConfirmSave}
        title="Personalizar agente para este tenant?"
        itemName={agent.name}
        scopeName={orgName}
        description="Este tenant deixará de herdar o padrão global deste agente e passará a usar esta configuração."
        confirmLabel="Salvar para este tenant"
        loading={pending}
        onConfirm={doSave}
      />
    </div>
  );
}

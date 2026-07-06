"use client";

import { useState, useTransition } from "react";
import { Check, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { savePlatformAgent, restorePlatformAgentDefault } from "@/app/admin/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

interface Agent {
  key: string; kind: string; name: string; category: string;
  prompt: string; model: string; triggers: string[]; active: boolean;
  source: "catalog" | "platform" | "override"; templateVersion: number | null;
}

export function PlatformAgentEditor({ agent }: { agent: Agent }) {
  const [prompt, setPrompt] = useState(agent.prompt);
  const [model, setModel] = useState(agent.model);
  const [triggers, setTriggers] = useState(agent.triggers.join(", "));
  const [active, setActive] = useState(agent.active);
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);
  const [confirmSave, setConfirmSave] = useState(false);
  const [confirmRestore, setConfirmRestore] = useState(false);

  const dirty = prompt !== agent.prompt || model !== agent.model || active !== agent.active || triggers !== agent.triggers.join(", ");

  function doSave() {
    start(async () => {
      try {
        await savePlatformAgent(agent.key, {
          prompt, model, active,
          triggers: triggers.split(",").map((t) => t.trim()).filter(Boolean),
        });
        setSaved(true); setTimeout(() => setSaved(false), 2000);
        setConfirmSave(false);
        toast.success(`${agent.name} atualizado para todos os tenants`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Falha ao salvar");
      }
    });
  }

  function doRestore() {
    start(async () => {
      try {
        await restorePlatformAgentDefault(agent.key);
        setConfirmRestore(false);
        toast.success("Revertido ao padrão do catálogo");
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
            <span className="font-mono text-[10px] text-slate-400">{agent.kind}</span>
            {agent.source === "platform" && <Badge variant="brand" className="text-[10px]">editado · v{agent.templateVersion}</Badge>}
            {agent.source === "catalog" && <Badge variant="muted" className="text-[10px]">padrão do catálogo</Badge>}
          </div>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-500">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="h-4 w-4 accent-brand-600" />
          {active ? "ativo" : "inativo"}
        </label>
      </div>

      <div className="mt-4">
        <label className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Instruções específicas (o contexto Reiners e o enriquecimento são adicionados automaticamente)</label>
        <Textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={8} className="mt-1 text-xs" />
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
        <Button onClick={() => setConfirmSave(true)} disabled={!dirty} loading={pending}>Salvar para todos</Button>
        {agent.source === "platform" && (
          <Button variant="outline" size="sm" onClick={() => setConfirmRestore(true)} disabled={pending}>
            <RotateCcw className="h-3 w-3" aria-hidden /> Restaurar padrão
          </Button>
        )}
        {saved && <span className="inline-flex items-center gap-1 text-sm text-emerald-600"><Check className="h-3.5 w-3.5" aria-hidden /> salvo</span>}
      </div>

      <ConfirmDialog
        open={confirmSave}
        onOpenChange={setConfirmSave}
        title="Salvar para todos os tenants?"
        itemName={agent.name}
        description="Esta alteração afeta todos os tenants que herdam o padrão da plataforma. A versão anterior fica no histórico."
        confirmLabel="Salvar para todos"
        loading={pending}
        onConfirm={doSave}
      />
      <ConfirmDialog
        open={confirmRestore}
        onOpenChange={setConfirmRestore}
        title="Restaurar padrão do catálogo?"
        itemName={agent.name}
        description="Remove a edição da plataforma e volta ao prompt padrão embutido no produto."
        confirmLabel="Restaurar"
        destructive
        loading={pending}
        onConfirm={doRestore}
      />
    </div>
  );
}

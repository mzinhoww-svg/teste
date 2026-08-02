"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { createAutomation, deleteAutomation, toggleAutomation } from "@/app/actions";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { AutomationView } from "@/lib/db";
import type { Agent, Stage } from "@/lib/types";

export function AutomationManager({ automations, stages, agents, orgName }: {
  automations: AutomationView[]; stages: Stage[]; agents: Agent[]; orgName: string;
}) {
  const [pending, start] = useTransition();
  const [formOpen, setFormOpen] = useState(false);
  const [toDelete, setToDelete] = useState<AutomationView | null>(null);

  function submit(fd: FormData) {
    start(async () => {
      try {
        await createAutomation(fd);
        setFormOpen(false);
        toast.success("Automação criada");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Falha ao criar automação");
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          Regras do tipo <strong className="text-slate-700">“ao entrar no estágio X, executar o agente Y”</strong>.
          Disparam automaticamente quando um card muda de estágio.
        </p>
        <button onClick={() => setFormOpen((o) => !o)}
          className="shrink-0 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
          {formOpen ? "Cancelar" : "+ Nova automação"}
        </button>
      </div>

      {formOpen && (
        <form action={submit} className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-4">
          <label className="text-xs font-medium text-slate-500">Nome
            <input name="name" placeholder="ex.: Proposta automática" className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-brand-400 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-400" />
          </label>
          <label className="text-xs font-medium text-slate-500">Quando entrar em…
            <select name="stageId" required className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-brand-400 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100">
              {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <label className="text-xs font-medium text-slate-500">Executar o agente…
            <select name="agentKind" required className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-brand-400 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100">
              {agents.filter((a) => a.enabled).map((a) => <option key={a.id} value={String(a.id)}>{a.name}</option>)}
            </select>
          </label>
          <div className="flex items-end">
            <button disabled={pending} className="w-full rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">
              {pending ? "Criando…" : "Criar"}
            </button>
          </div>
        </form>
      )}

      {automations.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">
          Nenhuma automação ainda. Crie a primeira — ex.: ao entrar em <em>Proposta</em>, executar o <em>Agente de Proposta Comercial</em>.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-[11px] uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2.5">Nome</th>
                <th className="px-4 py-2.5">Gatilho</th>
                <th className="px-4 py-2.5">Agente</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {automations.map((a) => (
                <tr key={a.id} className="border-b border-slate-50">
                  <td className="px-4 py-2.5 font-medium text-slate-700">{a.name}</td>
                  <td className="px-4 py-2.5 text-slate-500">entrar em <span className="font-medium text-slate-700">{a.stageName}</span></td>
                  <td className="px-4 py-2.5 text-slate-500">{a.agentName}</td>
                  <td className="px-4 py-2.5">
                    <button onClick={() => start(() => toggleAutomation(a.id, !a.enabled))}
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${a.enabled ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                      {a.enabled ? "ativa" : "pausada"}
                    </button>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <button onClick={() => setToDelete(a)} className="text-xs text-rose-400 hover:text-rose-600">remover</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(o) => !o && setToDelete(null)}
        title="Remover automação?"
        itemName={toDelete ? `${toDelete.name} — entrar em ${toDelete.stageName} → ${toDelete.agentName}` : ""}
        scopeName={orgName}
        description="A regra deixa de disparar imediatamente. Esta ação não pode ser desfeita."
        confirmLabel="Remover"
        destructive
        loading={pending}
        onConfirm={() => {
          if (!toDelete) return;
          start(async () => {
            try {
              await deleteAutomation(toDelete.id);
              toast.success("Automação removida");
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Falha ao remover");
            } finally {
              setToDelete(null);
            }
          });
        }}
      />
    </div>
  );
}

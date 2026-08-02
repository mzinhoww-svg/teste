"use client";

import { useState, useTransition } from "react";
import { Sparkles, Plus } from "lucide-react";
import { toast } from "sonner";
import { applyAutomationSuggestion } from "@/app/actions";
import type { AutomationSuggestion } from "@/lib/db";

export function SuggestedAutomations({ suggestions }: { suggestions: AutomationSuggestion[] }) {
  const [rows, setRows] = useState(suggestions);
  const [pending, start] = useTransition();
  if (rows.length === 0) return null;

  function apply(s: AutomationSuggestion) {
    start(async () => {
      try {
        await applyAutomationSuggestion(s.stageId, s.agentKind, `${s.stageName} → ${s.agentName}`);
        setRows((r) => r.filter((x) => x.stageId !== s.stageId));
        toast.success("Automação ativada");
      } catch (e) { toast.error(e instanceof Error ? e.message : "Falha ao ativar"); }
    });
  }

  return (
    <div className="mb-6 rounded-xl border border-brand-200 bg-brand-50/50 p-4 dark:border-brand-900 dark:bg-brand-950/20">
      <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-brand-700 dark:text-brand-300">
        <Sparkles className="h-4 w-4" aria-hidden /> Automações sugeridas para o seu funil
      </div>
      <ul className="space-y-2">
        {rows.map((s) => (
          <li key={s.stageId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-brand-100 bg-white p-2.5 dark:border-brand-900/50 dark:bg-slate-900">
            <div className="min-w-0 text-sm">
              <span className="font-medium text-slate-800 dark:text-slate-200">Ao entrar em “{s.stageName}” → {s.agentName}</span>
              <div className="text-xs text-slate-400">{s.reason}</div>
            </div>
            <button disabled={pending} onClick={() => apply(s)}
              className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50">
              <Plus className="h-3.5 w-3.5" aria-hidden /> Ativar
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

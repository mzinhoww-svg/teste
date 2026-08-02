"use client";

import { useState, useTransition } from "react";
import { Check, ChevronRight, Rocket, X } from "lucide-react";
import { toast } from "sonner";
import { dismissOnboarding } from "@/app/actions";
import type { OnboardingState } from "@/lib/db";

// Checklist de primeiros passos. O estado de cada passo é derivado do banco
// (ver getOnboarding em lib/db) — não é só uma flag local. Só aparece para
// owner/admin e enquanto não estiver concluído ou dispensado.
export function OnboardingChecklist({ state, canDismiss }: { state: OnboardingState; canDismiss: boolean }) {
  const [hidden, setHidden] = useState(false);
  const [pending, start] = useTransition();

  if (hidden || state.dismissed || state.doneCount >= state.total) return null;

  const pct = Math.round((state.doneCount / state.total) * 100);

  function dismiss() {
    setHidden(true);
    start(async () => {
      try {
        await dismissOnboarding();
      } catch (e) {
        setHidden(false);
        toast.error(e instanceof Error ? e.message : "Falha ao dispensar");
      }
    });
  }

  return (
    <div className="mb-6 rounded-2xl border border-brand-200 bg-gradient-to-br from-brand-50 to-white p-5 dark:border-brand-900 dark:from-brand-950/40 dark:to-slate-900">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-brand-600 text-white">
            <Rocket className="h-4 w-4" aria-hidden />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Primeiros passos</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {state.doneCount} de {state.total} concluídos
            </p>
          </div>
        </div>
        {canDismiss && (
          <button
            type="button"
            onClick={dismiss}
            disabled={pending}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
            aria-label="Dispensar checklist de primeiros passos"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        )}
      </div>

      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
        <div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${pct}%` }} />
      </div>

      <ul className="mt-4 grid gap-2 sm:grid-cols-2">
        {state.steps.map((s) => (
          <li key={s.key}>
            <a
              href={s.href}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
                s.done
                  ? "border-emerald-200 bg-emerald-50/60 text-slate-500 dark:border-emerald-900 dark:bg-emerald-950/30"
                  : "border-slate-200 bg-white text-slate-700 hover:border-brand-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              }`}
            >
              <span
                className={`grid h-5 w-5 shrink-0 place-items-center rounded-full ${
                  s.done ? "bg-emerald-500 text-white" : "border border-slate-300 text-transparent dark:border-slate-600"
                }`}
              >
                <Check className="h-3 w-3" aria-hidden />
              </span>
              <span className={s.done ? "line-through" : ""}>{s.label}</span>
              {!s.done && <ChevronRight className="ml-auto h-4 w-4 shrink-0 text-slate-300" aria-hidden />}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

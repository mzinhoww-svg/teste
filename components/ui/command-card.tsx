"use client";

import type { LucideIcon } from "lucide-react";

// Card acionável tipo "comando": título, atalho e ação em um clique. Para
// listas de agentes, ações rápidas e sugestões.
export function CommandCard({ icon: Icon, title, subtitle, onClick, disabled, right }: {
  icon?: LucideIcon; title: string; subtitle?: string; onClick?: () => void; disabled?: boolean; right?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left transition-colors hover:border-brand-300 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900"
    >
      {Icon && <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-950/40 dark:text-brand-300"><Icon className="h-4 w-4" aria-hidden /></span>}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-slate-800 dark:text-slate-200">{title}</span>
        {subtitle && <span className="block truncate text-xs text-slate-400">{subtitle}</span>}
      </span>
      {right}
    </button>
  );
}

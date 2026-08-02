import type { LucideIcon } from "lucide-react";

// Estado vazio reutilizável: ícone + título + descrição + CTA opcional.
export function EmptyState({ icon: Icon, title, description, action }: {
  icon: LucideIcon; title: string; description?: string; action?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center dark:border-slate-700 dark:bg-slate-900">
      <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-slate-100 text-slate-400 dark:bg-slate-800">
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <h3 className="mt-3 text-sm font-semibold text-slate-800 dark:text-slate-200">{title}</h3>
      {description && <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

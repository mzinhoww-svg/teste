import type { LucideIcon } from "lucide-react";

// Painel de ação: ícone + título + descrição + ações. Para blocos de CTA
// dentro de telas (ex.: "envie para assinatura", "gere a proposta").
export function ActionPanel({ icon: Icon, title, description, children, tone = "brand" }: {
  icon?: LucideIcon; title: string; description?: string; children?: React.ReactNode;
  tone?: "brand" | "amber" | "emerald";
}) {
  const toneCls = {
    brand: "border-brand-200 bg-brand-50/60 dark:border-brand-900 dark:bg-brand-950/30",
    amber: "border-amber-200 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/30",
    emerald: "border-emerald-200 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/30",
  }[tone];
  return (
    <div className={`rounded-xl border p-4 ${toneCls}`}>
      <div className="flex items-start gap-3">
        {Icon && <Icon className="mt-0.5 h-5 w-5 shrink-0 text-brand-600 dark:text-brand-300" aria-hidden />}
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">{title}</h3>
          {description && <p className="mt-0.5 text-xs text-slate-500">{description}</p>}
          {children && <div className="mt-2 flex flex-wrap gap-2">{children}</div>}
        </div>
      </div>
    </div>
  );
}

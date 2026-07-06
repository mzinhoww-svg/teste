import { cn } from "@/lib/utils";

// Tabela responsiva com rolagem horizontal contida.
export function Table({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
      <table className={cn("w-full min-w-[560px] text-sm", className)}>{children}</table>
    </div>
  );
}
export function THead({ children }: { children: React.ReactNode }) {
  return <thead className="border-b border-slate-100 text-left text-[11px] uppercase tracking-wide text-slate-500 dark:border-slate-800">{children}</thead>;
}
export function TR({ className, children }: { className?: string; children: React.ReactNode }) {
  return <tr className={cn("border-b border-slate-50 last:border-0 dark:border-slate-800/60", className)}>{children}</tr>;
}
export function TH({ className, children }: { className?: string; children: React.ReactNode }) {
  return <th className={cn("px-4 py-2.5 font-medium", className)}>{children}</th>;
}
export function TD({ className, children }: { className?: string; children: React.ReactNode }) {
  return <td className={cn("px-4 py-2.5 text-slate-600 dark:text-slate-300", className)}>{children}</td>;
}

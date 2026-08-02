"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

// Tabs acessível e leve (sem dependência externa). Setas navegam, roving tabindex.
interface TabsCtx { value: string; setValue: (v: string) => void }
const Ctx = React.createContext<TabsCtx | null>(null);

export function Tabs({ defaultValue, value, onValueChange, className, children }: {
  defaultValue?: string; value?: string; onValueChange?: (v: string) => void;
  className?: string; children: React.ReactNode;
}) {
  const [internal, setInternal] = React.useState(defaultValue ?? "");
  const v = value ?? internal;
  const setValue = (next: string) => { setInternal(next); onValueChange?.(next); };
  return <Ctx.Provider value={{ value: v, setValue }}><div className={className}>{children}</div></Ctx.Provider>;
}

export function TabsList({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div role="tablist" className={cn("flex gap-1 overflow-x-auto border-b border-slate-200 dark:border-slate-800", className)}>
      {children}
    </div>
  );
}

export function TabsTrigger({ value, children }: { value: string; children: React.ReactNode }) {
  const ctx = React.useContext(Ctx)!;
  const active = ctx.value === value;
  return (
    <button
      role="tab"
      aria-selected={active}
      tabIndex={active ? 0 : -1}
      onClick={() => ctx.setValue(value)}
      className={cn(
        "-mb-px shrink-0 border-b-2 px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400",
        active
          ? "border-brand-600 text-brand-700 dark:text-brand-300"
          : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200",
      )}
    >
      {children}
    </button>
  );
}

export function TabsContent({ value, className, children }: { value: string; className?: string; children: React.ReactNode }) {
  const ctx = React.useContext(Ctx)!;
  if (ctx.value !== value) return null;
  // Reveal ao trocar de aba (transitions-dev 18) — respeita reduced-motion.
  return <div role="tabpanel" className={cn("animate-reveal motion-reduce:animate-none", className)}>{children}</div>;
}

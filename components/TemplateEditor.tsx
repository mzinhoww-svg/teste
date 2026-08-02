"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

// Editor de um template (WhatsApp) ou da assinatura de e-mail. `action` é uma
// server action já vinculada à chave; recebe só o texto e persiste.
export function TemplateEditor({ label, hint, placeholder, initialValue, action }: {
  label: string; hint?: string; placeholder?: string; initialValue: string;
  action: (value: string) => Promise<void>;
}) {
  const [val, setVal] = useState(initialValue);
  const [pending, start] = useTransition();
  const dirty = val !== initialValue;
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-slate-800 dark:text-slate-200">{label}</span>
        <Button
          size="xs"
          disabled={pending || !dirty}
          onClick={() => start(async () => {
            try { await action(val); toast.success("Template salvo"); }
            catch (e) { toast.error(e instanceof Error ? e.message : "Falha ao salvar"); }
          })}
        >{pending ? "Salvando…" : "Salvar"}</Button>
      </div>
      {hint && <p className="mb-2 text-[11px] text-slate-400">{hint}</p>}
      <textarea
        value={val}
        onChange={(e) => setVal(e.target.value)}
        placeholder={placeholder}
        rows={3}
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-brand-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
      />
    </div>
  );
}

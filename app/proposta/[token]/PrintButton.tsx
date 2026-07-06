"use client";

import { Printer } from "lucide-react";

// Impressão/salvar-como-PDF pelo próprio navegador (sem dependência paga).
export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
    >
      <Printer className="h-3.5 w-3.5" aria-hidden /> Baixar PDF
    </button>
  );
}

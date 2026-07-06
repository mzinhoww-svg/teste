"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface Agent {
  key: string; kind: string; name: string; category: string;
  prompt: string; model: string; triggers: string[]; active: boolean;
  source: "catalog" | "platform" | "override"; templateVersion: number | null;
}

// Visão do Studio do tenant: os agentes seguem o PADRÃO DA PLATAFORMA. Aqui é
// leitura — a edição do padrão acontece em /admin/agents (admin da plataforma).
export function StudioAgentCard({ agent }: { agent: Agent }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-slate-900">{agent.name}</h3>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <Badge>{agent.category}</Badge>
            <Badge variant="brand" className="text-[10px]">Padrão da plataforma</Badge>
            {agent.source === "override" && <Badge variant="warning" className="text-[10px]">override do tenant</Badge>}
            {agent.templateVersion && <span className="text-[10px] text-slate-400">v{agent.templateVersion}</span>}
            {!agent.active && <Badge variant="muted" className="text-[10px]">inativo</Badge>}
          </div>
        </div>
        <span className="font-mono text-[10px] text-slate-400">{agent.kind}</span>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {agent.triggers.map((t) => (
          <span key={t} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">{t}</span>
        ))}
        <span className="rounded-full bg-slate-100 px-2 py-0.5 font-mono text-[10px] text-slate-500">{agent.model}</span>
      </div>

      <button onClick={() => setOpen((o) => !o)} className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-700" aria-expanded={open}>
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
        {open ? "Ocultar" : "Ver"} instruções
      </button>
      {open && (
        <p className="mt-2 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-xs leading-relaxed text-slate-600">{agent.prompt}</p>
      )}
    </div>
  );
}

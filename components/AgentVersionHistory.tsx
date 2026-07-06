"use client";

import { useState, useTransition } from "react";
import { History, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { rollbackAgent } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { AgentVersion } from "@/lib/db";

// Diff de linhas simples entre a versão antiga e o prompt atual.
// Sem dependência externa: marca linhas removidas (só na antiga) e adicionadas
// (só na atual). Suficiente para revisar uma mudança de prompt.
function LineDiff({ before, after }: { before: string; after: string }) {
  const a = before.split("\n");
  const b = after.split("\n");
  const bSet = new Set(b);
  const aSet = new Set(a);
  return (
    <div className="mt-2 max-h-56 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-2 font-mono text-[11px] leading-relaxed dark:border-slate-700 dark:bg-slate-900">
      {a.map((line, i) =>
        bSet.has(line) ? null : (
          <div key={`r${i}`} className="whitespace-pre-wrap rounded bg-rose-50 px-1 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
            <span aria-hidden>− </span>{line || " "}
          </div>
        ),
      )}
      {b.map((line, i) =>
        aSet.has(line) ? (
          <div key={`c${i}`} className="whitespace-pre-wrap px-1 text-slate-500 dark:text-slate-400">
            <span aria-hidden>{"  "}</span>{line || " "}
          </div>
        ) : (
          <div key={`a${i}`} className="whitespace-pre-wrap rounded bg-emerald-50 px-1 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
            <span aria-hidden>+ </span>{line || " "}
          </div>
        ),
      )}
    </div>
  );
}

function fmt(iso: string) {
  try {
    return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}

export function AgentVersionHistory({ agentId, versions, currentInstructions }: {
  agentId: string; versions: AgentVersion[]; currentInstructions: string;
}) {
  const [open, setOpen] = useState(false);
  const [diffId, setDiffId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!versions.length) return null;

  function restore(versionId: string) {
    start(async () => {
      try {
        await rollbackAgent(agentId, versionId);
        toast.success("Agente revertido para a versão selecionada");
        setConfirmId(null);
        setOpen(false);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Falha ao reverter");
      }
    });
  }

  return (
    <div className="mt-3 border-t border-slate-100 pt-3 dark:border-slate-800">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
        aria-expanded={open}
      >
        <History className="h-3.5 w-3.5" aria-hidden />
        Histórico de versões ({versions.length})
      </button>

      {open && (
        <ul className="mt-2 space-y-2">
          {versions.map((v) => (
            <li key={v.id} className="rounded-lg border border-slate-200 p-2.5 text-xs dark:border-slate-700">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <span className="font-medium text-slate-700 dark:text-slate-200">{fmt(v.createdAt)}</span>
                  <span className="ml-2 font-mono text-[10px] text-slate-400">{v.model}</span>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setDiffId(diffId === v.id ? null : v.id)}
                    className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                  >
                    {diffId === v.id ? "ocultar diff" : "ver diff"}
                  </button>
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    onClick={() => setConfirmId(v.id)}
                    disabled={pending}
                  >
                    <RotateCcw className="h-3 w-3" aria-hidden /> Restaurar
                  </Button>
                </div>
              </div>
              {diffId === v.id && <LineDiff before={v.instructions} after={currentInstructions} />}
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={confirmId !== null}
        onOpenChange={(o) => !o && setConfirmId(null)}
        title="Restaurar versão anterior?"
        itemName={confirmId ? `Versão de ${fmt(versions.find((v) => v.id === confirmId)?.createdAt ?? "")}` : ""}
        description="O prompt atual será substituído por esta versão. A configuração atual é guardada no histórico antes — dá para reverter de novo."
        confirmLabel="Restaurar"
        loading={pending}
        onConfirm={() => confirmId && restore(confirmId)}
      />
    </div>
  );
}

"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Check, Clock } from "lucide-react";
import { toast } from "sonner";
import { completeActivity, rescheduleActivity } from "@/app/actions";
import type { TaskRow } from "@/lib/db";

export function TaskItem({ task }: { task: TaskRow }) {
  const [pending, start] = useTransition();
  const [reschedule, setReschedule] = useState(false);
  const [done, setDone] = useState(false);
  if (done) return null;

  return (
    <li className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
      <button
        aria-label="Concluir tarefa"
        disabled={pending}
        onClick={() => start(async () => {
          try { await completeActivity(task.id, true); setDone(true); toast.success("Tarefa concluída"); }
          catch (e) { toast.error(e instanceof Error ? e.message : "Falha ao concluir"); }
        })}
        className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-slate-300 text-transparent hover:border-emerald-500 hover:text-emerald-500 dark:border-slate-600"
      >
        <Check className="h-3.5 w-3.5" aria-hidden />
      </button>

      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-slate-800 dark:text-slate-200">{task.summary}</div>
        <div className="text-xs text-slate-400">
          {task.deal_id ? <Link href="/app" className="text-brand-600 hover:underline dark:text-brand-300">{task.deal_title || "deal"}</Link> : "sem deal"}
          {task.author ? ` · ${task.author}` : ""}
        </div>
      </div>

      {reschedule ? (
        <input
          type="date"
          autoFocus
          defaultValue={task.due_at?.slice(0, 10) ?? ""}
          disabled={pending}
          onChange={(e) => start(async () => {
            try { await rescheduleActivity(task.id, e.target.value); setReschedule(false); toast.success("Reagendada"); }
            catch (err) { toast.error(err instanceof Error ? err.message : "Falha ao reagendar"); }
          })}
          className="rounded-lg border border-slate-300 px-2 py-1 text-xs dark:border-slate-600 dark:bg-slate-800"
        />
      ) : (
        <button
          onClick={() => setReschedule(true)}
          className="inline-flex h-7 items-center gap-1 rounded-lg border border-slate-200 px-2.5 text-xs text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
        >
          <Clock className="h-3 w-3" aria-hidden /> Reagendar
        </button>
      )}
    </li>
  );
}

"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { submitNps } from "@/app/portal-actions";

// M5 — coleta de NPS no portal do cliente (0-10 + comentário opcional).
export function NpsWidget({ slug }: { slug: string }) {
  const [pending, start] = useTransition();
  const [score, setScore] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [sent, setSent] = useState(false);

  if (sent) {
    return (
      <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">
        Obrigado pelo seu feedback! 🎉
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Como está sua experiência conosco?</h2>
      <p className="mb-3 text-xs text-slate-500">De 0 a 10, o quanto você recomendaria nosso trabalho?</p>
      <div className="flex flex-wrap gap-1">
        {Array.from({ length: 11 }, (_, i) => (
          <button
            key={i}
            onClick={() => setScore(i)}
            aria-pressed={score === i}
            className={`h-8 w-8 rounded-lg border text-sm font-medium transition-colors ${score === i ? "border-brand-600 bg-brand-600 text-white" : "border-slate-200 text-slate-600 hover:border-brand-300 dark:border-slate-700 dark:text-slate-300"}`}
          >{i}</button>
        ))}
      </div>
      {score != null && (
        <div className="mt-3 space-y-2">
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={2}
            placeholder="Quer contar o porquê? (opcional)"
            className="w-full rounded-lg border border-slate-200 p-2 text-sm dark:border-slate-700 dark:bg-slate-800"
          />
          <button
            disabled={pending}
            onClick={() => start(async () => {
              try { await submitNps(slug, score, comment); setSent(true); }
              catch (e) { toast.error(e instanceof Error ? e.message : "Falha ao enviar"); }
            })}
            className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
          >Enviar avaliação</button>
        </div>
      )}
    </section>
  );
}

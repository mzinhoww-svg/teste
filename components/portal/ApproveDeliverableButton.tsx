"use client";

import { useState, useTransition } from "react";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { approveDeliverable } from "@/app/portal/actions";

export function ApproveDeliverableButton({ id, clientSlug }: { id: string; clientSlug: string }) {
  const [pending, start] = useTransition();
  const [done, setDone] = useState(false);
  if (done) return <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">aprovado ✓</span>;
  return (
    <button
      disabled={pending}
      onClick={() => start(async () => {
        try { await approveDeliverable(id, clientSlug); setDone(true); toast.success("Entrega aprovada"); }
        catch (e) { toast.error(e instanceof Error ? e.message : "Falha ao aprovar"); }
      })}
      className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
    >
      <Check className="h-3 w-3" aria-hidden /> {pending ? "Aprovando…" : "Aprovar"}
    </button>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Inbox, MessageCircle, Mail, Globe, Zap, Check, X } from "lucide-react";
import { toast } from "sonner";
import { convertInboxLead, discardInboxLead } from "@/app/actions";
import { Button } from "@/components/ui/button";
import type { InboxRow } from "@/lib/db";

const ICON: Record<string, any> = { whatsapp: MessageCircle, email: Mail, form: Globe, api: Zap };

export function InboxList({ items }: { items: InboxRow[] }) {
  const [rows, setRows] = useState(items);
  const [pending, start] = useTransition();
  const router = useRouter();

  function convert(id: string) {
    start(async () => {
      try { const { dealId } = await convertInboxLead(id); setRows((r) => r.filter((x) => x.id !== id)); toast.success("Lead criado"); router.push(`/app?deal=${dealId}`); }
      catch (e) { toast.error(e instanceof Error ? e.message : "Falha ao converter"); }
    });
  }
  function discard(id: string) {
    start(async () => {
      try { await discardInboxLead(id); setRows((r) => r.filter((x) => x.id !== id)); toast.success("Descartado"); }
      catch (e) { toast.error(e instanceof Error ? e.message : "Falha ao descartar"); }
    });
  }

  if (rows.length === 0) {
    return (
      <div className="grid place-items-center rounded-xl border border-dashed border-slate-300 py-16 text-center dark:border-slate-700">
        <Inbox className="h-8 w-8 text-slate-300" aria-hidden />
        <p className="mt-2 text-sm text-slate-500">Nenhum lead aguardando triagem.</p>
        <p className="text-xs text-slate-400">Formulários, WhatsApp e API entram aqui antes de virar card.</p>
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {rows.map((r) => {
        const p: any = r.payload ?? {};
        const Ico = ICON[r.channel] ?? Globe;
        const name = p.name ?? p.nome ?? r.from_identifier ?? "Lead sem nome";
        const detail = [p.company ?? p.empresa, p.message ?? p.mensagem].filter(Boolean).join(" · ");
        return (
          <li key={r.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-500 dark:bg-slate-800"><Ico className="h-4 w-4" aria-hidden /></span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-slate-800 dark:text-slate-200">{name}</div>
              <div className="truncate text-xs text-slate-400">{r.channel} · {r.from_identifier ?? "—"}{detail ? ` · ${detail}` : ""}</div>
            </div>
            <Button size="sm" disabled={pending} onClick={() => convert(r.id)}><Check className="h-3.5 w-3.5" aria-hidden /> Converter</Button>
            <Button size="sm" variant="outline" disabled={pending} onClick={() => discard(r.id)}><X className="h-3.5 w-3.5" aria-hidden /> Descartar</Button>
          </li>
        );
      })}
    </ul>
  );
}

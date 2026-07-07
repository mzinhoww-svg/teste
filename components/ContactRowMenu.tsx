"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { forgetContact, mergeContacts } from "@/app/actions";
import { Select } from "@/components/ui/input";

// M2/M8 — ações por contato: mesclar duplicado no atual e esquecer (LGPD).
export function ContactRowMenu({ contactId, candidates }: {
  contactId: string; candidates: { id: string; name: string; company: string | null }[];
}) {
  const [pending, start] = useTransition();
  const [merging, setMerging] = useState(false);
  const others = candidates.filter((c) => c.id !== contactId);

  return (
    <div className="flex items-center justify-end gap-2 text-xs">
      {merging ? (
        <Select
          autoFocus
          className="h-7 w-40 text-xs"
          defaultValue=""
          disabled={pending}
          onChange={(e) => {
            const dup = e.target.value;
            if (!dup) return;
            if (!confirm("Mesclar esse contato no atual? O duplicado será removido e o histórico transferido.")) return;
            start(async () => {
              try { await mergeContacts(contactId, dup); toast.success("Contatos mesclados"); setMerging(false); }
              catch (err) { toast.error(err instanceof Error ? err.message : "Falha ao mesclar"); }
            });
          }}
        >
          <option value="">Escolher duplicado…</option>
          {others.map((c) => <option key={c.id} value={c.id}>{c.name}{c.company ? ` · ${c.company}` : ""}</option>)}
        </Select>
      ) : (
        <button onClick={() => setMerging(true)} className="rounded border border-slate-200 px-2 py-1 text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400">Mesclar</button>
      )}
      <button
        disabled={pending}
        onClick={() => {
          if (!confirm("Anonimizar os dados pessoais deste contato (LGPD)? Ação irreversível.")) return;
          start(async () => {
            try { await forgetContact(contactId); toast.success("Dados anonimizados"); }
            catch (err) { toast.error(err instanceof Error ? err.message : "Falha"); }
          });
        }}
        className="rounded border border-slate-200 px-2 py-1 text-slate-500 hover:bg-rose-50 hover:text-rose-600 dark:border-slate-700 dark:text-slate-400"
      >Esquecer</button>
    </div>
  );
}

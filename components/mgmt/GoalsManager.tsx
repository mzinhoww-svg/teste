"use client";

import { useState, useTransition } from "react";
import { Trash2, Plus } from "lucide-react";
import { toast } from "sonner";
import { saveGoal, deleteGoal } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input, Select, Label } from "@/components/ui/input";
import { brl } from "@/lib/format";
import type { GoalRow, OrgMember } from "@/lib/db";

const METRICS: Record<string, string> = {
  receita_ganha: "Receita ganha (R$)", deals_ganhos: "Deals ganhos", novos_deals: "Novos deals", reunioes: "Reuniões", propostas: "Propostas",
};

export function GoalsManager({ goals, members }: { goals: GoalRow[]; members: OrgMember[] }) {
  const [rows, setRows] = useState(goals);
  const [pending, start] = useTransition();
  const now = new Date();
  const [period, setPeriod] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  const [metric, setMetric] = useState("receita_ganha");
  const [owner, setOwner] = useState("");
  const [target, setTarget] = useState("");

  const emailById = new Map(members.map((m) => [m.userId, m.email]));

  function add() {
    if (!target) { toast.error("Informe a meta"); return; }
    start(async () => {
      try {
        await saveGoal({ periodMonth: period, metric, ownerUserId: owner || null, target: Number(target) });
        toast.success("Meta salva");
        setRows((r) => [{ id: Math.random().toString(), owner_user_id: owner || null, period_month: `${period}-01`, metric, target: Number(target) }, ...r]);
        setTarget("");
      } catch (e) { toast.error(e instanceof Error ? e.message : "Falha ao salvar"); }
    });
  }
  function remove(id: string) {
    start(async () => {
      try { await deleteGoal(id); setRows((r) => r.filter((x) => x.id !== id)); toast.success("Removida"); }
      catch (e) { toast.error(e instanceof Error ? e.message : "Falha ao remover"); }
    });
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3 rounded-xl border border-slate-200 p-4 dark:border-slate-800 sm:grid-cols-5 sm:items-end">
        <div><Label>Mês</Label><Input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} /></div>
        <div><Label>Métrica</Label><Select value={metric} onChange={(e) => setMetric(e.target.value)}>{Object.entries(METRICS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></div>
        <div><Label>Vendedor</Label><Select value={owner} onChange={(e) => setOwner(e.target.value)}><option value="">Time (geral)</option>{members.map((m) => <option key={m.userId} value={m.userId}>{m.email}</option>)}</Select></div>
        <div><Label>Meta</Label><Input type="number" min="0" value={target} onChange={(e) => setTarget(e.target.value)} /></div>
        <Button loading={pending} onClick={add}><Plus className="h-3.5 w-3.5" aria-hidden /> Adicionar</Button>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-slate-400">Nenhuma meta definida.</p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
          {rows.map((g) => (
            <li key={g.id} className="flex items-center justify-between gap-3 p-3 text-sm">
              <div>
                <span className="font-medium text-slate-700 dark:text-slate-200">{METRICS[g.metric] ?? g.metric}</span>
                <span className="text-slate-400"> · {g.period_month.slice(0, 7)} · {g.owner_user_id ? (emailById.get(g.owner_user_id) ?? "vendedor") : "time"}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="tabular-nums font-semibold">{g.metric === "receita_ganha" ? brl(g.target) : g.target}</span>
                <button aria-label="Remover" onClick={() => remove(g.id)} className="text-slate-400 hover:text-rose-500"><Trash2 className="h-4 w-4" aria-hidden /></button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

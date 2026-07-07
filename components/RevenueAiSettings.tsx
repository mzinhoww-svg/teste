"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { setAiPricing } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

// Parâmetros de custo de IA (org.settings.ai_pricing) usados nos Relatórios.
export function RevenueAiSettings({ ai }: {
  ai: { usdPer1M?: number; usdBrl?: number; monthlyBudgetBRL?: number };
}) {
  const [pending, start] = useTransition();

  return (
    <section className="mb-6 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <form
        action={(fd) => start(async () => {
          try {
            await setAiPricing({
              usdPer1M: Number(fd.get("usdPer1M") ?? 0) || undefined,
              usdBrl: Number(fd.get("usdBrl") ?? 0) || undefined,
              monthlyBudgetBRL: Number(fd.get("budget") ?? 0) || undefined,
            });
            toast.success("Custo de IA salvo");
          } catch (e) { toast.error(e instanceof Error ? e.message : "Falha"); }
        })}
      >
        <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">Custo de IA</div>
        <p className="mb-2 text-xs text-slate-500">Preço, câmbio e orçamento mensal para os Relatórios alertarem estouro.</p>
        <div className="grid grid-cols-3 gap-2">
          <div><Label>US$/1M tok</Label><Input name="usdPer1M" type="number" step="0.01" defaultValue={ai.usdPer1M ?? 0.6} /></div>
          <div><Label>US$→R$</Label><Input name="usdBrl" type="number" step="0.01" defaultValue={ai.usdBrl ?? 5.4} /></div>
          <div><Label>Orçamento (R$)</Label><Input name="budget" type="number" step="10" defaultValue={ai.monthlyBudgetBRL ?? ""} placeholder="R$" /></div>
        </div>
        <Button type="submit" variant="outline" loading={pending} className="mt-2">Salvar</Button>
      </form>
    </section>
  );
}

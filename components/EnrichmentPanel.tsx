"use client";

import { useEffect, useState, useTransition } from "react";
import { Search, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { enrichDeal } from "@/app/actions";
import { Button } from "@/components/ui/button";

type Fact = { label: string; fact: string; confidence: string; url: string | null };

const confColor: Record<string, string> = {
  high: "bg-emerald-100 text-emerald-700",
  medium: "bg-amber-100 text-amber-700",
  low: "bg-slate-100 text-slate-500",
};

// Enriquecimento sob demanda: chama BrasilAPI (CNPJ) e persiste evidências em
// lead_enrichment. Sem CNPJ, devolve buscas recomendadas.
export function EnrichmentPanel({ dealId, initialFacts }: { dealId: string; initialFacts?: Fact[] }) {
  const [facts, setFacts] = useState<Fact[] | null>(initialFacts && initialFacts.length ? initialFacts : null);
  const [pending, start] = useTransition();
  // Evidências salvas chegam via fetch async (panels) — mostra assim que carregam.
  useEffect(() => { if (initialFacts && initialFacts.length) setFacts((cur) => cur ?? initialFacts); }, [initialFacts]);

  function run() {
    start(async () => {
      try {
        const r = await enrichDeal(dealId);
        setFacts(r.facts);
        toast.success(
          r.enriched > 0
            ? `Enriquecido: ${r.enriched} evidência(s)${r.hadCnpj ? " (CNPJ + IA)" : " (IA)"}`
            : "Sem dados públicos — geradas buscas recomendadas",
        );
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Falha ao enriquecer");
      }
    });
  }

  return (
    <section className="rounded-xl border border-slate-200 p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-brand-500" aria-hidden />
          <h3 className="text-sm font-semibold text-slate-800">Enriquecimento</h3>
        </div>
        <Button size="xs" variant="outline" loading={pending} onClick={run}>
          <Search className="h-3 w-3" aria-hidden /> Enriquecer
        </Button>
      </div>
      <p className="mt-1 text-xs text-slate-400">Consulta CNPJ (BrasilAPI) e registra evidências. Sem CNPJ, sugere buscas.</p>

      {facts && (
        <ul className="mt-3 space-y-1.5">
          {facts.length === 0 && <li className="text-xs text-slate-400">Nenhuma evidência gerada.</li>}
          {facts.map((f, i) => (
            <li key={i} className="flex items-start gap-2 text-xs">
              <span className={`mt-0.5 shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-medium ${confColor[f.confidence] ?? confColor.low}`}>{f.confidence}</span>
              <div className="min-w-0">
                <span className="text-slate-700">{f.fact}</span>
                <span className="ml-1 text-slate-400">· {f.label}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

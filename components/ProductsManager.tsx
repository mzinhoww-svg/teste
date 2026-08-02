"use client";

import { useState, useTransition } from "react";
import { Package, Plus, Trash2, Check } from "lucide-react";
import { toast } from "sonner";
import { createProduct, updateProduct, deleteProduct } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Select, Label } from "@/components/ui/input";
import { brl } from "@/lib/format";
import type { ProductFull } from "@/lib/db";

const PRICING: Record<string, string> = {
  fixo: "Preço fixo", hora: "Por hora", mensal: "Mensal", negociado: "Negociado", gratuito: "Gratuito",
};

export function ProductsManager({ products }: { products: ProductFull[] }) {
  const [rows, setRows] = useState(products);
  const [pending, start] = useTransition();
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [pricingType, setPricingType] = useState("fixo");
  const [description, setDescription] = useState("");

  function add() {
    if (!name.trim()) { toast.error("Nome do produto é obrigatório"); return; }
    start(async () => {
      try {
        await createProduct({ name, description, price: price === "" ? null : Number(price), pricingType });
        toast.success("Produto criado");
        setRows((r) => [...r, { id: Math.random().toString(), name, description, price: price === "" ? null : Number(price), pricing_type: pricingType, active: true, position: r.length }]);
        setName(""); setPrice(""); setDescription(""); setPricingType("fixo");
      } catch (e) { toast.error(e instanceof Error ? e.message : "Falha ao criar"); }
    });
  }
  function toggle(p: ProductFull) {
    start(async () => {
      try { await updateProduct(p.id, { active: !p.active }); setRows((r) => r.map((x) => x.id === p.id ? { ...x, active: !x.active } : x)); }
      catch (e) { toast.error(e instanceof Error ? e.message : "Falha"); }
    });
  }
  function remove(id: string) {
    start(async () => {
      try { await deleteProduct(id); setRows((r) => r.filter((x) => x.id !== id)); toast.success("Removido"); }
      catch (e) { toast.error(e instanceof Error ? e.message : "Falha ao remover"); }
    });
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3 rounded-xl border border-slate-200 p-4 dark:border-slate-800 sm:grid-cols-6 sm:items-end">
        <div className="sm:col-span-2"><Label>Nome do produto/serviço</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Studio Corporativo" /></div>
        <div><Label>Preço (R$)</Label><Input type="number" min="0" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="opcional" /></div>
        <div><Label>Tipo</Label><Select value={pricingType} onChange={(e) => setPricingType(e.target.value)}>{Object.entries(PRICING).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></div>
        <div className="sm:col-span-2"><Label>Descrição</Label><Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="opcional" /></div>
        <Button loading={pending} onClick={add} className="sm:col-span-1"><Plus className="h-3.5 w-3.5" aria-hidden /> Adicionar</Button>
      </div>

      {rows.length === 0 ? (
        <div className="grid place-items-center rounded-xl border border-dashed border-slate-300 py-12 text-center dark:border-slate-700">
          <Package className="h-8 w-8 text-slate-300" aria-hidden />
          <p className="mt-2 text-sm text-slate-500">Nenhum produto cadastrado. Adicione seu catálogo para o agente de Proposta usar preços reais.</p>
        </div>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
          {rows.map((p) => (
            <li key={p.id} className={`flex flex-wrap items-center justify-between gap-3 p-3 text-sm ${p.active ? "" : "opacity-50"}`}>
              <div className="min-w-0">
                <div className="font-medium text-slate-700 dark:text-slate-200">{p.name}</div>
                <div className="text-xs text-slate-400">{PRICING[p.pricing_type] ?? p.pricing_type}{p.description ? ` · ${p.description}` : ""}</div>
              </div>
              <div className="flex items-center gap-3">
                <span className="tabular-nums font-semibold text-slate-700 dark:text-slate-300">{p.price != null ? brl(p.price) : "a validar"}</span>
                <button onClick={() => toggle(p)} title={p.active ? "Desativar" : "Ativar"} className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${p.active ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" : "bg-slate-100 text-slate-500 dark:bg-slate-800"}`}>{p.active ? "ativo" : "inativo"}</button>
                <button aria-label="Remover" onClick={() => remove(p.id)} className="text-slate-400 hover:text-rose-500"><Trash2 className="h-4 w-4" aria-hidden /></button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

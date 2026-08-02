export function brl(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

export function tempColor(t?: "hot" | "warm" | "cold"): string {
  if (t === "hot") return "bg-rose-100 text-rose-700 border-rose-200";
  if (t === "warm") return "bg-amber-100 text-amber-700 border-amber-200";
  if (t === "cold") return "bg-sky-100 text-sky-700 border-sky-200";
  return "bg-slate-100 text-slate-500 border-slate-200";
}

export function tempLabel(t?: "hot" | "warm" | "cold"): string {
  return t === "hot" ? "Quente" : t === "warm" ? "Morno" : t === "cold" ? "Frio" : "—";
}

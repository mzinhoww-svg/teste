// I1 — Guardrail de saída dos agentes. Além de "o JSON parseia", checa
// consistência numérica e coerência com o catálogo de produtos, para conter
// alucinação de preço. Não bloqueia; anota violações em `guardrail` (persistido
// em agent_runs e visível na UI), e corrige o que é seguro corrigir.

export interface GuardrailFinding { level: "warn" | "fix"; message: string }
export interface GuardrailResult { findings: GuardrailFinding[]; ok: boolean }

interface ProposalLike {
  items?: { name: string; qty: number; unitPrice: number }[];
  subtotal?: number; discountPct?: number; total?: number;
}

/**
 * Valida uma proposta gerada:
 *  - recomputa subtotal/total a partir dos itens e do desconto (corrige divergência);
 *  - teto de desconto de 15% (política Reiners);
 *  - alerta preço fora do catálogo (possível alucinação) quando há produtos.
 * Retorna a proposta possivelmente corrigida + achados.
 */
export function guardProposal(
  p: ProposalLike,
  catalogPrices: number[] = [],
): { proposal: ProposalLike; result: GuardrailResult } {
  const findings: GuardrailFinding[] = [];
  const items = Array.isArray(p.items) ? p.items : [];
  const recomputedSubtotal = items.reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.unitPrice) || 0), 0);

  const out: ProposalLike = { ...p };
  if (items.length && Math.abs((Number(p.subtotal) || 0) - recomputedSubtotal) > 1) {
    findings.push({ level: "fix", message: `Subtotal (${p.subtotal}) não batia com os itens (${recomputedSubtotal}) — corrigido.` });
    out.subtotal = recomputedSubtotal;
  }
  const subtotal = Number(out.subtotal) || 0;

  let discount = Number(out.discountPct) || 0;
  if (discount > 15) {
    findings.push({ level: "fix", message: `Desconto ${discount}% acima do teto de 15% — limitado a 15%.` });
    discount = 15;
    out.discountPct = 15;
  }
  const recomputedTotal = Math.round(subtotal * (1 - discount / 100));
  if (subtotal && Math.abs((Number(p.total) || 0) - recomputedTotal) > 1) {
    findings.push({ level: "fix", message: `Total (${p.total}) não batia com subtotal−desconto (${recomputedTotal}) — corrigido.` });
    out.total = recomputedTotal;
  }

  // Alerta de preço fora do catálogo (não corrige — pode ser escopo customizado).
  if (catalogPrices.length && items.length) {
    const known = new Set(catalogPrices.map((v) => Math.round(v)));
    const suspicious = items.filter((it) => Number(it.unitPrice) > 0 && !known.has(Math.round(Number(it.unitPrice))));
    if (suspicious.length && suspicious.length === items.length) {
      findings.push({ level: "warn", message: "Nenhum preço de item bate com a tabela de produtos — confirmar tabela vigente antes de enviar." });
    }
  }

  return { proposal: out, result: { findings, ok: findings.every((f) => f.level !== "warn") } };
}

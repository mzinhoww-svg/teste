// F3.3 — Next Best Action: recomendação determinística (sem LLM) derivada do
// estado do deal. Usada no card e no drawer para dizer "o que fazer agora".
import type { Deal } from "./types";

export interface NBA { label: string; urgency: "alta" | "media" | "baixa" }

function daysSince(iso?: string | null): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime();
  if (Number.isNaN(ms)) return null;
  return Math.floor((Date.now() - ms) / 86_400_000);
}

export function nextBestAction(deal: Pick<Deal, "stageKey" | "lastTouch" | "nextActionAt" | "score" | "temperature">): NBA {
  const key = (deal.stageKey ?? "").toLowerCase();
  const stale = daysSince(deal.lastTouch);
  const today = new Date().toISOString().slice(0, 10);

  // Próxima ação agendada e vencida tem prioridade.
  if (deal.nextActionAt && deal.nextActionAt.slice(0, 10) < today) {
    return { label: `Ação agendada vencida (${deal.nextActionAt.slice(0, 10)}) — executar agora`, urgency: "alta" };
  }

  if (["ganho", "won"].includes(key)) return { label: "Iniciar onboarding e kickoff", urgency: "media" };
  if (["perdido", "lost", "descarte"].includes(key)) return { label: "Registrar motivo e agendar reativação (30d)", urgency: "baixa" };

  if (["proposta", "proposal"].includes(key)) {
    if (stale != null && stale >= 10) return { label: "Proposta há 10+ dias — último contato ou marcar Perdido", urgency: "alta" };
    if (stale != null && stale >= 5) return { label: "Proposta há 5+ dias — ligar", urgency: "alta" };
    if (stale != null && stale >= 2) return { label: "Proposta há 48h — follow-up curto no WhatsApp", urgency: "media" };
    return { label: "Confirmar recebimento da proposta", urgency: "media" };
  }
  if (["negociacao", "negociação", "negotiation"].includes(key)) return { label: "Avançar negociação — tratar objeção e pedir fecho", urgency: "media" };
  if (["reuniao", "reunião", "meeting"].includes(key)) return { label: "Registrar diagnóstico da reunião e montar proposta", urgency: "media" };

  // Estágios iniciais
  if (stale != null && stale >= 3) return { label: `Parado há ${stale} dias — retomar contato`, urgency: "alta" };
  if ((deal.score ?? 0) >= 70 || deal.temperature === "hot") return { label: "Lead quente — abordar hoje", urgency: "alta" };
  return { label: "Qualificar e definir próxima ação", urgency: "baixa" };
}

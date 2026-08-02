import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getAgentByKind, getDealFull } from "@/lib/db";
import { resolveAgentByKind } from "@/lib/agents/resolve";
import { getLeadCommunicationContext, buildWhatsAppPromptBlock } from "@/lib/lead-comm-context";
import { buildEnrichmentPromptBlock } from "@/lib/agents/enrichment-context";
import { buildLearningsPromptBlock, isLearningSource, recordLearning } from "@/lib/agents/learnings";
import { guardProposal } from "@/lib/agents/guardrail";
import { runWithUsage } from "@/lib/ai";
import {
  runAdvisory, runContract, runCopilot, runLeadScoring, runProposal,
} from "@/lib/agents";
import { waMeLink } from "@/lib/whatsapp";
import type { Contact } from "@/lib/types";

// ==========================================================================
// Execução de agentes — usada pela rota manual (/api/agents/run) e pelas
// automações (mudança de estágio). Persiste resultado, auditoria e timeline.
// ==========================================================================

const STUB_CONTACT: Contact = { id: "", name: "Contato", email: "", company: "", channel: "form" };

/** Máximo de execuções de agentes por org por minuto (proteção de custo/abuso). */
const MAX_RUNS_PER_MINUTE = 20;

export class RateLimitError extends Error {
  constructor() { super("Limite de execuções atingido — aguarde um minuto."); }
}

export interface RunContext {
  orgId: string;
  userId: string | null;
  /** origem da execução: manual (botão) ou automação */
  via: "manual" | "automation";
}

/**
 * Dry-run: executa a lógica do agente e devolve o resultado SEM persistir nada
 * (não grava em deals/proposals/contracts/agent_runs/activities). Serve para
 * pré-visualizar a saída antes de aplicar de verdade. Respeita o rate limit.
 */
export async function dryRunAgentForDeal(kind: string, dealId: string, ctx: RunContext) {
  const supabase = createClient();

  const since = new Date(Date.now() - 60_000).toISOString();
  const { count } = await supabase
    .from("agent_runs")
    .select("id", { count: "exact", head: true })
    .eq("org_id", ctx.orgId)
    .gte("created_at", since);
  if ((count ?? 0) >= MAX_RUNS_PER_MINUTE) throw new RateLimitError();

  const [full, agent] = await Promise.all([getDealFull(dealId), getAgentByKind(kind)]);
  if (!full || !agent) throw new Error("Deal ou agente não encontrado");
  if (!agent.enabled) throw new Error("Agente inativo");

  // Prompt efetivo vem do padrão global da plataforma (+ override do tenant se
  // habilitado). O modelo e as instruções refinadas substituem os da linha do
  // agente por org, mantendo a metadata rica (grupo, dores) para a UI.
  const resolved = await resolveAgentByKind(kind, ctx.orgId);
  if (resolved) {
    if (!resolved.active) throw new Error("Agente inativo (padrão da plataforma)");
    agent.instructions = resolved.composedPrompt;
    agent.model = resolved.model;
  }

  const { deal } = full;
  const contact = full.contact ?? STUB_CONTACT;

  // Injeta a conversa de WhatsApp do lead (quando o bridge estiver ativo e
  // houver thread) no prompt — escopado por org. Registra se foi usada.
  const comm = await getLeadCommunicationContext(ctx.orgId, dealId, contact.id || null);
  if (comm.whatsapp_available) {
    agent.instructions = `${agent.instructions}\n\n${buildWhatsAppPromptBlock(comm)}`;
    (agent as any).__waUsed = true;
  }

  // Injeta os fatos de enriquecimento já coletados (lead_enrichment) + a memória
  // de aprendizados da org (loop de feedback) — camadas complementares ao #45.
  const enrich = await buildEnrichmentPromptBlock(supabase, ctx.orgId, dealId);
  if (enrich.block) {
    agent.instructions = `${agent.instructions}\n\n${enrich.block}`;
    (agent as any).__enrichUsed = enrich.count;
  }
  const learnings = await buildLearningsPromptBlock(supabase, ctx.orgId);
  if (learnings.block) agent.instructions = `${agent.instructions}\n\n${learnings.block}`;

  let result: any;
  const extra: Record<string, unknown> = {};
  switch (kind) {
    case "lead-scoring": result = await runLeadScoring(deal, contact, agent); break;
    case "sales-copilot":
      result = await runCopilot(deal, contact, agent);
      extra.waLink = waMeLink(contact.phone, result.message);
      break;
    case "proposal": {
      const { data: catalog } = await supabase.from("products").select("id,name,price,pricing_type,description").eq("org_id", ctx.orgId).eq("active", true).order("position");
      result = await runProposal(deal, contact, agent, (catalog ?? []) as any);
      break;
    }
    case "legal-contract": result = await runContract(deal, contact, agent); break;
    default: result = await runAdvisory(deal, contact, agent);
  }
  return { ...result, ...extra, dryRun: true };
}

export async function runAgentForDeal(kind: string, dealId: string, ctx: RunContext) {
  const supabase = createClient();

  // Rate limit por org (janela de 60s)
  const since = new Date(Date.now() - 60_000).toISOString();
  const { count } = await supabase
    .from("agent_runs")
    .select("id", { count: "exact", head: true })
    .eq("org_id", ctx.orgId)
    .gte("created_at", since);
  if ((count ?? 0) >= MAX_RUNS_PER_MINUTE) throw new RateLimitError();

  const [full, agent] = await Promise.all([getDealFull(dealId), getAgentByKind(kind)]);
  if (!full || !agent) throw new Error("Deal ou agente não encontrado");
  if (!agent.enabled) throw new Error("Agente inativo");

  // Prompt efetivo vem do padrão global da plataforma (+ override do tenant se
  // habilitado). O modelo e as instruções refinadas substituem os da linha do
  // agente por org, mantendo a metadata rica (grupo, dores) para a UI.
  const resolved = await resolveAgentByKind(kind, ctx.orgId);
  if (resolved) {
    if (!resolved.active) throw new Error("Agente inativo (padrão da plataforma)");
    agent.instructions = resolved.composedPrompt;
    agent.model = resolved.model;
  }

  const { deal } = full;
  const contact = full.contact ?? STUB_CONTACT;

  // Injeta a conversa de WhatsApp do lead (quando o bridge estiver ativo e
  // houver thread) no prompt — escopado por org. Registra se foi usada.
  const comm = await getLeadCommunicationContext(ctx.orgId, dealId, contact.id || null);
  if (comm.whatsapp_available) {
    agent.instructions = `${agent.instructions}\n\n${buildWhatsAppPromptBlock(comm)}`;
    (agent as any).__waUsed = true;
  }

  // Injeta os fatos de enriquecimento já coletados (lead_enrichment) + a memória
  // de aprendizados da org (loop de feedback) — camadas complementares ao #45.
  const enrich = await buildEnrichmentPromptBlock(supabase, ctx.orgId, dealId);
  if (enrich.block) {
    agent.instructions = `${agent.instructions}\n\n${enrich.block}`;
    (agent as any).__enrichUsed = enrich.count;
  }
  const learnings = await buildLearningsPromptBlock(supabase, ctx.orgId);
  if (learnings.block) agent.instructions = `${agent.instructions}\n\n${learnings.block}`;

  let result: any;
  const extra: Record<string, unknown> = {};

  const usage = await runWithUsage(async () => {
  switch (kind) {
    case "lead-scoring": {
      result = await runLeadScoring(deal, contact, agent);
      await supabase.from("deals").update({
        score: result.score, temperature: result.temperature, score_reason: result.reason,
      }).eq("id", dealId);
      break;
    }
    case "sales-copilot": {
      result = await runCopilot(deal, contact, agent);
      extra.waLink = waMeLink(contact.phone, result.message);
      // Registra a mensagem sugerida como rascunho (histórico omnichannel)
      await supabase.from("messages").insert({
        org_id: ctx.orgId, contact_id: contact.id || null, deal_id: dealId,
        channel: contact.channel === "whatsapp" ? "whatsapp" : "email",
        direction: "outbound", body: result.message, status: "draft",
      });
      break;
    }
    case "proposal": {
      // #49: proposta gerada a partir do catálogo de produtos ativo.
      const { data: catalog } = await supabase.from("products").select("id,name,price,pricing_type,description").eq("org_id", ctx.orgId).eq("active", true).order("position");
      result = await runProposal(deal, contact, agent, (catalog ?? []) as any);
      // Guardrail (complemento): recomputa subtotal/total, aplica teto de desconto
      // e alerta preço fora do catálogo antes de persistir (contém alucinação).
      const catalogPrices = (catalog ?? []).map((p: any) => Number(p.price)).filter((n) => n > 0);
      const guarded = guardProposal(result, catalogPrices);
      Object.assign(result, guarded.proposal);
      if (guarded.result.findings.length) extra.guardrail = guarded.result.findings;
      // Política: desconto NUNCA é aprovado automaticamente. Toda proposta com
      // desconto nasce "pendente" e só pode ser enviada após aprovação de gestor.
      const needsApproval = Number(result.discountPct) > 0;
      const { data: prop } = await supabase.from("proposals").insert({
        org_id: ctx.orgId, deal_id: dealId, items: result.items, subtotal: result.subtotal,
        discount_pct: result.discountPct, total: result.total, summary: result.summary,
        terms: result.terms, generated_by: result.generatedBy,
        approval_status: needsApproval ? "pendente" : "aprovada",
      }).select("id, share_token").single();
      if (prop?.share_token) extra.shareToken = prop.share_token;
      extra.approvalStatus = needsApproval ? "pendente" : "aprovada";
      // Espelha os itens em proposal_items, ligando ao catálogo (product_id) para
      // relatório de mix/margem (F0/F4).
      if (prop?.id) {
        const byName = new Map((catalog ?? []).map((p: any) => [p.name.toLowerCase(), p.id]));
        const rows = (result.items ?? []).map((it: any, i: number) => ({
          org_id: ctx.orgId, proposal_id: prop.id, product_id: byName.get(String(it.name).toLowerCase()) ?? null,
          name: it.name, qty: it.qty, unit_price: it.unitPrice, position: i,
        }));
        if (rows.length) await supabase.from("proposal_items").insert(rows);
      }
      if (needsApproval && prop?.id) {
        await supabase.from("notifications").insert({
          org_id: ctx.orgId, type: "discount_approval", title: "Desconto aguarda aprovação",
          body: `Proposta de "${deal.title}" tem ${result.discountPct}% de desconto e precisa de aprovação antes de ser enviada.`,
          deal_id: dealId, action_url: "/app",
        });
      }
      break;
    }
    case "legal-contract": {
      result = await runContract(deal, contact, agent);
      await supabase.from("contracts").insert({
        org_id: ctx.orgId, deal_id: dealId, reference: result.reference, title: result.title,
        clauses: result.clauses, value: result.value, signatories: result.signatories,
        signature_status: result.signatureStatus, signature_provider: result.signatureProvider,
        generated_by: result.generatedBy,
      });
      break;
    }
    case "activities":
    case "cadencia": {
      // Cadência OPERACIONAL: além do plano, agenda o próximo follow-up no card
      // (data + notificação acionável). Sem isso o agente só "sugeria".
      // `activities` = agente canônico de Cadência/SLA; `cadencia` = alias legado.
      result = await runAdvisory(deal, contact, agent);
      const touchMs = deal.lastTouch ? new Date(deal.lastTouch).getTime() : NaN;
      const stale = Number.isNaN(touchMs) ? null : Math.floor((Date.now() - touchMs) / 86_400_000);
      const days = stale != null && stale > 3 ? 0 : 2; // parado > SLA → hoje
      const nextAt = new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
      await supabase.from("deals").update({ next_action_at: nextAt }).eq("id", dealId);
      // Cadência vira TAREFA acionável (não só notificação).
      {
        const { createTask } = await import("@/lib/tasks");
        await createTask(supabase, {
          orgId: ctx.orgId, dealId, title: `Follow-up: ${deal.title}`,
          dueAt: new Date(Date.now() + days * 86_400_000).toISOString(),
          assigneeUserId: ctx.userId, priority: stale != null && stale > 3 ? "alta" : "normal",
          source: "cadence", agentKind: kind,
        });
      }
      await supabase.from("notifications").insert({
        org_id: ctx.orgId, deal_id: dealId, contact_id: contact.id || null,
        type: "cadence", title: "Follow-up agendado", action_url: "/app",
        body: `${deal.title}: próximo toque em ${nextAt} por ${contact.channel === "whatsapp" ? "WhatsApp" : "canal preferido"}.`,
        metadata: { agent_key: "cadencia", next_action_at: nextAt },
      });
      extra.nextActionAt = nextAt;
      break;
    }
    default: {
      // Agentes advisory (Nutrição, Coaching, Feedback, Atendimento): além do
      // texto, viram "atores" — o 1º item acionável vira uma tarefa com prazo.
      result = await runAdvisory(deal, contact, agent);
      const items: string[] = Array.isArray(result?.items) ? result.items : [];
      if (items.length) {
        const { createTask } = await import("@/lib/tasks");
        await createTask(supabase, {
          orgId: ctx.orgId, dealId, title: `${agent.name}: ${items[0]}`,
          dueAt: new Date(Date.now() + 2 * 86_400_000).toISOString(),
          assigneeUserId: ctx.userId, source: "agent", agentKind: kind,
        });
        extra.taskCreated = true;
      }
      // Aprendizado/Coaching alimentam a memória da org (loop fechado).
      if (isLearningSource(kind)) await recordLearning(supabase, { orgId: ctx.orgId, sourceKind: kind, dealId, result });
    }
  }
  });
  const tokens = usage.tokens;

  const persisted = { ...result, ...extra };
  await supabase.from("agent_runs").insert({
    org_id: ctx.orgId, agent_kind: kind, deal_id: dealId,
    input: { title: deal.title, stage: deal.stageKey, via: ctx.via, agentKey: resolved?.key ?? null, templateVersion: resolved?.templateVersion ?? null, whatsappUsed: Boolean((agent as any).__waUsed), enrichmentUsed: Number((agent as any).__enrichUsed ?? 0), guardrail: (extra as any).guardrail ?? null, tokens, llmError: result?.llmError ?? null },
    output: persisted, source: result?.source ?? "n/a", model: agent.model, created_by: ctx.userId,
  });

  await supabase.from("activities").insert({
    org_id: ctx.orgId, deal_id: dealId, type: "agent",
    summary: ctx.via === "automation" ? `${agent.name} executado automaticamente` : `${agent.name} executado`,
    author: agent.name,
  });

  return { ...result, ...extra };
}

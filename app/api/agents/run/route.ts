import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAgentByKind, getAuthContext, getDealFull } from "@/lib/db";
import {
  runAdvisory, runContract, runCopilot, runLeadScoring, runProposal,
} from "@/lib/agents";
import { waMeLink } from "@/lib/whatsapp";
import type { Contact } from "@/lib/types";

export const runtime = "nodejs";

const STUB_CONTACT: Contact = { id: "", name: "Contato", email: "", company: "", channel: "form" };

export async function POST(req: Request) {
  const auth = await getAuthContext();
  if (!auth) return NextResponse.json({ error: "não autenticado" }, { status: 401 });

  const { dealId, kind } = (await req.json()) as { dealId?: string; kind?: string };
  if (!dealId || !kind) return NextResponse.json({ error: "dealId e kind obrigatórios" }, { status: 400 });

  const [full, agent] = await Promise.all([getDealFull(dealId), getAgentByKind(kind)]);
  if (!full || !agent) return NextResponse.json({ error: "não encontrado" }, { status: 404 });

  const { deal } = full;
  const contact = full.contact ?? STUB_CONTACT;
  const supabase = createClient();

  let result: unknown;
  let extra: Record<string, unknown> = {};

  switch (kind) {
    case "lead-scoring": {
      const r = await runLeadScoring(deal, contact, agent);
      await supabase.from("deals").update({ score: r.score, temperature: r.temperature, score_reason: r.reason }).eq("id", dealId);
      result = r;
      break;
    }
    case "sales-copilot": {
      const r = await runCopilot(deal, contact, agent);
      extra.waLink = waMeLink(contact.phone, r.message);
      result = r;
      break;
    }
    case "proposal": {
      const r = await runProposal(deal, contact, agent);
      await supabase.from("proposals").insert({
        org_id: auth.orgId, deal_id: dealId, items: r.items, subtotal: r.subtotal,
        discount_pct: r.discountPct, total: r.total, summary: r.summary, terms: r.terms, generated_by: r.generatedBy,
      });
      result = r;
      break;
    }
    case "legal-contract": {
      const r = await runContract(deal, contact, agent);
      await supabase.from("contracts").insert({
        org_id: auth.orgId, deal_id: dealId, reference: r.reference, title: r.title, clauses: r.clauses,
        value: r.value, signatories: r.signatories, signature_status: r.signatureStatus, signature_provider: r.signatureProvider, generated_by: r.generatedBy,
      });
      result = r;
      break;
    }
    default: {
      // Nutrição, Atividades, Coaching, Feedback, Atendimento
      result = await runAdvisory(deal, contact, agent);
    }
  }

  // Auditoria da execução
  await supabase.from("agent_runs").insert({
    org_id: auth.orgId, agent_kind: kind, deal_id: dealId,
    input: { title: deal.title, stage: deal.stageKey },
    output: result as object, source: (result as any)?.source ?? "n/a",
    model: agent.model, created_by: auth.userId,
  });

  // Registra na timeline do deal
  await supabase.from("activities").insert({
    org_id: auth.orgId, deal_id: dealId, type: "agent",
    summary: `${agent.name} executado`, author: agent.name,
  });

  return NextResponse.json({ ...(result as object), ...extra });
}

"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { ACTIVE_ORG_COOKIE, getAuthContext, getOrgId } from "@/lib/db";

async function orgOrThrow() {
  const orgId = await getOrgId();
  if (!orgId) throw new Error("Sem organização / não autenticado");
  return orgId;
}

// --- Tenant ativo ----------------------------------------------------------

export async function switchOrg(orgId: string) {
  const ctx = await getAuthContext();
  if (!ctx) throw new Error("Não autenticado");
  // Só permite trocar para org da qual o usuário é membro.
  if (!ctx.memberships.some((m) => m.orgId === orgId)) {
    throw new Error("Você não é membro dessa organização");
  }
  cookies().set(ACTIVE_ORG_COOKIE, orgId, {
    path: "/", httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 365,
  });
  revalidatePath("/", "layout");
}

export async function renameOrg(name: string) {
  const ctx = await getAuthContext();
  if (!ctx?.orgId) throw new Error("Sem organização");
  if (ctx.role === "member") throw new Error("Apenas owner/admin podem renomear a organização");
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Nome inválido");
  const supabase = createClient();
  const { error } = await supabase.from("orgs").update({ name: trimmed }).eq("id", ctx.orgId);
  if (error) throw error;
  revalidatePath("/", "layout");
}

// --- Leads / Deals -------------------------------------------------------

export async function createLead(formData: FormData) {
  const orgId = await orgOrThrow();
  const supabase = createClient();

  const name = String(formData.get("name") ?? "").trim();
  const company = String(formData.get("company") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim() || null;
  const phone = String(formData.get("phone") ?? "").trim() || null;
  const channel = String(formData.get("channel") ?? "form");
  const title = String(formData.get("title") ?? "").trim() || `${company || name} — nova oportunidade`;
  const amount = Number(formData.get("amount") ?? 0) || 0;
  if (!name) throw new Error("Nome é obrigatório");

  const { data: pipe } = await supabase.from("pipelines").select("id").order("position").limit(1).maybeSingle();
  if (!pipe) throw new Error("Nenhum funil configurado");
  const { data: firstStage } = await supabase.from("stages").select("id").eq("pipeline_id", pipe.id).order("position").limit(1).maybeSingle();
  if (!firstStage) throw new Error("Nenhum estágio configurado");

  const { data: contact, error: cErr } = await supabase
    .from("contacts")
    .insert({ org_id: orgId, name, company, email, phone, channel })
    .select("id")
    .single();
  if (cErr) throw cErr;

  const { error: dErr } = await supabase.from("deals").insert({
    org_id: orgId, pipeline_id: pipe.id, stage_id: firstStage.id, contact_id: contact.id,
    title, amount, engagement: 40, last_touch: new Date().toISOString().slice(0, 10),
  });
  if (dErr) throw dErr;

  revalidatePath("/");
}

export async function moveDeal(dealId: string, stageId: string) {
  const orgId = await orgOrThrow();
  const supabase = createClient();
  const { error } = await supabase
    .from("deals")
    .update({ stage_id: stageId, updated_at: new Date().toISOString() })
    .eq("id", dealId);
  if (error) throw error;

  // Registra a mudança de estágio na timeline
  const { data: stage } = await supabase.from("stages").select("name").eq("id", stageId).maybeSingle();
  await supabase.from("activities").insert({
    org_id: orgId, deal_id: dealId, type: "note",
    summary: `Movido para "${stage?.name ?? "novo estágio"}"`, author: "Você",
  });

  // Automações: regras "ao entrar no estágio X, executar agente Y"
  const { data: autos } = await supabase
    .from("automations")
    .select("agent_kind")
    .eq("trigger_stage_id", stageId)
    .eq("trigger_type", "stage_enter")
    .eq("enabled", true);

  if (autos?.length) {
    const { runAgentForDeal } = await import("@/lib/run-agent");
    const { data: { user } } = await createClient().auth.getUser();
    // Executa em sequência; falha de um agente não bloqueia o movimento nem os demais.
    for (const a of autos) {
      if (!a.agent_kind) continue;
      try {
        await runAgentForDeal(a.agent_kind, dealId, { orgId, userId: user?.id ?? null, via: "automation" });
      } catch {
        // registrado via ausência em agent_runs; não propaga
      }
    }
  }

  revalidatePath("/");
}

export async function updateDeal(dealId: string, fields: { title?: string; amount?: number; engagement?: number }) {
  await orgOrThrow();
  const supabase = createClient();
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (fields.title !== undefined) patch.title = fields.title;
  if (fields.amount !== undefined) patch.amount = fields.amount;
  if (fields.engagement !== undefined) patch.engagement = fields.engagement;
  const { error } = await supabase.from("deals").update(patch).eq("id", dealId);
  if (error) throw error;
  revalidatePath("/");
}

export async function addActivity(dealId: string, type: string, summary: string, author = "Você") {
  const orgId = await orgOrThrow();
  const supabase = createClient();
  const { error } = await supabase.from("activities").insert({ org_id: orgId, deal_id: dealId, type, summary, author });
  if (error) throw error;
  await supabase.from("deals").update({ last_touch: new Date().toISOString().slice(0, 10) }).eq("id", dealId);
  revalidatePath("/");
}

// --- Agentes (Studio) ----------------------------------------------------

export async function updateAgent(uuid: string, fields: {
  instructions?: string; model?: string; enabled?: boolean; triggers?: string[]; temperature?: number;
}) {
  const orgId = await orgOrThrow();
  const supabase = createClient();

  // Versiona o prompt antes de sobrescrever.
  if (fields.instructions !== undefined || fields.model !== undefined) {
    const { data: cur } = await supabase.from("agents").select("instructions,model,temperature").eq("id", uuid).maybeSingle();
    if (cur) {
      await supabase.from("agent_versions").insert({
        org_id: orgId, agent_id: uuid, instructions: cur.instructions, model: cur.model, temperature: cur.temperature,
      });
    }
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (fields.instructions !== undefined) patch.instructions = fields.instructions;
  if (fields.model !== undefined) patch.model = fields.model;
  if (fields.enabled !== undefined) patch.enabled = fields.enabled;
  if (fields.triggers !== undefined) patch.triggers = fields.triggers;
  if (fields.temperature !== undefined) patch.temperature = fields.temperature;

  const { error } = await supabase.from("agents").update(patch).eq("id", uuid);
  if (error) throw error;
  revalidatePath("/studio");
}

// --- Automações ------------------------------------------------------------

export async function createAutomation(formData: FormData) {
  const orgId = await orgOrThrow();
  const supabase = createClient();
  const name = String(formData.get("name") ?? "").trim();
  const stageId = String(formData.get("stageId") ?? "");
  const agentKind = String(formData.get("agentKind") ?? "");
  if (!stageId || !agentKind) throw new Error("Estágio e agente são obrigatórios");

  const { error } = await supabase.from("automations").insert({
    org_id: orgId, name: name || `Automação`, trigger_type: "stage_enter",
    trigger_stage_id: stageId, agent_kind: agentKind, enabled: true,
  });
  if (error) throw error;
  revalidatePath("/automacoes");
}

export async function toggleAutomation(id: string, enabled: boolean) {
  await orgOrThrow();
  const supabase = createClient();
  const { error } = await supabase.from("automations").update({ enabled }).eq("id", id);
  if (error) throw error;
  revalidatePath("/automacoes");
}

export async function deleteAutomation(id: string) {
  await orgOrThrow();
  const supabase = createClient();
  const { error } = await supabase.from("automations").delete().eq("id", id);
  if (error) throw error;
  revalidatePath("/automacoes");
}

// --- Contratos -----------------------------------------------------------

export async function updateContractStatus(contractId: string, status: string) {
  await orgOrThrow();
  const supabase = createClient();
  const { error } = await supabase
    .from("contracts")
    .update({ signature_status: status, updated_at: new Date().toISOString() })
    .eq("id", contractId);
  if (error) throw error;
  revalidatePath("/contracts");
  revalidatePath("/");
}

export async function updateContractClauses(contractId: string, clauses: { heading: string; body: string }[]) {
  await orgOrThrow();
  const supabase = createClient();
  const { error } = await supabase
    .from("contracts")
    .update({ clauses, updated_at: new Date().toISOString() })
    .eq("id", contractId);
  if (error) throw error;
  revalidatePath("/contracts");
}

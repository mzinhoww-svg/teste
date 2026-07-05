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

/**
 * Guarda server-side por papel. A UI esconde o que o papel não pode fazer,
 * mas a autorização REAL acontece aqui — chamadas diretas às actions por um
 * `member` são rejeitadas mesmo que a UI seja contornada.
 */
async function requireRole(allowed: Array<"owner" | "admin" | "member">) {
  const ctx = await getAuthContext();
  if (!ctx?.orgId) throw new Error("Sem organização / não autenticado");
  if (!allowed.includes(ctx.role)) {
    throw new Error("Permissão insuficiente: esta ação exige papel owner/admin nesta organização");
  }
  return ctx;
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

export async function updateOrgBrand(brand: { primary?: string; accent?: string; logoUrl?: string }) {
  const ctx = await requireRole(["owner", "admin"]);
  const supabase = createClient();
  const { data: org } = await supabase.from("orgs").select("settings").eq("id", ctx.orgId).maybeSingle();
  const settings = { ...(org?.settings ?? {}), brand: { ...(org?.settings?.brand ?? {}), ...brand } };
  const { error } = await supabase.from("orgs").update({ settings }).eq("id", ctx.orgId);
  if (error) throw error;
  revalidatePath("/", "layout");
}

// --- Membros e convites -----------------------------------------------------

export async function createInvite(formData: FormData) {
  const ctx = await requireRole(["owner", "admin"]);
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = String(formData.get("role") ?? "member");
  if (!email.includes("@")) throw new Error("E-mail inválido");
  if (!["admin", "member"].includes(role)) throw new Error("Papel inválido");

  const supabase = createClient();
  const { data, error } = await supabase
    .from("invites")
    .insert({ org_id: ctx.orgId, email, member_role: role, created_by: ctx.userId })
    .select("token")
    .single();
  if (error) throw error;

  await supabase.from("notifications").insert({
    org_id: ctx.orgId, type: "invite_created", title: "Convite criado",
    body: `${email} foi convidado como ${role}.`, action_url: "/app/org",
  });

  revalidatePath("/app/org");
  return data.token as string;
}

export async function cancelInvite(id: string) {
  await requireRole(["owner", "admin"]);
  const supabase = createClient();
  const { error } = await supabase.from("invites").update({ status: "cancelled" }).eq("id", id).eq("status", "pending");
  if (error) throw error;
  revalidatePath("/app/org");
}

export async function setMemberRole(userId: string, role: string) {
  const ctx = await requireRole(["owner", "admin"]);
  const supabase = createClient();
  const { data } = await supabase.rpc("change_member_role", { p_org: ctx.orgId, p_user: userId, p_role: role });
  if (!data?.ok) throw new Error(data?.error ?? "Falha ao alterar papel");
  revalidatePath("/app/org");
}

export async function removeMemberAction(userId: string) {
  const ctx = await requireRole(["owner", "admin"]);
  const supabase = createClient();
  const { data } = await supabase.rpc("remove_member", { p_org: ctx.orgId, p_user: userId });
  if (!data?.ok) throw new Error(data?.error ?? "Falha ao remover membro");
  revalidatePath("/app/org");
}

export async function acceptInviteAction(token: string) {
  const supabase = createClient();
  const { data } = await supabase.rpc("accept_invite", { p_token: token });
  if (!data?.ok) throw new Error(data?.error ?? "Falha ao aceitar convite");
  // Ativa a org recém-aceita
  cookies().set(ACTIVE_ORG_COOKIE, data.org_id, { path: "/", httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
  revalidatePath("/", "layout");
  return { orgName: data.org_name as string };
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

  revalidatePath("/app");
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

  revalidatePath("/app");
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
  revalidatePath("/app");
}

export async function addActivity(dealId: string, type: string, summary: string, author = "Você") {
  const orgId = await orgOrThrow();
  const supabase = createClient();
  const { error } = await supabase.from("activities").insert({ org_id: orgId, deal_id: dealId, type, summary, author });
  if (error) throw error;
  await supabase.from("deals").update({ last_touch: new Date().toISOString().slice(0, 10) }).eq("id", dealId);
  revalidatePath("/app");
}

// --- Agentes (Studio) ----------------------------------------------------

export async function updateAgent(uuid: string, fields: {
  instructions?: string; model?: string; enabled?: boolean; triggers?: string[]; temperature?: number;
}) {
  const { orgId } = await requireRole(["owner", "admin"]);
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
  revalidatePath("/app/studio");
}

// --- Automações ------------------------------------------------------------

export async function createAutomation(formData: FormData) {
  const { orgId } = await requireRole(["owner", "admin"]);
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
  revalidatePath("/app/automacoes");
}

export async function toggleAutomation(id: string, enabled: boolean) {
  await requireRole(["owner", "admin"]);
  const supabase = createClient();
  const { error } = await supabase.from("automations").update({ enabled }).eq("id", id);
  if (error) throw error;
  revalidatePath("/app/automacoes");
}

export async function deleteAutomation(id: string) {
  await requireRole(["owner", "admin"]);
  const supabase = createClient();
  const { error } = await supabase.from("automations").delete().eq("id", id);
  if (error) throw error;
  revalidatePath("/app/automacoes");
}

// --- Contratos -----------------------------------------------------------

export async function updateContractStatus(contractId: string, status: string) {
  await requireRole(["owner", "admin"]);
  const supabase = createClient();
  const { error } = await supabase
    .from("contracts")
    .update({ signature_status: status, updated_at: new Date().toISOString() })
    .eq("id", contractId);
  if (error) throw error;
  revalidatePath("/app/contracts");
  revalidatePath("/app");
}

export async function updateContractClauses(contractId: string, clauses: { heading: string; body: string }[]) {
  await requireRole(["owner", "admin"]);
  const supabase = createClient();
  const { error } = await supabase
    .from("contracts")
    .update({ clauses, updated_at: new Date().toISOString() })
    .eq("id", contractId);
  if (error) throw error;
  revalidatePath("/app/contracts");
}

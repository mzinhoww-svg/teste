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

// --- Notificações -----------------------------------------------------------

export async function markNotificationRead(id: string) {
  await orgOrThrow();
  const supabase = createClient();
  await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id);
  revalidatePath("/app/notifications");
  revalidatePath("/app");
}

export async function markAllNotificationsRead() {
  const orgId = await orgOrThrow();
  const supabase = createClient();
  await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("org_id", orgId).is("read_at", null);
  revalidatePath("/app/notifications");
  revalidatePath("/app");
}

/** Registra na timeline do deal que o WhatsApp foi ABERTO (não entregue). */
export async function logWhatsappOpened(dealId: string, templateKey: string) {
  const orgId = await orgOrThrow();
  const supabase = createClient();
  await supabase.from("activities").insert({
    org_id: orgId, deal_id: dealId, type: "whatsapp",
    summary: `WhatsApp aberto${templateKey ? ` (template: ${templateKey})` : ""}`, author: "Você",
  });
  await supabase.from("deals").update({ last_touch: new Date().toISOString().slice(0, 10) }).eq("id", dealId);
  revalidatePath("/app");
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
  const pipelineId = String(formData.get("pipelineId") ?? "").trim() || null;
  if (!name) throw new Error("Nome é obrigatório");

  // CRÍTICO multi-tenant: o funil DEVE pertencer à org ativa. Antes, a seleção
  // não filtrava por org e pegava o funil de menor posição entre TODAS as orgs
  // do usuário (RLS permite ver as orgs em que ele é membro), fazendo o lead
  // cair no funil de outra organização — o deal sumia dos dois quadros.
  let pipe: { id: string } | null = null;
  if (pipelineId) {
    const { data } = await supabase.from("pipelines").select("id").eq("id", pipelineId).eq("org_id", orgId).maybeSingle();
    pipe = data;
  }
  if (!pipe) {
    const { data } = await supabase.from("pipelines").select("id").eq("org_id", orgId).eq("archived", false).order("position").limit(1).maybeSingle();
    pipe = data;
  }
  if (!pipe) throw new Error("Nenhum funil configurado nesta organização");
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

  // Notificação in-app para estágios críticos
  const { data: st } = await supabase.from("stages").select("name,is_won,is_lost,key").eq("id", stageId).maybeSingle();
  if (st && (st.is_won || st.is_lost || ["proposta", "negociacao", "proposal", "negotiation"].includes(st.key ?? ""))) {
    const { data: dealRow } = await supabase.from("deals").select("title").eq("id", dealId).maybeSingle();
    await supabase.from("notifications").insert({
      org_id: orgId, type: st.is_won ? "deal_won" : st.is_lost ? "deal_lost" : "deal_stage",
      title: st.is_won ? "Deal fechado (ganho)" : st.is_lost ? "Deal perdido" : `Deal em ${st.name}`,
      body: `${dealRow?.title ?? "Deal"} entrou em "${st.name}".`, deal_id: dealId, action_url: "/app",
    });
  }

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

export async function updateDealFull(dealId: string, fields: {
  title?: string; amount?: number; engagement?: number; origin?: string;
  nextActionAt?: string | null; temperature?: string | null; productId?: string | null;
  lostReason?: string | null; tags?: string[];
}) {
  await orgOrThrow();
  const supabase = createClient();
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (fields.title !== undefined) patch.title = fields.title;
  if (fields.amount !== undefined) patch.amount = fields.amount;
  if (fields.engagement !== undefined) patch.engagement = fields.engagement;
  if (fields.origin !== undefined) patch.origin = fields.origin || null;
  if (fields.nextActionAt !== undefined) patch.next_action_at = fields.nextActionAt || null;
  if (fields.temperature !== undefined) patch.temperature = fields.temperature || null;
  if (fields.productId !== undefined) patch.product_id = fields.productId || null;
  if (fields.lostReason !== undefined) patch.lost_reason = fields.lostReason || null;
  if (fields.tags !== undefined) patch.tags = fields.tags;
  const { error } = await supabase.from("deals").update(patch).eq("id", dealId);
  if (error) throw error;
  const orgId = await getOrgId();
  await supabase.from("activities").insert({ org_id: orgId, deal_id: dealId, type: "note", summary: "Deal editado", author: "Você" });
  revalidatePath("/app");
}

export async function deleteDeal(dealId: string) {
  await requireRole(["owner", "admin"]);
  const supabase = createClient();
  const { error } = await supabase.from("deals").delete().eq("id", dealId);
  if (error) throw error;
  revalidatePath("/app");
}

// --- Contatos ---------------------------------------------------------------

export async function updateContact(contactId: string, fields: {
  name?: string; company?: string; email?: string; phone?: string;
  jobTitle?: string; city?: string; segment?: string; notes?: string; channel?: string;
}) {
  await orgOrThrow();
  // Telefone precisa funcionar no wa.me: normaliza e valida dígitos
  let phone: string | null | undefined = fields.phone;
  if (phone !== undefined) {
    const digits = phone.replace(/\D/g, "");
    if (phone && (digits.length < 10 || digits.length > 14)) {
      throw new Error("Telefone inválido para WhatsApp — use DDI+DDD+número (ex.: +55 65 99999-0000)");
    }
    phone = phone || null;
  }
  const supabase = createClient();
  const patch: Record<string, unknown> = {};
  if (fields.name !== undefined) patch.name = fields.name;
  if (fields.company !== undefined) patch.company = fields.company || null;
  if (fields.email !== undefined) patch.email = fields.email || null;
  if (phone !== undefined) patch.phone = phone;
  if (fields.jobTitle !== undefined) patch.job_title = fields.jobTitle || null;
  if (fields.city !== undefined) patch.city = fields.city || null;
  if (fields.segment !== undefined) patch.segment = fields.segment || null;
  if (fields.notes !== undefined) patch.notes = fields.notes || null;
  if (fields.channel !== undefined) patch.channel = fields.channel;
  const { error } = await supabase.from("contacts").update(patch).eq("id", contactId);
  if (error) throw error;
  revalidatePath("/app");
}

export async function deleteContact(contactId: string) {
  await requireRole(["owner", "admin"]);
  const supabase = createClient();
  const { error } = await supabase.from("contacts").delete().eq("id", contactId);
  if (error) throw error;
  revalidatePath("/app");
}

// --- Pipelines e estágios -----------------------------------------------------

export async function createPipeline(name: string) {
  const ctx = await requireRole(["owner", "admin"]);
  const supabase = createClient();
  const { data: max } = await supabase.from("pipelines").select("position").eq("org_id", ctx.orgId).order("position", { ascending: false }).limit(1).maybeSingle();
  const { data: pipe, error } = await supabase.from("pipelines")
    .insert({ org_id: ctx.orgId, name: name.trim() || "Novo funil", position: (max?.position ?? 0) + 1 })
    .select("id").single();
  if (error) throw error;
  // Estágios mínimos para o funil nascer utilizável
  await supabase.from("stages").insert([
    { org_id: ctx.orgId, pipeline_id: pipe.id, name: "Entrada", position: 0, accent: "#6366f1", key: "entrada", sla_days: 3 },
    { org_id: ctx.orgId, pipeline_id: pipe.id, name: "Em andamento", position: 1, accent: "#f59e0b", key: "andamento", sla_days: 5 },
    { org_id: ctx.orgId, pipeline_id: pipe.id, name: "Concluído", position: 2, accent: "#10b981", key: "won", is_won: true },
  ]);
  revalidatePath("/app/pipelines");
  revalidatePath("/app");
}

export async function renamePipeline(id: string, name: string) {
  await requireRole(["owner", "admin"]);
  const supabase = createClient();
  const { error } = await supabase.from("pipelines").update({ name: name.trim() }).eq("id", id);
  if (error) throw error;
  revalidatePath("/app/pipelines");
  revalidatePath("/app");
}

export async function archivePipeline(id: string, archived: boolean) {
  const ctx = await requireRole(["owner", "admin"]);
  const supabase = createClient();
  if (archived) {
    const { count } = await supabase.from("pipelines").select("id", { count: "exact", head: true }).eq("org_id", ctx.orgId).eq("archived", false);
    if ((count ?? 0) <= 1) throw new Error("A organização precisa de pelo menos um funil ativo");
  }
  const { error } = await supabase.from("pipelines").update({ archived }).eq("id", id);
  if (error) throw error;
  revalidatePath("/app/pipelines");
  revalidatePath("/app");
}

export async function saveStage(stageId: string | null, pipelineId: string, fields: {
  name: string; accent: string; slaDays: number | null; probability: number | null;
  isWon: boolean; isLost: boolean; position?: number;
}) {
  const ctx = await requireRole(["owner", "admin"]);
  const supabase = createClient();
  const row = {
    name: fields.name.trim(), accent: fields.accent, sla_days: fields.slaDays,
    probability: fields.probability, is_won: fields.isWon, is_lost: fields.isLost,
  };
  if (stageId) {
    const { error } = await supabase.from("stages").update(row).eq("id", stageId);
    if (error) throw error;
  } else {
    const { data: max } = await supabase.from("stages").select("position").eq("pipeline_id", pipelineId).order("position", { ascending: false }).limit(1).maybeSingle();
    const key = fields.name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").slice(0, 24) || "estagio";
    const { error } = await supabase.from("stages").insert({
      ...row, org_id: ctx.orgId, pipeline_id: pipelineId, position: (max?.position ?? 0) + 1, key,
    });
    if (error) throw error;
  }
  revalidatePath("/app/pipelines");
  revalidatePath("/app");
}

export async function moveStagePosition(stageId: string, direction: "up" | "down") {
  await requireRole(["owner", "admin"]);
  const supabase = createClient();
  const { data: st } = await supabase.from("stages").select("id, position, pipeline_id").eq("id", stageId).maybeSingle();
  if (!st) throw new Error("Estágio não encontrado");
  const targetPos = direction === "up" ? st.position - 1 : st.position + 1;
  const { data: other } = await supabase.from("stages").select("id, position").eq("pipeline_id", st.pipeline_id).eq("position", targetPos).maybeSingle();
  if (!other) return;
  await supabase.from("stages").update({ position: other.position }).eq("id", st.id);
  await supabase.from("stages").update({ position: st.position }).eq("id", other.id);
  revalidatePath("/app/pipelines");
  revalidatePath("/app");
}

export async function deleteStage(stageId: string, migrateToStageId?: string) {
  await requireRole(["owner", "admin"]);
  const supabase = createClient();
  const { count } = await supabase.from("deals").select("id", { count: "exact", head: true }).eq("stage_id", stageId);
  if ((count ?? 0) > 0) {
    if (!migrateToStageId) throw new Error(`Há ${count} deal(s) neste estágio — escolha para onde movê-los antes de remover`);
    const { error: mErr } = await supabase.from("deals").update({ stage_id: migrateToStageId }).eq("stage_id", stageId);
    if (mErr) throw mErr;
  }
  const { error } = await supabase.from("stages").delete().eq("id", stageId);
  if (error) throw error;
  revalidatePath("/app/pipelines");
  revalidatePath("/app");
}

// --- Agentes (Studio): override por tenant -------------------------------
// Só tem efeito quando ALLOW_TENANT_AGENT_OVERRIDES=true. O tenant passa a NÃO
// herdar o padrão da plataforma para aquele agente. Validado por papel e org.

export async function saveTenantAgentOverride(agentKey: string, fields: {
  prompt: string; model: string; triggers: string[]; active: boolean;
}) {
  const { orgId } = await requireRole(["owner", "admin"]);
  if (process.env.ALLOW_TENANT_AGENT_OVERRIDES !== "true") {
    throw new Error("Overrides por tenant estão desabilitados nesta instância");
  }
  const supabase = createClient();
  const { error } = await supabase.from("org_agent_settings").upsert({
    org_id: orgId, agent_key: agentKey, inherit_platform_default: false,
    override_prompt: fields.prompt, override_model: fields.model,
    override_triggers: fields.triggers, active: fields.active,
    updated_at: new Date().toISOString(),
  }, { onConflict: "org_id,agent_key" });
  if (error) throw error;
  revalidatePath("/app/studio");
}

export async function resetTenantAgentOverride(agentKey: string) {
  const { orgId } = await requireRole(["owner", "admin"]);
  const supabase = createClient();
  const { error } = await supabase.from("org_agent_settings")
    .update({ inherit_platform_default: true, updated_at: new Date().toISOString() })
    .eq("org_id", orgId).eq("agent_key", agentKey);
  if (error) throw error;
  revalidatePath("/app/studio");
}

// --- Enriquecimento de leads ------------------------------------------------

export async function enrichDeal(dealId: string) {
  const ctx = await requireRole(["owner", "admin", "member"]);
  const supabase = createClient();
  const { fetchCNPJ, recommendedSearches } = await import("@/lib/enrichment");

  const { data: deal } = await supabase
    .from("deals").select("id, custom, contact:contacts(id, name, company, custom)")
    .eq("id", dealId).eq("org_id", ctx.orgId).maybeSingle();
  if (!deal) throw new Error("Deal não encontrado");

  const contact: any = Array.isArray(deal.contact) ? deal.contact[0] : deal.contact;
  const custom: any = deal.custom ?? {};
  const cnpj = String(custom.cnpj ?? contact?.custom?.cnpj ?? "").trim();
  const company = contact?.company ?? null;
  const name = contact?.name ?? null;

  const facts = [
    ...(cnpj ? await fetchCNPJ(cnpj) : []),
    ...recommendedSearches(company, name),
  ];

  if (facts.length) {
    await supabase.from("lead_enrichment").insert(
      facts.map((f) => ({
        org_id: ctx.orgId, deal_id: dealId, contact_id: contact?.id ?? null, company_name: company,
        source_type: f.source_type, source_label: f.source_label, source_url: f.source_url,
        extracted_fact: f.extracted_fact, confidence: f.confidence, relevance: f.relevance,
        used_by_agent: null, created_by_user_id: ctx.userId,
      })),
    );
  }
  revalidatePath("/app");
  return {
    count: facts.length,
    hadCnpj: Boolean(cnpj),
    facts: facts.map((f) => ({ label: f.source_label, fact: f.extracted_fact, confidence: f.confidence, url: f.source_url })),
  };
}

// --- Onboarding ------------------------------------------------------------

export async function dismissOnboarding() {
  const { orgId } = await requireRole(["owner", "admin"]);
  const supabase = createClient();
  await supabase.from("onboarding_progress").upsert(
    { org_id: orgId, dismissed: true, updated_at: new Date().toISOString() },
    { onConflict: "org_id" },
  );
  revalidatePath("/app");
}

// --- Assinatura digital (OpenSign) ------------------------------------------

export async function sendContractForSignature(contractId: string) {
  const ctx = await requireRole(["owner", "admin"]);
  const supabase = createClient();
  const { getSignatureProvider } = await import("@/lib/signature/provider");

  const { data: c } = await supabase.from("contracts").select("*").eq("id", contractId).eq("org_id", ctx.orgId).maybeSingle();
  if (!c) throw new Error("Contrato não encontrado");

  const signers = (Array.isArray(c.signatories) ? c.signatories : []).map((s: any) => ({
    name: s.name, email: s.email, phone: s.phone,
  })).filter((s: any) => s.email);
  const body = (Array.isArray(c.clauses) ? c.clauses : [])
    .map((cl: any) => `${cl.heading}\n${cl.body}`).join("\n\n");

  const provider = getSignatureProvider();
  const env = await provider.createEnvelope({ title: c.title, body, signers, reference: c.reference });
  if (env.status === "erro") throw new Error(env.error ?? "Falha ao criar envelope de assinatura");

  await supabase.from("contracts").update({
    envelope_provider: env.provider, envelope_id: env.envelopeId, signing_url: env.signingUrl ?? null,
    external_status: "enviado", signature_status: "enviado", sent_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("id", contractId);

  // Modelo por-signatário: envelope + um signatário por parte, cada um com token
  // interno HASHEADO (o token em claro nunca é persistido). Idempotente: remove
  // signatários/envelope antigos deste contrato antes de recriar.
  const { createHash, randomBytes } = await import("crypto");
  await supabase.from("contract_signers").delete().eq("contract_id", contractId);
  await supabase.from("contract_signature_envelopes").delete().eq("contract_id", contractId);
  const { data: envelope } = await supabase.from("contract_signature_envelopes").insert({
    org_id: ctx.orgId, contract_id: contractId, provider: env.provider,
    provider_document_id: env.envelopeId, status: "sent", signing_url: env.signingUrl ?? null,
    sent_at: new Date().toISOString(),
  }).select("id").single();
  const signerRows = (Array.isArray(c.signatories) ? c.signatories : [])
    .filter((s: any) => s.email)
    .map((s: any, i: number) => ({
      org_id: ctx.orgId, contract_id: contractId, envelope_id: envelope?.id ?? null,
      name: s.name, email: s.email, phone: s.phone ?? null, role: "signer", signing_order: i + 1,
      internal_signing_token_hash: createHash("sha256").update(randomBytes(24)).digest("hex"),
      status: "sent",
    }));
  if (signerRows.length) await supabase.from("contract_signers").insert(signerRows);

  await supabase.from("notifications").insert({
    org_id: ctx.orgId, type: "contract", title: "Contrato enviado para assinatura",
    body: `${c.reference} — ${c.title} enviado via ${env.provider}.`, contract_id: contractId, deal_id: c.deal_id, action_url: "/app/contracts",
  });
  if (c.deal_id) {
    await supabase.from("activities").insert({
      org_id: ctx.orgId, deal_id: c.deal_id, type: "note",
      summary: `Contrato ${c.reference} enviado para assinatura (${env.provider})`, author: "Agente Jurídico",
    });
  }
  revalidatePath("/app/contracts");
  return { signingUrl: env.signingUrl as string | undefined };
}

export async function refreshContractStatus(contractId: string) {
  const ctx = await requireRole(["owner", "admin"]);
  const supabase = createClient();
  const { getSignatureProvider } = await import("@/lib/signature/provider");

  const { data: c } = await supabase.from("contracts").select("envelope_id").eq("id", contractId).eq("org_id", ctx.orgId).maybeSingle();
  if (!c?.envelope_id) throw new Error("Contrato ainda não foi enviado para assinatura");

  const provider = getSignatureProvider();
  const st = await provider.getStatus(c.envelope_id);
  const localMap: Record<string, string> = { enviado: "enviado", visualizado: "enviado", assinado: "assinado", recusado: "cancelado", expirado: "cancelado", erro: "enviado" };
  const now = new Date().toISOString();
  await supabase.from("contracts").update({
    external_status: st.status, signature_status: localMap[st.status] ?? "enviado",
    certificate_url: st.certificateUrl ?? null,
    signed_at: st.status === "assinado" ? now : null,
    updated_at: now,
  }).eq("id", contractId);
  const envStatus = st.status === "assinado" ? "completed" : st.status === "recusado" ? "declined" : st.status === "expirado" ? "expired" : "sent";
  await supabase.from("contract_signature_envelopes").update({
    status: envStatus, certificate_url: st.certificateUrl ?? null,
    completed_at: st.status === "assinado" ? now : null, updated_at: now,
  }).eq("contract_id", contractId);
  if (st.status === "assinado") {
    await supabase.from("contract_signers").update({ status: "signed", signed_at: now, updated_at: now }).eq("contract_id", contractId);
  }
  revalidatePath("/app/contracts");
  return { status: st.status };
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

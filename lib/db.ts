import "server-only";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import type { Activity, Agent, Contact, Deal, Pipeline, Stage } from "./types";

export const ACTIVE_ORG_COOKIE = "active_org";

// ==========================================================================
// Camada de acesso a dados. Toda query roda sob a sessão do usuário; a RLS do
// Postgres garante que só dados da org dele voltem.
// ==========================================================================

export type MemberRole = "owner" | "admin" | "member";

export interface OrgMembership {
  orgId: string;
  orgName: string;
  role: MemberRole;
}

export interface OrgBrand {
  primary?: string;
  accent?: string;
  logoUrl?: string;
}

export interface AuthContext {
  userId: string;
  email: string;
  orgId: string;
  orgName: string;
  role: MemberRole;
  brand: OrgBrand;
  memberships: OrgMembership[];
}

/**
 * Contexto de autenticação + tenant ativo.
 * A org ativa vem do cookie `active_org`, SEMPRE validado contra as
 * memberships reais do usuário — cookie inválido/alheio cai no fallback
 * (primeira org por ordem de criação). Nunca confia no cookie às cegas.
 */
export async function getAuthContext(): Promise<AuthContext | null> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: rows } = await supabase
    .from("memberships")
    .select("org_id, member_role, created_at, orgs(name, settings)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  const memberships: OrgMembership[] = (rows ?? []).map((r: any) => ({
    orgId: r.org_id,
    orgName: r.orgs?.name ?? "Organização",
    role: (r.member_role ?? "member") as MemberRole,
  }));
  const brandByOrg = new Map<string, OrgBrand>((rows ?? []).map((r: any) => [r.org_id, {
    primary: r.orgs?.settings?.brand?.primary,
    accent: r.orgs?.settings?.brand?.accent,
    logoUrl: r.orgs?.settings?.brand?.logoUrl,
  }]));
  if (memberships.length === 0) {
    // Usuário logado sem organização (trigger de signup falhou ou foi removido).
    return {
      userId: user.id, email: user.email ?? "", orgId: "", orgName: "",
      role: "member", brand: {}, memberships: [],
    };
  }

  const wanted = cookies().get(ACTIVE_ORG_COOKIE)?.value;
  const active = memberships.find((m) => m.orgId === wanted) ?? memberships[0];

  return {
    userId: user.id,
    email: user.email ?? "",
    orgId: active.orgId,
    orgName: active.orgName,
    role: active.role,
    brand: brandByOrg.get(active.orgId) ?? {},
    memberships,
  };
}

export async function getOrgId(): Promise<string | null> {
  const ctx = await getAuthContext();
  return ctx?.orgId || null;
}

// --- Mappers (row snake_case -> domínio camelCase) -----------------------

function mapStage(r: any): Stage {
  return { id: r.id, name: r.name, order: r.position, accent: r.accent };
}

function mapContact(r: any): Contact {
  return {
    id: r.id, name: r.name, email: r.email ?? "", phone: r.phone ?? undefined,
    company: r.company ?? "", role: r.job_title ?? undefined, channel: r.channel,
  };
}

function mapActivity(r: any): Activity {
  return { id: r.id, at: (r.created_at ?? "").slice(0, 10), type: r.type, summary: r.summary, author: r.author ?? "", dueAt: r.due_at ?? null, doneAt: r.done_at ?? null };
}

function mapDeal(r: any, stageKeyById: Map<string, string>): Deal {
  return {
    id: r.id, title: r.title, pipelineId: r.pipeline_id, stageId: r.stage_id,
    stageKey: stageKeyById.get(r.stage_id) ?? "", contactId: r.contact_id ?? "",
    amount: Number(r.amount), score: r.score ?? undefined, scoreReason: r.score_reason ?? undefined,
    temperature: r.temperature ?? undefined, engagement: r.engagement ?? 0,
    lastTouch: r.last_touch ?? "", activities: [], tags: r.tags ?? [],
    origin: r.origin ?? undefined, nextActionAt: r.next_action_at ?? undefined,
    productId: r.product_id ?? undefined, lostReason: r.lost_reason ?? undefined,
    probability: r.probability ?? undefined, custom: r.custom ?? {},
  };
}

export function mapAgent(r: any): Agent {
  return {
    id: r.kind, uuid: r.id, name: r.name, group: r.funnel_group, role: r.agent_role,
    description: r.description, pains: r.pains ?? [], automatedActivities: r.automated_activities ?? [],
    instructions: r.instructions, enabled: r.enabled, triggers: r.triggers ?? [],
    model: r.model, runnable: r.runnable,
  };
}

// --- Leituras ------------------------------------------------------------

export interface PipelineListItem { id: string; name: string; archived: boolean }

export async function getPipelines(includeArchived = false): Promise<PipelineListItem[]> {
  const supabase = createClient();
  const orgId = await getOrgId();
  if (!orgId) return [];
  let q = supabase.from("pipelines").select("id,name,archived").eq("org_id", orgId).order("position");
  if (!includeArchived) q = q.eq("archived", false);
  const { data } = await q;
  return (data ?? []) as PipelineListItem[];
}

export interface ProductListItem { id: string; name: string; price: number | null }

export async function getProducts(): Promise<ProductListItem[]> {
  const supabase = createClient();
  const orgId = await getOrgId();
  if (!orgId) return [];
  const { data } = await supabase.from("products").select("id,name,price").eq("org_id", orgId).eq("active", true).order("position");
  return (data ?? []) as ProductListItem[];
}

export interface BoardData {
  pipeline: Pipeline | null;
  pipelines: PipelineListItem[];
  deals: Deal[];
  contacts: Contact[];
}

export async function getBoard(pipelineId?: string): Promise<BoardData> {
  const supabase = createClient();
  const orgId = await getOrgId();
  if (!orgId) return { pipeline: null, pipelines: [], deals: [], contacts: [] };
  const pipelines = await getPipelines();
  const pipe = (pipelineId && pipelines.find((p) => p.id === pipelineId))
    ? (await supabase.from("pipelines").select("*").eq("id", pipelineId).eq("org_id", orgId).maybeSingle()).data
    : (await supabase.from("pipelines").select("*").eq("org_id", orgId).eq("archived", false).order("position").limit(1)).data?.[0];
  if (!pipe) return { pipeline: null, pipelines, deals: [], contacts: [] };

  const { data: stageRows } = await supabase.from("stages").select("*").eq("pipeline_id", pipe.id).order("position");
  const stages = (stageRows ?? []).map(mapStage);
  const stageKeyById = new Map<string, string>((stageRows ?? []).map((s: any) => [s.id, s.key]));

  const { data: dealRows } = await supabase.from("deals").select("*").eq("pipeline_id", pipe.id).eq("org_id", orgId).order("created_at", { ascending: false });
  const { data: contactRows } = await supabase.from("contacts").select("*").eq("org_id", orgId).order("created_at", { ascending: false });

  const pipeline: Pipeline = { id: pipe.id, name: pipe.name, area: pipe.area, stages };
  return {
    pipeline,
    pipelines,
    deals: (dealRows ?? []).map((d: any) => mapDeal(d, stageKeyById)),
    contacts: (contactRows ?? []).map(mapContact),
  };
}

export interface DealFull {
  deal: Deal;
  contact: Contact | null;
}

export async function getDealFull(dealId: string): Promise<DealFull | null> {
  const supabase = createClient();
  const orgId = await getOrgId();
  if (!orgId) return null;
  const { data: d } = await supabase.from("deals").select("*").eq("id", dealId).eq("org_id", orgId).maybeSingle();
  if (!d) return null;

  const { data: stageRows } = await supabase.from("stages").select("id,key").eq("pipeline_id", d.pipeline_id);
  const stageKeyById = new Map<string, string>((stageRows ?? []).map((s: any) => [s.id, s.key]));

  const { data: acts } = await supabase.from("activities").select("*").eq("deal_id", dealId).order("created_at", { ascending: false });
  const deal = mapDeal(d, stageKeyById);
  deal.activities = (acts ?? []).map(mapActivity);

  let contact: Contact | null = null;
  if (d.contact_id) {
    const { data: c } = await supabase.from("contacts").select("*").eq("id", d.contact_id).maybeSingle();
    if (c) contact = mapContact(c);
  }
  return { deal, contact };
}

// Fonte ÚNICA de verdade da configuração de execução: a metadata rica (grupo,
// dores, descrição) vem da tabela agents, mas enabled/model/instructions/triggers
// vêm da resolução (padrão da plataforma → override do tenant). Assim, se o admin
// desativa um agente em /admin/agents, ele fica desativado em todo lugar.
export async function getAgents(): Promise<Agent[]> {
  const supabase = createClient();
  const orgId = await getOrgId();
  if (!orgId) return [];
  const { resolveAllAgents } = await import("@/lib/agents/resolve");
  const [{ data }, resolved] = await Promise.all([
    supabase.from("agents").select("*").eq("org_id", orgId).order("position"),
    resolveAllAgents(orgId),
  ]);
  const byKind = new Map(resolved.map((r) => [r.kind, r]));
  return (data ?? []).map((row: any) => {
    const a = mapAgent(row);
    const r = byKind.get(a.id);
    if (!r) return a;
    return { ...a, enabled: r.active, model: r.model, triggers: r.triggers, instructions: r.prompt };
  });
}

export async function getAgentByKind(kind: string): Promise<Agent | null> {
  const supabase = createClient();
  const orgId = await getOrgId();
  if (!orgId) return null;
  const { data } = await supabase.from("agents").select("*").eq("kind", kind).eq("org_id", orgId).maybeSingle();
  if (!data) return null;
  const a = mapAgent(data);
  const { resolveAgentByKind } = await import("@/lib/agents/resolve");
  const r = await resolveAgentByKind(kind, orgId);
  if (r) { a.enabled = r.active; a.model = r.model; a.triggers = r.triggers; a.instructions = r.prompt; }
  return a;
}

export interface AutomationView {
  id: string;
  name: string;
  stageId: string;
  stageName: string;
  agentKind: string;
  agentName: string;
  enabled: boolean;
}

export async function getAutomations(): Promise<AutomationView[]> {
  const supabase = createClient();
  const orgId = await getOrgId();
  if (!orgId) return [];
  const { data } = await supabase
    .from("automations")
    .select("*, stage:stages(name)")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });
  const agents = await getAgents();
  const nameByKind = new Map(agents.map((a) => [a.id, a.name]));
  return (data ?? []).map((r: any) => ({
    id: r.id, name: r.name, stageId: r.trigger_stage_id,
    stageName: r.stage?.name ?? "—", agentKind: r.agent_kind ?? "",
    agentName: nameByKind.get(r.agent_kind) ?? r.agent_kind ?? "—",
    enabled: r.enabled,
  }));
}

export interface ContractView {
  id: string;
  reference: string;
  title: string;
  value: number;
  status: string;
  provider: string | null;
  clauses: { heading: string; body: string }[];
  signatories: { name: string; role: string; party: string; email: string }[];
  dealTitle: string;
  company: string;
  createdAt: string;
  dealId: string | null;
  envelopeId: string | null;
  externalStatus: string | null;
  signingUrl: string | null;
  certificateUrl: string | null;
  contactPhone: string | null;
  contactName: string | null;
  signToken: string | null;
  signedAt: string | null;
  signers: { name: string; email: string | null; status: string }[];
}

export async function getContracts(): Promise<ContractView[]> {
  const supabase = createClient();
  const orgId = await getOrgId();
  if (!orgId) return [];
  const { data } = await supabase
    .from("contracts")
    .select("*, deal:deals(title, contact:contacts(name, company, phone)), signers:contract_signers(name, email, status)")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });
  return (data ?? []).map((r: any) => ({
    id: r.id, reference: r.reference, title: r.title, value: Number(r.value),
    status: r.signature_status, provider: r.signature_provider,
    clauses: r.clauses ?? [], signatories: r.signatories ?? [],
    dealTitle: r.deal?.title ?? "—", company: r.deal?.contact?.company ?? r.deal?.contact?.name ?? "—",
    createdAt: (r.created_at ?? "").slice(0, 10),
    dealId: r.deal_id ?? null, envelopeId: r.envelope_id ?? null, externalStatus: r.external_status ?? null,
    signingUrl: r.signing_url ?? null, certificateUrl: r.certificate_url ?? null,
    contactPhone: r.deal?.contact?.phone ?? null, contactName: r.deal?.contact?.name ?? null,
    signToken: r.sign_token ?? null, signedAt: r.signed_at ?? null,
    signers: (r.signers ?? []).map((s: any) => ({ name: s.name, email: s.email ?? null, status: s.status })),
  }));
}

export interface NotificationRow {
  id: string; type: string; title: string; body: string;
  action_url: string | null; deal_id: string | null; read_at: string | null; created_at: string;
  metadata: any;
}

export async function getNotifications(limit = 50): Promise<NotificationRow[]> {
  const supabase = createClient();
  const ctx = await getAuthContext();
  if (!ctx?.orgId) return [];
  // Notificações da org direcionadas ao usuário OU gerais (user_id null)
  const { data } = await supabase
    .from("notifications")
    .select("id,type,title,body,action_url,deal_id,read_at,created_at,user_id,metadata")
    .eq("org_id", ctx.orgId)
    .or(`user_id.is.null,user_id.eq.${ctx.userId}`)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as NotificationRow[];
}

export async function getUnreadCount(): Promise<number> {
  const supabase = createClient();
  const ctx = await getAuthContext();
  if (!ctx?.orgId) return 0;
  const { count } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("org_id", ctx.orgId)
    .is("read_at", null)
    .or(`user_id.is.null,user_id.eq.${ctx.userId}`);
  return count ?? 0;
}

// --- Enriquecimento de leads ------------------------------------------------

export interface EnrichmentRow {
  id: string; sourceLabel: string; sourceUrl: string | null; fact: string;
  confidence: string; relevance: string; createdAt: string;
}

export async function getLeadEnrichment(dealId: string): Promise<EnrichmentRow[]> {
  const supabase = createClient();
  const orgId = await getOrgId();
  if (!orgId) return [];
  const { data } = await supabase
    .from("lead_enrichment")
    .select("id, source_label, source_url, extracted_fact, confidence, relevance, created_at")
    .eq("org_id", orgId).eq("deal_id", dealId)
    .order("created_at", { ascending: false })
    .limit(40);
  return (data ?? []).map((r: any) => ({
    id: r.id, sourceLabel: r.source_label, sourceUrl: r.source_url, fact: r.extracted_fact,
    confidence: r.confidence, relevance: r.relevance, createdAt: r.created_at,
  }));
}

// --- Onboarding guiado ------------------------------------------------------

export interface OnboardingState {
  dismissed: boolean;
  steps: {
    key: string; label: string; done: boolean; href: string;
  }[];
  doneCount: number;
  total: number;
}

/**
 * Calcula o progresso de onboarding derivando o estado real do banco
 * (pipeline, deal, execução de agente, contrato, membro convidado, agente
 * editado). O estado é computado, não confiado só em flags.
 */
export async function getOnboarding(): Promise<OnboardingState | null> {
  const supabase = createClient();
  const ctx = await getAuthContext();
  if (!ctx?.orgId) return null;
  const org = ctx.orgId;

  const [prog, deals, runs, contracts, invites, versions] = await Promise.all([
    supabase.from("onboarding_progress").select("dismissed").eq("org_id", org).maybeSingle(),
    supabase.from("deals").select("id", { count: "exact", head: true }).eq("org_id", org),
    supabase.from("agent_runs").select("id", { count: "exact", head: true }).eq("org_id", org),
    supabase.from("contracts").select("id", { count: "exact", head: true }).eq("org_id", org),
    supabase.from("memberships").select("id", { count: "exact", head: true }).eq("org_id", org),
    supabase.from("agent_versions").select("id", { count: "exact", head: true }).eq("org_id", org),
  ]);

  const steps = [
    { key: "brand", label: "Personalizar marca e organização", done: Boolean(ctx.orgName), href: "/app/org" },
    { key: "deal", label: "Criar seu primeiro negócio no funil", done: (deals.count ?? 0) > 0, href: "/app" },
    { key: "agent", label: "Executar um agente de IA em um negócio", done: (runs.count ?? 0) > 0, href: "/app" },
    { key: "studio", label: "Ajustar um agente no Studio", done: (versions.count ?? 0) > 0, href: "/app/studio" },
    { key: "contract", label: "Gerar um contrato", done: (contracts.count ?? 0) > 0, href: "/app/contracts" },
    { key: "team", label: "Convidar um membro para o time", done: (invites.count ?? 0) > 1, href: "/app/org" },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  return {
    dismissed: Boolean(prog.data?.dismissed),
    steps, doneCount, total: steps.length,
  };
}

// ==========================================================================
// Portal do Cliente + Financeiro (Fase 4/5) — leituras escopadas por org (RLS
// + .eq('org_id') de defesa em profundidade). Ver migration 0010.
// ==========================================================================

export interface ClientAccountRow {
  id: string; slug: string; name: string; portal_enabled: boolean;
  cnpj: string | null; notes: string | null; brand: any; created_at: string;
  deals: number; invoices: number; users: number;
}

export async function getClientAccounts(): Promise<ClientAccountRow[]> {
  const supabase = createClient();
  const orgId = await getOrgId();
  if (!orgId) return [];
  const { data } = await supabase
    .from("client_accounts")
    .select("id,slug,name,portal_enabled,cnpj,notes,brand,created_at")
    .eq("org_id", orgId)
    .order("name");
  const accounts = data ?? [];
  if (accounts.length === 0) return [];
  const ids = accounts.map((a: any) => a.id);
  const [{ data: deals }, { data: invoices }, { data: users }] = await Promise.all([
    supabase.from("deals").select("client_account_id").eq("org_id", orgId).in("client_account_id", ids),
    supabase.from("invoices").select("client_account_id").eq("org_id", orgId).in("client_account_id", ids),
    supabase.from("client_users").select("client_account_id").eq("org_id", orgId).in("client_account_id", ids),
  ]);
  const count = (rows: any[] | null, id: string) => (rows ?? []).filter((r) => r.client_account_id === id).length;
  return accounts.map((a: any) => ({
    ...a,
    deals: count(deals, a.id), invoices: count(invoices, a.id), users: count(users, a.id),
  })) as ClientAccountRow[];
}

export interface ClientAccount360 {
  account: { id: string; name: string; slug: string; cnpj: string | null; notes: string | null; portal_enabled: boolean };
  deals: { id: string; title: string; amount: number; stage: string }[];
  contacts: { id: string; name: string; email: string | null; phone: string | null; job_title: string | null }[];
  invoices: { id: string; number: string | null; amount: number; status: string; due_date: string | null }[];
  projects: { id: string; name: string; status: string; due_date: string | null }[];
  deliverables: { id: string; title: string; type: string; status: string; url: string | null }[];
  totals: { pipeline: number; recebido: number; aReceber: number };
}

/** Visão 360° de uma conta de cliente (Empresa): deals, contatos, financeiro, entregas. */
export async function getClientAccount360(id: string): Promise<ClientAccount360 | null> {
  const supabase = createClient();
  const orgId = await getOrgId();
  if (!orgId) return null;
  const { data: account } = await supabase
    .from("client_accounts")
    .select("id,name,slug,cnpj,notes,portal_enabled")
    .eq("org_id", orgId).eq("id", id).maybeSingle();
  if (!account) return null;

  const [{ data: deals }, { data: contacts }, { data: invoices }, { data: projects }, { data: deliverables }] = await Promise.all([
    supabase.from("deals").select("id,title,amount,stages(name)").eq("org_id", orgId).eq("client_account_id", id).order("created_at", { ascending: false }),
    supabase.from("contacts").select("id,name,email,phone,job_title").eq("org_id", orgId).eq("client_account_id", id).order("name"),
    supabase.from("invoices").select("id,number,amount,status,due_date").eq("org_id", orgId).eq("client_account_id", id).order("issue_date", { ascending: false }),
    supabase.from("projects").select("id,name,status,due_date").eq("org_id", orgId).eq("client_account_id", id).order("created_at", { ascending: false }),
    supabase.from("deliverables").select("id,title,type,status,url").eq("org_id", orgId).eq("client_account_id", id).order("created_at", { ascending: false }),
  ]);

  const invs = (invoices ?? []).map((i: any) => ({ ...i, amount: Number(i.amount) }));
  return {
    account: account as any,
    deals: (deals ?? []).map((d: any) => ({ id: d.id, title: d.title, amount: Number(d.amount), stage: d.stages?.name ?? "—" })),
    contacts: (contacts ?? []) as any,
    invoices: invs as any,
    projects: (projects ?? []) as any,
    deliverables: (deliverables ?? []) as any,
    totals: {
      pipeline: (deals ?? []).reduce((s: number, d: any) => s + Number(d.amount), 0),
      recebido: invs.filter((i) => i.status === "paga").reduce((s, i) => s + i.amount, 0),
      aReceber: invs.filter((i) => i.status === "enviada" || i.status === "vencida").reduce((s, i) => s + i.amount, 0),
    },
  };
}

export interface ClientOption { id: string; name: string; slug: string }
export async function getClientOptions(): Promise<ClientOption[]> {
  const supabase = createClient();
  const orgId = await getOrgId();
  if (!orgId) return [];
  const { data } = await supabase.from("client_accounts").select("id,name,slug").eq("org_id", orgId).order("name");
  return (data ?? []) as ClientOption[];
}

export interface InvoiceRow {
  id: string; number: string | null; description: string; amount: number; currency: string;
  status: string; issue_date: string; due_date: string | null; paid_at: string | null;
  payment_link: string | null; recurring: boolean; client_account_id: string; client_name: string;
}

export async function getInvoices(): Promise<InvoiceRow[]> {
  const supabase = createClient();
  const orgId = await getOrgId();
  if (!orgId) return [];
  const { data } = await supabase
    .from("invoices")
    .select("id,number,description,amount,currency,status,issue_date,due_date,paid_at,payment_link,recurring,client_account_id,client_accounts(name)")
    .eq("org_id", orgId)
    .order("issue_date", { ascending: false });
  return (data ?? []).map((r: any) => ({ ...r, amount: Number(r.amount), client_name: r.client_accounts?.name ?? "—" })) as InvoiceRow[];
}

export interface ProjectRow {
  id: string; name: string; status: string; start_date: string | null; due_date: string | null;
  description: string; client_account_id: string; client_name: string;
}

export async function getProjects(): Promise<ProjectRow[]> {
  const supabase = createClient();
  const orgId = await getOrgId();
  if (!orgId) return [];
  const { data } = await supabase
    .from("projects")
    .select("id,name,status,start_date,due_date,description,client_account_id,client_accounts(name)")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });
  return (data ?? []).map((r: any) => ({ ...r, client_name: r.client_accounts?.name ?? "—" })) as ProjectRow[];
}

export interface DeliverableRow {
  id: string; type: string; title: string; url: string | null; status: string;
  delivered_at: string | null; description: string; client_account_id: string;
  client_name: string; project_name: string | null;
}

export async function getDeliverables(): Promise<DeliverableRow[]> {
  const supabase = createClient();
  const orgId = await getOrgId();
  if (!orgId) return [];
  const { data } = await supabase
    .from("deliverables")
    .select("id,type,title,url,status,delivered_at,description,client_account_id,client_accounts(name),projects(name)")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });
  return (data ?? []).map((r: any) => ({ ...r, client_name: r.client_accounts?.name ?? "—", project_name: r.projects?.name ?? null })) as DeliverableRow[];
}

export interface ContactListRow {
  id: string; name: string; email: string | null; phone: string | null;
  company: string | null; job_title: string | null; city: string | null; client_account_id: string | null;
}

export async function getContactsList(q?: string): Promise<ContactListRow[]> {
  const supabase = createClient();
  const orgId = await getOrgId();
  if (!orgId) return [];
  let query = supabase
    .from("contacts")
    .select("id,name,email,phone,company,job_title,city,client_account_id")
    .eq("org_id", orgId)
    .order("name")
    .limit(500);
  if (q && q.trim()) {
    const term = `%${q.trim()}%`;
    query = query.or(`name.ilike.${term},company.ilike.${term},email.ilike.${term}`);
  }
  const { data } = await query;
  return (data ?? []) as ContactListRow[];
}

export interface TaskRow {
  id: string; summary: string; type: string; due_at: string | null; author: string | null;
  deal_id: string | null; deal_title: string | null;
}

/** Tarefas abertas (activities com prazo e sem conclusão) — a fila "Meu dia". */
export async function getOpenTasks(): Promise<TaskRow[]> {
  const supabase = createClient();
  const orgId = await getOrgId();
  if (!orgId) return [];
  const { data } = await supabase
    .from("activities")
    .select("id,summary,type,due_at,author,deal_id,deals(title)")
    .eq("org_id", orgId)
    .not("due_at", "is", null)
    .is("done_at", null)
    .order("due_at", { ascending: true })
    .limit(200);
  return (data ?? []).map((r: any) => ({
    id: r.id, summary: r.summary, type: r.type, due_at: r.due_at, author: r.author,
    deal_id: r.deal_id, deal_title: r.deals?.title ?? null,
  })) as TaskRow[];
}

export interface ClientInviteRow { id: string; email: string; token: string; status: string; client_account_id: string; client_name: string }
export async function getClientInvites(): Promise<ClientInviteRow[]> {
  const supabase = createClient();
  const orgId = await getOrgId();
  if (!orgId) return [];
  const { data } = await supabase
    .from("client_invites")
    .select("id,email,token,status,client_account_id,client_accounts(name)")
    .eq("org_id", orgId).eq("status", "pending").order("created_at", { ascending: false });
  return (data ?? []).map((r: any) => ({ ...r, client_name: r.client_accounts?.name ?? "—" })) as ClientInviteRow[];
}

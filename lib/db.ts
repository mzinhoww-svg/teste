import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Activity, Agent, Contact, Deal, Pipeline, Stage } from "./types";

// ==========================================================================
// Camada de acesso a dados. Toda query roda sob a sessão do usuário; a RLS do
// Postgres garante que só dados da org dele voltem.
// ==========================================================================

export async function getAuthContext(): Promise<{ userId: string; orgId: string } | null> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("memberships")
    .select("org_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();
  if (!data?.org_id) return null;
  return { userId: user.id, orgId: data.org_id };
}

export async function getOrgId(): Promise<string | null> {
  return (await getAuthContext())?.orgId ?? null;
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
  return { id: r.id, at: (r.created_at ?? "").slice(0, 10), type: r.type, summary: r.summary, author: r.author ?? "" };
}

function mapDeal(r: any, stageKeyById: Map<string, string>): Deal {
  return {
    id: r.id, title: r.title, pipelineId: r.pipeline_id, stageId: r.stage_id,
    stageKey: stageKeyById.get(r.stage_id) ?? "", contactId: r.contact_id ?? "",
    amount: Number(r.amount), score: r.score ?? undefined, scoreReason: r.score_reason ?? undefined,
    temperature: r.temperature ?? undefined, engagement: r.engagement ?? 0,
    lastTouch: r.last_touch ?? "", activities: [], tags: r.tags ?? [],
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

export interface BoardData {
  pipeline: Pipeline | null;
  deals: Deal[];
  contacts: Contact[];
}

export async function getBoard(): Promise<BoardData> {
  const supabase = createClient();
  const { data: pipes } = await supabase.from("pipelines").select("*").order("position").limit(1);
  const pipe = pipes?.[0];
  if (!pipe) return { pipeline: null, deals: [], contacts: [] };

  const { data: stageRows } = await supabase.from("stages").select("*").eq("pipeline_id", pipe.id).order("position");
  const stages = (stageRows ?? []).map(mapStage);
  const stageKeyById = new Map<string, string>((stageRows ?? []).map((s: any) => [s.id, s.key]));

  const { data: dealRows } = await supabase.from("deals").select("*").eq("pipeline_id", pipe.id).order("created_at", { ascending: false });
  const { data: contactRows } = await supabase.from("contacts").select("*").order("created_at", { ascending: false });

  const pipeline: Pipeline = { id: pipe.id, name: pipe.name, area: pipe.area, stages };
  return {
    pipeline,
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
  const { data: d } = await supabase.from("deals").select("*").eq("id", dealId).maybeSingle();
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

export async function getAgents(): Promise<Agent[]> {
  const supabase = createClient();
  const { data } = await supabase.from("agents").select("*").order("position");
  return (data ?? []).map(mapAgent);
}

export async function getAgentByKind(kind: string): Promise<Agent | null> {
  const supabase = createClient();
  const { data } = await supabase.from("agents").select("*").eq("kind", kind).maybeSingle();
  return data ? mapAgent(data) : null;
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
  const { data } = await supabase
    .from("automations")
    .select("*, stage:stages(name)")
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
}

export async function getContracts(): Promise<ContractView[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("contracts")
    .select("*, deal:deals(title, contact:contacts(name, company))")
    .order("created_at", { ascending: false });
  return (data ?? []).map((r: any) => ({
    id: r.id, reference: r.reference, title: r.title, value: Number(r.value),
    status: r.signature_status, provider: r.signature_provider,
    clauses: r.clauses ?? [], signatories: r.signatories ?? [],
    dealTitle: r.deal?.title ?? "—", company: r.deal?.contact?.company ?? r.deal?.contact?.name ?? "—",
    createdAt: (r.created_at ?? "").slice(0, 10),
  }));
}

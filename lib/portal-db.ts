import "server-only";
import { createClient } from "@/lib/supabase/server";

// Camada de dados do PORTAL DO CLIENTE. Paralela a lib/db.ts (getAuthContext),
// mas resolve o contexto por client_users (NÃO memberships). A RLS de cliente
// (is_client_user) já garante o isolamento; aqui filtramos pelo client_account
// do contexto por clareza e defesa em profundidade. Ver migration 0010.

export interface PortalContext {
  userId: string;
  email: string;
  clientAccountId: string;
  slug: string;
  name: string;
  orgId: string;
  brand: { primary?: string; accent?: string };
}

// Resolve o cliente ativo pelo slug do path e valida que o usuário logado
// pertence a ele. Retorna null se não for usuário-portal daquele cliente.
export async function getPortalContext(slug: string): Promise<PortalContext | null> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("client_users")
    .select("client_account_id, org_id, client_accounts(id, slug, name, brand)")
    .eq("user_id", user.id)
    .eq("status", "active");

  const row = (data ?? []).find((r: any) => r.client_accounts?.slug === slug);
  if (!row) return null;
  const ca: any = row.client_accounts;
  return {
    userId: user.id,
    email: user.email ?? "",
    clientAccountId: ca.id,
    slug: ca.slug,
    name: ca.name,
    orgId: row.org_id,
    brand: { primary: ca.brand?.primary, accent: ca.brand?.accent },
  };
}

async function dealIdsFor(clientAccountId: string): Promise<string[]> {
  const supabase = createClient();
  const { data } = await supabase.from("deals").select("id").eq("client_account_id", clientAccountId);
  return (data ?? []).map((d: any) => d.id);
}

export async function getPortalDeals(clientAccountId: string) {
  const supabase = createClient();
  const { data } = await supabase
    .from("deals")
    .select("id,title,amount,stage_id,temperature,next_action_at")
    .eq("client_account_id", clientAccountId)
    .order("created_at", { ascending: false });
  return (data ?? []).map((d: any) => ({ ...d, amount: Number(d.amount) }));
}

export async function getPortalProposals(clientAccountId: string) {
  const ids = await dealIdsFor(clientAccountId);
  if (ids.length === 0) return [];
  const supabase = createClient();
  const { data } = await supabase
    .from("proposals")
    .select("id,deal_id,share_token,total,created_at")
    .in("deal_id", ids)
    .order("created_at", { ascending: false });
  return (data ?? []).map((p: any) => ({ ...p, total: p.total == null ? null : Number(p.total) }));
}

export async function getPortalContracts(clientAccountId: string) {
  const ids = await dealIdsFor(clientAccountId);
  if (ids.length === 0) return [];
  const supabase = createClient();
  const { data } = await supabase
    .from("contracts")
    .select("id,deal_id,sign_token,title,external_status,created_at")
    .in("deal_id", ids)
    .order("created_at", { ascending: false });
  return data ?? [];
}

export async function getPortalInvoices(clientAccountId: string) {
  const supabase = createClient();
  const { data } = await supabase
    .from("invoices")
    .select("id,number,description,amount,currency,status,issue_date,due_date,payment_link,recurring")
    .eq("client_account_id", clientAccountId)
    .order("issue_date", { ascending: false });
  return (data ?? []).map((i: any) => ({ ...i, amount: Number(i.amount) }));
}

export async function getPortalProjects(clientAccountId: string) {
  const supabase = createClient();
  const { data } = await supabase
    .from("projects")
    .select("id,name,status,start_date,due_date,description")
    .eq("client_account_id", clientAccountId)
    .order("created_at", { ascending: false });
  return data ?? [];
}

export async function getPortalDeliverables(clientAccountId: string) {
  const supabase = createClient();
  const { data } = await supabase
    .from("deliverables")
    .select("id,type,title,url,status,delivered_at,description,projects(name)")
    .eq("client_account_id", clientAccountId)
    .order("created_at", { ascending: false });
  return (data ?? []).map((d: any) => ({ ...d, project_name: d.projects?.name ?? null }));
}

"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/db";

// Ações do lado AGÊNCIA (CRM) para Clientes, Financeiro, Projetos e Entregas.
// Todas exigem papel owner/admin/member e escopam por org (RLS + org_id).
async function requireOrg(allowed: Array<"owner" | "admin" | "member"> = ["owner", "admin", "member"]) {
  const ctx = await getAuthContext();
  if (!ctx?.orgId) throw new Error("Sem organização / não autenticado");
  if (!allowed.includes(ctx.role)) throw new Error("Permissão insuficiente");
  return ctx;
}

function slugify(s: string) {
  return s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

// ---- Clientes -------------------------------------------------------------
export async function createClientAccount(formData: FormData) {
  const ctx = await requireOrg(["owner", "admin"]);
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Nome obrigatório");
  const slug = slugify(String(formData.get("slug") ?? "") || name);
  const supabase = createClient();
  const { error } = await supabase.from("client_accounts").insert({
    org_id: ctx.orgId, name, slug,
    cnpj: String(formData.get("cnpj") ?? "") || null,
    notes: String(formData.get("notes") ?? "") || null,
  });
  if (error) throw error;
  revalidatePath("/app/clientes");
}

export async function updateClientAccount(id: string, formData: FormData) {
  await requireOrg(["owner", "admin"]);
  const supabase = createClient();
  const patch: Record<string, unknown> = {};
  if (formData.has("name")) patch.name = String(formData.get("name")).trim();
  if (formData.has("slug")) patch.slug = slugify(String(formData.get("slug")));
  if (formData.has("cnpj")) patch.cnpj = String(formData.get("cnpj")) || null;
  if (formData.has("notes")) patch.notes = String(formData.get("notes")) || null;
  const { error } = await supabase.from("client_accounts").update(patch).eq("id", id);
  if (error) throw error;
  revalidatePath("/app/clientes");
}

export async function toggleClientPortal(id: string, enabled: boolean) {
  await requireOrg(["owner", "admin"]);
  const supabase = createClient();
  const { error } = await supabase.from("client_accounts").update({ portal_enabled: enabled }).eq("id", id);
  if (error) throw error;
  revalidatePath("/app/clientes");
}

// Gera link de convite do portal (espelha createInvite). Retorna o token.
export async function createClientInvite(formData: FormData) {
  const ctx = await requireOrg(["owner", "admin"]);
  const clientAccountId = String(formData.get("clientAccountId") ?? "");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!clientAccountId) throw new Error("Cliente obrigatório");
  if (!email.includes("@")) throw new Error("E-mail inválido");
  const supabase = createClient();
  const { data, error } = await supabase
    .from("client_invites")
    .insert({ org_id: ctx.orgId, client_account_id: clientAccountId, email, created_by: ctx.userId })
    .select("token")
    .single();
  if (error) throw error;
  revalidatePath("/app/clientes");
  return data.token as string;
}

// ---- Financeiro -----------------------------------------------------------
export async function createInvoice(formData: FormData) {
  const ctx = await requireOrg(["owner", "admin", "member"]);
  const clientAccountId = String(formData.get("clientAccountId") ?? "");
  if (!clientAccountId) throw new Error("Cliente obrigatório");
  const supabase = createClient();
  const { error } = await supabase.from("invoices").insert({
    org_id: ctx.orgId, client_account_id: clientAccountId,
    number: String(formData.get("number") ?? "") || null,
    description: String(formData.get("description") ?? ""),
    amount: Number(formData.get("amount") ?? 0),
    due_date: String(formData.get("due_date") ?? "") || null,
    payment_link: String(formData.get("payment_link") ?? "") || null,
    recurring: formData.get("recurring") === "on",
    status: String(formData.get("status") ?? "rascunho"),
  });
  if (error) throw error;
  revalidatePath("/app/financeiro");
}

export async function setInvoiceStatus(id: string, status: string) {
  await requireOrg(["owner", "admin", "member"]);
  const supabase = createClient();
  const patch: Record<string, unknown> = { status };
  if (status === "paga") patch.paid_at = new Date().toISOString();
  const { error } = await supabase.from("invoices").update(patch).eq("id", id);
  if (error) throw error;
  revalidatePath("/app/financeiro");
}

// ---- Projetos -------------------------------------------------------------
export async function createProject(formData: FormData) {
  const ctx = await requireOrg(["owner", "admin", "member"]);
  const clientAccountId = String(formData.get("clientAccountId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!clientAccountId || !name) throw new Error("Cliente e nome obrigatórios");
  const supabase = createClient();
  const { error } = await supabase.from("projects").insert({
    org_id: ctx.orgId, client_account_id: clientAccountId, name,
    status: String(formData.get("status") ?? "ativo"),
    due_date: String(formData.get("due_date") ?? "") || null,
    description: String(formData.get("description") ?? ""),
  });
  if (error) throw error;
  revalidatePath("/app/projetos");
}

export async function setProjectStatus(id: string, status: string) {
  await requireOrg(["owner", "admin", "member"]);
  const supabase = createClient();
  const { error } = await supabase.from("projects").update({ status }).eq("id", id);
  if (error) throw error;
  revalidatePath("/app/projetos");
}

// ---- Entregas / Documentos ------------------------------------------------
export async function createDeliverable(formData: FormData) {
  const ctx = await requireOrg(["owner", "admin", "member"]);
  const clientAccountId = String(formData.get("clientAccountId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  if (!clientAccountId || !title) throw new Error("Cliente e título obrigatórios");
  const supabase = createClient();
  const { error } = await supabase.from("deliverables").insert({
    org_id: ctx.orgId, client_account_id: clientAccountId, title,
    type: String(formData.get("type") ?? "file"),
    url: String(formData.get("url") ?? "") || null,
    description: String(formData.get("description") ?? ""),
  });
  if (error) throw error;
  revalidatePath("/app/entregas");
}

export async function setDeliverableStatus(id: string, status: string) {
  await requireOrg(["owner", "admin", "member"]);
  const supabase = createClient();
  const patch: Record<string, unknown> = { status };
  if (status === "entregue" || status === "aprovado") patch.delivered_at = new Date().toISOString();
  const { error } = await supabase.from("deliverables").update(patch).eq("id", id);
  if (error) throw error;
  revalidatePath("/app/entregas");
}

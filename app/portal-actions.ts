"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAuthContext, type OrgBrand } from "@/lib/db";
import { clientInviteUrl, portalBaseUrl } from "@/lib/urls";

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

// Resolve destinatários e identidade do cliente para os e-mails (fatura/entrega).
// Prioriza os usuários ativos do portal; se não houver, usa o contato principal.
async function resolveClientCtx(supabase: ReturnType<typeof createClient>, clientAccountId: string) {
  const { data: ca } = await supabase
    .from("client_accounts")
    .select("name, slug, brand, primary_contact_id")
    .eq("id", clientAccountId)
    .maybeSingle();
  const { data: users } = await supabase
    .from("client_users")
    .select("email, name")
    .eq("client_account_id", clientAccountId)
    .eq("status", "active");
  const recipients: { email: string; name?: string }[] = (users ?? [])
    .filter((u: any) => u.email)
    .map((u: any) => ({ email: u.email as string, name: (u.name ?? undefined) as string | undefined }));
  if (!recipients.length && ca?.primary_contact_id) {
    const { data: contact } = await supabase.from("contacts").select("email, name").eq("id", ca.primary_contact_id).maybeSingle();
    if (contact?.email) recipients.push({ email: contact.email, name: contact.name ?? undefined });
  }
  const brandObj: any = ca?.brand ?? {};
  const brand: OrgBrand | undefined = brandObj?.primary ? brandObj : undefined;
  return { name: (ca?.name ?? "Cliente") as string, slug: (ca?.slug ?? "") as string, brand, recipients };
}

/** Link para uma seção do portal do cliente (absoluto). "" se não houver base. */
function portalSectionUrl(slug: string, section: string): string | undefined {
  const base = portalBaseUrl();
  return base ? `${base}/portal/${slug}/${section}` : undefined;
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

  // E-mail do convite do portal (Brevo). Best-effort; o link copiável é o fallback.
  if (portalBaseUrl()) {
    try {
      const cc = await resolveClientCtx(supabase, clientAccountId);
      const { sendAndLogEmail } = await import("@/lib/email/send");
      const { portalInviteEmail } = await import("@/lib/email/templates");
      const content = portalInviteEmail({
        brand: cc.brand ?? ctx.brand, orgName: ctx.orgName, clientName: cc.name,
        portalUrl: clientInviteUrl(data.token),
      });
      await sendAndLogEmail({ db: supabase, orgId: ctx.orgId, to: { email }, content, tags: ["portal-convite"] });
    } catch { /* não bloqueia a criação do convite */ }
  }

  revalidatePath("/app/clientes");
  return data.token as string;
}

// ---- Financeiro -----------------------------------------------------------
export async function createInvoice(formData: FormData) {
  const ctx = await requireOrg(["owner", "admin", "member"]);
  const clientAccountId = String(formData.get("clientAccountId") ?? "");
  if (!clientAccountId) throw new Error("Cliente obrigatório");
  const supabase = createClient();
  const number = String(formData.get("number") ?? "") || null;
  const amount = Number(formData.get("amount") ?? 0);
  const dueDate = String(formData.get("due_date") ?? "") || null;
  const paymentLink = String(formData.get("payment_link") ?? "") || null;
  const status = String(formData.get("status") ?? "rascunho");
  const { error } = await supabase.from("invoices").insert({
    org_id: ctx.orgId, client_account_id: clientAccountId,
    number, description: String(formData.get("description") ?? ""),
    amount, due_date: dueDate, payment_link: paymentLink,
    recurring: formData.get("recurring") === "on", status,
  });
  if (error) throw error;
  // Só envia por e-mail quando a fatura é criada já como "enviada" (não em rascunho).
  if (status === "enviada") {
    await emailInvoice(supabase, ctx.orgId, ctx.orgName, ctx.brand, clientAccountId, { number, amount, dueDate, paymentLink });
  }
  revalidatePath("/app/financeiro");
}

export async function setInvoiceStatus(id: string, status: string) {
  const ctx = await requireOrg(["owner", "admin", "member"]);
  const supabase = createClient();
  const patch: Record<string, unknown> = { status };
  if (status === "paga") patch.paid_at = new Date().toISOString();
  const { error } = await supabase.from("invoices").update(patch).eq("id", id);
  if (error) throw error;
  // Ao marcar como "enviada", dispara a fatura por e-mail ao cliente.
  if (status === "enviada") {
    const { data: inv } = await supabase
      .from("invoices")
      .select("client_account_id, number, amount, due_date, payment_link")
      .eq("id", id).maybeSingle();
    if (inv) {
      await emailInvoice(supabase, ctx.orgId, ctx.orgName, ctx.brand, inv.client_account_id, {
        number: inv.number, amount: Number(inv.amount), dueDate: inv.due_date, paymentLink: inv.payment_link,
      });
    }
  }
  revalidatePath("/app/financeiro");
}

// Envia uma fatura por e-mail aos destinatários do cliente. Best-effort.
async function emailInvoice(
  supabase: ReturnType<typeof createClient>, orgId: string, orgName: string, orgBrand: OrgBrand,
  clientAccountId: string,
  inv: { number: string | null; amount: number; dueDate: string | null; paymentLink: string | null },
) {
  try {
    const cc = await resolveClientCtx(supabase, clientAccountId);
    if (!cc.recipients.length) return;
    const { sendAndLogEmail } = await import("@/lib/email/send");
    const { invoiceEmail } = await import("@/lib/email/templates");
    const content = invoiceEmail({
      brand: cc.brand ?? orgBrand, orgName,
      clientName: cc.name, number: inv.number ?? "—", amount: inv.amount,
      dueDate: inv.dueDate ?? undefined,
      paymentUrl: inv.paymentLink ?? undefined,
      invoiceUrl: portalSectionUrl(cc.slug, "financeiro"),
    });
    await sendAndLogEmail({ db: supabase, orgId, to: cc.recipients, content, tags: ["fatura"] });
  } catch { /* não bloqueia a operação financeira */ }
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
  const deliverableUrl = String(formData.get("url") ?? "") || null;
  const { error } = await supabase.from("deliverables").insert({
    org_id: ctx.orgId, client_account_id: clientAccountId, title,
    type: String(formData.get("type") ?? "file"),
    url: deliverableUrl,
    description: String(formData.get("description") ?? ""),
  });
  if (error) throw error;

  // Notifica o cliente por e-mail sobre a nova entrega/documento/link. Best-effort.
  try {
    const cc = await resolveClientCtx(supabase, clientAccountId);
    if (cc.recipients.length) {
      const { sendAndLogEmail } = await import("@/lib/email/send");
      const { deliverableEmail } = await import("@/lib/email/templates");
      const content = deliverableEmail({
        brand: cc.brand ?? ctx.brand, orgName: ctx.orgName, clientName: cc.name, title,
        url: deliverableUrl ?? portalSectionUrl(cc.slug, "documentos"),
      });
      await sendAndLogEmail({ db: supabase, orgId: ctx.orgId, to: cc.recipients, content, tags: ["entrega"] });
    }
  } catch { /* não bloqueia a criação da entrega */ }

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

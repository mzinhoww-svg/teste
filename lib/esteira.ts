import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// Esteira "Ganhou → Entrega": ao fechar um deal (estágio is_won), monta o
// pós-venda automaticamente — garante a conta do cliente, abre um projeto, uma
// fatura em rascunho e a tarefa de onboarding. Idempotente: se já houver
// projeto/fatura para o deal, não duplica (mover para ganho de novo é seguro).

function slugify(s: string): string {
  return s.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/** Garante um client_account para o deal, criando a partir da empresa do contato. */
async function ensureClientAccount(db: SupabaseClient, orgId: string, deal: any): Promise<string | null> {
  if (deal.client_account_id) return deal.client_account_id;
  const contact: any = Array.isArray(deal.contact) ? deal.contact[0] : deal.contact;
  const company = (contact?.company ?? "").trim();
  const name = company || contact?.name || "Cliente";
  const slug = slugify(name) || `cliente-${String(deal.id).slice(0, 8)}`;

  // Reusa uma conta existente com o mesmo slug (bootstrap por empresa já cria essas).
  const { data: existing } = await db.from("client_accounts").select("id").eq("org_id", orgId).eq("slug", slug).maybeSingle();
  let caId = existing?.id as string | undefined;
  if (!caId) {
    const { data: created } = await db.from("client_accounts")
      .insert({ org_id: orgId, name, slug, primary_contact_id: contact?.id ?? null })
      .select("id").single();
    caId = created?.id;
  }
  if (caId) await db.from("deals").update({ client_account_id: caId }).eq("id", deal.id);
  return caId ?? null;
}

export interface EsteiraResult {
  ran: boolean;
  projectCreated: boolean;
  invoiceCreated: boolean;
  clientAccountId: string | null;
}

export async function runWonEsteira(db: SupabaseClient, orgId: string, dealId: string): Promise<EsteiraResult> {
  const { data: deal } = await db
    .from("deals")
    .select("id, title, amount, client_account_id, contact:contacts(id, name, company, email)")
    .eq("id", dealId).eq("org_id", orgId).maybeSingle();
  if (!deal) return { ran: false, projectCreated: false, invoiceCreated: false, clientAccountId: null };

  const clientAccountId = await ensureClientAccount(db, orgId, deal);
  if (!clientAccountId) return { ran: false, projectCreated: false, invoiceCreated: false, clientAccountId: null };

  // F1.2 — fecho do deal promove a empresa para o ciclo de vida 'ativo'.
  try {
    const { promoteCompanyToActive } = await import("@/lib/company");
    await promoteCompanyToActive(db, orgId, clientAccountId);
  } catch { /* não bloqueia a esteira */ }

  // Projeto (idempotente por deal_id).
  let projectCreated = false;
  const { data: existingProject } = await db.from("projects").select("id").eq("deal_id", dealId).maybeSingle();
  if (!existingProject) {
    await db.from("projects").insert({
      org_id: orgId, client_account_id: clientAccountId, deal_id: dealId,
      name: deal.title || "Projeto", status: "ativo",
      description: "Criado automaticamente ao fechar o deal (esteira Ganhou→Entrega).",
    });
    projectCreated = true;
  }

  // Fatura em rascunho (idempotente por deal_id).
  let invoiceCreated = false;
  const { data: existingInvoice } = await db.from("invoices").select("id").eq("deal_id", dealId).maybeSingle();
  if (!existingInvoice) {
    const { count } = await db.from("invoices").select("id", { count: "exact", head: true }).eq("org_id", orgId);
    const number = `FAT-${String((count ?? 0) + 1).padStart(4, "0")}`;
    await db.from("invoices").insert({
      org_id: orgId, client_account_id: clientAccountId, deal_id: dealId,
      number, description: deal.title || "Serviços", amount: Number(deal.amount) || 0, status: "rascunho",
    });
    invoiceCreated = true;
  }

  // Tarefa de onboarding (só na primeira vez que a esteira roda de fato).
  if (projectCreated) {
    const due = new Date(Date.now() + 2 * 86_400_000).toISOString();
    const { createTask } = await import("@/lib/tasks");
    await createTask(db, {
      orgId, dealId, title: "Onboarding: agendar kickoff e confirmar escopo/entregas com o cliente",
      dueAt: due, priority: "alta", source: "esteira",
    });
    await db.from("notifications").insert({
      org_id: orgId, type: "handoff", title: "Pós-venda iniciado",
      body: `${deal.title}: projeto e fatura (rascunho) criados. Agende o kickoff.`,
      deal_id: dealId, action_url: "/app/projetos",
    });
  }

  return { ran: true, projectCreated, invoiceCreated, clientAccountId };
}

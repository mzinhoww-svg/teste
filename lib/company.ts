import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// F1.2 — Empresa (client_account) como entidade de ciclo de vida, criada JÁ na
// entrada do lead (lifecycle 'lead'), não só no Ganho. Dedup por slug/domínio.
// A esteira Ganhou→Entrega apenas promove o lifecycle para 'ativo'.

export function slugify(s: string): string {
  return s.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function domainFromEmail(email?: string | null): string | null {
  const at = (email ?? "").split("@")[1]?.trim().toLowerCase();
  if (!at) return null;
  // ignora provedores genéricos — não identificam a empresa
  const generic = new Set(["gmail.com", "hotmail.com", "outlook.com", "yahoo.com", "icloud.com", "live.com", "bol.com.br", "uol.com.br"]);
  return generic.has(at) ? null : at;
}

/** Garante um client_account 'lead' para a empresa do contato. Idempotente por slug. */
export async function ensureCompanyForLead(
  db: SupabaseClient, orgId: string,
  opts: { company?: string | null; cnpj?: string | null; email?: string | null; contactId?: string | null; ownerUserId?: string | null },
): Promise<string | null> {
  const company = (opts.company ?? "").trim();
  const domain = domainFromEmail(opts.email);
  if (!company && !domain) return null;

  const name = company || domain!;
  const slug = slugify(name);
  if (!slug) return null;

  const { data: existing } = await db
    .from("client_accounts").select("id").eq("org_id", orgId).eq("slug", slug).maybeSingle();
  if (existing?.id) return existing.id;

  const { data: created } = await db.from("client_accounts").insert({
    org_id: orgId, name, slug, lifecycle: "lead",
    primary_contact_id: opts.contactId ?? null,
    owner_user_id: opts.ownerUserId ?? null,
    domain, cnpj: opts.cnpj ?? null,
  }).select("id").maybeSingle();
  return created?.id ?? null;
}

/** Promove a empresa para 'ativo' no fecho do deal (carimba first_won_at 1x). */
export async function promoteCompanyToActive(db: SupabaseClient, orgId: string, clientAccountId: string): Promise<void> {
  const { data: ca } = await db.from("client_accounts").select("lifecycle, first_won_at").eq("id", clientAccountId).eq("org_id", orgId).maybeSingle();
  if (!ca) return;
  await db.from("client_accounts").update({
    lifecycle: "ativo",
    first_won_at: ca.first_won_at ?? new Date().toISOString(),
  }).eq("id", clientAccountId);
}

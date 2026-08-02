import "server-only";
import { createClient } from "@/lib/supabase/server";

// Autorização do CMS do site. Editor = linha em `site_admins` (por user_id ou
// e-mail). ADMIN vê tudo; EDITOR não gerencia usuários. Sempre validado no
// SERVIDOR — as policies de RLS (0016) são a segunda barreira, não a primeira.

export type SiteRole = "ADMIN" | "EDITOR";

export type SiteSession =
  | { ok: true; email: string; role: SiteRole; userId: string }
  | { ok: false; email: string; reason: "anon" | "forbidden" };

export async function getSiteSession(): Promise<SiteSession> {
  const db = createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return { ok: false, email: "", reason: "anon" };

  const email = user.email ?? "";
  const { data } = await db
    .from("site_admins")
    .select("role")
    .or(`user_id.eq.${user.id},email.eq.${email.toLowerCase()}`)
    .limit(1)
    .maybeSingle();

  if (!data) return { ok: false, email, reason: "forbidden" };
  return { ok: true, email, role: (data.role as SiteRole) ?? "EDITOR", userId: user.id };
}

/** Para uso em server actions: explode se quem chamou não pode editar. */
export async function requireSiteEditor(): Promise<{ email: string; role: SiteRole }> {
  const session = await getSiteSession();
  if (!session.ok) throw new Error("Acesso restrito aos editores do site.");
  return { email: session.email, role: session.role };
}

// Leituras do CMS: diferente de `lib/site/data.ts` (público, anônimo, só
// publicado), aqui usamos a sessão do editor para enxergar TAMBÉM os rascunhos.

export async function listAllPlans() {
  const { data } = await createClient().from("site_plans").select("*").order("display_order");
  return data ?? [];
}

export async function listAllTestimonials() {
  const { data } = await createClient().from("site_testimonials").select("*").order("display_order");
  return data ?? [];
}

export async function listAllPrograms() {
  const { data } = await createClient().from("site_programs").select("*").order("display_order");
  return data ?? [];
}

export async function getConfigRow() {
  const { data } = await createClient().from("site_config").select("*").limit(1).maybeSingle();
  return data ?? null;
}

export type SiteKpis = {
  pageViews: number;
  ctaClicks: number;
  formSubmits: number;
  /** Série diária dos últimos 14 dias, do mais antigo ao mais recente. */
  series: { day: string; views: number; clicks: number }[];
};

const EMPTY_KPIS: SiteKpis = { pageViews: 0, ctaClicks: 0, formSubmits: 0, series: [] };

/** KPIs dos últimos 14 dias, agregados em memória (volume é baixo). */
export async function getSiteKpis(): Promise<SiteKpis> {
  const db = createClient();
  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

  const { data, error } = await db
    .from("site_events")
    .select("kind, created_at")
    .gte("created_at", since.toISOString());

  if (error || !data) return EMPTY_KPIS;

  const buckets = new Map<string, { views: number; clicks: number }>();
  for (let i = 13; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    buckets.set(d, { views: 0, clicks: 0 });
  }

  let pageViews = 0, ctaClicks = 0, formSubmits = 0;
  for (const row of data) {
    const day = String(row.created_at).slice(0, 10);
    const bucket = buckets.get(day);
    if (row.kind === "page_view") { pageViews++; if (bucket) bucket.views++; }
    else if (row.kind === "cta_click") { ctaClicks++; if (bucket) bucket.clicks++; }
    else if (row.kind === "form_submit") formSubmits++;
  }

  return {
    pageViews,
    ctaClicks,
    formSubmits,
    series: [...buckets.entries()].map(([day, v]) => ({ day, ...v })),
  };
}

import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  DEFAULT_CONFIG, DEFAULT_PLANS, DEFAULT_PROGRAMS, DEFAULT_TESTIMONIALS,
  toConfig, toPlan, toProgram, toTestimonial,
  type Plan, type Program, type SiteConfig, type Testimonial,
} from "./content";

// Leitura do conteúdo público do site.
//
// Usa um cliente ANÔNIMO sem cookies (não `lib/supabase/server`): sem
// `cookies()` a landing continua cacheável (revalidate) em vez de virar
// dinâmica a cada request. As policies de 0016 liberam SELECT anônimo do que
// está publicado.
//
// Regra de ouro: a landing NUNCA quebra por causa do banco. Sem env, sem
// migration ou com erro de rede, cai nos defaults de `content.ts`.

let cached: SupabaseClient | null = null;

function publicClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key || url.includes("placeholder")) return null;
  cached ??= createClient(url, key, { auth: { persistSession: false } });
  return cached;
}

async function safe<T>(fn: (db: SupabaseClient) => PromiseLike<{ data: unknown; error: unknown }>, fallback: T, map: (rows: Record<string, unknown>[]) => T): Promise<T> {
  const db = publicClient();
  if (!db) return fallback;
  try {
    const { data, error } = await fn(db);
    if (error || !Array.isArray(data) || data.length === 0) return fallback;
    return map(data as Record<string, unknown>[]);
  } catch {
    return fallback; // rede/DNS fora do ar não derruba a página
  }
}

export function getSiteConfig(): Promise<SiteConfig> {
  return safe(
    (db) => db.from("site_config").select("*").limit(1),
    DEFAULT_CONFIG,
    (rows) => toConfig(rows[0]),
  );
}

export function getPlans(): Promise<Plan[]> {
  return safe(
    (db) => db.from("site_plans").select("*").eq("published", true).order("display_order"),
    DEFAULT_PLANS,
    (rows) => rows.map(toPlan),
  );
}

export function getTestimonials(): Promise<Testimonial[]> {
  return safe(
    (db) => db.from("site_testimonials").select("*").eq("published", true).order("display_order"),
    DEFAULT_TESTIMONIALS,
    (rows) => rows.map(toTestimonial),
  );
}

export function getPrograms(opts: { featuredOnly?: boolean } = {}): Promise<Program[]> {
  const fallback = opts.featuredOnly
    ? DEFAULT_PROGRAMS.filter((p) => p.featured)
    : DEFAULT_PROGRAMS;
  return safe(
    (db) => {
      const q = db.from("site_programs").select("*").eq("published", true);
      return (opts.featuredOnly ? q.eq("featured", true) : q).order("display_order");
    },
    fallback,
    (rows) => rows.map(toProgram),
  );
}

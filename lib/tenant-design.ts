import "server-only";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { callLLM, extractJson, hasLiveAI } from "@/lib/ai";

// Design system por tenant para os documentos (PDF de proposta). Deriva das
// cores da marca e é enriquecido por um LLM (uma vez, cacheado em
// org.settings.design_system) com base no nome e no segmento do tenant.

export interface TenantDesign {
  primary: string;
  accent: string;
  heading: string;
  tagline: string;
  tone: string;
}

function adminDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createAdminClient(url, key);
}

function fallback(name: string, brand: any): TenantDesign {
  return {
    primary: brand?.primary || "#0f172a",
    accent: brand?.accent || "#4f46e5",
    heading: name || "Proposta",
    tagline: "Proposta comercial",
    tone: "institucional",
  };
}

/** Retorna o design do tenant, gerando-o via LLM na primeira vez (cacheado). */
export async function getTenantDesign(orgId: string): Promise<TenantDesign> {
  const db = adminDb();
  if (!db) return fallback("", {});

  const { data: org } = await db.from("orgs").select("name, settings").eq("id", orgId).maybeSingle();
  const name = org?.name ?? "Proposta";
  const settings: any = org?.settings ?? {};
  const brand = settings.brand ?? {};

  if (settings.design_system?.primary) return settings.design_system as TenantDesign;

  let design = fallback(name, brand);
  if (hasLiveAI()) {
    try {
      const text = await callLLM({
        system: "Você cria design systems para documentos comerciais. Responda SOMENTE com JSON.",
        prompt: `Tenant: "${name}". Cores da marca: primary=${brand.primary ?? "n/d"}, accent=${brand.accent ?? "n/d"}. ` +
          `Gere um design para o PDF de proposta comercial deste tenant. Responda JSON ` +
          `{"primary":"#hex","accent":"#hex","heading":"nome curto no cabeçalho","tagline":"subtítulo institucional curto","tone":"1-2 palavras"}. ` +
          `Se houver cores da marca, respeite-as. Cores devem ter bom contraste sobre branco.`,
        maxTokens: 300,
      });
      const parsed = extractJson<TenantDesign>(text);
      if (parsed?.primary && parsed.accent) {
        design = {
          primary: parsed.primary, accent: parsed.accent,
          heading: parsed.heading || name, tagline: parsed.tagline || "Proposta comercial",
          tone: parsed.tone || "institucional",
        };
      }
    } catch {
      // mantém fallback
    }
  }

  // Cacheia (não bloqueia o retorno em caso de falha de escrita).
  try {
    await db.from("orgs").update({ settings: { ...settings, design_system: design } }).eq("id", orgId);
  } catch { /* ignore */ }

  return design;
}

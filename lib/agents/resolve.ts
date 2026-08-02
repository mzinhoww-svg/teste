import "server-only";
import { createClient } from "@/lib/supabase/server";
import { PLATFORM_AGENT_BY_KIND, PLATFORM_AGENTS, type PlatformAgentDef } from "./catalog";
import { composeAgentPrompt } from "./reiners-context";

// Resolução do agente efetivo: catálogo (código) → override do admin da
// plataforma (platform_agent_templates) → override do tenant (org_agent_settings,
// somente se ALLOW_TENANT_AGENT_OVERRIDES=true).

export interface ResolvedAgent {
  key: string;
  kind: string;
  name: string;
  category: string;
  prompt: string;          // parte específica do agente (antes das camadas globais)
  composedPrompt: string;  // prompt completo enviado ao modelo
  model: string;
  triggers: string[];
  active: boolean;
  source: "catalog" | "platform" | "override";
  templateVersion: number | null;
}

export const overridesEnabled = () => process.env.ALLOW_TENANT_AGENT_OVERRIDES === "true";

function build(base: PlatformAgentDef, tpl: any, ov: any): ResolvedAgent {
  let prompt = (tpl?.default_prompt as string) || base.prompt;
  let model = (tpl?.default_model as string) || base.model;
  let triggers = (tpl?.default_triggers as string[]) ?? base.triggers;
  let active = tpl?.active ?? true;
  let source: ResolvedAgent["source"] = tpl ? "platform" : "catalog";
  if (overridesEnabled() && ov && ov.inherit_platform_default === false) {
    if (ov.override_prompt) prompt = ov.override_prompt;
    if (ov.override_model) model = ov.override_model;
    if (ov.override_triggers) triggers = ov.override_triggers;
    if (ov.active !== null && ov.active !== undefined) active = ov.active;
    source = "override";
  }
  return {
    key: base.key, kind: base.kind, name: base.name, category: base.category,
    prompt, composedPrompt: composeAgentPrompt(prompt), model, triggers, active,
    source, templateVersion: tpl?.version ?? null,
  };
}

export async function resolveAgentByKind(kind: string, orgId: string | null): Promise<ResolvedAgent | null> {
  const base = PLATFORM_AGENT_BY_KIND.get(kind);
  if (!base) return null;
  const sb = createClient();
  const { data: tpl } = await sb.from("platform_agent_templates").select("*").eq("key", base.key).maybeSingle();
  let ov: any = null;
  if (overridesEnabled() && orgId) {
    const { data } = await sb.from("org_agent_settings").select("*").eq("org_id", orgId).eq("agent_key", base.key).maybeSingle();
    ov = data;
  }
  return build(base, tpl, ov);
}

export async function resolveAllAgents(orgId: string | null): Promise<ResolvedAgent[]> {
  const sb = createClient();
  const { data: tpls } = await sb.from("platform_agent_templates").select("*");
  const tplByKey = new Map((tpls ?? []).map((t: any) => [t.key, t]));
  let ovByKey = new Map<string, any>();
  if (overridesEnabled() && orgId) {
    const { data: ovs } = await sb.from("org_agent_settings").select("*").eq("org_id", orgId);
    ovByKey = new Map((ovs ?? []).map((o: any) => [o.agent_key, o]));
  }
  return PLATFORM_AGENTS.map((base) => build(base, tplByKey.get(base.key), ovByKey.get(base.key)));
}

"use server";

import { revalidatePath } from "next/cache";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { PLATFORM_AGENT_BY_KEY } from "@/lib/agents/catalog";

// Admin da PLATAFORMA (≠ admin de tenant). Autoriza por tabela platform_admins
// OU e-mail em PLATFORM_ADMIN_EMAILS. Sempre validado no servidor.
async function requirePlatformAdmin(): Promise<{ userId: string }> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado");

  const envList = (process.env.PLATFORM_ADMIN_EMAILS ?? "")
    .split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  if (user.email && envList.includes(user.email.toLowerCase())) return { userId: user.id };

  const { data } = await supabase.from("platform_admins").select("user_id").eq("user_id", user.id).maybeSingle();
  if (!data) throw new Error("Acesso restrito ao administrador da plataforma");
  return { userId: user.id };
}

// Escrita nos templates ignora RLS (só service role escreve) — a autorização
// real é o requirePlatformAdmin acima.
function adminDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_SERVICE_ROLE_KEY não configurada — necessária para editar agentes da plataforma");
  return createAdminClient(url, key);
}

export async function savePlatformAgent(key: string, fields: {
  prompt: string; model: string; triggers: string[]; active: boolean; changelog?: string;
}) {
  const { userId } = await requirePlatformAdmin();
  const base = PLATFORM_AGENT_BY_KEY.get(key);
  if (!base) throw new Error("Agente desconhecido");
  const db = adminDb();

  const { data: existing } = await db.from("platform_agent_templates").select("*").eq("key", key).maybeSingle();
  const nextVersion = (existing?.version ?? 0) + 1;

  // Versiona o estado atual antes de sobrescrever (histórico global).
  if (existing) {
    await db.from("platform_agent_template_versions").insert({
      template_id: existing.id, version: existing.version,
      prompt: existing.default_prompt, model: existing.default_model,
      triggers: existing.default_triggers, changelog: fields.changelog ?? null, created_by: userId,
    });
  }

  const row = {
    key, name: base.name, category: base.category,
    default_prompt: fields.prompt, default_model: fields.model,
    default_triggers: fields.triggers, active: fields.active,
    version: nextVersion, updated_by: userId, updated_at: new Date().toISOString(),
  };
  const { error } = existing
    ? await db.from("platform_agent_templates").update(row).eq("key", key)
    : await db.from("platform_agent_templates").insert({ ...row, created_by: userId });
  if (error) throw error;

  revalidatePath("/admin/agents");
  revalidatePath("/app/studio");
}

// Volta ao padrão do catálogo (remove o override da plataforma).
export async function restorePlatformAgentDefault(key: string) {
  await requirePlatformAdmin();
  const db = adminDb();
  await db.from("platform_agent_templates").delete().eq("key", key);
  revalidatePath("/admin/agents");
  revalidatePath("/app/studio");
}

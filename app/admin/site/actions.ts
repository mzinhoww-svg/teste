"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireSiteEditor } from "@/lib/site/admin";
import { sanitizeWhatsappNumber } from "@/lib/site/whatsapp";

// CRUD do CMS do site. A autorização é feita no servidor (requireSiteEditor) e
// a escrita usa o cliente COM sessão — então as policies de RLS validam de
// novo. Nada aqui usa service role: o CMS não precisa furar RLS.

function revalidateSite() {
  revalidatePath("/");
  revalidatePath("/portfolio");
  revalidatePath("/admin/site");
}

function parseFeatures(raw: string): string[] {
  return raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

// ─────────────────────────────── Planos ──────────────────────────────────────

export async function savePlan(formData: FormData) {
  await requireSiteEditor();
  const db = createClient();

  const id = String(formData.get("id") ?? "").trim();
  const row = {
    name: String(formData.get("name") ?? "").trim(),
    price: String(formData.get("price") ?? "").trim(),
    period: String(formData.get("period") ?? "/mês").trim(),
    description: String(formData.get("description") ?? "").trim() || null,
    features: parseFeatures(String(formData.get("features") ?? "")),
    is_featured: formData.get("is_featured") === "on",
    published: formData.get("published") === "on",
    display_order: Number(formData.get("display_order") ?? 0),
    updated_at: new Date().toISOString(),
  };

  if (!row.name || !row.price) throw new Error("Nome e preço são obrigatórios.");

  const { error } = id
    ? await db.from("site_plans").update(row).eq("id", id)
    : await db.from("site_plans").insert(row);
  if (error) throw new Error(error.message);

  revalidateSite();
}

export async function deletePlan(formData: FormData) {
  await requireSiteEditor();
  const id = String(formData.get("id") ?? "");
  const { error } = await createClient().from("site_plans").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidateSite();
}

/** Reordena movendo um plano uma posição para cima/baixo. */
export async function movePlan(formData: FormData) {
  await requireSiteEditor();
  const db = createClient();
  const id = String(formData.get("id") ?? "");
  const direction = String(formData.get("direction") ?? "up");

  const { data: plans } = await db.from("site_plans").select("id, display_order").order("display_order");
  if (!plans) return;

  const index = plans.findIndex((p) => p.id === id);
  const target = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || target < 0 || target >= plans.length) return;

  // Troca as posições dos dois vizinhos (normalizando para 1..n).
  const reordered = [...plans];
  [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
  await Promise.all(
    reordered.map((p, i) =>
      db.from("site_plans").update({ display_order: i + 1 }).eq("id", p.id),
    ),
  );
  revalidateSite();
}

// ───────────────────────────── Depoimentos ───────────────────────────────────

export async function saveTestimonial(formData: FormData) {
  await requireSiteEditor();
  const db = createClient();

  const id = String(formData.get("id") ?? "").trim();
  const row = {
    name: String(formData.get("name") ?? "").trim(),
    role: String(formData.get("role") ?? "").trim(),
    quote: String(formData.get("quote") ?? "").trim(),
    avatar_url: String(formData.get("avatar_url") ?? "").trim() || null,
    display_order: Number(formData.get("display_order") ?? 0),
    published: formData.get("published") === "on",
    updated_at: new Date().toISOString(),
  };

  if (!row.name || !row.quote) throw new Error("Nome e depoimento são obrigatórios.");

  const { error } = id
    ? await db.from("site_testimonials").update(row).eq("id", id)
    : await db.from("site_testimonials").insert(row);
  if (error) throw new Error(error.message);

  revalidateSite();
}

export async function deleteTestimonial(formData: FormData) {
  await requireSiteEditor();
  const id = String(formData.get("id") ?? "");
  const { error } = await createClient().from("site_testimonials").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidateSite();
}

// ────────────────────────────── Programas ────────────────────────────────────

export async function saveProgram(formData: FormData) {
  await requireSiteEditor();
  const db = createClient();

  const id = String(formData.get("id") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const slug = String(formData.get("slug") ?? "").trim()
    || title.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

  const row = {
    title,
    slug,
    client: String(formData.get("client") ?? "").trim() || null,
    description: String(formData.get("description") ?? "").trim() || null,
    poster_url: String(formData.get("poster_url") ?? "").trim() || null,
    listen_url: String(formData.get("listen_url") ?? "").trim() || null,
    category: String(formData.get("category") ?? "").trim() || null,
    featured: formData.get("featured") === "on",
    published: formData.get("published") === "on",
    display_order: Number(formData.get("display_order") ?? 0),
    updated_at: new Date().toISOString(),
  };

  if (!row.title) throw new Error("Título é obrigatório.");

  const { error } = id
    ? await db.from("site_programs").update(row).eq("id", id)
    : await db.from("site_programs").insert(row);
  if (error) throw new Error(error.message);

  revalidateSite();
}

export async function deleteProgram(formData: FormData) {
  await requireSiteEditor();
  const id = String(formData.get("id") ?? "");
  const { error } = await createClient().from("site_programs").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidateSite();
}

// ──────────────────────────── Configurações ──────────────────────────────────

export async function saveSiteConfig(formData: FormData) {
  await requireSiteEditor();
  const db = createClient();

  const row = {
    site_name: String(formData.get("site_name") ?? "").trim() || "Reiners Media",
    tagline: String(formData.get("tagline") ?? "").trim(),
    hero_video_url: String(formData.get("hero_video_url") ?? "").trim() || null,
    hero_image_url: String(formData.get("hero_image_url") ?? "").trim() || null,
    cta_primary_text: String(formData.get("cta_primary_text") ?? "").trim(),
    cta_primary_url: String(formData.get("cta_primary_url") ?? "").trim(),
    cta_secondary_text: String(formData.get("cta_secondary_text") ?? "").trim(),
    cta_secondary_url: String(formData.get("cta_secondary_url") ?? "").trim(),
    // Só dígitos: o CMS aceita "+55 (65) 99920-7108" e o wa.me exige limpo.
    whatsapp_number: sanitizeWhatsappNumber(String(formData.get("whatsapp_number") ?? "")) || null,
    location: String(formData.get("location") ?? "").trim() || null,
    instagram_url: String(formData.get("instagram_url") ?? "").trim() || null,
    linkedin_url: String(formData.get("linkedin_url") ?? "").trim() || null,
    youtube_url: String(formData.get("youtube_url") ?? "").trim() || null,
    spotify_url: String(formData.get("spotify_url") ?? "").trim() || null,
    seo_title: String(formData.get("seo_title") ?? "").trim() || null,
    seo_description: String(formData.get("seo_description") ?? "").trim() || null,
    analytics_id: String(formData.get("analytics_id") ?? "").trim() || null,
    updated_at: new Date().toISOString(),
  };

  const id = String(formData.get("id") ?? "").trim();
  const { error } = id
    ? await db.from("site_config").update(row).eq("id", id)
    : await db.from("site_config").insert(row);
  if (error) throw new Error(error.message);

  revalidateSite();
}

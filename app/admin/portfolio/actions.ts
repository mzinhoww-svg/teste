"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getPrisma } from "@/lib/portfolio/prisma";
import { requireRole } from "@/lib/portfolio/auth";
import { normalizeTracks } from "@/lib/portfolio/embeds";
import { DEFAULT_ACCENT } from "@/lib/portfolio/tokens";
import { slugify } from "@/lib/portfolio/slug";
import { toJson } from "@/lib/portfolio/json";
import {
  ADMIN_ROLES,
  isPodcastStatus,
  isVisualStyle,
  type Host,
  type SocialLinks,
} from "@/lib/portfolio/types";

// ==========================================================================
// Server Actions do admin do catálogo.
//
// Toda ação: (1) confere o papel, (2) valida a entrada, (3) revalida as rotas
// públicas afetadas. Erros voltam como `{ error }` para o formulário exibir —
// nunca como exceção não tratada na tela.
// ==========================================================================

export interface ActionResult {
  ok: boolean;
  error?: string;
  id?: string;
}

const STORAGE_BUCKET = "portfolio";

function fail(error: string): ActionResult {
  return { ok: false, error };
}

function requireDb() {
  const prisma = getPrisma();
  if (!prisma) {
    throw new Error(
      "DATABASE_URL não configurada — o admin do catálogo precisa do banco para gravar.",
    );
  }
  return prisma;
}

function revalidateCatalog(slug?: string) {
  revalidatePath("/portfolio");
  revalidatePath("/admin/portfolio");
  if (slug) revalidatePath(`/portfolio/${slug}`);
}

function parseHosts(raw: string): Host[] {
  // Formato do textarea: uma linha por host — "Nome | Papel | Bio | XX"
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, role, bio, initial] = line.split("|").map((p) => p.trim());
      return {
        name: name ?? "",
        role: role || null,
        bio: bio || null,
        initial: initial || null,
        photo: null,
      };
    })
    .filter((h) => h.name.length > 0);
}

const SOCIAL_FIELDS = ["instagram", "twitter", "tiktok", "linkedin", "website", "github"] as const;

function parseSocial(form: FormData): SocialLinks {
  const out: SocialLinks = {};
  for (const key of SOCIAL_FIELDS) {
    const value = String(form.get(`social_${key}`) ?? "").trim();
    if (value && /^https?:\/\//i.test(value)) out[key] = value;
  }
  return out;
}

// --------------------------------------------------------------------------
// Programas
// --------------------------------------------------------------------------

export async function savePodcast(_prev: unknown, form: FormData): Promise<ActionResult> {
  try {
    await requireRole("EDITOR");
    const prisma = requireDb();

    const id = String(form.get("id") ?? "").trim();
    const title = String(form.get("title") ?? "").trim();
    if (!title) return fail("Título é obrigatório.");

    const slug = slugify(String(form.get("slug") ?? "").trim() || title);
    if (!slug) return fail("Não foi possível gerar um slug a partir do título.");

    const status = String(form.get("status") ?? "ACTIVE");
    if (!isPodcastStatus(status)) return fail("Status inválido.");

    const visualStyle = String(form.get("visualStyle") ?? "MINIMAL");
    if (!isVisualStyle(visualStyle)) return fail("Estilo visual inválido.");

    const year = Number(form.get("year"));
    if (!Number.isInteger(year) || year < 1900 || year > 2200) return fail("Ano inválido.");

    const accentColor = String(form.get("accentColor") ?? DEFAULT_ACCENT).trim();
    if (!/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(accentColor)) {
      return fail("Cor de acento deve ser um hex (#rrggbb).");
    }

    const data = {
      slug,
      title,
      tagline: String(form.get("tagline") ?? "").trim() || null,
      description: String(form.get("description") ?? "").trim(),
      coverImage: String(form.get("coverImage") ?? "").trim(),
      heroImage: String(form.get("heroImage") ?? "").trim() || null,
      category: String(form.get("category") ?? "").trim(),
      status,
      visualStyle,
      year,
      accentColor,
      hosts: toJson(parseHosts(String(form.get("hosts") ?? ""))),
      socialLinks: toJson(parseSocial(form)),
      featured: form.get("featured") === "on",
      displayOrder: Number(form.get("displayOrder") ?? 0) || 0,
    };

    // Slug é único: um conflito é erro de conteúdo, não de sistema.
    const clash = await prisma.podcast.findFirst({
      where: { slug, ...(id ? { NOT: { id } } : {}) },
      select: { id: true },
    });
    if (clash) return fail(`Já existe um programa com o slug "${slug}".`);

    const saved = id
      ? await prisma.podcast.update({ where: { id }, data })
      : await prisma.podcast.create({ data });

    revalidateCatalog(saved.slug);
    return { ok: true, id: saved.id };
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Falha ao salvar o programa.");
  }
}

export async function deletePodcast(id: string): Promise<ActionResult> {
  try {
    await requireRole("ADMIN");
    const prisma = requireDb();
    // onDelete: Cascade no schema remove os episódios junto.
    const removed = await prisma.podcast.delete({ where: { id } });
    revalidateCatalog(removed.slug);
    return { ok: true };
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Falha ao excluir o programa.");
  }
}

export async function toggleFeatured(id: string, featured: boolean): Promise<ActionResult> {
  try {
    await requireRole("EDITOR");
    const prisma = requireDb();
    await prisma.podcast.update({ where: { id }, data: { featured } });
    revalidateCatalog();
    return { ok: true };
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Falha ao alterar destaque.");
  }
}

/** Recebe a ordem final dos ids (drag-and-drop) e persiste `displayOrder`. */
export async function reorderPodcasts(ids: string[]): Promise<ActionResult> {
  try {
    await requireRole("EDITOR");
    const prisma = requireDb();
    await prisma.$transaction(
      ids.map((id, index) =>
        prisma.podcast.update({ where: { id }, data: { displayOrder: index } }),
      ),
    );
    revalidateCatalog();
    return { ok: true };
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Falha ao reordenar.");
  }
}

// --------------------------------------------------------------------------
// Episódios
// --------------------------------------------------------------------------

export async function saveEpisode(_prev: unknown, form: FormData): Promise<ActionResult> {
  try {
    await requireRole("EDITOR");
    const prisma = requireDb();

    const id = String(form.get("id") ?? "").trim();
    const podcastId = String(form.get("podcastId") ?? "").trim();
    if (!podcastId) return fail("Selecione o programa.");

    const title = String(form.get("title") ?? "").trim();
    if (!title) return fail("Título é obrigatório.");

    const number = Number(form.get("number"));
    if (!Number.isInteger(number) || number < 0) return fail("Número do episódio inválido.");

    const publishedAtRaw = String(form.get("publishedAt") ?? "").trim();
    const publishedAt = publishedAtRaw ? new Date(publishedAtRaw) : new Date();
    if (Number.isNaN(publishedAt.getTime())) return fail("Data de publicação inválida.");

    // O parser converte as URLs coladas em URLs de embed (spec §9).
    const tracks = normalizeTracks({
      youtubeUrl: String(form.get("youtubeUrl") ?? ""),
      spotifyUrl: String(form.get("spotifyUrl") ?? ""),
    });

    const data = {
      podcastId,
      number,
      title,
      description: String(form.get("description") ?? "").trim(),
      thumbnail: String(form.get("thumbnail") ?? "").trim() || null,
      duration: String(form.get("duration") ?? "").trim(),
      publishedAt,
      ...tracks,
    };

    const clash = await prisma.episode.findFirst({
      where: { podcastId, number, ...(id ? { NOT: { id } } : {}) },
      select: { id: true },
    });
    if (clash) return fail(`O episódio ${number} já existe neste programa.`);

    const saved = id
      ? await prisma.episode.update({ where: { id }, data })
      : await prisma.episode.create({ data });

    const podcast = await prisma.podcast.findUnique({
      where: { id: podcastId },
      select: { slug: true },
    });
    revalidateCatalog(podcast?.slug);
    revalidatePath("/admin/portfolio/episodios");
    return { ok: true, id: saved.id };
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Falha ao salvar o episódio.");
  }
}

export async function deleteEpisode(id: string): Promise<ActionResult> {
  try {
    await requireRole("EDITOR");
    const prisma = requireDb();
    const removed = await prisma.episode.delete({
      where: { id },
      include: { podcast: { select: { slug: true } } },
    });
    revalidateCatalog(removed.podcast?.slug);
    revalidatePath("/admin/portfolio/episodios");
    return { ok: true };
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Falha ao excluir o episódio.");
  }
}

// --------------------------------------------------------------------------
// Configurações do site
// --------------------------------------------------------------------------

export async function saveSiteConfig(_prev: unknown, form: FormData): Promise<ActionResult> {
  try {
    await requireRole("ADMIN");
    const prisma = requireDb();

    const primaryColor = String(form.get("primaryColor") ?? DEFAULT_ACCENT).trim();
    if (!/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(primaryColor)) {
      return fail("Cor primária deve ser um hex (#rrggbb).");
    }

    const data = {
      siteName: String(form.get("siteName") ?? "").trim() || "Reiners Media",
      tagline: String(form.get("tagline") ?? "").trim() || "Conteúdo que conecta",
      logoUrl: String(form.get("logoUrl") ?? "").trim() || null,
      faviconUrl: String(form.get("faviconUrl") ?? "").trim() || null,
      primaryColor,
      seoTitle: String(form.get("seoTitle") ?? "").trim() || null,
      seoDescription: String(form.get("seoDescription") ?? "").trim() || null,
      analyticsId: String(form.get("analyticsId") ?? "").trim() || null,
      facebookPixel: String(form.get("facebookPixel") ?? "").trim() || null,
      customCss: String(form.get("customCss") ?? "").trim() || null,
    };

    const existing = await prisma.siteConfig.findFirst({ orderBy: { createdAt: "asc" } });
    if (existing) await prisma.siteConfig.update({ where: { id: existing.id }, data });
    else await prisma.siteConfig.create({ data });

    revalidateCatalog();
    return { ok: true };
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Falha ao salvar as configurações.");
  }
}

// --------------------------------------------------------------------------
// Usuários do admin
// --------------------------------------------------------------------------

export async function saveAdminUser(_prev: unknown, form: FormData): Promise<ActionResult> {
  try {
    await requireRole("ADMIN");
    const prisma = requireDb();

    const email = String(form.get("email") ?? "").trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail("E-mail inválido.");

    const role = String(form.get("role") ?? "EDITOR");
    if (!(ADMIN_ROLES as readonly string[]).includes(role)) return fail("Papel inválido.");

    const name = String(form.get("name") ?? "").trim() || null;

    await prisma.adminUser.upsert({
      where: { email },
      create: { email, name, role },
      update: { name, role },
    });

    revalidatePath("/admin/portfolio/usuarios");
    return { ok: true };
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Falha ao salvar o usuário.");
  }
}

export async function deleteAdminUser(id: string): Promise<ActionResult> {
  try {
    const session = await requireRole("ADMIN");
    const prisma = requireDb();

    const target = await prisma.adminUser.findUnique({ where: { id } });
    if (!target) return fail("Usuário não encontrado.");
    // Impede que o admin logado remova o próprio acesso.
    if (target.email === session.email) return fail("Você não pode remover o próprio acesso.");

    await prisma.adminUser.delete({ where: { id } });
    revalidatePath("/admin/portfolio/usuarios");
    return { ok: true };
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Falha ao excluir o usuário.");
  }
}

// --------------------------------------------------------------------------
// Upload de imagens (Supabase Storage)
// --------------------------------------------------------------------------

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif", "image/svg+xml"];
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/**
 * Envia uma imagem ao bucket `portfolio` e devolve a URL pública, para ser
 * gravada em coverImage/heroImage/thumbnail/logoUrl.
 */
export async function uploadImage(form: FormData): Promise<ActionResult & { url?: string }> {
  try {
    await requireRole("EDITOR");

    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) return fail("Selecione um arquivo.");
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      return fail("Formato não suportado (use JPEG, PNG, WebP, AVIF ou SVG).");
    }
    if (file.size > MAX_UPLOAD_BYTES) return fail("Arquivo acima de 5 MB.");

    const folder = String(form.get("folder") ?? "covers").replace(/[^a-z0-9-]/gi, "");
    const ext = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
    const path = `${folder}/${crypto.randomUUID()}.${ext}`;

    const supabase = createClient();
    const { error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(path, file, { cacheControl: "31536000", upsert: false, contentType: file.type });

    if (error) return fail(`Upload falhou: ${error.message}`);

    const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
    return { ok: true, url: data.publicUrl };
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Falha no upload.");
  }
}

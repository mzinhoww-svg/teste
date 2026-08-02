import "server-only";
import { getPrisma, isDatabaseConfigured } from "./prisma";
import { demoPodcasts, DEMO_SITE_CONFIG } from "./demo-data";
import {
  type AdminRole,
  type AdminUser,
  type EventLogEntry,
  type EventType,
  type Episode,
  type Host,
  type Podcast,
  type PodcastStatus,
  type SiteConfig,
  type SocialLinks,
  type VisualStyle,
  isPodcastStatus,
  isVisualStyle,
} from "./types";
import { DEFAULT_ACCENT } from "./tokens";
import { toJson } from "./json";

// ==========================================================================
// Camada de acesso a dados do catálogo.
//
// Regras:
//   - tudo que sai daqui é serializável (datas → ISO string), porque atravessa
//     a fronteira Server → Client Component;
//   - sem DATABASE_URL, as leituras caem no dataset de demonstração e as
//     escritas falham explicitamente (nunca "sucesso" silencioso);
//   - os campos Json (`hosts`, `socialLinks`) são normalizados na saída, então
//     nenhum componente precisa defender-se de dado malformado.
// ==========================================================================

const EPISODES_PAGE_SIZE = 20;

function asHosts(value: unknown): Host[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((h): h is Record<string, unknown> => !!h && typeof h === "object")
    .map((h) => ({
      name: typeof h.name === "string" ? h.name : "",
      photo: typeof h.photo === "string" ? h.photo : null,
      bio: typeof h.bio === "string" ? h.bio : null,
      initial: typeof h.initial === "string" ? h.initial : null,
      role: typeof h.role === "string" ? h.role : null,
    }))
    .filter((h) => h.name.length > 0);
}

const SOCIAL_KEYS: (keyof SocialLinks)[] = [
  "instagram", "twitter", "tiktok", "linkedin", "website", "github",
];

function asSocialLinks(value: unknown): SocialLinks {
  if (!value || typeof value !== "object") return {};
  const raw = value as Record<string, unknown>;
  const out: SocialLinks = {};
  for (const key of SOCIAL_KEYS) {
    const v = raw[key];
    // Só http(s): impede `javascript:` vindo de um campo do admin.
    if (typeof v === "string" && /^https?:\/\//i.test(v.trim())) out[key] = v.trim();
  }
  return out;
}

function mapEpisode(row: Record<string, any>): Episode {
  return {
    id: row.id,
    podcastId: row.podcastId,
    number: row.number,
    title: row.title,
    description: row.description ?? "",
    thumbnail: row.thumbnail ?? null,
    duration: row.duration ?? "",
    publishedAt: new Date(row.publishedAt).toISOString(),
    youtubeUrl: row.youtubeUrl ?? null,
    youtubeEmbed: row.youtubeEmbed ?? null,
    spotifyUrl: row.spotifyUrl ?? null,
    spotifyEmbed: row.spotifyEmbed ?? null,
  };
}

function mapPodcast(row: Record<string, any>): Podcast {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    tagline: row.tagline ?? null,
    description: row.description ?? "",
    coverImage: row.coverImage ?? "",
    heroImage: row.heroImage ?? null,
    category: row.category ?? "",
    status: isPodcastStatus(row.status) ? row.status : ("ACTIVE" as PodcastStatus),
    visualStyle: isVisualStyle(row.visualStyle) ? row.visualStyle : ("MINIMAL" as VisualStyle),
    year: row.year ?? new Date(row.createdAt ?? Date.now()).getFullYear(),
    accentColor: typeof row.accentColor === "string" ? row.accentColor : DEFAULT_ACCENT,
    hosts: asHosts(row.hosts),
    socialLinks: asSocialLinks(row.socialLinks),
    featured: !!row.featured,
    displayOrder: row.displayOrder ?? 0,
    episodes: (row.episodes ?? []).map(mapEpisode),
  };
}

/**
 * Catálogo completo, ordenado como o grid exibe. Os episódios já vêm limitados
 * (`take`) — a spec proíbe carregar todos de uma vez; o restante é paginado
 * sob demanda por `listEpisodes`.
 */
export async function listPodcasts(
  opts: { episodesPerPodcast?: number } = {},
): Promise<Podcast[]> {
  const take = opts.episodesPerPodcast ?? 5;
  const prisma = getPrisma();

  if (!prisma) {
    return demoPodcasts()
      .map((p) => ({ ...p, episodes: p.episodes.slice(0, take) }))
      .sort(byDisplayOrder);
  }

  try {
    const rows = await prisma.podcast.findMany({
      orderBy: [{ displayOrder: "asc" }, { createdAt: "desc" }],
      include: { episodes: { orderBy: { number: "desc" }, take } },
    });
    return rows.map(mapPodcast);
  } catch (error) {
    console.error("[portfolio] listPodcasts falhou, usando dataset de demonstração:", error);
    return demoPodcasts().map((p) => ({ ...p, episodes: p.episodes.slice(0, take) })).sort(byDisplayOrder);
  }
}

function byDisplayOrder(a: Podcast, b: Podcast) {
  return a.displayOrder - b.displayOrder;
}

export async function getPodcastBySlug(slug: string): Promise<Podcast | null> {
  const prisma = getPrisma();

  if (!prisma) {
    return demoPodcasts().find((p) => p.slug === slug) ?? null;
  }

  try {
    const row = await prisma.podcast.findUnique({
      where: { slug },
      include: { episodes: { orderBy: { number: "desc" }, take: EPISODES_PAGE_SIZE } },
    });
    return row ? mapPodcast(row) : null;
  } catch (error) {
    console.error("[portfolio] getPodcastBySlug falhou:", error);
    return demoPodcasts().find((p) => p.slug === slug) ?? null;
  }
}

export async function getPodcastById(id: string): Promise<Podcast | null> {
  const prisma = getPrisma();
  if (!prisma) return demoPodcasts().find((p) => p.id === id) ?? null;

  const row = await prisma.podcast.findUnique({
    where: { id },
    include: { episodes: { orderBy: { number: "desc" } } },
  });
  return row ? mapPodcast(row) : null;
}

/** Página de episódios de um programa — usada pelo scroll do painel e pelo admin. */
export async function listEpisodes(
  podcastId: string,
  opts: { skip?: number; take?: number } = {},
): Promise<Episode[]> {
  const take = Math.min(opts.take ?? EPISODES_PAGE_SIZE, 50);
  const skip = opts.skip ?? 0;
  const prisma = getPrisma();

  if (!prisma) {
    const p = demoPodcasts().find((x) => x.id === podcastId);
    return (p?.episodes ?? []).slice(skip, skip + take);
  }

  const rows = await prisma.episode.findMany({
    where: { podcastId },
    orderBy: { number: "desc" },
    skip,
    take,
  });
  return rows.map(mapEpisode);
}

export async function listAllEpisodes(
  opts: { skip?: number; take?: number } = {},
): Promise<(Episode & { podcastTitle: string; podcastSlug: string })[]> {
  const take = Math.min(opts.take ?? EPISODES_PAGE_SIZE, 100);
  const skip = opts.skip ?? 0;
  const prisma = getPrisma();

  if (!prisma) {
    return demoPodcasts()
      .flatMap((p) => p.episodes.map((e) => ({ ...e, podcastTitle: p.title, podcastSlug: p.slug })))
      .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
      .slice(skip, skip + take);
  }

  const rows = await prisma.episode.findMany({
    orderBy: { publishedAt: "desc" },
    skip,
    take,
    include: { podcast: { select: { title: true, slug: true } } },
  });
  return rows.map((r) => ({
    ...mapEpisode(r),
    podcastTitle: r.podcast.title,
    podcastSlug: r.podcast.slug,
  }));
}

export async function getEpisodeById(id: string): Promise<Episode | null> {
  const prisma = getPrisma();
  if (!prisma) {
    return demoPodcasts().flatMap((p) => p.episodes).find((e) => e.id === id) ?? null;
  }
  const row = await prisma.episode.findUnique({ where: { id } });
  return row ? mapEpisode(row) : null;
}

// --------------------------------------------------------------------------
// Configuração do site
// --------------------------------------------------------------------------

export async function getSiteConfig(): Promise<SiteConfig> {
  const prisma = getPrisma();
  if (!prisma) return DEMO_SITE_CONFIG;

  try {
    const row = await prisma.siteConfig.findFirst({ orderBy: { createdAt: "asc" } });
    if (!row) return DEMO_SITE_CONFIG;
    return {
      id: row.id,
      siteName: row.siteName,
      tagline: row.tagline,
      logoUrl: row.logoUrl,
      faviconUrl: row.faviconUrl,
      primaryColor: row.primaryColor,
      seoTitle: row.seoTitle,
      seoDescription: row.seoDescription,
      analyticsId: row.analyticsId,
      facebookPixel: row.facebookPixel,
      customCss: row.customCss,
    };
  } catch (error) {
    console.error("[portfolio] getSiteConfig falhou:", error);
    return DEMO_SITE_CONFIG;
  }
}

// --------------------------------------------------------------------------
// Admin users
// --------------------------------------------------------------------------

export async function listAdminUsers(): Promise<AdminUser[]> {
  const prisma = getPrisma();
  if (!prisma) return [];
  const rows = await prisma.adminUser.findMany({ orderBy: { createdAt: "asc" } });
  return rows.map((r) => ({
    id: r.id,
    email: r.email,
    name: r.name,
    role: (r.role === "ADMIN" ? "ADMIN" : "EDITOR") as AdminRole,
    lastLoginAt: r.lastLoginAt ? r.lastLoginAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function findAdminByEmail(email: string): Promise<AdminUser | null> {
  const prisma = getPrisma();
  if (!prisma) return null;
  const row = await prisma.adminUser.findUnique({ where: { email: email.toLowerCase() } });
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: (row.role === "ADMIN" ? "ADMIN" : "EDITOR") as AdminRole,
    lastLoginAt: row.lastLoginAt ? row.lastLoginAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

// --------------------------------------------------------------------------
// Analytics (EventLog)
// --------------------------------------------------------------------------

/**
 * Registra um evento. Nunca lança: telemetria não pode derrubar a página nem
 * bloquear a interação que a originou.
 */
export async function recordEvent(
  eventType: EventType,
  payload?: Record<string, unknown>,
): Promise<void> {
  const prisma = getPrisma();
  if (!prisma) return;
  try {
    await prisma.eventLog.create({ data: { eventType, payload: toJson(payload ?? {}) } });
  } catch (error) {
    console.error("[portfolio] recordEvent falhou:", error);
  }
}

export interface EventFilter {
  eventType?: EventType;
  from?: Date;
  to?: Date;
  skip?: number;
  take?: number;
}

export async function listEvents(filter: EventFilter = {}): Promise<EventLogEntry[]> {
  const prisma = getPrisma();
  if (!prisma) return [];

  const where: Record<string, unknown> = {};
  if (filter.eventType) where.eventType = filter.eventType;
  if (filter.from || filter.to) {
    where.createdAt = {
      ...(filter.from ? { gte: filter.from } : {}),
      ...(filter.to ? { lte: filter.to } : {}),
    };
  }

  const rows = await prisma.eventLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: filter.skip ?? 0,
    take: Math.min(filter.take ?? 100, 1000),
  });
  return rows.map((r) => ({
    id: r.id,
    eventType: r.eventType as EventType,
    payload: (r.payload as Record<string, unknown>) ?? null,
    createdAt: r.createdAt.toISOString(),
  }));
}

export interface DashboardStats {
  totalPodcasts: number;
  totalEpisodes: number;
  episodesThisMonth: number;
  featuredCount: number;
  /** Série diária dos últimos 30 dias para o gráfico do dashboard. */
  series: { date: string; views: number; expands: number }[];
  topPodcasts: { title: string; clicks: number }[];
  trackClicks: { youtube: number; spotify: number };
  databaseConfigured: boolean;
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const prisma = getPrisma();
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  if (!prisma) {
    const demo = demoPodcasts();
    return {
      totalPodcasts: demo.length,
      totalEpisodes: demo.reduce((n, p) => n + p.episodes.length, 0),
      episodesThisMonth: 0,
      featuredCount: demo.filter((p) => p.featured).length,
      series: emptySeries(),
      topPodcasts: [],
      trackClicks: { youtube: 0, spotify: 0 },
      databaseConfigured: false,
    };
  }

  const since = new Date();
  since.setDate(since.getDate() - 29);
  since.setHours(0, 0, 0, 0);

  const [totalPodcasts, totalEpisodes, episodesThisMonth, featuredCount, events] =
    await Promise.all([
      prisma.podcast.count(),
      prisma.episode.count(),
      prisma.episode.count({ where: { publishedAt: { gte: startOfMonth } } }),
      prisma.podcast.count({ where: { featured: true } }),
      prisma.eventLog.findMany({
        where: { createdAt: { gte: since } },
        select: { eventType: true, payload: true, createdAt: true },
      }),
    ]);

  const buckets = new Map(emptySeries().map((d) => [d.date, { ...d }]));
  const podcastClicks = new Map<string, number>();
  let youtube = 0;
  let spotify = 0;

  for (const e of events) {
    const key = e.createdAt.toISOString().slice(0, 10);
    const bucket = buckets.get(key);
    if (bucket) {
      if (e.eventType === "PAGE_VIEW") bucket.views += 1;
      if (e.eventType === "CARD_EXPAND") bucket.expands += 1;
    }
    if (e.eventType === "YOUTUBE_CLICK") youtube += 1;
    if (e.eventType === "SPOTIFY_CLICK") spotify += 1;

    const payload = (e.payload ?? {}) as Record<string, unknown>;
    const title = typeof payload.podcastTitle === "string" ? payload.podcastTitle : null;
    if (title && e.eventType !== "PAGE_VIEW") {
      podcastClicks.set(title, (podcastClicks.get(title) ?? 0) + 1);
    }
  }

  return {
    totalPodcasts,
    totalEpisodes,
    episodesThisMonth,
    featuredCount,
    series: [...buckets.values()],
    topPodcasts: [...podcastClicks.entries()]
      .map(([title, clicks]) => ({ title, clicks }))
      .sort((a, b) => b.clicks - a.clicks)
      .slice(0, 5),
    trackClicks: { youtube, spotify },
    databaseConfigured: true,
  };
}

function emptySeries(): { date: string; views: number; expands: number }[] {
  const out: { date: string; views: number; expands: number }[] = [];
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - 29);
  for (let i = 0; i < 30; i++) {
    out.push({ date: d.toISOString().slice(0, 10), views: 0, expands: 0 });
    d.setDate(d.getDate() + 1);
  }
  return out;
}

export { isDatabaseConfigured };

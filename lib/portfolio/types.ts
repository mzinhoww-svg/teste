// Tipos de domínio do catálogo. Espelham o schema Prisma, mas com os campos
// `Json` já tipados — o resto do módulo nunca lida com `any`.

export const VISUAL_STYLES = [
  "PHOTO_REAL",
  "ILLUSTRATION",
  "MINIMAL",
  "DUOTONE",
  "COLLAGE",
] as const;
export type VisualStyle = (typeof VISUAL_STYLES)[number];

export const PODCAST_STATUS = ["ACTIVE", "ENDED", "HIATUS"] as const;
export type PodcastStatus = (typeof PODCAST_STATUS)[number];

export const ADMIN_ROLES = ["ADMIN", "EDITOR"] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

export const EVENT_TYPES = [
  "PAGE_VIEW",
  "CARD_EXPAND",
  "YOUTUBE_CLICK",
  "SPOTIFY_CLICK",
  "EPISODE_PLAY",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const STATUS_LABEL: Record<PodcastStatus, string> = {
  ACTIVE: "No ar",
  ENDED: "Encerrado",
  HIATUS: "Em pausa",
};

export const VISUAL_STYLE_LABEL: Record<VisualStyle, string> = {
  PHOTO_REAL: "Foto real",
  ILLUSTRATION: "Ilustração",
  MINIMAL: "Minimalista",
  DUOTONE: "Duotone",
  COLLAGE: "Colagem",
};

export interface Host {
  name: string;
  photo?: string | null;
  bio?: string | null;
  /** Iniciais exibidas no avatar. Derivadas do nome quando ausente. */
  initial?: string | null;
  /**
   * Função exibida abaixo do nome ("Apresentador", "Direção").
   * O modelo de dados guarda `hosts` como Json, então o campo é opcional e
   * retrocompatível com registros gravados sem ele.
   */
  role?: string | null;
}

export interface SocialLinks {
  instagram?: string;
  twitter?: string;
  tiktok?: string;
  linkedin?: string;
  website?: string;
  github?: string;
}

export interface Episode {
  id: string;
  podcastId: string;
  number: number;
  title: string;
  description: string;
  thumbnail: string | null;
  duration: string;
  publishedAt: string; // ISO — serializável para Client Components
  youtubeUrl: string | null;
  youtubeEmbed: string | null;
  spotifyUrl: string | null;
  spotifyEmbed: string | null;
}

export interface Podcast {
  id: string;
  slug: string;
  title: string;
  tagline: string | null;
  description: string;
  coverImage: string;
  heroImage: string | null;
  category: string;
  status: PodcastStatus;
  visualStyle: VisualStyle;
  year: number;
  accentColor: string;
  hosts: Host[];
  socialLinks: SocialLinks;
  featured: boolean;
  displayOrder: number;
  episodes: Episode[];
}

export interface SiteConfig {
  id: string;
  siteName: string;
  tagline: string;
  logoUrl: string | null;
  faviconUrl: string | null;
  primaryColor: string;
  seoTitle: string | null;
  seoDescription: string | null;
  analyticsId: string | null;
  facebookPixel: string | null;
  customCss: string | null;
}

export interface AdminUser {
  id: string;
  email: string;
  name: string | null;
  role: AdminRole;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface EventLogEntry {
  id: string;
  eventType: EventType;
  payload: Record<string, unknown> | null;
  createdAt: string;
}

/** Iniciais para o avatar: "Ana Reiners" → "AR". */
export function initialsOf(host: Host): string {
  if (host.initial) return host.initial.slice(0, 2).toUpperCase();
  return host.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}

export function isVisualStyle(v: unknown): v is VisualStyle {
  return typeof v === "string" && (VISUAL_STYLES as readonly string[]).includes(v);
}

export function isPodcastStatus(v: unknown): v is PodcastStatus {
  return typeof v === "string" && (PODCAST_STATUS as readonly string[]).includes(v);
}

export function isEventType(v: unknown): v is EventType {
  return typeof v === "string" && (EVENT_TYPES as readonly string[]).includes(v);
}

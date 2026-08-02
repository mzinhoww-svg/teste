// Conteúdo do site público — tipos + defaults.
//
// Módulo PURO (sem I/O, sem `server-only`): dá para testar no vitest e é o que
// a landing renderiza quando o banco não responde (dev sem Supabase, preview
// sem migration aplicada, E2E com credenciais placeholder). O CMS em
// /admin/site sobrescreve estes valores; eles nunca somem do bundle.
//
// Espelha as tabelas de supabase/migrations/0016_site_cms.sql.

export type SiteConfig = {
  siteName: string;
  tagline: string;
  heroVideoUrl: string | null;
  heroImageUrl: string | null;
  ctaPrimaryText: string;
  ctaPrimaryUrl: string;
  ctaSecondaryText: string;
  ctaSecondaryUrl: string;
  seoTitle: string | null;
  seoDescription: string | null;
  analyticsId: string | null;
  customCss: string | null;
};

export type Plan = {
  id: string;
  name: string;
  price: string;
  period: string;
  description: string | null;
  features: string[];
  isFeatured: boolean;
  displayOrder: number;
};

export type Testimonial = {
  id: string;
  name: string;
  role: string;
  quote: string;
  avatarUrl: string | null;
  displayOrder: number;
};

export type Program = {
  id: string;
  title: string;
  slug: string;
  client: string | null;
  description: string | null;
  posterUrl: string | null;
  listenUrl: string | null;
  category: string | null;
  featured: boolean;
  displayOrder: number;
};

export const DEFAULT_CONFIG: SiteConfig = {
  siteName: "Reiners Media",
  tagline: "Estúdio de Podcast Premium",
  heroVideoUrl: null,
  heroImageUrl: null,
  ctaPrimaryText: "Ver planos",
  ctaPrimaryUrl: "#planos",
  ctaSecondaryText: "Ouvir programas",
  ctaSecondaryUrl: "/portfolio",
  seoTitle: "Reiners Media — Estúdio de podcast premium",
  seoDescription:
    "Gravação, edição, mixagem, identidade visual e distribuição. Tudo em um só lugar.",
  analyticsId: null,
  customCss: null,
};

export const DEFAULT_PLANS: Plan[] = [
  {
    id: "hora-de-estudio",
    name: "Hora de Estúdio",
    price: "R$ 890",
    period: "/hora",
    description: "Para quem já tem pauta e equipe: use nossa estrutura por hora.",
    features: [
      "Estúdio com tratamento acústico",
      "Até 3 câmeras 4K",
      "Operador de áudio incluso",
      "Arquivos brutos no mesmo dia",
    ],
    isFeatured: false,
    displayOrder: 1,
  },
  {
    id: "podcast-in-loco",
    name: "Podcast In Loco",
    price: "R$ 2.190",
    period: "/episódio",
    description: "Gravamos na sua sede, com estrutura de estúdio montada no local.",
    features: [
      "Equipe e equipamento na sua sede",
      "Episódio editado + 5 cortes",
      "Reel de divulgação",
      "Fotos do bastidor",
      "Entrega em 48h",
    ],
    isFeatured: true,
    displayOrder: 2,
  },
  {
    id: "bts-recorrente",
    name: "BTS Recorrente",
    price: "R$ 4.500",
    period: "/mês",
    description: "Presença institucional contínua: pauta, gravação e distribuição todo mês.",
    features: [
      "2 episódios por mês",
      "10 cortes verticais",
      "Identidade visual do programa",
      "Distribuição em todas as plataformas",
      "Relatório mensal de audiência",
    ],
    isFeatured: false,
    displayOrder: 3,
  },
];

export const DEFAULT_TESTIMONIALS: Testimonial[] = [
  {
    id: "ana-furtado",
    name: "Ana Furtado",
    role: "Gerente de Comunicação · Sicredi MT",
    quote:
      "Saímos de posts avulsos para um programa próprio. A diretoria virou porta-voz e a pauta deixou de depender de agência.",
    avatarUrl: null,
    displayOrder: 1,
  },
  {
    id: "rodrigo-menezes",
    name: "Rodrigo Menezes",
    role: "Diretor · Federação das Indústrias",
    quote:
      "A equipe montou estúdio na nossa sede em duas horas. O episódio ficou pronto em 48h, com cortes prontos para publicar.",
    avatarUrl: null,
    displayOrder: 2,
  },
  {
    id: "camila-prado",
    name: "Camila Prado",
    role: "Head de Marketing · Associação do Agro",
    quote:
      "O rigor de estúdio aparece no resultado. É o único fornecedor que entrega roteiro, gravação e distribuição sem terceirizar.",
    avatarUrl: null,
    displayOrder: 3,
  },
];

export const DEFAULT_PROGRAMS: Program[] = [
  {
    id: "conversas-que-cooperam",
    title: "Conversas que Cooperam",
    slug: "conversas-que-cooperam",
    client: "Sicredi MT",
    description: "Série institucional gravada no estúdio corporativo permanente da cooperativa.",
    posterUrl: null,
    listenUrl: null,
    category: "Corporativo",
    featured: true,
    displayOrder: 1,
  },
  {
    id: "industria-em-pauta",
    title: "Indústria em Pauta",
    slug: "industria-em-pauta",
    client: "Federação das Indústrias",
    description: "Podcast in loco com lideranças industriais do Centro-Oeste.",
    posterUrl: null,
    listenUrl: null,
    category: "Institucional",
    featured: true,
    displayOrder: 2,
  },
  {
    id: "domo-cast",
    title: "Domo Cast",
    slug: "domo-cast",
    client: "Eventos Reiners",
    description: "Episódios gravados dentro do domo geodésico, ao vivo, em feiras e congressos.",
    posterUrl: null,
    listenUrl: null,
    category: "Eventos",
    featured: true,
    displayOrder: 3,
  },
  {
    id: "presenca-que-posiciona",
    title: "Presença que Posiciona",
    slug: "presenca-que-posiciona",
    client: "Reiners Media",
    description: "O programa da casa sobre comunicação estratégica institucional.",
    posterUrl: null,
    listenUrl: null,
    category: "Autoral",
    featured: true,
    displayOrder: 4,
  },
  {
    id: "campo-aberto",
    title: "Campo Aberto",
    slug: "campo-aberto",
    client: "Associação do Agro",
    description: "Videocast itinerante sobre o agronegócio de Mato Grosso.",
    posterUrl: null,
    listenUrl: null,
    category: "Institucional",
    featured: true,
    displayOrder: 5,
  },
];

/** Normaliza a linha do banco (snake_case, jsonb) para o tipo da aplicação. */
export function toPlan(row: Record<string, unknown>): Plan {
  const raw = row.features;
  const features = Array.isArray(raw)
    ? raw.filter((f): f is string => typeof f === "string")
    : [];
  return {
    id: String(row.id),
    name: String(row.name ?? ""),
    price: String(row.price ?? ""),
    period: String(row.period ?? ""),
    description: (row.description as string | null) ?? null,
    features,
    isFeatured: Boolean(row.is_featured),
    displayOrder: Number(row.display_order ?? 0),
  };
}

export function toTestimonial(row: Record<string, unknown>): Testimonial {
  return {
    id: String(row.id),
    name: String(row.name ?? ""),
    role: String(row.role ?? ""),
    quote: String(row.quote ?? ""),
    avatarUrl: (row.avatar_url as string | null) ?? null,
    displayOrder: Number(row.display_order ?? 0),
  };
}

export function toProgram(row: Record<string, unknown>): Program {
  return {
    id: String(row.id),
    title: String(row.title ?? ""),
    slug: String(row.slug ?? ""),
    client: (row.client as string | null) ?? null,
    description: (row.description as string | null) ?? null,
    posterUrl: (row.poster_url as string | null) ?? null,
    listenUrl: (row.listen_url as string | null) ?? null,
    category: (row.category as string | null) ?? null,
    featured: Boolean(row.featured),
    displayOrder: Number(row.display_order ?? 0),
  };
}

export function toConfig(row: Record<string, unknown>): SiteConfig {
  const str = (k: string, fallback: string) => {
    const v = row[k];
    return typeof v === "string" && v.trim() ? v : fallback;
  };
  const nullable = (k: string) => {
    const v = row[k];
    return typeof v === "string" && v.trim() ? v : null;
  };
  return {
    siteName: str("site_name", DEFAULT_CONFIG.siteName),
    tagline: str("tagline", DEFAULT_CONFIG.tagline),
    heroVideoUrl: nullable("hero_video_url"),
    heroImageUrl: nullable("hero_image_url"),
    ctaPrimaryText: str("cta_primary_text", DEFAULT_CONFIG.ctaPrimaryText),
    ctaPrimaryUrl: str("cta_primary_url", DEFAULT_CONFIG.ctaPrimaryUrl),
    ctaSecondaryText: str("cta_secondary_text", DEFAULT_CONFIG.ctaSecondaryText),
    ctaSecondaryUrl: str("cta_secondary_url", DEFAULT_CONFIG.ctaSecondaryUrl),
    seoTitle: nullable("seo_title") ?? DEFAULT_CONFIG.seoTitle,
    seoDescription: nullable("seo_description") ?? DEFAULT_CONFIG.seoDescription,
    analyticsId: nullable("analytics_id"),
    customCss: nullable("custom_css"),
  };
}

/** Iniciais para o avatar-fallback do depoimento (sem imagem). */
export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

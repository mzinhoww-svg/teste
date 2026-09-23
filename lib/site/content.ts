// Conteúdo do site público — tipos + defaults.
//
// Módulo PURO (sem I/O, sem `server-only`): dá para testar no vitest e é o que
// a landing renderiza quando o banco não responde (dev sem Supabase, preview
// sem migration aplicada, E2E com credenciais placeholder). O CMS em
// /admin/site sobrescreve estes valores; eles nunca somem do bundle.
//
// Espelha as tabelas de supabase/migrations/0016_site_cms.sql.

import { DEFAULT_WHATSAPP, sanitizeWhatsappNumber } from "./whatsapp";

export type SiteConfig = {
  siteName: string;
  tagline: string;
  heroVideoUrl: string | null;
  heroImageUrl: string | null;
  aboutImageUrl: string | null;
  ogImageUrl: string | null;
  ctaPrimaryText: string;
  ctaPrimaryUrl: string;
  ctaSecondaryText: string;
  ctaSecondaryUrl: string;
  whatsappNumber: string;
  location: string;
  instagramUrl: string | null;
  linkedinUrl: string | null;
  youtubeUrl: string | null;
  spotifyUrl: string | null;
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

export type Guest = {
  id: string;
  name: string;
  role: string | null;
  photoUrl: string | null;
  displayOrder: number;
};

export type Service = {
  id: string;
  title: string;
  badge: string | null;
  description: string | null;
  footnote: string | null;
  videoUrl: string | null;
  posterUrl: string | null;
  /** Até 3. Ignorado quando há vídeo. */
  images: string[];
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
  // Servidos de /public pelo próprio Vercel — sem dependência do Storage. O CMS
  // sobrescreve quando houver URL lá (ver toConfig).
  heroVideoUrl: "/hero.mp4",
  heroImageUrl: "/hero-poster.jpg",
  // Sem imagem própria da seção "Sobre", o bloco cai no gradiente (ver
  // AboutSection). Já a de compartilhamento tem arquivo padrão: link sem card
  // é pior que card genérico.
  aboutImageUrl: null,
  ogImageUrl: "/og.jpg",
  ctaPrimaryText: "Ver planos",
  ctaPrimaryUrl: "#planos",
  ctaSecondaryText: "Ouvir programas",
  ctaSecondaryUrl: "/portfolio",
  whatsappNumber: DEFAULT_WHATSAPP,
  location: "Cuiabá/MT",
  // Sem URL real, o ícone não é renderizado (ver FooterSection).
  instagramUrl: null,
  linkedinUrl: null,
  youtubeUrl: null,
  spotifyUrl: null,
  seoTitle: "Reiners Media — Estúdio de podcast premium",
  seoDescription:
    "Estúdio de podcast em Cuiabá/MT: gravação, edição, mixagem, identidade visual e distribuição. Também gravamos na sua sede.",
  analyticsId: null,
  customCss: null,
};

export const DEFAULT_PLANS: Plan[] = [
  {
    id: "hora-de-estudio",
    name: "Hora de Estúdio",
    price: "R$ 1.390",
    period: "/2h",
    description:
      "Para quem já tem pauta e equipe: **2 horas de gravação** inclusas, com toda a estrutura do nosso estúdio.",
    features: [
      "2 horas de gravação incluídas",
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

// Vazio pela MESMA razão de DEFAULT_GUESTS: um depoimento afirma que uma
// pessoa nomeada recomendou o estúdio. Escrever essa frase por ela fabrica um
// endosso — e os três que moravam aqui (Ana Furtado, Rodrigo Menezes, Camila
// Prado) eram exatamente isso: nomes e falas inventados.
//
// Foram despublicados no banco em vez de apagados: se alguém com esse nome de
// fato falar, é só republicar. Enquanto não houver frase real, a seção não
// existe — a prova social do site é a de convidados, que afirma só presença.
export const DEFAULT_TESTIMONIALS: Testimonial[] = [];

// Vazio de propósito: sem convidado publicado a seção não renderiza. Prova
// social é o único conteúdo do site que NÃO tem placeholder — inventar quem
// gravou no estúdio seria fabricar credencial.
export const DEFAULT_GUESTS: Guest[] = [];

// As seis frentes do estúdio. Diferente dos convidados, descrever o próprio
// serviço não é credencial de terceiro — é a oferta da casa, e a landing
// precisa dela no ar desde o primeiro deploy. O CMS sobrescreve.
//
// Mídia vazia de propósito: os vídeos entram pelo /admin depois.
export const DEFAULT_SERVICES: Service[] = [
  {
    id: "podcast",
    title: "Podcast",
    badge: "Estúdio próprio",
    description:
      "O programa da sua marca, do roteiro ao episódio publicado. Grava no nosso estúdio, com equipe, equipamento e edição inclusos.",
    footnote: "Tratamento acústico, até 3 câmeras 4K e **entrega em 48h**.",
    videoUrl: null,
    posterUrl: null,
    images: [],
    displayOrder: 1,
  },
  {
    id: "cobertura-de-evento",
    title: "Cobertura de evento",
    badge: null,
    description:
      "Feira, congresso ou convenção: levamos filmmaker e estrutura de podcast — inclusive o domo geodésico — para gravar no meio do movimento.",
    footnote: "Episódio gravado **ao vivo**, no estande ou no palco.",
    videoUrl: null,
    posterUrl: null,
    images: [],
    displayOrder: 2,
  },
  {
    id: "gravar-com-os-seus-clientes",
    title: "Gravar com os seus clientes",
    badge: null,
    description:
      "Recebemos os seus clientes e convidados no estúdio, ou montamos a produção onde você quiser. Depoimento, entrevista, série: a sua marca conduz, a gente grava.",
    footnote: "A mesma direção do podcast, a serviço da **sua marca e dos seus convidados**.",
    videoUrl: null,
    posterUrl: null,
    images: [],
    displayOrder: 3,
  },
  {
    id: "o-seu-evento-proprio",
    title: "O seu evento próprio",
    badge: null,
    description:
      "Jantar, encontro de clientes ou lançamento. Registramos o que acontece na sala e devolvemos conteúdo editado, pronto para publicar.",
    footnote: "Curadoria, registro e edição: do **painel ao corte final**.",
    videoUrl: null,
    posterUrl: null,
    images: [],
    displayOrder: 4,
  },
  {
    id: "o-estudio-a-sua-disposicao",
    title: "O estúdio à sua disposição",
    badge: null,
    description:
      "Quer usar o estúdio para produzir o seu próprio conteúdo? Espaço, equipamentos e operador ficam com você, pelo tempo que precisar.",
    footnote: "Estrutura completa em **Cuiabá/MT**: câmeras, áudio, iluminação e operador incluso.",
    videoUrl: null,
    posterUrl: null,
    images: [],
    displayOrder: 5,
  },
  {
    id: "projeto-especial",
    title: "Projeto especial",
    badge: null,
    description:
      "Quer algo mais elaborado? Série, documentário, filme de marca. A mesma produção do podcast, agora contando a história da sua empresa.",
    footnote: "Projetos sob medida, com **roteiro, direção e edição próprios**.",
    videoUrl: null,
    posterUrl: null,
    images: [],
    displayOrder: 6,
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

/** Texto opcional do CMS: string vazia ou só espaços conta como ausente. */
function nullableText(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

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

export function toGuest(row: Record<string, unknown>): Guest {
  return {
    id: String(row.id),
    name: String(row.name ?? ""),
    role: (row.role as string | null) ?? null,
    photoUrl: (row.photo_url as string | null) ?? null,
    displayOrder: Number(row.display_order ?? 0),
  };
}

export function toService(row: Record<string, unknown>): Service {
  const raw = row.images;
  // Coluna jsonb: pode vir com qualquer coisa dentro se editada na mão.
  const images = Array.isArray(raw)
    ? raw.filter((i): i is string => typeof i === "string" && i.trim() !== "").slice(0, 3)
    : [];
  return {
    id: String(row.id),
    title: String(row.title ?? ""),
    badge: nullableText(row.badge),
    description: nullableText(row.description),
    footnote: nullableText(row.footnote),
    videoUrl: nullableText(row.video_url),
    posterUrl: nullableText(row.poster_url),
    images,
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
    // `?? default`: coluna vazia no banco não deve APAGAR o hero — só uma URL
    // de fato preenchida no CMS substitui o arquivo versionado.
    heroVideoUrl: nullable("hero_video_url") ?? DEFAULT_CONFIG.heroVideoUrl,
    heroImageUrl: nullable("hero_image_url") ?? DEFAULT_CONFIG.heroImageUrl,
    // Sobre: null é resposta válida — o componente desenha o gradiente.
    aboutImageUrl: nullable("about_image_url"),
    ogImageUrl: nullable("og_image_url") ?? DEFAULT_CONFIG.ogImageUrl,
    ctaPrimaryText: str("cta_primary_text", DEFAULT_CONFIG.ctaPrimaryText),
    ctaPrimaryUrl: str("cta_primary_url", DEFAULT_CONFIG.ctaPrimaryUrl),
    ctaSecondaryText: str("cta_secondary_text", DEFAULT_CONFIG.ctaSecondaryText),
    ctaSecondaryUrl: str("cta_secondary_url", DEFAULT_CONFIG.ctaSecondaryUrl),
    // Guarda só dígitos: o CMS aceita "+55 (65) 99920-7108" e o link exige limpo.
    whatsappNumber: sanitizeWhatsappNumber(str("whatsapp_number", DEFAULT_CONFIG.whatsappNumber)),
    location: str("location", DEFAULT_CONFIG.location),
    instagramUrl: nullable("instagram_url"),
    linkedinUrl: nullable("linkedin_url"),
    youtubeUrl: nullable("youtube_url"),
    spotifyUrl: nullable("spotify_url"),
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

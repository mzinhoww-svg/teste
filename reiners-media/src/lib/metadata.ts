/**
 * Reiners Media Podcast Studio — helpers de SEO (TCK-022, FR-018/FR-019/NFR-004).
 *
 * Este módulo é a ÚNICA fonte de verdade de:
 * - resolução da URL pública do site (`NEXT_PUBLIC_SITE_URL`);
 * - construção de `Metadata` do App Router (canonical + Open Graph + Twitter);
 * - construção e serialização segura de JSON-LD (schema.org).
 *
 * ---------------------------------------------------------------------------
 * QUEM CONSOME O QUÊ
 * ---------------------------------------------------------------------------
 * - TCK-011/012 (landing)      -> `buildHomeMetadata()`, `organizationJsonLd()`
 * - TCK-013 (grid /portfolio)  -> `buildPortfolioMetadata()`, `breadcrumbJsonLd()`
 * - TCK-016 (/portfolio/[slug])-> `podcastSeriesJsonLd()`, `podcastEpisodeJsonLd()`,
 *                                 `podcastBreadcrumbJsonLd()`, `jsonLdScriptProps()`
 * - `src/app/sitemap.ts` / `src/app/robots.ts` -> `getSiteUrl()`, `absoluteUrl()`
 *
 * Este ticket NÃO escreve `generateMetadata` de nenhuma página: cada página é
 * dona da sua. A de `/portfolio/[slug]` já existe (TCK-016,
 * `src/components/programa/metadata.ts`) e monta título/OG por conta própria;
 * `buildPodcastMetadata()` abaixo é o equivalente desta biblioteca, oferecido
 * para a convergência na integração — o que TCK-016 ainda NÃO tem, e só sai
 * daqui, é o JSON-LD.
 *
 * ---------------------------------------------------------------------------
 * INJEÇÃO DO JSON-LD NA PÁGINA (padrão obrigatório)
 * ---------------------------------------------------------------------------
 * ```tsx
 * import { jsonLdScriptProps, podcastSeriesJsonLd } from '@/lib/metadata';
 *
 * <script {...jsonLdScriptProps(podcastSeriesJsonLd(podcast))} />
 * ```
 * NUNCA faça `JSON.stringify(data)` direto dentro de `<script>`: o título de um
 * programa vem do banco e pode conter `</script>`, o que fecharia a tag e
 * transformaria conteúdo em código (XSS armazenado). `serializeJsonLd` escapa
 * `<`, `>`, `&`, U+2028 e U+2029 — e é o que `jsonLdScriptProps` usa.
 */
import type { Metadata } from 'next';

import type { Episode, Podcast, PodcastHost, PodcastStatus, PodcastWithEpisodes } from '@/types/api';

/* -------------------------------------------------------------------------- */
/* Constantes de marca e de rota                                              */
/* -------------------------------------------------------------------------- */

/** Nome curto da marca, usado em `og:site_name` e no sufixo do título. */
export const SITE_NAME = 'Reiners Media';

/** Nome completo, usado no JSON-LD de `Organization`. */
export const SITE_LEGAL_NAME = 'Reiners Media — Estúdio de Podcast';

/** Locale Open Graph (underscore) e do documento (hífen). */
export const SITE_LOCALE = 'pt_BR';
export const SITE_LANGUAGE = 'pt-BR';

/**
 * ESPELHA `metadata.title.template` de `src/app/layout.tsx` — aquele arquivo é
 * de outro dono, então a duplicação é inevitável; `tests/unit/metadata.test.ts`
 * compara os dois e falha se divergirem.
 */
export const TITLE_TEMPLATE = '%s · Reiners Media';

/** Título absoluto da home (não recebe o sufixo do template). */
export const DEFAULT_TITLE = 'Reiners Media — Estúdio de Podcast';

export const DEFAULT_DESCRIPTION =
  'Estúdio de podcast full-service: gravação, edição, distribuição e estratégia de conteúdo.';

/**
 * Imagem de compartilhamento padrão. Caminho root-relativo servido de `public/`
 * — é transformado em URL absoluta por `absoluteUrl` antes de ir para as tags,
 * porque crawlers de OG não resolvem caminho relativo.
 */
export const DEFAULT_OG_IMAGE = '/images/og/default.jpg';
export const OG_IMAGE_WIDTH = 1200;
export const OG_IMAGE_HEIGHT = 630;

/** Único formato de card usado no produto (imagem grande). */
export const TWITTER_CARD = 'summary_large_image';

/** Fallback de desenvolvimento — jamais deve chegar a produção (ver `getSiteUrl`). */
export const DEFAULT_SITE_URL = 'http://localhost:3000';

export const HOME_PATH = '/';
export const PORTFOLIO_PATH = '/portfolio';

/** Caminho canônico da página de um programa. Use SEMPRE isto, nunca literal. */
export function podcastPath(slug: string): string {
  return `${PORTFOLIO_PATH}/${slug}`;
}

/* -------------------------------------------------------------------------- */
/* Resolução da URL pública                                                   */
/* -------------------------------------------------------------------------- */

/** Variáveis lidas para descobrir a origem pública do site. */
export interface SiteUrlEnv {
  NEXT_PUBLIC_SITE_URL?: string;
  /** Domínio estável do projeto na Vercel (sem protocolo). */
  VERCEL_PROJECT_PRODUCTION_URL?: string;
  /** Domínio efêmero do deploy atual (preview), sem protocolo. */
  VERCEL_URL?: string;
  VERCEL_ENV?: string;
  NODE_ENV?: string;
  /** `phase-production-build` durante `next build`. */
  NEXT_PHASE?: string;
}

export type SiteUrlSource = 'env' | 'vercel-production' | 'vercel-preview' | 'fallback';

export interface ResolvedSiteUrl {
  /** Origem normalizada, sem barra final. */
  url: string;
  source: SiteUrlSource;
}

/** Erro de configuração: produção sem origem pública conhecida. */
export class MissingSiteUrlError extends Error {
  constructor() {
    super(
      'NEXT_PUBLIC_SITE_URL ausente ou inválida em produção. ' +
        'Canonical, Open Graph e sitemap ficariam apontando para localhost — ' +
        'configure NEXT_PUBLIC_SITE_URL (ex: https://reiners.media) no ambiente.',
    );
    this.name = 'MissingSiteUrlError';
  }
}

/**
 * Referências estáticas a `process.env.X` (nunca `process.env[x]`): só a forma
 * estática é substituída pelo bundler, então um eventual uso em componente de
 * cliente continua enxergando `NEXT_PUBLIC_SITE_URL`.
 */
function readEnv(): SiteUrlEnv {
  return {
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    VERCEL_PROJECT_PRODUCTION_URL: process.env.VERCEL_PROJECT_PRODUCTION_URL,
    VERCEL_URL: process.env.VERCEL_URL,
    VERCEL_ENV: process.env.VERCEL_ENV,
    NODE_ENV: process.env.NODE_ENV,
    NEXT_PHASE: process.env.NEXT_PHASE,
  };
}

/** Normaliza `reiners.media`, `https://reiners.media/` -> `https://reiners.media`. */
function normalizeOrigin(value: string | undefined): string | null {
  const raw = value?.trim();
  if (!raw) return null;

  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const parsed = new URL(withProtocol);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    // `origin + pathname` preserva instalação em subdiretório; a barra final sai.
    return `${parsed.origin}${parsed.pathname}`.replace(/\/+$/, '');
  } catch {
    return null;
  }
}

/**
 * `true` quando o código está servindo tráfego de produção de verdade.
 *
 * DECISÃO DELIBERADA: `next build` roda com `NODE_ENV=production`, mas nele o
 * ambiente ainda pode não ter as variáveis públicas (build local, CI de PR).
 * Derrubar o build por isso transformaria um lint de configuração em falha de
 * pipeline em todo lugar; por outro lado, servir produção com canonical
 * apontando para localhost é dano real de SEO. Por isso a fase de build é a
 * única exceção — e ela grita no log (`console.error` em `resolveSiteUrl`).
 */
function isProductionRuntime(env: SiteUrlEnv): boolean {
  if (env.NEXT_PHASE === 'phase-production-build') return false;
  if (env.VERCEL_ENV) return env.VERCEL_ENV === 'production';
  return env.NODE_ENV === 'production';
}

/**
 * Resolve a origem pública sem lançar. Ordem: variável explícita -> domínio de
 * produção da Vercel -> domínio do preview -> fallback de desenvolvimento.
 */
export function resolveSiteUrl(env: SiteUrlEnv = readEnv()): ResolvedSiteUrl {
  const explicit = normalizeOrigin(env.NEXT_PUBLIC_SITE_URL);
  if (explicit) return { url: explicit, source: 'env' };

  const vercelProduction = normalizeOrigin(env.VERCEL_PROJECT_PRODUCTION_URL);
  if (vercelProduction) return { url: vercelProduction, source: 'vercel-production' };

  const vercelPreview = normalizeOrigin(env.VERCEL_URL);
  if (vercelPreview) return { url: vercelPreview, source: 'vercel-preview' };

  if (env.NODE_ENV === 'production') {
    // Visível no log do build e no log da função: configuração faltando.
    console.error(
      '[metadata] NEXT_PUBLIC_SITE_URL ausente — usando %s. URLs canônicas, Open Graph e sitemap ficarão erradas.',
      DEFAULT_SITE_URL,
    );
  }

  return { url: DEFAULT_SITE_URL, source: 'fallback' };
}

/**
 * Origem pública do site. **Lança `MissingSiteUrlError` em runtime de produção**
 * quando nenhuma variável resolve — um deploy sem `NEXT_PUBLIC_SITE_URL` é
 * defeito de configuração, não um detalhe cosmético. Em desenvolvimento (e na
 * fase de build) cai em `DEFAULT_SITE_URL`.
 */
export function getSiteUrl(env: SiteUrlEnv = readEnv()): string {
  const resolved = resolveSiteUrl(env);
  if (resolved.source === 'fallback' && isProductionRuntime(env)) {
    throw new MissingSiteUrlError();
  }
  return resolved.url;
}

/**
 * Converte caminho root-relativo em URL absoluta. URLs já absolutas passam
 * intactas (capa hospedada no Supabase Storage, por exemplo).
 */
export function absoluteUrl(pathOrUrl: string, env: SiteUrlEnv = readEnv()): string {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const base = getSiteUrl(env);
  const path = pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`;
  return path === '/' ? `${base}/` : `${base}${path}`;
}

/* -------------------------------------------------------------------------- */
/* Metadata                                                                   */
/* -------------------------------------------------------------------------- */

/** Aplica `TITLE_TEMPLATE` — o mesmo sufixo que o root layout aplicaria. */
export function formatTitle(title: string): string {
  return TITLE_TEMPLATE.replace('%s', title);
}

export interface BuildMetadataInput {
  /** Título da página, SEM o sufixo da marca (o template cuida disso). */
  title: string;
  description: string;
  /** Caminho root-relativo da página. Default: `/`. */
  path?: string;
  /** Imagem de compartilhamento (caminho ou URL). Default: `DEFAULT_OG_IMAGE`. */
  image?: string | null;
  imageAlt?: string;
  /** `og:type`. Default: `website`. */
  type?: 'website' | 'article' | 'profile';
  /** ISO-8601. Só faz sentido com `type: 'article'`. */
  publishedTime?: string;
  /** Marca a página como não indexável (páginas de estado, filtros, etc.). */
  noIndex?: boolean;
  keywords?: readonly string[];
  /**
   * `true` -> o título vai como está (`title.absolute`), sem o sufixo do
   * template. Use na home, cujo título já contém a marca.
   */
  absoluteTitle?: boolean;
  /** Injeção de ambiente para teste. Em produção, deixe o default. */
  env?: SiteUrlEnv;
}

/**
 * Constrói o `Metadata` do App Router com canonical, Open Graph e Twitter Card
 * completos. Toda página pública deve sair daqui (direta ou indiretamente), para
 * que nenhuma rota fique sem canonical ou sem card de compartilhamento.
 */
export function buildMetadata(input: BuildMetadataInput): Metadata {
  const {
    title,
    description,
    path = HOME_PATH,
    image = DEFAULT_OG_IMAGE,
    imageAlt,
    type = 'website',
    publishedTime,
    noIndex = false,
    keywords,
    absoluteTitle = false,
    env = readEnv(),
  } = input;

  const base = getSiteUrl(env);
  const canonical = absoluteUrl(path, env);
  const socialTitle = absoluteTitle ? title : formatTitle(title);
  const imageUrl = absoluteUrl(image ?? DEFAULT_OG_IMAGE, env);

  return {
    metadataBase: new URL(base),
    title: absoluteTitle ? { absolute: title } : title,
    description,
    ...(keywords && keywords.length > 0 ? { keywords: [...keywords] } : {}),
    alternates: { canonical },
    robots: noIndex
      ? { index: false, follow: false, googleBot: { index: false, follow: false } }
      : {
          index: true,
          follow: true,
          googleBot: { index: true, follow: true, 'max-image-preview': 'large' },
        },
    openGraph: {
      type,
      url: canonical,
      siteName: SITE_NAME,
      title: socialTitle,
      description,
      locale: SITE_LOCALE,
      ...(type === 'article' && publishedTime ? { publishedTime } : {}),
      images: [
        {
          url: imageUrl,
          width: OG_IMAGE_WIDTH,
          height: OG_IMAGE_HEIGHT,
          alt: imageAlt ?? socialTitle,
        },
      ],
    },
    twitter: {
      card: TWITTER_CARD,
      title: socialTitle,
      description,
      images: [imageUrl],
    },
  };
}

/** Metadata da landing page (TCK-011/012). */
export function buildHomeMetadata(
  overrides: { title?: string; description?: string; image?: string | null; env?: SiteUrlEnv } = {},
): Metadata {
  return buildMetadata({
    title: overrides.title ?? DEFAULT_TITLE,
    description: overrides.description ?? DEFAULT_DESCRIPTION,
    path: HOME_PATH,
    image: overrides.image ?? DEFAULT_OG_IMAGE,
    absoluteTitle: true,
    env: overrides.env,
  });
}

/** Metadata do grid `/portfolio` (TCK-013). */
export function buildPortfolioMetadata(
  overrides: { description?: string; image?: string | null; env?: SiteUrlEnv } = {},
): Metadata {
  return buildMetadata({
    title: 'Portfólio',
    description:
      overrides.description ??
      'Catálogo completo dos programas produzidos pela Reiners Media: conceito visual, apresentadores e episódios.',
    path: PORTFOLIO_PATH,
    image: overrides.image ?? DEFAULT_OG_IMAGE,
    env: overrides.env,
  });
}

/** Campos de um programa efetivamente usados por SEO. */
export type PodcastSeoInput = Pick<
  Podcast,
  'slug' | 'title' | 'description' | 'coverImage' | 'category' | 'status'
> &
  Partial<Pick<Podcast, 'tagline' | 'heroImage' | 'year' | 'hosts' | 'socialLinks'>>;

/**
 * Metadata de `/portfolio/[slug]` (TCK-016). A página continua dona do seu
 * `generateMetadata`; ela só delega a montagem para cá.
 */
export function buildPodcastMetadata(
  podcast: PodcastSeoInput,
  options: { env?: SiteUrlEnv } = {},
): Metadata {
  const description = podcast.tagline?.trim() || truncate(podcast.description, 200);
  return buildMetadata({
    title: podcast.title,
    description,
    path: podcastPath(podcast.slug),
    image: podcast.heroImage ?? podcast.coverImage,
    imageAlt: `Capa do programa ${podcast.title}`,
    type: 'article',
    keywords: [podcast.category, 'podcast', SITE_NAME],
    env: options.env,
  });
}

/** Corta no limite sem partir palavra e sem deixar pontuação órfã. */
export function truncate(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  const cut = normalized.slice(0, maxLength - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > maxLength / 2 ? cut.slice(0, lastSpace) : cut).replace(/[\s.,;:!-]+$/, '')}…`;
}

/* -------------------------------------------------------------------------- */
/* JSON-LD (schema.org)                                                       */
/* -------------------------------------------------------------------------- */

/** Nó JSON-LD. `@type` é obrigatório; o resto é aberto por natureza do vocabulário. */
export interface JsonLdNode {
  '@context'?: string;
  '@type': string;
  [key: string]: unknown;
}

const SCHEMA_CONTEXT = 'https://schema.org';

/** Remove `undefined`/`null`/string vazia/array vazio, recursivamente. */
function prune<T>(value: T): T {
  if (Array.isArray(value)) {
    const items = value.map(prune).filter((item) => item !== undefined);
    return items as unknown as T;
  }
  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
      if (raw === undefined || raw === null || raw === '') continue;
      const cleaned = prune(raw);
      if (Array.isArray(cleaned) && cleaned.length === 0) continue;
      result[key] = cleaned;
    }
    return result as unknown as T;
  }
  return value;
}

/** `45:30` -> `PT45M30S`; `1:02:03` -> `PT1H2M3S`. Inválido -> `undefined`. */
export function toIso8601Duration(duration: string | null | undefined): string | undefined {
  if (!duration) return undefined;
  const parts = duration.trim().split(':');
  if (parts.length < 2 || parts.length > 3) return undefined;
  const numbers = parts.map((part) => Number.parseInt(part, 10));
  if (numbers.some((n) => !Number.isFinite(n) || n < 0)) return undefined;

  const [hours, minutes, seconds] =
    numbers.length === 3 ? numbers : [0, numbers[0] as number, numbers[1] as number];

  const result = [
    hours ? `${hours}H` : '',
    minutes ? `${minutes}M` : '',
    seconds ? `${seconds}S` : '',
  ].join('');

  return `PT${result || '0S'}`;
}

function hostToPerson(host: PodcastHost, env?: SiteUrlEnv): JsonLdNode {
  return prune({
    '@type': 'Person',
    name: host.name,
    description: host.bio ?? undefined,
    // `undefined` cai no default do parâmetro (leitura de process.env).
    image: host.photo ? absoluteUrl(host.photo, env) : undefined,
  });
}

/** `Organization` do estúdio — vai na home (TCK-011). */
export function organizationJsonLd(
  options: { logo?: string; sameAs?: readonly string[]; env?: SiteUrlEnv } = {},
): JsonLdNode {
  const env = options.env;
  const base = getSiteUrl(env);
  return prune({
    '@context': SCHEMA_CONTEXT,
    '@type': 'Organization',
    '@id': `${base}#organization`,
    name: SITE_NAME,
    legalName: SITE_LEGAL_NAME,
    url: `${base}/`,
    description: DEFAULT_DESCRIPTION,
    logo: absoluteUrl(options.logo ?? DEFAULT_OG_IMAGE, env),
    sameAs: options.sameAs ? [...options.sameAs] : undefined,
  });
}

/**
 * `PodcastSeries` de um programa. É o nó que faz o Google entender o catálogo:
 * sem ele, a página é só mais um HTML com imagem grande.
 */
export function podcastSeriesJsonLd(
  podcast: PodcastSeoInput | PodcastWithEpisodes,
  options: { env?: SiteUrlEnv } = {},
): JsonLdNode {
  const env = options.env;
  const url = absoluteUrl(podcastPath(podcast.slug), env);
  const hosts = podcast.hosts ?? [];
  const episodes = 'episodes' in podcast ? podcast.episodes : undefined;
  const socialLinks = podcast.socialLinks ?? {};

  return prune({
    '@context': SCHEMA_CONTEXT,
    '@type': 'PodcastSeries',
    '@id': `${url}#podcast`,
    name: podcast.title,
    description: podcast.description,
    url,
    image: absoluteUrl(podcast.coverImage, env),
    genre: podcast.category,
    inLanguage: SITE_LANGUAGE,
    author: hosts.map((host) => hostToPerson(host, env)),
    publisher: { '@type': 'Organization', name: SITE_NAME, url: `${getSiteUrl(env)}/` },
    sameAs: Object.values(socialLinks).filter(
      (link): link is string => typeof link === 'string' && link.length > 0,
    ),
    numberOfEpisodes: episodes?.length,
    // ENDED continua indexável (valor de catálogo), mas o vocabulário registra
    // que a produção terminou — ver a decisão documentada em src/app/sitemap.ts.
    ...(podcast.status === 'ENDED' && podcast.year ? { endDate: String(podcast.year) } : {}),
    ...(podcast.year ? { startDate: String(podcast.year) } : {}),
  });
}

/** `PodcastEpisode`, sempre amarrado à série via `partOfSeries`. */
export function podcastEpisodeJsonLd(
  episode: Pick<
    Episode,
    'title' | 'description' | 'number' | 'duration' | 'publishedAt' | 'thumbnail'
  > &
    Partial<Pick<Episode, 'youtubeUrl' | 'spotifyUrl'>>,
  podcast: Pick<PodcastSeoInput, 'slug' | 'title'>,
  options: { env?: SiteUrlEnv } = {},
): JsonLdNode {
  const env = options.env;
  const seriesUrl = absoluteUrl(podcastPath(podcast.slug), env);
  const associated = [episode.youtubeUrl, episode.spotifyUrl].filter(
    (link): link is string => typeof link === 'string' && link.length > 0,
  );

  return prune({
    '@context': SCHEMA_CONTEXT,
    '@type': 'PodcastEpisode',
    '@id': `${seriesUrl}#episode-${episode.number}`,
    name: episode.title,
    description: episode.description,
    url: seriesUrl,
    episodeNumber: episode.number,
    datePublished: episode.publishedAt,
    timeRequired: toIso8601Duration(episode.duration),
    thumbnailUrl: episode.thumbnail ? absoluteUrl(episode.thumbnail, env) : undefined,
    associatedMedia: associated.map((contentUrl) => ({ '@type': 'MediaObject', contentUrl })),
    partOfSeries: {
      '@type': 'PodcastSeries',
      '@id': `${seriesUrl}#podcast`,
      name: podcast.title,
      url: seriesUrl,
    },
  });
}

export interface BreadcrumbItem {
  name: string;
  /** Caminho root-relativo ou URL absoluta. */
  path: string;
}

/** `BreadcrumbList` — posições começam em 1, na ordem recebida. */
export function breadcrumbJsonLd(
  items: readonly BreadcrumbItem[],
  options: { env?: SiteUrlEnv } = {},
): JsonLdNode {
  return prune({
    '@context': SCHEMA_CONTEXT,
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path, options.env),
    })),
  });
}

/** Trilha pronta da página de programa: Início > Portfólio > <programa>. */
export function podcastBreadcrumbJsonLd(
  podcast: Pick<PodcastSeoInput, 'slug' | 'title'>,
  options: { env?: SiteUrlEnv } = {},
): JsonLdNode {
  return breadcrumbJsonLd(
    [
      { name: 'Início', path: HOME_PATH },
      { name: 'Portfólio', path: PORTFOLIO_PATH },
      { name: podcast.title, path: podcastPath(podcast.slug) },
    ],
    options,
  );
}

/* -------------------------------------------------------------------------- */
/* Serialização segura                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Escapes obrigatórios dentro de `<script>`:
 * - `<`/`>` impedem que um `</script>` vindo do banco feche a tag;
 * - `&` impede reintrodução de sequência sensível por entidade;
 * - U+2028/U+2029 são quebras de linha válidas em JSON e ILEGAIS em JS literal.
 */
const JSON_LD_ESCAPES: Readonly<Record<string, string>> = {
  '<': '\\u003c',
  '>': '\\u003e',
  '&': '\\u0026',
  '\u2028': '\\u2028',
  '\u2029': '\\u2029',
};

/**
 * Serializa JSON-LD para dentro de `<script type="application/ld+json">`.
 *
 * O resultado continua sendo JSON válido (`\uXXXX` é escape legítimo de string
 * JSON), então `JSON.parse` devolve o título original — o escape é só de
 * transporte, não altera o dado que o Google lê.
 */
export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, (char) => JSON_LD_ESCAPES[char] ?? char);
}

/**
 * Props prontas para `<script {...jsonLdScriptProps(node)} />`. É a ÚNICA forma
 * suportada de injetar JSON-LD no produto.
 */
export function jsonLdScriptProps(value: unknown): {
  type: 'application/ld+json';
  dangerouslySetInnerHTML: { __html: string };
} {
  return {
    type: 'application/ld+json',
    dangerouslySetInnerHTML: { __html: serializeJsonLd(value) },
  };
}

/** Status de programa que o produto considera indexável. Ver `src/app/sitemap.ts`. */
export const INDEXABLE_PODCAST_STATUSES: readonly PodcastStatus[] = ['ACTIVE', 'HIATUS', 'ENDED'];

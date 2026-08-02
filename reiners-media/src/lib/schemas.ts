/**
 * Reiners Media Podcast Studio — Zod schemas (CONTRACT-004).
 *
 * Fonte de verdade EXECUTÁVEL dos contratos de API. Os arquivos OpenAPI em
 * `contracts/api/*.yaml` (CONTRACT-003) são a documentação equivalente e cada
 * operação declara, via extensões `x-zod-*`, qual schema exportado deste módulo
 * valida sua query / body / resposta. O teste
 * `tests/integration/contract-validation.test.ts` garante que os dois lados
 * nunca divirjam.
 *
 * Regras de negócio TOTALMENTE fechadas pelo schema (docs/PRD.md §11):
 * - BR-003 — programa precisa de >= 1 host          -> `hosts.min(1)`
 * - BR-007 — YouTube URL -> embed ID                -> `YOUTUBE_URL_PATTERNS`
 * - BR-008 — Spotify URL -> embed URI               -> `SPOTIFY_URL_PATTERNS`
 *
 * Regras fechadas no CREATE, mas NÃO no PATCH (payload parcial não enxerga o
 * estado persistido). O route handler DEVE fechá-las sobre o estado mesclado
 * usando os helpers abaixo, devolvendo 409/422:
 * - BR-004 — episódio precisa de >= 1 trilha  -> `validateEpisodeTracks` (TCK-006)
 * - BR-006 — ENDED não pode ser destaque      -> `validatePodcastRules` (TCK-005)
 *
 * Regras que dependem do banco e nunca são expressáveis em Zod (documentadas
 * nos YAMLs como resposta 409):
 * - BR-001/BR-002 — RBAC (TCK-004)
 * - BR-005 — máximo de 3 programas em destaque -> `validatePodcastRules` + count
 * - BR-009 — retenção de 90 dias do EventLog (TCK-021, ver EVENT_LOG_RETENTION_DAYS)
 */
import { z } from 'zod';

/* -------------------------------------------------------------------------- */
/* Constantes de contrato                                                     */
/* -------------------------------------------------------------------------- */

/** Itens por página padrão de qualquer listagem paginada. */
export const DEFAULT_PAGE_LIMIT = 20;
/** Teto absoluto de itens por página (protege o banco de scans grandes). */
export const MAX_PAGE_LIMIT = 100;
/** Menor ano aceito para `Podcast.year`. */
export const MIN_YEAR = 2000;
/** Maior ano aceito para `Podcast.year` (permite agendar o ano seguinte). */
export const MAX_YEAR = new Date().getUTCFullYear() + 1;
/** Tamanho máximo de upload: 5MB (docs/API_CONTRACTS.md — POST /api/upload). */
export const UPLOAD_MAX_BYTES = 5 * 1024 * 1024;
/** MIME types aceitos no upload de imagens. */
export const UPLOAD_ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
/** BR-005 — máximo de programas com `featured: true` (validado no banco, TCK-005). */
export const MAX_FEATURED_PODCASTS = 3;
/** BR-009 — retenção do EventLog em dias (job de limpeza, TCK-021). */
export const EVENT_LOG_RETENTION_DAYS = 90;
/** Rate limit de POST /api/events por IP (docs/API_CONTRACTS.md). */
export const EVENTS_RATE_LIMIT_PER_MINUTE = 100;

/* -------------------------------------------------------------------------- */
/* Expressões regulares canônicas                                             */
/* -------------------------------------------------------------------------- */

/** Slug kebab-case: `horizonte-digital`. Sem underscore, acento ou hífen duplo. */
export const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Cor hexadecimal de 6 dígitos com `#`: `#d87dff`. */
export const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;

/** Duração `MM:SS` ou `H:MM:SS` / `HH:MM:SS`. Segundos e minutos em 00-59. */
export const DURATION_REGEX = /^\d{1,2}:[0-5]\d(?::[0-5]\d)?$/;

/**
 * Padrões canônicos de URL do YouTube. O grupo de captura 1 é SEMPRE o video ID
 * (11 caracteres base64url). TCK-006 deve implementar o parser
 * (`src/lib/url-parser.ts`) iterando exatamente sobre este array — não criar
 * regex novo.
 *
 * Formas aceitas:
 * - `https://youtu.be/<id>`
 * - `https://www.youtube.com/watch?v=<id>` (query extra permitida)
 * - `https://www.youtube.com/embed/<id>`
 */
export const YOUTUBE_URL_PATTERNS: readonly RegExp[] = [
  /^https?:\/\/(?:www\.)?youtu\.be\/([A-Za-z0-9_-]{11})(?:[?#].*)?$/,
  /^https?:\/\/(?:www\.|m\.)?youtube\.com\/watch\?(?:[^#]*&)?v=([A-Za-z0-9_-]{11})(?:[&#].*)?$/,
  /^https?:\/\/(?:www\.)?youtube\.com\/embed\/([A-Za-z0-9_-]{11})(?:[?#].*)?$/,
];

/**
 * Padrões canônicos de URL de episódio do Spotify. O grupo de captura 1 é
 * SEMPRE o episode ID (22 caracteres base62), que TCK-006 converte na URI
 * `spotify:episode:<id>` (BR-008). Querystring e prefixo de locale
 * (`/intl-pt/`) são opcionais.
 */
export const SPOTIFY_URL_PATTERNS: readonly RegExp[] = [
  /^https?:\/\/open\.spotify\.com\/(?:intl-[a-z]{2}\/)?episode\/([A-Za-z0-9]{22})(?:[?#].*)?$/,
];

/** `true` se a URL casa com algum padrão canônico do YouTube. */
export function isYoutubeUrl(value: string): boolean {
  return YOUTUBE_URL_PATTERNS.some((pattern) => pattern.test(value));
}

/** `true` se a URL casa com algum padrão canônico de episódio do Spotify. */
export function isSpotifyUrl(value: string): boolean {
  return SPOTIFY_URL_PATTERNS.some((pattern) => pattern.test(value));
}

/* -------------------------------------------------------------------------- */
/* Primitivos reutilizáveis                                                   */
/* -------------------------------------------------------------------------- */

/** Data/hora ISO-8601 com timezone (`2024-01-01T00:00:00Z` ou `+00:00`). */
export const isoDateTimeSchema = z.string().datetime({ offset: true });

/** Identificador de recurso (UUID v4 gerado pelo Prisma). */
export const uuidSchema = z.string().uuid();

export const slugSchema = z
  .string()
  .min(1)
  .max(80)
  .regex(SLUG_REGEX, 'Slug deve ser kebab-case: apenas [a-z0-9] separados por hífen simples');

export const hexColorSchema = z
  .string()
  .regex(HEX_COLOR_REGEX, 'Cor deve ser hexadecimal de 6 dígitos, ex: #d87dff');

export const durationSchema = z
  .string()
  .regex(DURATION_REGEX, 'Duração deve estar em MM:SS ou H:MM:SS, ex: 45:30');

/** URL absoluta. Use apenas para link externo de verdade (redes, YouTube, Spotify). */
export const urlSchema = z.string().url().max(2048);

/**
 * Caminho root-relativo servido de `public/`, ex: `/images/podcasts/capa.jpg`.
 * Exige barra inicial unica (barra dupla seria URL protocol-relative).
 */
export const IMAGE_ROOT_PATH_REGEX = /^\/(?!\/)[A-Za-z0-9._~\-/%()+,;=:@&$!]*$/;

/** Padrao equivalente publicado nos YAMLs OpenAPI para campos de imagem. */
export const IMAGE_REF_PATTERN = '^(?:https?://[^\\s]+|/(?!/)[^\\s]*)$';

/**
 * Referencia de imagem aceita pelo produto. Existem duas origens legitimas:
 * - upload real -> URL absoluta do Supabase Storage (`https://...`);
 * - asset de demonstracao -> caminho root-relativo servido de `public/`
 *   (`/images/podcasts/horizonte-digital-cover.jpg`), que e o formato gravado
 *   pelo seed de TCK-002.
 *
 * Rejeita explicitamente: string vazia, `//host` (protocol-relative),
 * `javascript:` e demais esquemas, path traversal (`..`) e espacos em branco.
 */
export function isImageRef(value: string): boolean {
  if (value.length === 0 || value.length > 2048) return false;
  if (/[\s<>"'`\\]/.test(value)) return false;
  if (value.split('/').includes('..')) return false;
  if (IMAGE_ROOT_PATH_REGEX.test(value)) return true;
  if (!/^https?:\/\//i.test(value)) return false;
  try {
    const parsed = new URL(value);
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && parsed.host.length > 0;
  } catch {
    return false;
  }
}

export const imageRefSchema = z
  .string()
  .min(1)
  .max(2048)
  .refine(
    isImageRef,
    'Imagem deve ser uma URL http(s) absoluta ou um caminho iniciado por /, ex: /images/capa.jpg',
  );

export const yearSchema = z.number().int().min(MIN_YEAR).max(MAX_YEAR);

/** Booleano vindo de querystring: aceita `true/false/1/0` além de boolean. */
export const booleanQueryParamSchema = z.union([
  z.boolean(),
  z
    .enum(['true', 'false', '1', '0'])
    .transform((value) => value === 'true' || value === '1'),
]);

/* -------------------------------------------------------------------------- */
/* Enums                                                                      */
/* -------------------------------------------------------------------------- */

export const podcastStatusSchema = z.enum(['ACTIVE', 'ENDED', 'HIATUS']);
export const visualStyleSchema = z.enum([
  'PHOTO_REAL',
  'ILLUSTRATION',
  'MINIMAL',
  'DUOTONE',
  'COLLAGE',
]);
export const adminRoleSchema = z.enum(['ADMIN', 'EDITOR']);
export const eventTypeSchema = z.enum([
  'PAGE_VIEW',
  'CARD_EXPAND',
  'YOUTUBE_CLICK',
  'SPOTIFY_CLICK',
  'EPISODE_PLAY',
  'ADMIN_LOGIN',
  'EPISODE_CREATE',
]);
export const uploadFolderSchema = z.enum(['podcasts', 'episodes', 'avatars', 'logos']);
export const uploadMimeTypeSchema = z.enum(UPLOAD_ALLOWED_MIME_TYPES);
export const errorCodeSchema = z.enum([
  'BAD_REQUEST',
  'VALIDATION_ERROR',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'PAYLOAD_TOO_LARGE',
  'UNSUPPORTED_MEDIA_TYPE',
  'RATE_LIMITED',
  'INTERNAL_ERROR',
]);
export const sortOrderSchema = z.enum(['asc', 'desc']);

/** Mapas `{ VALOR: 'VALOR' }` para uso como constantes no código de produção. */
export const PodcastStatus = podcastStatusSchema.enum;
export const VisualStyle = visualStyleSchema.enum;
export const AdminRole = adminRoleSchema.enum;
export const EventType = eventTypeSchema.enum;
export const UploadFolder = uploadFolderSchema.enum;
export const ErrorCode = errorCodeSchema.enum;

/**
 * Registro nome-do-enum -> schema. Usado pelo teste de contrato para conferir
 * que os `enum:` dos YAMLs batem exatamente com os valores Zod.
 */
export const ZOD_ENUMS = {
  PodcastStatus: podcastStatusSchema,
  VisualStyle: visualStyleSchema,
  AdminRole: adminRoleSchema,
  EventType: eventTypeSchema,
  UploadFolder: uploadFolderSchema,
  UploadMimeType: uploadMimeTypeSchema,
  ErrorCode: errorCodeSchema,
  SortOrder: sortOrderSchema,
} as const;

/** Status HTTP canônico de cada código de erro. */
export const ERROR_STATUS_BY_CODE: Record<z.infer<typeof errorCodeSchema>, number> = {
  BAD_REQUEST: 400,
  VALIDATION_ERROR: 422,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA_TYPE: 415,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
};

/* -------------------------------------------------------------------------- */
/* Envelopes de resposta                                                      */
/* -------------------------------------------------------------------------- */

export const errorObjectSchema = z.object({
  code: errorCodeSchema,
  message: z.string().min(1),
  details: z.record(z.string(), z.unknown()).optional(),
});

/** Formato único de erro de toda a API: `{ error: { code, message, details? } }`. */
export const errorResponseSchema = z.object({ error: errorObjectSchema });

export const paginationMetaSchema = z.object({
  page: z.number().int().min(1),
  limit: z.number().int().min(1).max(MAX_PAGE_LIMIT),
  total: z.number().int().min(0),
  totalPages: z.number().int().min(0),
});

/** `{ data: <item> }` — envelope de recurso único. */
export function dataResponseSchema<TItem extends z.ZodTypeAny>(item: TItem) {
  return z.object({ data: item });
}

/** `{ data: <item>[], meta: {...} }` — envelope paginado genérico. */
export function paginatedResponseSchema<TItem extends z.ZodTypeAny>(item: TItem) {
  return z.object({ data: z.array(item), meta: paginationMetaSchema });
}

/* -------------------------------------------------------------------------- */
/* Query / paginação                                                          */
/* -------------------------------------------------------------------------- */

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_LIMIT).default(DEFAULT_PAGE_LIMIT),
});

export const podcastSortFieldSchema = z.enum([
  'displayOrder',
  'createdAt',
  'updatedAt',
  'year',
  'title',
]);

export const podcastQuerySchema = paginationQuerySchema.extend({
  sort: podcastSortFieldSchema.default('displayOrder'),
  order: sortOrderSchema.default('asc'),
  status: podcastStatusSchema.optional(),
  category: z.string().min(1).max(60).optional(),
  featured: booleanQueryParamSchema.optional(),
});

export const episodeSortFieldSchema = z.enum(['number', 'publishedAt', 'createdAt']);

export const episodeQuerySchema = paginationQuerySchema.extend({
  sort: episodeSortFieldSchema.default('publishedAt'),
  order: sortOrderSchema.default('desc'),
  /** Obrigatório: episódios só são listados no contexto de um programa. */
  podcastId: uuidSchema,
});

export const eventQuerySchema = paginationQuerySchema.extend({
  sort: z.enum(['createdAt']).default('createdAt'),
  order: sortOrderSchema.default('desc'),
  eventType: eventTypeSchema.optional(),
  from: isoDateTimeSchema.optional(),
  to: isoDateTimeSchema.optional(),
});

/** Parâmetro de rota `:slug`. */
export const slugParamSchema = z.object({ slug: slugSchema });
/** Parâmetro de rota `:id`. */
export const idParamSchema = z.object({ id: uuidSchema });

/* -------------------------------------------------------------------------- */
/* Podcast                                                                    */
/* -------------------------------------------------------------------------- */

export const podcastHostSchema = z.object({
  name: z.string().min(1).max(80),
  /** Iniciais exibidas no avatar fallback, ex: `MR`. */
  initial: z.string().min(1).max(2),
  photo: imageRefSchema.nullish(),
  bio: z.string().max(600).nullish(),
});

export const socialLinksSchema = z.object({
  instagram: urlSchema.nullish(),
  twitter: urlSchema.nullish(),
  tiktok: urlSchema.nullish(),
  linkedin: urlSchema.nullish(),
  website: urlSchema.nullish(),
  github: urlSchema.nullish(),
});

/** Campos mutáveis de um programa (base de create/update/entidade). */
const podcastWritableSchema = z
  .object({
    slug: slugSchema,
    title: z.string().min(1).max(120),
    tagline: z.string().max(160).nullish(),
    description: z.string().min(1).max(5000),
    coverImage: imageRefSchema,
    heroImage: imageRefSchema.nullish(),
    category: z.string().min(1).max(60),
    status: podcastStatusSchema.default('ACTIVE'),
    visualStyle: visualStyleSchema.default('PHOTO_REAL'),
    year: yearSchema,
    accentColor: hexColorSchema.default('#d87dff'),
    /** BR-003 — todo programa precisa de pelo menos um host. */
    hosts: z.array(podcastHostSchema).min(1, 'BR-003: programa precisa de pelo menos 1 host'),
    socialLinks: socialLinksSchema.default({}),
    featured: z.boolean().default(false),
    displayOrder: z.number().int().min(0).default(0),
  })
  .strict();

/** BR-006 — programa ENDED nunca pode estar em destaque. */
function refineEndedNotFeatured(value: {
  status?: unknown;
  featured?: unknown;
}): boolean {
  return !(value.status === 'ENDED' && value.featured === true);
}
const endedNotFeaturedError = {
  message: 'BR-006: programa com status ENDED não pode ser destaque',
  path: ['featured'] as (string | number)[],
};

export const podcastCreateSchema = podcastWritableSchema.refine(
  refineEndedNotFeatured,
  endedNotFeaturedError,
);

/**
 * ATENÇÃO — o `.refine` de BR-006 aqui só dispara quando `status` e `featured`
 * chegam JUNTOS no payload. Num PATCH `{ "featured": true }` o `status` vem
 * `undefined` e a validação passa, mesmo que o programa persistido esteja
 * ENDED. Isso é limitação intrínseca de schema de payload parcial, não um bug
 * a ser "consertado" aqui.
 *
 * O fechamento de BR-006 (e de BR-005) é OBRIGAÇÃO do route handler de TCK-005,
 * que deve chamar `validatePodcastRules(resolvePodcastRuleState(...))` sobre o
 * estado mesclado e devolver 409 em caso de violação.
 */
export const podcastUpdateSchema = podcastWritableSchema
  .partial()
  .refine(refineEndedNotFeatured, endedNotFeaturedError);

/**
 * Programa como sai da API **pública**.
 *
 * Os campos que têm `.default()` no schema de escrita são redeclarados sem
 * default: numa resposta eles sempre vêm preenchidos, e deixar o default aqui
 * faria o validador aceitar uma resposta incompleta (`status` ausente vira
 * 'ACTIVE' silenciosamente).
 *
 * `deletedAt` NÃO aparece aqui de propósito: é metadado interno de soft delete
 * e expô-lo em rota pública vazaria estado interno. Quem precisa dele usa
 * `podcastAdminSchema`.
 */
export const podcastSchema = podcastWritableSchema.extend({
  id: uuidSchema,
  status: podcastStatusSchema,
  visualStyle: visualStyleSchema,
  accentColor: hexColorSchema,
  socialLinks: socialLinksSchema,
  featured: z.boolean(),
  displayOrder: z.number().int().min(0),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

/**
 * Programa como sai das rotas administrativas, incluindo o metadado de soft
 * delete. Usado na resposta de `DELETE /api/podcasts/:id` e pelo painel
 * (TCK-018). Nunca serialize isto em rota pública.
 */
export const podcastAdminSchema = podcastSchema.extend({
  deletedAt: isoDateTimeSchema.nullable(),
});

/* -------------------------------------------------------------------------- */
/* Regras de negócio sobre estado MESCLADO (obrigação do route handler)        */
/* -------------------------------------------------------------------------- */

export type BusinessRuleId = 'BR-004' | 'BR-005' | 'BR-006';

export interface BusinessRuleViolation {
  rule: BusinessRuleId;
  /** Código de erro a devolver no envelope padronizado. */
  code: 'CONFLICT' | 'VALIDATION_ERROR';
  message: string;
  path: string[];
}

export interface PodcastRuleState {
  status: z.infer<typeof podcastStatusSchema>;
  featured: boolean;
  /**
   * Quantos OUTROS programas estão com `featured: true` (exclui o que está
   * sendo salvo). O handler obtém com um `count` no Prisma.
   */
  otherFeaturedCount?: number;
}

/**
 * Mescla o estado persistido com o patch já validado.
 *
 * Necessário porque `podcastUpdateSchema` é parcial: num PATCH
 * `{ "featured": true }` o campo `status` chega `undefined`, então nenhum
 * `.refine` de payload consegue avaliar BR-006 — só o estado final consegue.
 */
export function resolvePodcastRuleState(
  current: { status: z.infer<typeof podcastStatusSchema>; featured: boolean },
  patch: { status?: z.infer<typeof podcastStatusSchema>; featured?: boolean },
  otherFeaturedCount?: number,
): PodcastRuleState {
  return {
    status: patch.status ?? current.status,
    featured: patch.featured ?? current.featured,
    otherFeaturedCount,
  };
}

/**
 * Aplica BR-005 e BR-006 sobre o estado final de um programa.
 *
 * TCK-005 (POST e PATCH de podcasts) e TCK-018 (painel) DEVEM chamar isto
 * depois do parse do payload — o schema Zod sozinho não fecha essas regras.
 * Violações devem virar 409 CONFLICT.
 */
export function validatePodcastRules(state: PodcastRuleState): BusinessRuleViolation[] {
  const violations: BusinessRuleViolation[] = [];

  if (state.featured && state.status === 'ENDED') {
    violations.push({
      rule: 'BR-006',
      code: 'CONFLICT',
      message: 'BR-006: programa com status ENDED não pode ser destaque',
      path: ['featured'],
    });
  }

  if (
    state.featured &&
    state.otherFeaturedCount !== undefined &&
    state.otherFeaturedCount + 1 > MAX_FEATURED_PODCASTS
  ) {
    violations.push({
      rule: 'BR-005',
      code: 'CONFLICT',
      message: `BR-005: no máximo ${MAX_FEATURED_PODCASTS} programas podem estar em destaque`,
      path: ['featured'],
    });
  }

  return violations;
}

/**
 * Aplica BR-004 sobre o estado final de um episódio.
 *
 * TCK-006 DEVE chamar isto no PATCH: `episodeUpdateSchema` só consegue avaliar
 * a regra quando as duas chaves chegam juntas no payload.
 */
export function validateEpisodeTracks(state: {
  youtubeUrl?: string | null;
  spotifyUrl?: string | null;
}): BusinessRuleViolation[] {
  if (state.youtubeUrl || state.spotifyUrl) return [];
  return [
    {
      rule: 'BR-004',
      code: 'VALIDATION_ERROR',
      message: 'BR-004: episódio precisa de pelo menos uma trilha (youtubeUrl ou spotifyUrl)',
      path: ['youtubeUrl'],
    },
  ];
}

/* -------------------------------------------------------------------------- */
/* Episode                                                                    */
/* -------------------------------------------------------------------------- */

const youtubeUrlSchema = urlSchema.refine(
  isYoutubeUrl,
  'URL do YouTube inválida: use youtu.be/<id>, youtube.com/watch?v=<id> ou youtube.com/embed/<id>',
);

const spotifyUrlSchema = urlSchema.refine(
  isSpotifyUrl,
  'URL do Spotify inválida: use open.spotify.com/episode/<id>',
);

/** Campos mutáveis de um episódio. `*Embed` é derivado no servidor (BR-007/BR-008). */
const episodeWritableSchema = z
  .object({
    podcastId: uuidSchema,
    number: z.number().int().min(1),
    title: z.string().min(1).max(160),
    description: z.string().min(1).max(5000),
    thumbnail: imageRefSchema.nullish(),
    duration: durationSchema,
    publishedAt: isoDateTimeSchema,
    youtubeUrl: youtubeUrlSchema.nullish(),
    spotifyUrl: spotifyUrlSchema.nullish(),
  })
  .strict();

const atLeastOneTrackError = {
  message: 'BR-004: episódio precisa de pelo menos uma trilha (youtubeUrl ou spotifyUrl)',
  path: ['youtubeUrl'] as (string | number)[],
};

/** BR-004 — pelo menos uma trilha no create. */
export const episodeCreateSchema = episodeWritableSchema.refine(
  (value) => Boolean(value.youtubeUrl) || Boolean(value.spotifyUrl),
  atLeastOneTrackError,
);

/**
 * BR-004 no update: só é verificável quando as duas chaves vêm no payload
 * (do contrário o valor persistido complementa). A checagem final contra o
 * estado mesclado é responsabilidade de TCK-006.
 */
export const episodeUpdateSchema = episodeWritableSchema
  .omit({ podcastId: true })
  .partial()
  .refine((value) => {
    const hasBothKeys = 'youtubeUrl' in value && 'spotifyUrl' in value;
    if (!hasBothKeys) return true;
    return Boolean(value.youtubeUrl) || Boolean(value.spotifyUrl);
  }, atLeastOneTrackError);

export const episodeSchema = episodeWritableSchema.extend({
  id: uuidSchema,
  /** Video ID extraído de `youtubeUrl` (BR-007). */
  youtubeEmbed: z.string().min(1).nullable(),
  /** URI `spotify:episode:<id>` extraída de `spotifyUrl` (BR-008). */
  spotifyEmbed: z.string().min(1).nullable(),
  createdAt: isoDateTimeSchema,
});

/** GET /api/podcasts/:slug devolve o programa com seus episódios. */
export const podcastWithEpisodesSchema = podcastSchema.extend({
  episodes: z.array(episodeSchema),
});

/* -------------------------------------------------------------------------- */
/* SiteConfig                                                                 */
/* -------------------------------------------------------------------------- */

const siteConfigWritableSchema = z
  .object({
    siteName: z.string().min(1).max(80).default('Reiners Media'),
    tagline: z.string().min(1).max(160).default('Conteúdo que conecta'),
    logoUrl: imageRefSchema.nullish(),
    faviconUrl: imageRefSchema.nullish(),
    primaryColor: hexColorSchema.default('#d87dff'),
    seoTitle: z.string().max(70).nullish(),
    seoDescription: z.string().max(200).nullish(),
    analyticsId: z.string().max(60).nullish(),
    facebookPixel: z.string().max(60).nullish(),
    customCss: z.string().max(50000).nullish(),
  })
  .strict();

export const siteConfigCreateSchema = siteConfigWritableSchema;
export const siteConfigUpdateSchema = siteConfigWritableSchema.partial();
/** Campos com default são redeclarados obrigatórios: a resposta sempre os traz. */
export const siteConfigSchema = siteConfigWritableSchema.extend({
  id: uuidSchema,
  siteName: z.string().min(1).max(80),
  tagline: z.string().min(1).max(160),
  primaryColor: hexColorSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

/* -------------------------------------------------------------------------- */
/* EventLog                                                                   */
/* -------------------------------------------------------------------------- */

/** Payload de analytics: campos conhecidos + extras livres (JSON-serializável). */
export const eventPayloadSchema = z
  .object({
    path: z.string().max(2048).optional(),
    referrer: z.string().max(2048).optional(),
    userAgent: z.string().max(512).optional(),
    podcastId: uuidSchema.optional(),
    episodeId: uuidSchema.optional(),
  })
  .catchall(z.unknown());

export const eventCreateSchema = z
  .object({
    eventType: eventTypeSchema,
    payload: eventPayloadSchema.optional(),
  })
  .strict();

export const eventUpdateSchema = eventCreateSchema.partial();

export const eventSchema = z.object({
  id: uuidSchema,
  eventType: eventTypeSchema,
  payload: eventPayloadSchema.nullable(),
  createdAt: isoDateTimeSchema,
});

/* -------------------------------------------------------------------------- */
/* Testimonial                                                                */
/* -------------------------------------------------------------------------- */

const testimonialWritableSchema = z
  .object({
    name: z.string().min(1).max(80),
    role: z.string().min(1).max(120),
    quote: z.string().min(1).max(1000),
    avatarUrl: imageRefSchema.nullish(),
    podcastId: uuidSchema.nullish(),
  })
  .strict();

export const testimonialCreateSchema = testimonialWritableSchema;
export const testimonialUpdateSchema = testimonialWritableSchema.partial();
export const testimonialSchema = testimonialWritableSchema.extend({
  id: uuidSchema,
  createdAt: isoDateTimeSchema,
});

/* -------------------------------------------------------------------------- */
/* Plan                                                                       */
/* -------------------------------------------------------------------------- */

const planWritableSchema = z
  .object({
    name: z.string().min(1).max(80),
    /** Preço como string formatada, ex: `R$ 2.500`. */
    price: z.string().min(1).max(40),
    /** Periodicidade, ex: `por episódio`, `mensal`. */
    period: z.string().min(1).max(40),
    description: z.string().max(1000).nullish(),
    features: z.array(z.string().min(1).max(160)).min(1),
    isFeatured: z.boolean().default(false),
    displayOrder: z.number().int().min(0).default(0),
  })
  .strict();

export const planCreateSchema = planWritableSchema;
export const planUpdateSchema = planWritableSchema.partial();
export const planSchema = planWritableSchema.extend({
  id: uuidSchema,
  isFeatured: z.boolean(),
  displayOrder: z.number().int().min(0),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

/* -------------------------------------------------------------------------- */
/* Auth (TCK-004)                                                             */
/* -------------------------------------------------------------------------- */

export const adminUserSchema = z.object({
  id: uuidSchema,
  email: z.string().email(),
  name: z.string().max(80).nullable(),
  role: adminRoleSchema,
  lastLoginAt: isoDateTimeSchema.nullable(),
  createdAt: isoDateTimeSchema,
});

export const loginSchema = z
  .object({
    email: z.string().email().max(254),
    password: z.string().min(8).max(128),
  })
  .strict();

export const sessionSchema = z.object({
  authenticated: z.boolean(),
  user: adminUserSchema.nullable(),
  expiresAt: isoDateTimeSchema.nullable(),
});

export const logoutResponseSchema = z.object({ data: z.object({ success: z.literal(true) }) });

/* -------------------------------------------------------------------------- */
/* Upload (TCK-005)                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Metadados do arquivo enviado em `multipart/form-data`. O binário em si é
 * validado pelo handler; este schema valida o que dá para inspecionar antes de
 * tocar no Storage.
 */
export const uploadRequestSchema = z
  .object({
    folder: uploadFolderSchema,
    filename: z.string().min(1).max(255),
    contentType: uploadMimeTypeSchema,
    size: z.number().int().positive().max(UPLOAD_MAX_BYTES),
  })
  .strict();

export const uploadResultSchema = z.object({
  url: urlSchema,
  path: z.string().min(1).max(1024),
});

/* -------------------------------------------------------------------------- */
/* Respostas concretas por endpoint                                           */
/* -------------------------------------------------------------------------- */

export const podcastListResponseSchema = paginatedResponseSchema(podcastSchema);
export const podcastResponseSchema = dataResponseSchema(podcastSchema);
/** Resposta administrativa: inclui `deletedAt`. Usada por DELETE /api/podcasts/:id. */
export const podcastAdminResponseSchema = dataResponseSchema(podcastAdminSchema);
export const podcastDetailResponseSchema = dataResponseSchema(podcastWithEpisodesSchema);
export const episodeListResponseSchema = paginatedResponseSchema(episodeSchema);
export const episodeResponseSchema = dataResponseSchema(episodeSchema);
export const siteConfigResponseSchema = dataResponseSchema(siteConfigSchema);
export const eventListResponseSchema = paginatedResponseSchema(eventSchema);
export const eventResponseSchema = dataResponseSchema(eventSchema);
export const testimonialResponseSchema = dataResponseSchema(testimonialSchema);
export const planResponseSchema = dataResponseSchema(planSchema);
export const sessionResponseSchema = dataResponseSchema(sessionSchema);
export const uploadResponseSchema = dataResponseSchema(uploadResultSchema);

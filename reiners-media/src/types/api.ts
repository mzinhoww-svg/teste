/**
 * Reiners Media Podcast Studio — tipos compartilhados de API (CONTRACT-003/004).
 *
 * TODOS os tipos aqui são derivados de `src/lib/schemas.ts` via `z.infer`.
 * Nunca redigite a forma de um objeto neste arquivo: altere o schema Zod e o
 * tipo acompanha. Zero `any`.
 *
 * Convenção de nomes:
 * - `Podcast`, `Episode`, ...            -> entidade como sai da API (JSON)
 * - `PodcastCreateInput`                 -> body de POST (antes dos defaults)
 * - `PodcastUpdateInput`                 -> body de PATCH (partial)
 * - `PodcastQuery`                       -> querystring já validada/coagida
 * - `PodcastListResponse`                -> envelope completo da resposta
 */
import type { z } from 'zod';

import type {
  adminRoleSchema,
  adminUserSchema,
  episodeCreateSchema,
  episodeListResponseSchema,
  episodeQuerySchema,
  episodeResponseSchema,
  episodeSchema,
  episodeSortFieldSchema,
  episodeUpdateSchema,
  errorCodeSchema,
  errorObjectSchema,
  errorResponseSchema,
  eventCreateSchema,
  eventListResponseSchema,
  eventPayloadSchema,
  eventQuerySchema,
  eventResponseSchema,
  eventSchema,
  eventTypeSchema,
  eventUpdateSchema,
  idParamSchema,
  loginSchema,
  logoutResponseSchema,
  paginationMetaSchema,
  paginationQuerySchema,
  planCreateSchema,
  planResponseSchema,
  planSchema,
  planUpdateSchema,
  podcastAdminResponseSchema,
  podcastAdminSchema,
  podcastCreateSchema,
  podcastDetailResponseSchema,
  podcastHostSchema,
  podcastListResponseSchema,
  podcastQuerySchema,
  podcastResponseSchema,
  podcastSchema,
  podcastSortFieldSchema,
  podcastStatusSchema,
  podcastUpdateSchema,
  podcastWithEpisodesSchema,
  sessionResponseSchema,
  sessionSchema,
  siteConfigCreateSchema,
  siteConfigResponseSchema,
  siteConfigSchema,
  siteConfigUpdateSchema,
  slugParamSchema,
  socialLinksSchema,
  sortOrderSchema,
  testimonialCreateSchema,
  testimonialResponseSchema,
  testimonialSchema,
  testimonialUpdateSchema,
  uploadFolderSchema,
  uploadMimeTypeSchema,
  uploadRequestSchema,
  uploadResponseSchema,
  uploadResultSchema,
  visualStyleSchema,
} from '@/lib/schemas';

/* -------------------------------------------------------------------------- */
/* Enums                                                                      */
/* -------------------------------------------------------------------------- */

export type PodcastStatus = z.infer<typeof podcastStatusSchema>;
export type VisualStyle = z.infer<typeof visualStyleSchema>;
export type AdminRole = z.infer<typeof adminRoleSchema>;
export type EventType = z.infer<typeof eventTypeSchema>;
export type UploadFolder = z.infer<typeof uploadFolderSchema>;
export type UploadMimeType = z.infer<typeof uploadMimeTypeSchema>;
export type ErrorCode = z.infer<typeof errorCodeSchema>;
export type SortOrder = z.infer<typeof sortOrderSchema>;
export type PodcastSortField = z.infer<typeof podcastSortFieldSchema>;
export type EpisodeSortField = z.infer<typeof episodeSortFieldSchema>;

/* -------------------------------------------------------------------------- */
/* Envelopes genéricos                                                        */
/* -------------------------------------------------------------------------- */

export type PaginationMeta = z.infer<typeof paginationMetaSchema>;
export type ApiErrorObject = z.infer<typeof errorObjectSchema>;
export type ApiErrorResponse = z.infer<typeof errorResponseSchema>;

/** `{ data: T }` — envelope de recurso único. */
export interface ApiResponse<TData> {
  data: TData;
}

/** `{ data: T[], meta }` — envelope paginado. */
export interface PaginatedResponse<TItem> {
  data: TItem[];
  meta: PaginationMeta;
}

/** Resultado de qualquer handler: sucesso tipado ou o erro padronizado. */
export type ApiResult<TData> = ApiResponse<TData> | ApiErrorResponse;

/* -------------------------------------------------------------------------- */
/* Query                                                                      */
/* -------------------------------------------------------------------------- */

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;
export type PaginationQueryInput = z.input<typeof paginationQuerySchema>;
export type PodcastQuery = z.infer<typeof podcastQuerySchema>;
export type PodcastQueryInput = z.input<typeof podcastQuerySchema>;
export type EpisodeQuery = z.infer<typeof episodeQuerySchema>;
export type EpisodeQueryInput = z.input<typeof episodeQuerySchema>;
export type EventQuery = z.infer<typeof eventQuerySchema>;
export type EventQueryInput = z.input<typeof eventQuerySchema>;
export type SlugParam = z.infer<typeof slugParamSchema>;
export type IdParam = z.infer<typeof idParamSchema>;

/* -------------------------------------------------------------------------- */
/* Podcast                                                                    */
/* -------------------------------------------------------------------------- */

export type PodcastHost = z.infer<typeof podcastHostSchema>;
export type SocialLinks = z.infer<typeof socialLinksSchema>;
export type Podcast = z.infer<typeof podcastSchema>;
export type PodcastWithEpisodes = z.infer<typeof podcastWithEpisodesSchema>;
export type PodcastCreateInput = z.input<typeof podcastCreateSchema>;
export type PodcastCreateData = z.infer<typeof podcastCreateSchema>;
export type PodcastUpdateInput = z.input<typeof podcastUpdateSchema>;
export type PodcastUpdateData = z.infer<typeof podcastUpdateSchema>;
export type PodcastListResponse = z.infer<typeof podcastListResponseSchema>;
/** Forma administrativa, com `deletedAt`. Nunca serialize em rota publica. */
export type PodcastAdmin = z.infer<typeof podcastAdminSchema>;
export type PodcastAdminResponse = z.infer<typeof podcastAdminResponseSchema>;
export type PodcastResponse = z.infer<typeof podcastResponseSchema>;
export type PodcastDetailResponse = z.infer<typeof podcastDetailResponseSchema>;

/**
 * Contratos das regras de negocio fechadas no route handler (BR-004/005/006).
 * Ver `validatePodcastRules` e `validateEpisodeTracks` em `@/lib/schemas`.
 */
export type { BusinessRuleId, BusinessRuleViolation, PodcastRuleState } from '@/lib/schemas';

/* -------------------------------------------------------------------------- */
/* Episode                                                                    */
/* -------------------------------------------------------------------------- */

export type Episode = z.infer<typeof episodeSchema>;
export type EpisodeCreateInput = z.input<typeof episodeCreateSchema>;
export type EpisodeCreateData = z.infer<typeof episodeCreateSchema>;
export type EpisodeUpdateInput = z.input<typeof episodeUpdateSchema>;
export type EpisodeUpdateData = z.infer<typeof episodeUpdateSchema>;
export type EpisodeListResponse = z.infer<typeof episodeListResponseSchema>;
export type EpisodeResponse = z.infer<typeof episodeResponseSchema>;

/* -------------------------------------------------------------------------- */
/* SiteConfig                                                                 */
/* -------------------------------------------------------------------------- */

export type SiteConfig = z.infer<typeof siteConfigSchema>;
export type SiteConfigCreateInput = z.input<typeof siteConfigCreateSchema>;
export type SiteConfigUpdateInput = z.input<typeof siteConfigUpdateSchema>;
export type SiteConfigUpdateData = z.infer<typeof siteConfigUpdateSchema>;
export type SiteConfigResponse = z.infer<typeof siteConfigResponseSchema>;

/* -------------------------------------------------------------------------- */
/* EventLog                                                                   */
/* -------------------------------------------------------------------------- */

export type EventPayload = z.infer<typeof eventPayloadSchema>;
export type EventLog = z.infer<typeof eventSchema>;
export type EventCreateInput = z.input<typeof eventCreateSchema>;
export type EventCreateData = z.infer<typeof eventCreateSchema>;
export type EventUpdateInput = z.input<typeof eventUpdateSchema>;
export type EventListResponse = z.infer<typeof eventListResponseSchema>;
export type EventResponse = z.infer<typeof eventResponseSchema>;

/* -------------------------------------------------------------------------- */
/* Testimonial / Plan                                                         */
/* -------------------------------------------------------------------------- */

export type Testimonial = z.infer<typeof testimonialSchema>;
export type TestimonialCreateInput = z.input<typeof testimonialCreateSchema>;
export type TestimonialUpdateInput = z.input<typeof testimonialUpdateSchema>;
export type TestimonialResponse = z.infer<typeof testimonialResponseSchema>;

export type Plan = z.infer<typeof planSchema>;
export type PlanCreateInput = z.input<typeof planCreateSchema>;
export type PlanUpdateInput = z.input<typeof planUpdateSchema>;
export type PlanResponse = z.infer<typeof planResponseSchema>;

/* -------------------------------------------------------------------------- */
/* Auth                                                                       */
/* -------------------------------------------------------------------------- */

export type AdminUser = z.infer<typeof adminUserSchema>;
export type LoginInput = z.input<typeof loginSchema>;
export type LoginData = z.infer<typeof loginSchema>;
export type Session = z.infer<typeof sessionSchema>;
export type SessionResponse = z.infer<typeof sessionResponseSchema>;
export type LogoutResponse = z.infer<typeof logoutResponseSchema>;

/* -------------------------------------------------------------------------- */
/* Upload                                                                     */
/* -------------------------------------------------------------------------- */

export type UploadRequest = z.infer<typeof uploadRequestSchema>;
export type UploadResult = z.infer<typeof uploadResultSchema>;
export type UploadResponse = z.infer<typeof uploadResponseSchema>;

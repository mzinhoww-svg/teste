/**
 * TCK-016 — Superfície pública dos componentes de programa.
 *
 * Consumo:
 *
 *     import { ProgramaHero, EpisodeList, TrackLinks } from '@/components/programa';
 *
 * SERVER vs CLIENT — o que TCK-013/014/015 precisam saber ao reusar isto:
 *   - Server Components (zero JS): `ProgramaHero`, `ProgramaAbout`,
 *     `EpisodeList`, `EpisodeListItem`, `ProgramaSocialLinks`, `TrackLinks`.
 *   - Client Component: apenas `ProgramaTabs`.
 *   - Módulos puros (rodam em qualquer lugar): `embeds`, `format`, `metadata`,
 *     `query`, `status`.
 *
 * `TrackLinks`/`resolveEpisodeTracks` já entregam `embedUrl` pronto para os dois
 * formatos de embed — o TCK-015 não precisa reconstruir URL nenhuma.
 */

export {
  SPOTIFY_EMBED_BASE,
  SPOTIFY_EPISODE_BASE,
  SPOTIFY_ID_REGEX,
  YOUTUBE_EMBED_BASE,
  YOUTUBE_ID_REGEX,
  YOUTUBE_WATCH_BASE,
  normalizeSpotifyId,
  normalizeYoutubeId,
  resolveEpisodeTracks,
  toSpotifyEmbedUrl,
  toSpotifyEpisodeUrl,
  toYoutubeEmbedUrl,
  toYoutubeWatchUrl,
  type EpisodeTrackSource,
  type ResolvedTrack,
  type TrackPlatform,
} from './embeds';

export {
  LOCALE,
  formatEpisodeCount,
  formatEpisodeNumber,
  formatPublishedAt,
  toDateTimeAttribute,
  toIsoDuration,
  toSpokenDuration,
} from './format';

export {
  MAX_DESCRIPTION_LENGTH,
  PORTFOLIO_PATH,
  SITE_NAME,
  buildNotFoundMetadata,
  buildProgramaDescription,
  buildProgramaMetadata,
  podcastCanonicalPath,
  truncateForMeta,
  type ProgramaMetadataOptions,
  type ProgramaMetadataSource,
} from './metadata';

export {
  EPISODE_ORDER_BY,
  PUBLIC_PODCAST_FILTER,
  isPubliclyVisible,
  publicPodcastWhere,
  type SoftDeletable,
} from './query';

export {
  PODCAST_STATUS_PRESENTATION,
  podcastStatusPresentation,
  type PodcastStatusPresentation,
} from './status';

export {
  EPISODE_THUMBNAIL_SIZES,
  EpisodeList,
  EpisodeListItem,
  type EpisodeHeadingLevel,
  type EpisodeListItemProps,
  type EpisodeListProps,
} from './episode-list';

export { ProgramaAbout, toParagraphs, type ProgramaAboutProps } from './programa-about';

export { ProgramaHero, type ProgramaHeroPodcast, type ProgramaHeroProps } from './programa-hero';

export {
  ProgramaSocialLinks,
  SOCIAL_ORDER,
  resolveSocialLinks,
  type ProgramaSocialLinksProps,
  type SocialLinkEntry,
} from './social-links';

export { ProgramaTabs, type ProgramaTabSection, type ProgramaTabsProps } from './tabs';

export { TrackLinks, type TrackLinksProps } from './track-links';

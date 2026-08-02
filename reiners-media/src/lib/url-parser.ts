/**
 * Reiners Media Podcast Studio — parser de URLs de trilha (TCK-006).
 *
 * BR-007 — `youtubeUrl` -> `youtubeEmbed` (video ID de 11 caracteres).
 * BR-008 — `spotifyUrl` -> `spotifyEmbed` (URI `spotify:episode:<id>`).
 *
 * Este módulo é a ÚNICA derivação de embed do produto e opera exatamente sobre
 * `YOUTUBE_URL_PATTERNS` / `SPOTIFY_URL_PATTERNS` exportados por
 * `src/lib/schemas.ts` (CONTRACT-004). Nenhum padrão é redigitado aqui de
 * propósito: se o parser tivesse regex próprio, ele poderia aceitar uma URL que
 * o schema rejeita (ou o contrário) e `youtubeEmbed` viraria `null` para uma
 * URL considerada válida no POST — exatamente o tipo de divergência que o
 * contrato manda evitar (`contracts/README.md`, decisões 5 e 11).
 *
 * Invariantes que os testes de `tests/unit/url-parser.test.ts` amarram:
 * - o parser aceita **exatamente** o que `isYoutubeUrl` / `isSpotifyUrl` aceitam;
 * - entrada não-string (`null`, `undefined`, número, objeto) devolve `null` em
 *   vez de lançar — o parser roda com dados já validados no POST, mas também é
 *   chamado sobre linhas antigas do banco no PATCH;
 * - o embed nunca é lido do cliente: `episodeCreateSchema` / `episodeUpdateSchema`
 *   são `.strict()` e não têm `youtubeEmbed` / `spotifyEmbed`.
 */
import { SPOTIFY_URL_PATTERNS, YOUTUBE_URL_PATTERNS } from '@/lib/schemas';

/**
 * Teto de tamanho da URL, alinhado a `urlSchema` (`z.string().url().max(2048)`).
 * Alinhar aqui evita divergência com o schema e limita o trabalho do regex
 * quando a função é chamada com entrada não validada.
 */
export const MAX_TRACK_URL_LENGTH = 2048;

/** Prefixo da URI de episódio do Spotify (BR-008). */
export const SPOTIFY_EPISODE_URI_PREFIX = 'spotify:episode:';

/** URLs de trilha de um episódio, como chegam do payload ou do banco. */
export interface EpisodeTrackUrls {
  youtubeUrl?: string | null;
  spotifyUrl?: string | null;
}

/** Embeds derivados no servidor. `null` quando não há URL correspondente. */
export interface EpisodeEmbeds {
  youtubeEmbed: string | null;
  spotifyEmbed: string | null;
}

/** URLs de trilha já resolvidas (estado final, sem `undefined`). */
export interface ResolvedEpisodeTracks {
  youtubeUrl: string | null;
  spotifyUrl: string | null;
}

/**
 * Devolve o grupo de captura 1 do primeiro padrão canônico que casar.
 *
 * Os padrões de `schemas.ts` garantem que o grupo 1 é sempre o ID; nenhum deles
 * tem a flag `g`, então `exec` não carrega `lastIndex` entre chamadas.
 */
function firstCapture(patterns: readonly RegExp[], value: unknown): string | null {
  if (typeof value !== 'string') return null;
  if (value.length === 0 || value.length > MAX_TRACK_URL_LENGTH) return null;

  for (const pattern of patterns) {
    const captured = pattern.exec(value)?.[1];
    if (captured) return captured;
  }

  return null;
}

/**
 * BR-007 — extrai o video ID de 11 caracteres de uma URL do YouTube.
 *
 * Formatos aceitos (`YOUTUBE_URL_PATTERNS`): `youtu.be/<id>`,
 * `youtube.com/watch?v=<id>` (com outros parâmetros antes ou depois) e
 * `youtube.com/embed/<id>`. Querystring e fragmento extras são ignorados.
 */
export function extractYoutubeVideoId(value: unknown): string | null {
  return firstCapture(YOUTUBE_URL_PATTERNS, value);
}

/**
 * BR-008 — extrai o episode ID de 22 caracteres de uma URL do Spotify.
 * Aceita prefixo de locale (`/intl-pt/`) e querystring (`?si=...`).
 */
export function extractSpotifyEpisodeId(value: unknown): string | null {
  return firstCapture(SPOTIFY_URL_PATTERNS, value);
}

/** Monta a URI canônica `spotify:episode:<id>` a partir de um ID já extraído. */
export function toSpotifyEpisodeUri(episodeId: string): string {
  return `${SPOTIFY_EPISODE_URI_PREFIX}${episodeId}`;
}

/**
 * Valor gravado em `Episode.youtubeEmbed`: o video ID puro (BR-007), que
 * TCK-015 concatena em `https://www.youtube.com/embed/<id>` no player.
 */
export function parseYoutubeEmbed(value: unknown): string | null {
  return extractYoutubeVideoId(value);
}

/**
 * Valor gravado em `Episode.spotifyEmbed`: a URI `spotify:episode:<id>`
 * (BR-008), consumida pelo embed do Spotify em TCK-015.
 */
export function parseSpotifyEmbed(value: unknown): string | null {
  const episodeId = extractSpotifyEpisodeId(value);
  return episodeId === null ? null : toSpotifyEpisodeUri(episodeId);
}

/** Deriva os dois embeds de uma vez. Usado no POST e no PATCH de episódio. */
export function deriveEpisodeEmbeds(tracks: EpisodeTrackUrls): EpisodeEmbeds {
  return {
    youtubeEmbed: parseYoutubeEmbed(tracks.youtubeUrl),
    spotifyEmbed: parseSpotifyEmbed(tracks.spotifyUrl),
  };
}

/**
 * Mescla as trilhas persistidas com um patch parcial.
 *
 * Distingue "chave ausente" (mantém o valor do banco) de "chave presente com
 * `null`" (limpa a trilha). É esta diferença que torna BR-004 verificável no
 * PATCH: `validateEpisodeTracks(mergeEpisodeTracks(current, patch))` enxerga o
 * estado final, coisa que `episodeUpdateSchema` — parcial por natureza — não
 * consegue enxergar sozinho.
 */
export function mergeEpisodeTracks(
  current: EpisodeTrackUrls,
  patch: EpisodeTrackUrls,
): ResolvedEpisodeTracks {
  return {
    youtubeUrl: ('youtubeUrl' in patch ? patch.youtubeUrl : current.youtubeUrl) ?? null,
    spotifyUrl: ('spotifyUrl' in patch ? patch.spotifyUrl : current.spotifyUrl) ?? null,
  };
}

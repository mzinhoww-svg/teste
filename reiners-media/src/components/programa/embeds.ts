/**
 * TCK-016 — Construção das URLs de trilha a partir dos embeds do TCK-006.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * OS DOIS FORMATOS (e por que eles são diferentes)
 * ─────────────────────────────────────────────────────────────────────────────
 * `Episode.youtubeEmbed` e `Episode.spotifyEmbed` são derivados no SERVIDOR por
 * `src/lib/url-parser.ts` (BR-007 / BR-008) e **não têm o mesmo formato**:
 *
 *   | coluna         | valor gravado                | o iframe precisa de                            |
 *   |----------------|------------------------------|------------------------------------------------|
 *   | `youtubeEmbed` | `dQw4w9WgXcQ` (ID puro, 11)  | `https://www.youtube.com/embed/dQw4w9WgXcQ`    |
 *   | `spotifyEmbed` | `spotify:episode:<22 chars>` | `https://open.spotify.com/embed/episode/<id>`  |
 *
 * Ou seja: no YouTube o valor é concatenado; no Spotify o prefixo
 * `spotify:episode:` tem de ser **removido** antes. Concatenar a URI crua
 * produziria `.../embed/episode/spotify:episode:abc`, que responde 404 — este
 * módulo existe para que essa assimetria seja resolvida em UM lugar só.
 *
 * Os dois campos são `.nullable()` no `episodeSchema`: um episódio pode existir
 * com só uma trilha (BR-004 exige *pelo menos uma*, não as duas). Toda função
 * daqui devolve `null` — nunca uma URL quebrada — quando não há embed.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUE VALIDAMOS O ID EM VEZ DE CONFIAR NA COLUNA
 * ─────────────────────────────────────────────────────────────────────────────
 * `contracts/README.md` (decisão 11) fixa: "IDs de embed são estritos — YouTube
 * com 11 caracteres, Spotify com 22". O valor vem do banco, e o banco tem
 * linhas anteriores ao TCK-006 e linhas escritas por seed/migração. Interpolar
 * um valor arbitrário dentro de uma URL que vai para o `src` de um `<iframe>`
 * (ou para o `href` de um link) é injeção de URL: `../../evil` escaparia do
 * caminho, e `javascript:` mudaria o esquema. Validar contra o alfabeto e o
 * comprimento canônicos custa uma regex e fecha o eixo inteiro.
 *
 * Este módulo é PURO (sem React, sem `window`): roda igual em Server Component,
 * em Client Component e em teste unitário.
 */
import { SPOTIFY_EPISODE_URI_PREFIX } from '@/lib/url-parser';

/** Base do player embutido do YouTube. `youtubeEmbed` é concatenado aqui. */
export const YOUTUBE_EMBED_BASE = 'https://www.youtube.com/embed/';

/** Base do watch page do YouTube — destino do link direto (sem modal). */
export const YOUTUBE_WATCH_BASE = 'https://www.youtube.com/watch?v=';

/** Base do player embutido do Spotify, já no recurso `episode`. */
export const SPOTIFY_EMBED_BASE = 'https://open.spotify.com/embed/episode/';

/** Base da página pública do episódio no Spotify — destino do link direto. */
export const SPOTIFY_EPISODE_BASE = 'https://open.spotify.com/episode/';

/** Video ID do YouTube: 11 caracteres do alfabeto base64url (BR-007). */
export const YOUTUBE_ID_REGEX = /^[A-Za-z0-9_-]{11}$/;

/** Episode ID do Spotify: 22 caracteres base62 (BR-008). */
export const SPOTIFY_ID_REGEX = /^[A-Za-z0-9]{22}$/;

/** Plataformas de trilha suportadas. */
export type TrackPlatform = 'youtube' | 'spotify';

/** Uma trilha resolvida, pronta para virar link (e, no TCK-015, iframe). */
export interface ResolvedTrack {
  readonly platform: TrackPlatform;
  /** Rótulo humano da plataforma. */
  readonly label: string;
  /** Página pública da plataforma — destino do link direto. */
  readonly href: string;
  /** URL do player embutido, para o modal do TCK-015. */
  readonly embedUrl: string;
}

/** Recorte de episódio que este módulo precisa. Evita acoplar à entidade toda. */
export interface EpisodeTrackSource {
  readonly youtubeEmbed?: string | null;
  readonly spotifyEmbed?: string | null;
  readonly youtubeUrl?: string | null;
  readonly spotifyUrl?: string | null;
}

/**
 * `'dQw4w9WgXcQ'` → o próprio ID; qualquer outra coisa → `null`.
 * Aceita apenas o ID puro: uma URL completa gravada por engano na coluna é
 * rejeitada em vez de virar `https://www.youtube.com/embed/https://...`.
 */
export function normalizeYoutubeId(embed: string | null | undefined): string | null {
  if (typeof embed !== 'string') return null;
  const trimmed = embed.trim();
  return YOUTUBE_ID_REGEX.test(trimmed) ? trimmed : null;
}

/**
 * `'spotify:episode:<id>'` → `<id>`. O prefixo é OBRIGATÓRIO removido; um valor
 * que já venha sem ele também é aceito, porque `toSpotifyEpisodeUri` é a única
 * origem do prefixo e uma linha antiga pode ter só o ID.
 */
export function normalizeSpotifyId(embed: string | null | undefined): string | null {
  if (typeof embed !== 'string') return null;
  const trimmed = embed.trim();
  const withoutPrefix = trimmed.startsWith(SPOTIFY_EPISODE_URI_PREFIX)
    ? trimmed.slice(SPOTIFY_EPISODE_URI_PREFIX.length)
    : trimmed;
  return SPOTIFY_ID_REGEX.test(withoutPrefix) ? withoutPrefix : null;
}

/** `https://www.youtube.com/embed/<id>` ou `null`. */
export function toYoutubeEmbedUrl(embed: string | null | undefined): string | null {
  const id = normalizeYoutubeId(embed);
  return id === null ? null : `${YOUTUBE_EMBED_BASE}${id}`;
}

/** `https://www.youtube.com/watch?v=<id>` ou `null`. */
export function toYoutubeWatchUrl(embed: string | null | undefined): string | null {
  const id = normalizeYoutubeId(embed);
  return id === null ? null : `${YOUTUBE_WATCH_BASE}${id}`;
}

/** `https://open.spotify.com/embed/episode/<id>` ou `null`. */
export function toSpotifyEmbedUrl(embed: string | null | undefined): string | null {
  const id = normalizeSpotifyId(embed);
  return id === null ? null : `${SPOTIFY_EMBED_BASE}${id}`;
}

/** `https://open.spotify.com/episode/<id>` ou `null`. */
export function toSpotifyEpisodeUrl(embed: string | null | undefined): string | null {
  const id = normalizeSpotifyId(embed);
  return id === null ? null : `${SPOTIFY_EPISODE_BASE}${id}`;
}

/**
 * Trilhas de um episódio, na ordem em que aparecem na interface.
 *
 * O `href` prefere a URL canônica derivada do embed e só cai para a coluna
 * `*Url` quando o embed é inutilizável: a coluna guarda a URL exatamente como o
 * admin digitou (com `?si=`, `&t=42`, prefixo de locale), enquanto o embed já
 * passou pelo parser canônico. Um episódio sem nenhuma trilha válida devolve
 * lista vazia — quem consome decide se some com o bloco ou mostra estado vazio.
 */
export function resolveEpisodeTracks(episode: EpisodeTrackSource): ResolvedTrack[] {
  const tracks: ResolvedTrack[] = [];

  const youtubeEmbedUrl = toYoutubeEmbedUrl(episode.youtubeEmbed);
  const youtubeHref = toYoutubeWatchUrl(episode.youtubeEmbed) ?? episode.youtubeUrl ?? null;
  if (youtubeEmbedUrl !== null && youtubeHref !== null) {
    tracks.push({
      platform: 'youtube',
      label: 'YouTube',
      href: youtubeHref,
      embedUrl: youtubeEmbedUrl,
    });
  }

  const spotifyEmbedUrl = toSpotifyEmbedUrl(episode.spotifyEmbed);
  const spotifyHref = toSpotifyEpisodeUrl(episode.spotifyEmbed) ?? episode.spotifyUrl ?? null;
  if (spotifyEmbedUrl !== null && spotifyHref !== null) {
    tracks.push({
      platform: 'spotify',
      label: 'Spotify',
      href: spotifyHref,
      embedUrl: spotifyEmbedUrl,
    });
  }

  return tracks;
}

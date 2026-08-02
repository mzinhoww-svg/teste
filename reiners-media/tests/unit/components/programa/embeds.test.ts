/**
 * TCK-016 — As duas formas de embed e o `null` de cada trilha.
 *
 * A assimetria entre `youtubeEmbed` (ID puro) e `spotifyEmbed` (URI
 * `spotify:episode:<id>`) é a origem mais provável de um iframe 404 nesta rota,
 * então ela é testada nos dois sentidos: a URL montada e o que acontece quando
 * o valor não existe.
 */
import { describe, expect, it } from 'vitest';

import {
  SPOTIFY_EMBED_BASE,
  SPOTIFY_EPISODE_BASE,
  YOUTUBE_EMBED_BASE,
  YOUTUBE_WATCH_BASE,
  normalizeSpotifyId,
  normalizeYoutubeId,
  resolveEpisodeTracks,
  toSpotifyEmbedUrl,
  toSpotifyEpisodeUrl,
  toYoutubeEmbedUrl,
  toYoutubeWatchUrl,
} from '@/components/programa/embeds';
import { toSafeExternalUrl } from '@/components/programa/safe-url';
import { SPOTIFY_EPISODE_URI_PREFIX, parseSpotifyEmbed, parseYoutubeEmbed } from '@/lib/url-parser';
import { makeEpisode } from './fixtures';

const YOUTUBE_ID = 'dQw4w9WgXcQ';
const SPOTIFY_ID = '4rOoJ6Egrf8K2IrywzwOMk';
const SPOTIFY_URI = `${SPOTIFY_EPISODE_URI_PREFIX}${SPOTIFY_ID}`;

describe('normalização de ID', () => {
  it('aceita o video ID de 11 caracteres do YouTube', () => {
    expect(normalizeYoutubeId(YOUTUBE_ID)).toBe(YOUTUBE_ID);
    expect(normalizeYoutubeId(`  ${YOUTUBE_ID}  `)).toBe(YOUTUBE_ID);
  });

  it('rejeita comprimento e alfabeto fora do contrato (decisão 11)', () => {
    expect(normalizeYoutubeId('curto')).toBeNull();
    expect(normalizeYoutubeId('dQw4w9WgXcQextra')).toBeNull();
    expect(normalizeYoutubeId('../../etc/pass')).toBeNull();
    expect(normalizeYoutubeId('dQw4w9WgXc?')).toBeNull();
  });

  it('remove o prefixo `spotify:episode:` e devolve o ID de 22 caracteres', () => {
    expect(normalizeSpotifyId(SPOTIFY_URI)).toBe(SPOTIFY_ID);
  });

  it('também aceita o ID cru do Spotify, sem prefixo', () => {
    expect(normalizeSpotifyId(SPOTIFY_ID)).toBe(SPOTIFY_ID);
  });

  it('rejeita URI com ID de tamanho errado', () => {
    expect(normalizeSpotifyId(`${SPOTIFY_EPISODE_URI_PREFIX}abc`)).toBeNull();
    expect(normalizeSpotifyId('spotify:track:4rOoJ6Egrf8K2IrywzwOMk')).toBeNull();
  });

  it('devolve null para qualquer entrada que não seja string', () => {
    expect(normalizeYoutubeId(null)).toBeNull();
    expect(normalizeYoutubeId(undefined)).toBeNull();
    expect(normalizeSpotifyId(null)).toBeNull();
    expect(normalizeSpotifyId(undefined)).toBeNull();
  });
});

describe('construção das URLs de embed', () => {
  it('YouTube: concatena o ID puro na base do player', () => {
    expect(toYoutubeEmbedUrl(YOUTUBE_ID)).toBe(`${YOUTUBE_EMBED_BASE}${YOUTUBE_ID}`);
    expect(toYoutubeEmbedUrl(YOUTUBE_ID)).toBe('https://www.youtube.com/embed/dQw4w9WgXcQ');
  });

  it('Spotify: REMOVE o prefixo antes de montar a URL do player', () => {
    const url = toSpotifyEmbedUrl(SPOTIFY_URI);
    expect(url).toBe(`${SPOTIFY_EMBED_BASE}${SPOTIFY_ID}`);
    expect(url).toBe(`https://open.spotify.com/embed/episode/${SPOTIFY_ID}`);
    // A regressão que este teste existe para pegar:
    expect(url).not.toContain('spotify:episode:');
  });

  it('monta também as URLs de página pública (destino do link direto)', () => {
    expect(toYoutubeWatchUrl(YOUTUBE_ID)).toBe(`${YOUTUBE_WATCH_BASE}${YOUTUBE_ID}`);
    expect(toSpotifyEpisodeUrl(SPOTIFY_URI)).toBe(`${SPOTIFY_EPISODE_BASE}${SPOTIFY_ID}`);
  });

  it('devolve null — nunca uma URL truncada — quando o embed é null', () => {
    expect(toYoutubeEmbedUrl(null)).toBeNull();
    expect(toYoutubeWatchUrl(null)).toBeNull();
    expect(toSpotifyEmbedUrl(null)).toBeNull();
    expect(toSpotifyEpisodeUrl(null)).toBeNull();
  });

  it('consome exatamente o que o parser do TCK-006 grava no banco', () => {
    // Prova que as duas pontas concordam sem redigitar o formato: o valor de
    // entrada é o que `deriveEpisodeEmbeds` gravaria na coluna.
    const youtubeEmbed = parseYoutubeEmbed(`https://youtu.be/${YOUTUBE_ID}`);
    const spotifyEmbed = parseSpotifyEmbed(`https://open.spotify.com/episode/${SPOTIFY_ID}?si=x`);

    expect(youtubeEmbed).toBe(YOUTUBE_ID);
    expect(spotifyEmbed).toBe(SPOTIFY_URI);
    expect(toYoutubeEmbedUrl(youtubeEmbed)).toBe(`${YOUTUBE_EMBED_BASE}${YOUTUBE_ID}`);
    expect(toSpotifyEmbedUrl(spotifyEmbed)).toBe(`${SPOTIFY_EMBED_BASE}${SPOTIFY_ID}`);
  });
});

describe('resolveEpisodeTracks', () => {
  it('devolve as duas trilhas na ordem YouTube → Spotify', () => {
    const tracks = resolveEpisodeTracks({
      youtubeEmbed: YOUTUBE_ID,
      spotifyEmbed: SPOTIFY_URI,
    });

    expect(tracks.map((track) => track.platform)).toEqual(['youtube', 'spotify']);
    expect(tracks[0]?.embedUrl).toBe(`${YOUTUBE_EMBED_BASE}${YOUTUBE_ID}`);
    expect(tracks[1]?.embedUrl).toBe(`${SPOTIFY_EMBED_BASE}${SPOTIFY_ID}`);
  });

  it('só YouTube: a trilha do Spotify simplesmente não existe', () => {
    const tracks = resolveEpisodeTracks({ youtubeEmbed: YOUTUBE_ID, spotifyEmbed: null });
    expect(tracks).toHaveLength(1);
    expect(tracks[0]?.platform).toBe('youtube');
  });

  it('só Spotify: a trilha do YouTube simplesmente não existe', () => {
    const tracks = resolveEpisodeTracks({ youtubeEmbed: null, spotifyEmbed: SPOTIFY_URI });
    expect(tracks).toHaveLength(1);
    expect(tracks[0]?.platform).toBe('spotify');
  });

  it('nenhuma trilha válida devolve lista vazia', () => {
    expect(resolveEpisodeTracks({ youtubeEmbed: null, spotifyEmbed: null })).toEqual([]);
    expect(resolveEpisodeTracks({})).toEqual([]);
  });

  it('o href é derivado do embed, nunca lido da coluna crua', () => {
    // A coluna `youtubeUrl` do episódio guarda o que o admin digitou
    // (`?t=42&list=abc`, prefixo de locale...). Ela é ignorada de propósito:
    // `href` e `embedUrl` saem das constantes deste módulo mais um ID que já
    // casou com o alfabeto canônico — o que torna `javascript:` e path
    // traversal impossíveis por construção, e não por acidente.
    const episode = makeEpisode({ youtubeUrl: `https://youtu.be/${YOUTUBE_ID}?t=42&list=abc` });
    const [track] = resolveEpisodeTracks(episode);

    expect(track?.href).toBe(`${YOUTUBE_WATCH_BASE}${YOUTUBE_ID}`);
    expect(track?.href).not.toContain('t=42');
  });

  it('embed corrompido não vira link, mesmo com `youtubeUrl` intacto', () => {
    // Sem embed utilizável não há como montar o player do TCK-015; publicar só
    // o link deixaria um botão que abre e um modal que não abre.
    const episode = makeEpisode({
      youtubeEmbed: '../../../evil',
      youtubeUrl: `https://youtu.be/${YOUTUBE_ID}`,
      spotifyEmbed: null,
      spotifyUrl: null,
    });

    expect(resolveEpisodeTracks(episode)).toEqual([]);
  });

  it('todo href produzido é http(s) — a mesma allowlist da renderização', () => {
    for (const track of resolveEpisodeTracks(makeEpisode())) {
      expect(toSafeExternalUrl(track.href)).toBe(track.href);
      expect(toSafeExternalUrl(track.embedUrl)).toBe(track.embedUrl);
    }
  });
});

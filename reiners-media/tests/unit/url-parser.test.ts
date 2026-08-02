/**
 * TCK-006 — parser de URLs de trilha (`src/lib/url-parser.ts`).
 *
 * BR-007: `youtubeUrl` -> video ID de 11 caracteres.
 * BR-008: `spotifyUrl` -> URI `spotify:episode:<id>`.
 *
 * Além dos formatos aceitos, os testes amarram duas invariantes que valem mais
 * que qualquer caso isolado:
 *
 * 1. o parser aceita EXATAMENTE o mesmo conjunto de URLs que `isYoutubeUrl` /
 *    `isSpotifyUrl` (os validadores de `episodeCreateSchema`). Se divergissem,
 *    uma URL aprovada no POST gravaria `youtubeEmbed: null` e o player de
 *    TCK-015 ficaria mudo sem nenhum erro visível;
 * 2. entrada não-string nunca lança — o parser roda tanto sobre payload
 *    validado quanto sobre linhas antigas do banco no PATCH.
 */
import { describe, expect, it } from 'vitest';

import {
  SPOTIFY_URL_PATTERNS,
  YOUTUBE_URL_PATTERNS,
  isSpotifyUrl,
  isYoutubeUrl,
  urlSchema,
} from '@/lib/schemas';
import {
  MAX_TRACK_URL_LENGTH,
  SPOTIFY_EPISODE_URI_PREFIX,
  deriveEpisodeEmbeds,
  extractSpotifyEpisodeId,
  extractYoutubeVideoId,
  mergeEpisodeTracks,
  parseSpotifyEmbed,
  parseYoutubeEmbed,
  toSpotifyEpisodeUri,
} from '@/lib/url-parser';

const YT_ID = 'dQw4w9WgXcQ';
const YT_ID_SYMBOLS = '_-aBcDeF123';
const SP_ID = '4rOoJ6Egrf8K2IrywzwOMk';

/** Entradas que não são string: nenhuma delas pode lançar. */
const NON_STRING_INPUTS: Array<[string, unknown]> = [
  ['null', null],
  ['undefined', undefined],
  ['número', 42],
  ['objeto', { url: `https://youtu.be/${YT_ID}` }],
  ['array', [`https://youtu.be/${YT_ID}`]],
  ['boolean', true],
  ['NaN', Number.NaN],
];

describe('constantes do parser', () => {
  it('usa os IDs no tamanho fixado pelo contrato (11 YouTube, 22 Spotify)', () => {
    expect(YT_ID).toHaveLength(11);
    expect(YT_ID_SYMBOLS).toHaveLength(11);
    expect(SP_ID).toHaveLength(22);
  });

  it('alinha o teto de tamanho da URL ao `urlSchema` do contrato', () => {
    expect(MAX_TRACK_URL_LENGTH).toBe(2048);
    expect(urlSchema.safeParse(`https://youtu.be/${YT_ID}`).success).toBe(true);
  });

  it('deriva a URI do Spotify do prefixo canônico', () => {
    expect(SPOTIFY_EPISODE_URI_PREFIX).toBe('spotify:episode:');
    expect(toSpotifyEpisodeUri(SP_ID)).toBe(`spotify:episode:${SP_ID}`);
  });

  it('opera sobre os padrões canônicos exportados por schemas.ts', () => {
    expect(YOUTUBE_URL_PATTERNS.length).toBeGreaterThan(0);
    expect(SPOTIFY_URL_PATTERNS.length).toBeGreaterThan(0);
    // Nenhum padrão pode ter a flag `g`: `lastIndex` sobreviveria entre chamadas
    // e o segundo `exec` da mesma URL devolveria null.
    for (const pattern of [...YOUTUBE_URL_PATTERNS, ...SPOTIFY_URL_PATTERNS]) {
      expect(pattern.global).toBe(false);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* BR-007 — YouTube                                                           */
/* -------------------------------------------------------------------------- */

describe('BR-007 — extractYoutubeVideoId', () => {
  const accepted: Array<[string, string, string]> = [
    ['youtu.be https', `https://youtu.be/${YT_ID}`, YT_ID],
    ['youtu.be http', `http://youtu.be/${YT_ID}`, YT_ID],
    ['youtu.be com www', `https://www.youtu.be/${YT_ID}`, YT_ID],
    ['youtu.be com querystring', `https://youtu.be/${YT_ID}?t=42`, YT_ID],
    ['youtu.be com fragmento', `https://youtu.be/${YT_ID}#t=1m30s`, YT_ID],
    ['youtu.be com ID de símbolos', `https://youtu.be/${YT_ID_SYMBOLS}`, YT_ID_SYMBOLS],
    ['watch com www', `https://www.youtube.com/watch?v=${YT_ID}`, YT_ID],
    ['watch sem www', `https://youtube.com/watch?v=${YT_ID}`, YT_ID],
    ['watch mobile', `https://m.youtube.com/watch?v=${YT_ID}`, YT_ID],
    ['watch com parâmetro antes', `https://www.youtube.com/watch?list=PLabc123&v=${YT_ID}`, YT_ID],
    ['watch com parâmetro depois', `https://www.youtube.com/watch?v=${YT_ID}&t=90s`, YT_ID],
    [
      'watch cercado de parâmetros',
      `https://www.youtube.com/watch?feature=share&v=${YT_ID}&list=PLx&index=2`,
      YT_ID,
    ],
    ['watch com fragmento', `https://www.youtube.com/watch?v=${YT_ID}#comentarios`, YT_ID],
    ['embed', `https://www.youtube.com/embed/${YT_ID}`, YT_ID],
    ['embed sem www', `https://youtube.com/embed/${YT_ID}`, YT_ID],
    ['embed com querystring', `https://www.youtube.com/embed/${YT_ID}?rel=0&start=10`, YT_ID],
  ];

  it.each(accepted)('aceita %s e extrai o video ID', (_label, url, expected) => {
    expect(extractYoutubeVideoId(url)).toBe(expected);
    expect(parseYoutubeEmbed(url)).toBe(expected);
  });

  it('é idempotente: o mesmo valor pode ser parseado duas vezes', () => {
    const url = `https://www.youtube.com/watch?v=${YT_ID}`;
    expect(extractYoutubeVideoId(url)).toBe(YT_ID);
    expect(extractYoutubeVideoId(url)).toBe(YT_ID);
  });

  const rejected: Array<[string, string]> = [
    ['string vazia', ''],
    ['só espaços', '   '],
    ['URL com espaço em volta', ` https://youtu.be/${YT_ID} `],
    ['sem esquema', `youtu.be/${YT_ID}`],
    ['esquema ftp', `ftp://youtu.be/${YT_ID}`],
    ['javascript:', `javascript:alert(1)//youtu.be/${YT_ID}`],
    ['outro domínio', 'https://vimeo.com/123456789'],
    ['domínio parecido (typosquat)', `https://youtube.com.evil.com/watch?v=${YT_ID}`],
    ['subdomínio hostil', `https://evil-youtu.be/${YT_ID}`],
    ['host aninhado', `https://evil.com/https://youtu.be/${YT_ID}`],
    ['ID curto (10)', 'https://youtu.be/dQw4w9WgXc'],
    ['ID longo (12)', 'https://youtu.be/dQw4w9WgXcQ1'],
    ['watch com ID longo', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ1'],
    ['watch com ID curto', 'https://www.youtube.com/watch?v=dQw4w9WgX'],
    ['embed com ID longo', 'https://www.youtube.com/embed/dQw4w9WgXcQ1'],
    ['ID com caractere inválido', 'https://youtu.be/dQw4w9WgXc!'],
    ['watch sem v', 'https://www.youtube.com/watch'],
    ['watch com v vazio', 'https://www.youtube.com/watch?v='],
    ['youtu.be sem ID', 'https://youtu.be/'],
    ['playlist', 'https://www.youtube.com/playlist?list=PLabc123'],
    ['canal', 'https://www.youtube.com/@reinersmedia'],
    ['parâmetro parecido com v', `https://www.youtube.com/watch?vv=${YT_ID}`],
    ['URL do Spotify', `https://open.spotify.com/episode/${SP_ID}`],
  ];

  it.each(rejected)('rejeita %s', (_label, url) => {
    expect(extractYoutubeVideoId(url)).toBeNull();
    expect(parseYoutubeEmbed(url)).toBeNull();
  });

  it.each(NON_STRING_INPUTS)('devolve null (sem lançar) para %s', (_label, value) => {
    expect(() => extractYoutubeVideoId(value)).not.toThrow();
    expect(extractYoutubeVideoId(value)).toBeNull();
  });

  it('rejeita URL acima do teto de 2048 caracteres', () => {
    const oversized = `https://www.youtube.com/watch?v=${YT_ID}&pad=${'a'.repeat(
      MAX_TRACK_URL_LENGTH,
    )}`;
    expect(oversized.length).toBeGreaterThan(MAX_TRACK_URL_LENGTH);
    expect(extractYoutubeVideoId(oversized)).toBeNull();
    // O schema também rejeita, então parser e validação seguem de acordo.
    expect(urlSchema.safeParse(oversized).success).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* BR-008 — Spotify                                                           */
/* -------------------------------------------------------------------------- */

describe('BR-008 — extractSpotifyEpisodeId / parseSpotifyEmbed', () => {
  const accepted: Array<[string, string]> = [
    ['https', `https://open.spotify.com/episode/${SP_ID}`],
    ['http', `http://open.spotify.com/episode/${SP_ID}`],
    ['com querystring', `https://open.spotify.com/episode/${SP_ID}?si=8f3a1b2c4d5e6f70`],
    ['com fragmento', `https://open.spotify.com/episode/${SP_ID}#play`],
    ['com prefixo de locale', `https://open.spotify.com/intl-pt/episode/${SP_ID}`],
    [
      'com locale e querystring',
      `https://open.spotify.com/intl-br/episode/${SP_ID}?si=abc&nd=1`,
    ],
  ];

  it.each(accepted)('aceita %s e produz a URI canônica', (_label, url) => {
    expect(extractSpotifyEpisodeId(url)).toBe(SP_ID);
    expect(parseSpotifyEmbed(url)).toBe(`spotify:episode:${SP_ID}`);
  });

  const rejected: Array<[string, string]> = [
    ['string vazia', ''],
    ['sem esquema', `open.spotify.com/episode/${SP_ID}`],
    ['com www', `https://www.open.spotify.com/episode/${SP_ID}`],
    ['domínio parecido', `https://open.spotify.com.evil.com/episode/${SP_ID}`],
    ['track em vez de episode', `https://open.spotify.com/track/${SP_ID}`],
    ['show em vez de episode', `https://open.spotify.com/show/${SP_ID}`],
    ['ID curto (21)', 'https://open.spotify.com/episode/4rOoJ6Egrf8K2IrywzwOM'],
    ['ID longo (23)', 'https://open.spotify.com/episode/4rOoJ6Egrf8K2IrywzwOMk1'],
    ['ID com hífen (fora do base62)', 'https://open.spotify.com/episode/4rOoJ6Egrf8K2Irywzw-Mk'],
    ['ID com underscore', 'https://open.spotify.com/episode/4rOoJ6Egrf8K2Irywzw_Mk'],
    ['sem ID', 'https://open.spotify.com/episode/'],
    ['locale malformado', `https://open.spotify.com/intl-portugues/episode/${SP_ID}`],
    ['URI em vez de URL', `spotify:episode:${SP_ID}`],
    ['URL do YouTube', `https://youtu.be/${YT_ID}`],
  ];

  it.each(rejected)('rejeita %s', (_label, url) => {
    expect(extractSpotifyEpisodeId(url)).toBeNull();
    expect(parseSpotifyEmbed(url)).toBeNull();
  });

  it.each(NON_STRING_INPUTS)('devolve null (sem lançar) para %s', (_label, value) => {
    expect(() => extractSpotifyEpisodeId(value)).not.toThrow();
    expect(extractSpotifyEpisodeId(value)).toBeNull();
    expect(parseSpotifyEmbed(value)).toBeNull();
  });

  it('rejeita URL acima do teto de 2048 caracteres', () => {
    const oversized = `https://open.spotify.com/episode/${SP_ID}?si=${'a'.repeat(
      MAX_TRACK_URL_LENGTH,
    )}`;
    expect(extractSpotifyEpisodeId(oversized)).toBeNull();
    expect(urlSchema.safeParse(oversized).success).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* Invariante: parser e validador do schema aceitam o mesmo conjunto           */
/* -------------------------------------------------------------------------- */

describe('parser e schema concordam sobre o mesmo corpus', () => {
  const probes: string[] = [
    `https://youtu.be/${YT_ID}`,
    `https://youtu.be/${YT_ID}?t=42`,
    `https://www.youtube.com/watch?v=${YT_ID}`,
    `https://m.youtube.com/watch?v=${YT_ID}&t=1`,
    `https://www.youtube.com/watch?list=PLx&v=${YT_ID}`,
    `https://www.youtube.com/embed/${YT_ID}`,
    `https://youtu.be/${YT_ID_SYMBOLS}`,
    'https://youtu.be/dQw4w9WgXc',
    'https://www.youtube.com/watch',
    'https://vimeo.com/123456789',
    `https://open.spotify.com/episode/${SP_ID}`,
    `https://open.spotify.com/intl-pt/episode/${SP_ID}?si=abc`,
    `https://open.spotify.com/track/${SP_ID}`,
    'https://open.spotify.com/episode/short',
    'https://example.com/podcast',
    '',
    'not-a-url',
  ];

  it.each(probes)('YouTube: parser e isYoutubeUrl concordam sobre %s', (probe) => {
    expect(extractYoutubeVideoId(probe) !== null).toBe(isYoutubeUrl(probe));
  });

  it.each(probes)('Spotify: parser e isSpotifyUrl concordam sobre %s', (probe) => {
    expect(extractSpotifyEpisodeId(probe) !== null).toBe(isSpotifyUrl(probe));
  });
});

/* -------------------------------------------------------------------------- */
/* Derivação e mesclagem usadas pelos route handlers                          */
/* -------------------------------------------------------------------------- */

describe('deriveEpisodeEmbeds', () => {
  it('deriva os dois embeds quando as duas trilhas existem', () => {
    expect(
      deriveEpisodeEmbeds({
        youtubeUrl: `https://youtu.be/${YT_ID}`,
        spotifyUrl: `https://open.spotify.com/episode/${SP_ID}`,
      }),
    ).toEqual({ youtubeEmbed: YT_ID, spotifyEmbed: `spotify:episode:${SP_ID}` });
  });

  it('deriva só o YouTube quando não há Spotify', () => {
    expect(deriveEpisodeEmbeds({ youtubeUrl: `https://youtu.be/${YT_ID}`, spotifyUrl: null })).toEqual(
      { youtubeEmbed: YT_ID, spotifyEmbed: null },
    );
  });

  it('deriva só o Spotify quando não há YouTube', () => {
    expect(
      deriveEpisodeEmbeds({ spotifyUrl: `https://open.spotify.com/episode/${SP_ID}` }),
    ).toEqual({ youtubeEmbed: null, spotifyEmbed: `spotify:episode:${SP_ID}` });
  });

  it('devolve os dois nulos para objeto vazio', () => {
    expect(deriveEpisodeEmbeds({})).toEqual({ youtubeEmbed: null, spotifyEmbed: null });
  });

  it('não confunde as trilhas: URL trocada de campo não gera embed', () => {
    expect(
      deriveEpisodeEmbeds({
        youtubeUrl: `https://open.spotify.com/episode/${SP_ID}`,
        spotifyUrl: `https://youtu.be/${YT_ID}`,
      }),
    ).toEqual({ youtubeEmbed: null, spotifyEmbed: null });
  });
});

describe('mergeEpisodeTracks', () => {
  const current = {
    youtubeUrl: `https://youtu.be/${YT_ID}`,
    spotifyUrl: `https://open.spotify.com/episode/${SP_ID}`,
  };

  it('mantém o estado atual quando o patch é vazio', () => {
    expect(mergeEpisodeTracks(current, {})).toEqual(current);
  });

  it('substitui apenas a chave presente no patch', () => {
    const merged = mergeEpisodeTracks(current, { youtubeUrl: `https://youtu.be/${YT_ID_SYMBOLS}` });
    expect(merged.youtubeUrl).toBe(`https://youtu.be/${YT_ID_SYMBOLS}`);
    expect(merged.spotifyUrl).toBe(current.spotifyUrl);
  });

  it('distingue chave ausente de chave com null (limpar trilha)', () => {
    expect(mergeEpisodeTracks(current, { youtubeUrl: null })).toEqual({
      youtubeUrl: null,
      spotifyUrl: current.spotifyUrl,
    });
  });

  it('normaliza undefined explícito do banco para null', () => {
    expect(mergeEpisodeTracks({ youtubeUrl: undefined, spotifyUrl: undefined }, {})).toEqual({
      youtubeUrl: null,
      spotifyUrl: null,
    });
  });

  it('expõe o estado que zera a última trilha, para BR-004 conseguir ver', () => {
    const merged = mergeEpisodeTracks({ youtubeUrl: current.youtubeUrl, spotifyUrl: null }, {
      youtubeUrl: null,
    });
    expect(merged).toEqual({ youtubeUrl: null, spotifyUrl: null });
  });
});

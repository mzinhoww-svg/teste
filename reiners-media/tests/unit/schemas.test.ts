/**
 * TCK-003 — testes unitarios dos schemas Zod (CONTRACT-004).
 *
 * Cada regra de negocio de docs/PRD.md secao 11 que e expressavel em Zod tem
 * pelo menos um caso valido e um invalido. Se a regra for removida do schema,
 * o teste correspondente falha.
 */
import { describe, expect, it } from 'vitest';

import {
  DEFAULT_PAGE_LIMIT,
  DURATION_REGEX,
  ERROR_STATUS_BY_CODE,
  EVENT_LOG_RETENTION_DAYS,
  HEX_COLOR_REGEX,
  MAX_FEATURED_PODCASTS,
  MAX_PAGE_LIMIT,
  MAX_YEAR,
  MIN_YEAR,
  SLUG_REGEX,
  SPOTIFY_URL_PATTERNS,
  UPLOAD_MAX_BYTES,
  YOUTUBE_URL_PATTERNS,
  ZOD_ENUMS,
  adminRoleSchema,
  adminUserSchema,
  dataResponseSchema,
  episodeCreateSchema,
  episodeQuerySchema,
  episodeSchema,
  episodeUpdateSchema,
  errorResponseSchema,
  eventCreateSchema,
  eventQuerySchema,
  eventTypeSchema,
  imageRefSchema,
  isImageRef,
  isSpotifyUrl,
  isYoutubeUrl,
  loginSchema,
  paginatedResponseSchema,
  paginationQuerySchema,
  planCreateSchema,
  podcastAdminSchema,
  podcastCreateSchema,
  podcastQuerySchema,
  podcastSchema,
  podcastStatusSchema,
  podcastUpdateSchema,
  resolvePodcastRuleState,
  sessionSchema,
  siteConfigUpdateSchema,
  testimonialCreateSchema,
  uploadRequestSchema,
  validateEpisodeTracks,
  validatePodcastRules,
  visualStyleSchema,
} from '@/lib/schemas';

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

const YOUTUBE_URL = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
const SPOTIFY_URL = 'https://open.spotify.com/episode/1a2B3c4D5e6F7g8H9i0JkL';
const UUID = '3f6c3f2e-6c2b-4c8f-9a5e-6b1f9a2d4c11';
const OTHER_UUID = '9b7c1d2e-1111-4222-8333-444455556666';

function validPodcast() {
  return {
    slug: 'horizonte-digital',
    title: 'Horizonte Digital',
    description: 'Conversas sobre tecnologia e futuro.',
    coverImage: 'https://cdn.reiners.media/podcasts/horizonte.jpg',
    category: 'tech',
    status: 'ACTIVE' as const,
    visualStyle: 'PHOTO_REAL' as const,
    year: 2024,
    accentColor: '#d87dff',
    hosts: [{ name: 'Marina Reiners', initial: 'MR' }],
    featured: false,
  };
}

function validEpisode() {
  return {
    podcastId: UUID,
    number: 1,
    title: 'O futuro da IA generativa',
    description: 'Um papo sobre modelos de linguagem.',
    duration: '45:30',
    publishedAt: '2024-01-01T00:00:00Z',
    youtubeUrl: YOUTUBE_URL,
  };
}

/* -------------------------------------------------------------------------- */
/* Enums                                                                      */
/* -------------------------------------------------------------------------- */

describe('enums', () => {
  it('PodcastStatus aceita apenas ACTIVE, ENDED e HIATUS', () => {
    expect(podcastStatusSchema.options).toEqual(['ACTIVE', 'ENDED', 'HIATUS']);
    expect(podcastStatusSchema.safeParse('PAUSED').success).toBe(false);
  });

  it('VisualStyle cobre os cinco estilos de poster', () => {
    expect(visualStyleSchema.options).toEqual([
      'PHOTO_REAL',
      'ILLUSTRATION',
      'MINIMAL',
      'DUOTONE',
      'COLLAGE',
    ]);
    expect(visualStyleSchema.safeParse('photo_real').success).toBe(false);
  });

  it('AdminRole aceita apenas ADMIN e EDITOR', () => {
    expect(adminRoleSchema.options).toEqual(['ADMIN', 'EDITOR']);
    expect(adminRoleSchema.safeParse('OWNER').success).toBe(false);
  });

  it('EventType cobre os sete eventos de telemetria', () => {
    expect(eventTypeSchema.options).toEqual([
      'PAGE_VIEW',
      'CARD_EXPAND',
      'YOUTUBE_CLICK',
      'SPOTIFY_CLICK',
      'EPISODE_PLAY',
      'ADMIN_LOGIN',
      'EPISODE_CREATE',
    ]);
    expect(eventTypeSchema.safeParse('PAGEVIEW').success).toBe(false);
  });

  it('ZOD_ENUMS expoe todos os enums usados nos contratos OpenAPI', () => {
    expect(Object.keys(ZOD_ENUMS).sort()).toEqual([
      'AdminRole',
      'ErrorCode',
      'EventType',
      'PodcastStatus',
      'SortOrder',
      'UploadFolder',
      'UploadMimeType',
      'VisualStyle',
    ]);
  });
});

/* -------------------------------------------------------------------------- */
/* Regex canonicos                                                            */
/* -------------------------------------------------------------------------- */

describe('regex canonicos', () => {
  it.each([
    'horizonte-digital',
    'ressonancia',
    'codigo-aberto-2',
    'a',
  ])('aceita slug valido %s', (slug) => {
    expect(SLUG_REGEX.test(slug)).toBe(true);
  });

  it.each([
    'Horizonte-Digital',
    'horizonte_digital',
    '-horizonte',
    'horizonte-',
    'horizonte--digital',
    'ressonância',
    'horizonte digital',
    '',
  ])('rejeita slug invalido %s', (slug) => {
    expect(SLUG_REGEX.test(slug)).toBe(false);
  });

  it.each(['#d87dff', '#0B0B0F', '#FAF7F2'])('aceita cor hex %s', (color) => {
    expect(HEX_COLOR_REGEX.test(color)).toBe(true);
  });

  it.each(['d87dff', '#d87df', '#d87dfff', '#GGGGGG', 'rgb(0,0,0)'])(
    'rejeita cor invalida %s',
    (color) => {
      expect(HEX_COLOR_REGEX.test(color)).toBe(false);
    },
  );

  it.each(['45:30', '05:00', '1:02:33', '12:59:59'])('aceita duracao %s', (duration) => {
    expect(DURATION_REGEX.test(duration)).toBe(true);
  });

  it.each(['45:60', '45', '45:3', '1:2:3', '100:00', 'abc', '45:30:'])(
    'rejeita duracao %s',
    (duration) => {
      expect(DURATION_REGEX.test(duration)).toBe(false);
    },
  );
});

/* -------------------------------------------------------------------------- */
/* BR-007 / BR-008 — padroes de URL para o parser de TCK-006                   */
/* -------------------------------------------------------------------------- */

describe('YOUTUBE_URL_PATTERNS (BR-007)', () => {
  it.each([
    ['https://youtu.be/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://youtube.com/watch?v=dQw4w9WgXcQ&t=30s', 'dQw4w9WgXcQ'],
    ['https://www.youtube.com/watch?list=PL123&v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://www.youtube.com/embed/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://youtu.be/dQw4w9WgXcQ?t=42', 'dQw4w9WgXcQ'],
  ])('extrai o video ID de %s no grupo 1', (url, expected) => {
    const match = YOUTUBE_URL_PATTERNS.map((pattern) => pattern.exec(url)).find(Boolean);
    expect(match).not.toBeUndefined();
    expect(match?.[1]).toBe(expected);
    expect(isYoutubeUrl(url)).toBe(true);
  });

  it.each([
    'https://vimeo.com/123456',
    'https://youtu.be/short',
    'https://www.youtube.com/watch?v=tooooooooolong',
    'https://www.youtube.com/channel/UC12345',
    'not-a-url',
  ])('rejeita %s', (url) => {
    expect(isYoutubeUrl(url)).toBe(false);
  });
});

describe('SPOTIFY_URL_PATTERNS (BR-008)', () => {
  it.each([
    ['https://open.spotify.com/episode/1a2B3c4D5e6F7g8H9i0JkL', '1a2B3c4D5e6F7g8H9i0JkL'],
    ['https://open.spotify.com/episode/1a2B3c4D5e6F7g8H9i0JkL?si=abc123', '1a2B3c4D5e6F7g8H9i0JkL'],
    ['https://open.spotify.com/intl-pt/episode/1a2B3c4D5e6F7g8H9i0JkL', '1a2B3c4D5e6F7g8H9i0JkL'],
  ])('extrai o episode ID de %s no grupo 1', (url, expected) => {
    const match = SPOTIFY_URL_PATTERNS.map((pattern) => pattern.exec(url)).find(Boolean);
    expect(match?.[1]).toBe(expected);
    expect(isSpotifyUrl(url)).toBe(true);
  });

  it.each([
    'https://open.spotify.com/show/1a2B3c4D5e6F7g8H9i0JkL',
    'https://open.spotify.com/episode/curto',
    'https://spotify.com/episode/1a2B3c4D5e6F7g8H9i0JkL',
    'https://open.spotify.com/episode/',
  ])('rejeita %s', (url) => {
    expect(isSpotifyUrl(url)).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* Referencia de imagem: URL absoluta OU caminho root-relativo                */
/* -------------------------------------------------------------------------- */

describe('imageRefSchema', () => {
  it.each([
    'https://abcdef.supabase.co/storage/v1/object/public/podcasts/capa.jpg',
    'http://localhost:3000/images/capa.png',
    '/images/podcasts/horizonte-digital-cover.jpg',
    '/images/hosts/marina-alcantara.jpg',
    '/logo.svg',
  ])('aceita %s', (value) => {
    expect(isImageRef(value)).toBe(true);
    expect(imageRefSchema.safeParse(value).success).toBe(true);
  });

  it.each([
    ['', 'string vazia'],
    ['//evil.com/pwn.jpg', 'protocol-relative'],
    ['javascript:alert(1)', 'esquema javascript'],
    ['data:image/png;base64,AAAA', 'data URI'],
    ['/../etc/passwd', 'traversal absoluto'],
    ['/images/../../secret.jpg', 'traversal no meio'],
    ['../images/capa.jpg', 'caminho relativo sem barra'],
    ['images/capa.jpg', 'sem barra inicial'],
    ['/images/ capa.jpg', 'espaco em branco'],
    ['ftp://host/capa.jpg', 'esquema nao http'],
    ['C:\\imagens\\capa.jpg', 'caminho windows'],
  ])('rejeita %s (%s)', (value) => {
    expect(isImageRef(value)).toBe(false);
    expect(imageRefSchema.safeParse(value).success).toBe(false);
  });

  it('os campos de imagem do seed de TCK-002 passam no contrato', () => {
    const seedShaped = {
      ...validPodcast(),
      coverImage: '/images/podcasts/horizonte-digital-cover.jpg',
      heroImage: '/images/podcasts/horizonte-digital-hero.jpg',
      hosts: [
        { name: 'Marina Alcantara', initial: 'MA', photo: '/images/hosts/marina-alcantara.jpg' },
      ],
    };
    expect(podcastCreateSchema.safeParse(seedShaped).success).toBe(true);
    expect(
      episodeCreateSchema.safeParse({
        ...validEpisode(),
        thumbnail: '/images/episodes/horizonte-01.jpg',
      }).success,
    ).toBe(true);
    expect(
      siteConfigUpdateSchema.safeParse({ logoUrl: '/images/logo.svg', faviconUrl: '/favicon.ico' })
        .success,
    ).toBe(true);
    expect(
      testimonialCreateSchema.safeParse({
        name: 'Ana',
        role: 'Head',
        quote: 'Otimo',
        avatarUrl: '/images/testimonials/ana.jpg',
      }).success,
    ).toBe(true);
  });

  it('links externos continuam exigindo URL absoluta', () => {
    expect(
      podcastCreateSchema.safeParse({
        ...validPodcast(),
        socialLinks: { instagram: '/reiners' },
      }).success,
    ).toBe(false);
    expect(
      episodeCreateSchema.safeParse({ ...validEpisode(), youtubeUrl: '/videos/abc' }).success,
    ).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* Podcast                                                                    */
/* -------------------------------------------------------------------------- */

describe('podcastCreateSchema', () => {
  it('aceita um payload completo e aplica defaults', () => {
    const parsed = podcastCreateSchema.parse(validPodcast());
    expect(parsed.status).toBe('ACTIVE');
    expect(parsed.displayOrder).toBe(0);
    expect(parsed.socialLinks).toEqual({});
    expect(parsed.accentColor).toBe('#d87dff');
  });

  it('BR-003: rejeita programa sem hosts', () => {
    const result = podcastCreateSchema.safeParse({ ...validPodcast(), hosts: [] });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((item) => item.path[0] === 'hosts');
      expect(issue?.message).toContain('BR-003');
    }
  });

  it('BR-003: aceita programa com um unico host', () => {
    const result = podcastCreateSchema.safeParse({
      ...validPodcast(),
      hosts: [{ name: 'Solo Host', initial: 'S' }],
    });
    expect(result.success).toBe(true);
  });

  it('BR-006: rejeita destaque com status ENDED', () => {
    const result = podcastCreateSchema.safeParse({
      ...validPodcast(),
      status: 'ENDED',
      featured: true,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain('BR-006');
      expect(result.error.issues[0]?.path).toEqual(['featured']);
    }
  });

  it('BR-006: permite ENDED sem destaque e destaque com ACTIVE', () => {
    expect(
      podcastCreateSchema.safeParse({ ...validPodcast(), status: 'ENDED', featured: false }).success,
    ).toBe(true);
    expect(
      podcastCreateSchema.safeParse({ ...validPodcast(), status: 'ACTIVE', featured: true }).success,
    ).toBe(true);
  });

  it('rejeita slug fora do padrao kebab-case', () => {
    const result = podcastCreateSchema.safeParse({ ...validPodcast(), slug: 'Horizonte_Digital' });
    expect(result.success).toBe(false);
  });

  it('rejeita accentColor que nao seja hex de 6 digitos', () => {
    expect(podcastCreateSchema.safeParse({ ...validPodcast(), accentColor: '#fff' }).success).toBe(
      false,
    );
  });

  it('rejeita coverImage que nao seja URL', () => {
    expect(
      podcastCreateSchema.safeParse({ ...validPodcast(), coverImage: 'nao-e-url' }).success,
    ).toBe(false);
  });

  it('rejeita ano fora do intervalo plausivel', () => {
    expect(podcastCreateSchema.safeParse({ ...validPodcast(), year: MIN_YEAR - 1 }).success).toBe(
      false,
    );
    expect(podcastCreateSchema.safeParse({ ...validPodcast(), year: MAX_YEAR + 1 }).success).toBe(
      false,
    );
    expect(podcastCreateSchema.safeParse({ ...validPodcast(), year: MIN_YEAR }).success).toBe(true);
    expect(podcastCreateSchema.safeParse({ ...validPodcast(), year: MAX_YEAR }).success).toBe(true);
  });

  it('rejeita campos desconhecidos no body', () => {
    const result = podcastCreateSchema.safeParse({ ...validPodcast(), deletedAt: null });
    expect(result.success).toBe(false);
  });

  it('rejeita host sem nome ou sem inicial', () => {
    expect(
      podcastCreateSchema.safeParse({ ...validPodcast(), hosts: [{ name: 'Sem inicial' }] }).success,
    ).toBe(false);
    expect(
      podcastCreateSchema.safeParse({ ...validPodcast(), hosts: [{ initial: 'X' }] }).success,
    ).toBe(false);
  });

  it('valida socialLinks como URLs', () => {
    expect(
      podcastCreateSchema.safeParse({
        ...validPodcast(),
        socialLinks: { instagram: 'https://instagram.com/reiners' },
      }).success,
    ).toBe(true);
    expect(
      podcastCreateSchema.safeParse({ ...validPodcast(), socialLinks: { instagram: '@reiners' } })
        .success,
    ).toBe(false);
  });
});

describe('podcastUpdateSchema', () => {
  it('aceita objeto vazio (patch parcial)', () => {
    expect(podcastUpdateSchema.safeParse({}).success).toBe(true);
  });

  it('aceita atualizacao de um unico campo', () => {
    const result = podcastUpdateSchema.safeParse({ title: 'Novo titulo' });
    expect(result.success).toBe(true);
  });

  it('BR-003 continua valendo quando hosts e enviado', () => {
    expect(podcastUpdateSchema.safeParse({ hosts: [] }).success).toBe(false);
  });

  it('BR-006 continua valendo quando status e featured vem juntos', () => {
    expect(podcastUpdateSchema.safeParse({ status: 'ENDED', featured: true }).success).toBe(false);
    expect(podcastUpdateSchema.safeParse({ status: 'ENDED' }).success).toBe(true);
  });

  it('rejeita campos desconhecidos', () => {
    expect(podcastUpdateSchema.safeParse({ id: UUID }).success).toBe(false);
  });
});

describe('podcastSchema (entidade publica)', () => {
  const entity = () => ({
    ...validPodcast(),
    id: UUID,
    socialLinks: {},
    displayOrder: 0,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-02-01T12:30:00.000Z',
  });

  it('valida a forma devolvida pela API', () => {
    expect(podcastSchema.safeParse(entity()).success).toBe(true);
  });

  it('nao expoe deletedAt: e metadado interno de soft delete', () => {
    expect(podcastSchema.safeParse({ ...entity(), deletedAt: null }).success).toBe(false);
    expect(Object.keys(podcastSchema.shape)).not.toContain('deletedAt');
  });

  it('exige os campos que o schema de escrita preenche por default', () => {
    // Uma resposta sem `status` nao pode ser aceita "virando ACTIVE" em silencio.
    for (const field of ['status', 'visualStyle', 'accentColor', 'featured', 'displayOrder']) {
      const incomplete: Record<string, unknown> = { ...entity() };
      delete incomplete[field];
      expect(podcastSchema.safeParse(incomplete).success, field).toBe(false);
    }
  });

  it('rejeita id que nao seja uuid', () => {
    expect(podcastSchema.safeParse({ ...entity(), id: '123' }).success).toBe(false);
  });

  it('rejeita timestamps que nao sejam ISO-8601', () => {
    expect(podcastSchema.safeParse({ ...entity(), createdAt: '01/01/2024' }).success).toBe(false);
  });

  it('podcastAdminSchema adiciona deletedAt como campo obrigatorio', () => {
    expect(podcastAdminSchema.safeParse({ ...entity(), deletedAt: null }).success).toBe(true);
    expect(
      podcastAdminSchema.safeParse({ ...entity(), deletedAt: '2024-03-01T00:00:00Z' }).success,
    ).toBe(true);
    expect(podcastAdminSchema.safeParse(entity()).success).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* BR-005 / BR-006 sobre estado mesclado                                      */
/* -------------------------------------------------------------------------- */

describe('validatePodcastRules (estado mesclado)', () => {
  it('documenta o buraco real do PATCH parcial: o schema sozinho deixa passar', () => {
    // Este é o comportamento ATUAL e esperado de um schema de payload parcial:
    // sem `status` no body, o refine nao tem como avaliar BR-006.
    expect(podcastUpdateSchema.safeParse({ featured: true }).success).toBe(true);
  });

  it('BR-006: o helper pega o caso que o schema parcial deixa passar', () => {
    const persisted = { status: 'ENDED' as const, featured: false };
    const patch = podcastUpdateSchema.parse({ featured: true });
    const violations = validatePodcastRules(resolvePodcastRuleState(persisted, patch));
    expect(violations).toHaveLength(1);
    expect(violations[0]?.rule).toBe('BR-006');
    expect(violations[0]?.code).toBe('CONFLICT');
    expect(violations[0]?.path).toEqual(['featured']);
  });

  it('BR-006: patch que tira o ENDED junto com o destaque e aceito', () => {
    const persisted = { status: 'ENDED' as const, featured: false };
    const patch = podcastUpdateSchema.parse({ featured: true, status: 'ACTIVE' });
    expect(validatePodcastRules(resolvePodcastRuleState(persisted, patch))).toEqual([]);
  });

  it('BR-006: patch que nao mexe em featured num programa ACTIVE nao viola nada', () => {
    const persisted = { status: 'ACTIVE' as const, featured: true };
    const patch = podcastUpdateSchema.parse({ title: 'Novo titulo' });
    expect(validatePodcastRules(resolvePodcastRuleState(persisted, patch))).toEqual([]);
  });

  it('BR-005: bloqueia o quarto destaque e libera o terceiro', () => {
    const state = { status: 'ACTIVE' as const, featured: true };
    expect(validatePodcastRules({ ...state, otherFeaturedCount: MAX_FEATURED_PODCASTS })).toEqual([
      expect.objectContaining({ rule: 'BR-005', code: 'CONFLICT' }),
    ]);
    expect(
      validatePodcastRules({ ...state, otherFeaturedCount: MAX_FEATURED_PODCASTS - 1 }),
    ).toEqual([]);
  });

  it('BR-005 nao se aplica quando o programa nao e destaque', () => {
    expect(
      validatePodcastRules({ status: 'ACTIVE', featured: false, otherFeaturedCount: 99 }),
    ).toEqual([]);
  });

  it('BR-005 e BR-006 podem violar juntas', () => {
    const violations = validatePodcastRules({
      status: 'ENDED',
      featured: true,
      otherFeaturedCount: MAX_FEATURED_PODCASTS,
    });
    expect(violations.map((item) => item.rule)).toEqual(['BR-006', 'BR-005']);
  });
});

describe('validateEpisodeTracks (estado mesclado)', () => {
  it('BR-004: pega o PATCH que zera a unica trilha existente', () => {
    const persisted = { youtubeUrl: YOUTUBE_URL, spotifyUrl: null };
    const patch = episodeUpdateSchema.parse({ youtubeUrl: null });
    const merged = { ...persisted, ...patch };
    expect(episodeUpdateSchema.safeParse({ youtubeUrl: null }).success).toBe(true);
    const violations = validateEpisodeTracks(merged);
    expect(violations).toHaveLength(1);
    expect(violations[0]?.rule).toBe('BR-004');
  });

  it('BR-004: aceita quando a outra trilha persiste', () => {
    const merged = { youtubeUrl: null, spotifyUrl: SPOTIFY_URL };
    expect(validateEpisodeTracks(merged)).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */
/* Episode                                                                    */
/* -------------------------------------------------------------------------- */

describe('episodeCreateSchema', () => {
  it('aceita episodio apenas com YouTube', () => {
    expect(episodeCreateSchema.safeParse(validEpisode()).success).toBe(true);
  });

  it('aceita episodio apenas com Spotify', () => {
    const { youtubeUrl: _youtubeUrl, ...rest } = validEpisode();
    expect(episodeCreateSchema.safeParse({ ...rest, spotifyUrl: SPOTIFY_URL }).success).toBe(true);
  });

  it('aceita episodio com as duas trilhas', () => {
    expect(
      episodeCreateSchema.safeParse({ ...validEpisode(), spotifyUrl: SPOTIFY_URL }).success,
    ).toBe(true);
  });

  it('BR-004: rejeita episodio sem nenhuma trilha', () => {
    const { youtubeUrl: _youtubeUrl, ...rest } = validEpisode();
    const result = episodeCreateSchema.safeParse(rest);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain('BR-004');
      expect(result.error.issues[0]?.path).toEqual(['youtubeUrl']);
    }
  });

  it('BR-004: rejeita episodio com as duas trilhas nulas', () => {
    const result = episodeCreateSchema.safeParse({
      ...validEpisode(),
      youtubeUrl: null,
      spotifyUrl: null,
    });
    expect(result.success).toBe(false);
  });

  it('rejeita URL de YouTube fora dos padroes canonicos', () => {
    expect(
      episodeCreateSchema.safeParse({ ...validEpisode(), youtubeUrl: 'https://vimeo.com/123456' })
        .success,
    ).toBe(false);
  });

  it('rejeita URL de Spotify que aponte para show em vez de episode', () => {
    const { youtubeUrl: _youtubeUrl, ...rest } = validEpisode();
    expect(
      episodeCreateSchema.safeParse({
        ...rest,
        spotifyUrl: 'https://open.spotify.com/show/1a2B3c4D5e6F7g8H9i0JkL',
      }).success,
    ).toBe(false);
  });

  it('rejeita duracao fora de MM:SS ou H:MM:SS', () => {
    expect(episodeCreateSchema.safeParse({ ...validEpisode(), duration: '45' }).success).toBe(false);
    expect(episodeCreateSchema.safeParse({ ...validEpisode(), duration: '45:60' }).success).toBe(
      false,
    );
    expect(episodeCreateSchema.safeParse({ ...validEpisode(), duration: '1:02:33' }).success).toBe(
      true,
    );
  });

  it('rejeita podcastId que nao seja uuid e number menor que 1', () => {
    expect(episodeCreateSchema.safeParse({ ...validEpisode(), podcastId: 'abc' }).success).toBe(
      false,
    );
    expect(episodeCreateSchema.safeParse({ ...validEpisode(), number: 0 }).success).toBe(false);
  });

  it('rejeita embeds no body: sao derivados no servidor', () => {
    expect(
      episodeCreateSchema.safeParse({ ...validEpisode(), youtubeEmbed: 'dQw4w9WgXcQ' }).success,
    ).toBe(false);
  });
});

describe('episodeUpdateSchema', () => {
  it('aceita patch parcial e ignora podcastId (imutavel)', () => {
    expect(episodeUpdateSchema.safeParse({ title: 'Novo titulo' }).success).toBe(true);
    expect(episodeUpdateSchema.safeParse({ podcastId: OTHER_UUID }).success).toBe(false);
  });

  it('BR-004: rejeita zerar as duas trilhas na mesma requisicao', () => {
    const result = episodeUpdateSchema.safeParse({ youtubeUrl: null, spotifyUrl: null });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain('BR-004');
    }
  });

  it('BR-004: permite zerar apenas uma trilha (a outra vem do estado persistido)', () => {
    expect(episodeUpdateSchema.safeParse({ youtubeUrl: null }).success).toBe(true);
    expect(
      episodeUpdateSchema.safeParse({ youtubeUrl: null, spotifyUrl: SPOTIFY_URL }).success,
    ).toBe(true);
  });
});

describe('episodeSchema (entidade)', () => {
  it('exige os campos de embed derivados', () => {
    const base = {
      ...validEpisode(),
      id: UUID,
      createdAt: '2024-01-01T00:00:00Z',
      youtubeEmbed: 'dQw4w9WgXcQ',
      spotifyEmbed: null,
    };
    expect(episodeSchema.safeParse(base).success).toBe(true);
    const { youtubeEmbed: _youtubeEmbed, ...semEmbed } = base;
    expect(episodeSchema.safeParse(semEmbed).success).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* Query / paginacao                                                          */
/* -------------------------------------------------------------------------- */

describe('paginationQuerySchema', () => {
  it('aplica defaults quando a query esta vazia', () => {
    expect(paginationQuerySchema.parse({})).toEqual({ page: 1, limit: DEFAULT_PAGE_LIMIT });
  });

  it('coage strings de querystring para numero', () => {
    expect(paginationQuerySchema.parse({ page: '3', limit: '50' })).toEqual({ page: 3, limit: 50 });
  });

  it('rejeita limit acima do teto e page menor que 1', () => {
    expect(paginationQuerySchema.safeParse({ limit: String(MAX_PAGE_LIMIT + 1) }).success).toBe(
      false,
    );
    expect(paginationQuerySchema.safeParse({ page: '0' }).success).toBe(false);
    expect(paginationQuerySchema.safeParse({ page: '1.5' }).success).toBe(false);
  });
});

describe('podcastQuerySchema', () => {
  it('aplica sort e order padrao', () => {
    const parsed = podcastQuerySchema.parse({});
    expect(parsed.sort).toBe('displayOrder');
    expect(parsed.order).toBe('asc');
    expect(parsed.status).toBeUndefined();
  });

  it.each([
    ['true', true],
    ['1', true],
    ['false', false],
    ['0', false],
  ])('coage featured=%s para %s', (input, expected) => {
    expect(podcastQuerySchema.parse({ featured: input }).featured).toBe(expected);
  });

  it('rejeita status, sort e order invalidos', () => {
    expect(podcastQuerySchema.safeParse({ status: 'PAUSED' }).success).toBe(false);
    expect(podcastQuerySchema.safeParse({ sort: 'random' }).success).toBe(false);
    expect(podcastQuerySchema.safeParse({ order: 'ASC' }).success).toBe(false);
    expect(podcastQuerySchema.safeParse({ featured: 'sim' }).success).toBe(false);
  });

  it('aceita filtro por categoria', () => {
    expect(podcastQuerySchema.parse({ category: 'tech' }).category).toBe('tech');
  });
});

describe('episodeQuerySchema', () => {
  it('exige podcastId', () => {
    expect(episodeQuerySchema.safeParse({}).success).toBe(false);
    expect(episodeQuerySchema.safeParse({ podcastId: 'nao-uuid' }).success).toBe(false);
  });

  it('ordena por publishedAt desc por padrao', () => {
    const parsed = episodeQuerySchema.parse({ podcastId: UUID, page: '2' });
    expect(parsed).toEqual({
      podcastId: UUID,
      page: 2,
      limit: DEFAULT_PAGE_LIMIT,
      sort: 'publishedAt',
      order: 'desc',
    });
  });
});

describe('eventQuerySchema', () => {
  it('aceita janela temporal ISO e filtro por tipo', () => {
    const parsed = eventQuerySchema.parse({
      eventType: 'PAGE_VIEW',
      from: '2024-01-01T00:00:00Z',
      to: '2024-01-31T23:59:59Z',
    });
    expect(parsed.eventType).toBe('PAGE_VIEW');
    expect(parsed.order).toBe('desc');
  });

  it('rejeita datas fora do formato ISO', () => {
    expect(eventQuerySchema.safeParse({ from: '2024-01-01' }).success).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* Envelopes                                                                  */
/* -------------------------------------------------------------------------- */

describe('envelopes de resposta', () => {
  it('paginatedResponseSchema valida data + meta', () => {
    const schema = paginatedResponseSchema(podcastStatusSchema);
    expect(
      schema.safeParse({
        data: ['ACTIVE', 'ENDED'],
        meta: { page: 1, limit: 20, total: 2, totalPages: 1 },
      }).success,
    ).toBe(true);
    expect(schema.safeParse({ data: ['ACTIVE'] }).success).toBe(false);
    expect(
      schema.safeParse({ data: ['NOPE'], meta: { page: 1, limit: 20, total: 1, totalPages: 1 } })
        .success,
    ).toBe(false);
  });

  it('dataResponseSchema envelopa recurso unico', () => {
    const schema = dataResponseSchema(adminRoleSchema);
    expect(schema.parse({ data: 'ADMIN' })).toEqual({ data: 'ADMIN' });
    expect(schema.safeParse({ data: 'ROOT' }).success).toBe(false);
  });

  it('errorResponseSchema exige code e message e aceita details opcional', () => {
    expect(
      errorResponseSchema.safeParse({ error: { code: 'NOT_FOUND', message: 'Podcast not found' } })
        .success,
    ).toBe(true);
    expect(
      errorResponseSchema.safeParse({
        error: { code: 'VALIDATION_ERROR', message: 'invalido', details: { field: 'slug' } },
      }).success,
    ).toBe(true);
    expect(errorResponseSchema.safeParse({ error: { code: 'BOOM', message: 'x' } }).success).toBe(
      false,
    );
    expect(errorResponseSchema.safeParse({ error: { code: 'NOT_FOUND' } }).success).toBe(false);
    expect(errorResponseSchema.safeParse({ message: 'sem envelope' }).success).toBe(false);
  });

  it('todo codigo de erro tem status HTTP mapeado', () => {
    for (const code of ZOD_ENUMS.ErrorCode.options) {
      expect(ERROR_STATUS_BY_CODE[code]).toBeGreaterThanOrEqual(400);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* SiteConfig, Event, Testimonial, Plan, Auth, Upload                         */
/* -------------------------------------------------------------------------- */

describe('siteConfigUpdateSchema', () => {
  it('aceita patch parcial valido', () => {
    expect(siteConfigUpdateSchema.safeParse({ siteName: 'Reiners Media' }).success).toBe(true);
    expect(siteConfigUpdateSchema.safeParse({}).success).toBe(true);
  });

  it('rejeita primaryColor invalida, URL invalida e campo desconhecido', () => {
    expect(siteConfigUpdateSchema.safeParse({ primaryColor: 'roxo' }).success).toBe(false);
    expect(siteConfigUpdateSchema.safeParse({ logoUrl: 'logo.png' }).success).toBe(false);
    expect(siteConfigUpdateSchema.safeParse({ unknownField: 1 }).success).toBe(false);
  });

  it('rejeita seoDescription acima de 200 caracteres', () => {
    expect(siteConfigUpdateSchema.safeParse({ seoDescription: 'x'.repeat(201) }).success).toBe(
      false,
    );
  });
});

describe('eventCreateSchema', () => {
  it('aceita evento com payload conhecido', () => {
    const result = eventCreateSchema.safeParse({
      eventType: 'PAGE_VIEW',
      payload: { path: '/portfolio', referrer: 'https://google.com', userAgent: 'vitest' },
    });
    expect(result.success).toBe(true);
  });

  it('aceita chaves extras no payload', () => {
    const result = eventCreateSchema.safeParse({
      eventType: 'CARD_EXPAND',
      payload: { path: '/', experimento: 'B', profundidade: 3 },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.payload?.experimento).toBe('B');
    }
  });

  it('aceita evento sem payload', () => {
    expect(eventCreateSchema.safeParse({ eventType: 'ADMIN_LOGIN' }).success).toBe(true);
  });

  it('rejeita eventType desconhecido e campo raiz desconhecido', () => {
    expect(eventCreateSchema.safeParse({ eventType: 'CLICK' }).success).toBe(false);
    expect(eventCreateSchema.safeParse({ eventType: 'PAGE_VIEW', ip: '1.2.3.4' }).success).toBe(
      false,
    );
  });

  it('rejeita podcastId nao-uuid dentro do payload', () => {
    expect(
      eventCreateSchema.safeParse({ eventType: 'EPISODE_PLAY', payload: { podcastId: 'x' } })
        .success,
    ).toBe(false);
  });
});

describe('testimonialCreateSchema e planCreateSchema', () => {
  it('valida depoimento completo', () => {
    expect(
      testimonialCreateSchema.safeParse({
        name: 'Ana Souza',
        role: 'Head de Marketing',
        quote: 'Producao impecavel.',
      }).success,
    ).toBe(true);
    expect(testimonialCreateSchema.safeParse({ name: 'Ana', role: 'Head' }).success).toBe(false);
  });

  it('plano exige ao menos uma feature', () => {
    const base = { name: 'Essencial', price: 'R$ 2.500', period: 'por episodio' };
    expect(planCreateSchema.safeParse({ ...base, features: ['Gravacao 4K'] }).success).toBe(true);
    expect(planCreateSchema.safeParse({ ...base, features: [] }).success).toBe(false);
    expect(planCreateSchema.parse({ ...base, features: ['x'] }).isFeatured).toBe(false);
  });
});

describe('auth', () => {
  it('loginSchema exige email valido e senha de 8 caracteres', () => {
    expect(loginSchema.safeParse({ email: 'admin@reiners.media', password: 'senha1234' }).success).toBe(
      true,
    );
    expect(loginSchema.safeParse({ email: 'admin', password: 'senha1234' }).success).toBe(false);
    expect(loginSchema.safeParse({ email: 'admin@reiners.media', password: 'curta' }).success).toBe(
      false,
    );
    expect(
      loginSchema.safeParse({ email: 'admin@reiners.media', password: 'senha1234', remember: true })
        .success,
    ).toBe(false);
  });

  it('sessionSchema aceita sessao anonima e autenticada', () => {
    expect(
      sessionSchema.safeParse({ authenticated: false, user: null, expiresAt: null }).success,
    ).toBe(true);
    const user = {
      id: UUID,
      email: 'admin@reiners.media',
      name: 'Admin',
      role: 'ADMIN',
      lastLoginAt: '2024-01-01T00:00:00Z',
      createdAt: '2024-01-01T00:00:00Z',
    };
    expect(adminUserSchema.safeParse(user).success).toBe(true);
    expect(
      sessionSchema.safeParse({ authenticated: true, user, expiresAt: '2024-01-02T00:00:00Z' })
        .success,
    ).toBe(true);
    expect(sessionSchema.safeParse({ authenticated: true }).success).toBe(false);
  });
});

describe('uploadRequestSchema', () => {
  it('aceita metadados dentro dos limites', () => {
    expect(
      uploadRequestSchema.safeParse({
        folder: 'podcasts',
        filename: 'capa.jpg',
        contentType: 'image/jpeg',
        size: 1024,
      }).success,
    ).toBe(true);
  });

  it('rejeita pasta invalida, mime invalido e arquivo acima de 5MB', () => {
    const base = { filename: 'capa.jpg', contentType: 'image/jpeg', size: 1024 } as const;
    expect(uploadRequestSchema.safeParse({ ...base, folder: 'outros' }).success).toBe(false);
    expect(
      uploadRequestSchema.safeParse({ ...base, folder: 'podcasts', contentType: 'image/gif' })
        .success,
    ).toBe(false);
    expect(
      uploadRequestSchema.safeParse({ ...base, folder: 'podcasts', size: UPLOAD_MAX_BYTES + 1 })
        .success,
    ).toBe(false);
    expect(
      uploadRequestSchema.safeParse({ ...base, folder: 'podcasts', size: UPLOAD_MAX_BYTES }).success,
    ).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* Constantes de regra de negocio nao expressaveis em Zod                      */
/* -------------------------------------------------------------------------- */

describe('constantes de regra de negocio', () => {
  it('BR-005 e BR-009 ficam disponiveis para as camadas de dados', () => {
    expect(MAX_FEATURED_PODCASTS).toBe(3);
    expect(EVENT_LOG_RETENTION_DAYS).toBe(90);
    expect(UPLOAD_MAX_BYTES).toBe(5 * 1024 * 1024);
    expect(MAX_PAGE_LIMIT).toBe(100);
    expect(DEFAULT_PAGE_LIMIT).toBe(20);
  });
});

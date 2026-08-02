// @vitest-environment node
/**
 * TCK-006 — testes de integração das rotas de episódio.
 *
 * AMBIENTE: não há PostgreSQL disponível nesta execução, então o `PrismaClient`
 * é MOCKADO no módulo `@/lib/prisma`. O que está sob teste são os route
 * handlers de verdade: cada caso constrói um `NextRequest`, chama o handler
 * exportado e verifica status, corpo e os argumentos entregues ao Prisma.
 * Nenhum handler é reimplementado aqui.
 *
 * O ambiente é `node` (e não o `jsdom` padrão do projeto) porque
 * `next/server` precisa dos globais `Request`/`Response` do runtime.
 */
import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  episodeListResponseSchema,
  episodeResponseSchema,
  errorResponseSchema,
} from '@/lib/schemas';

/**
 * Mock PARCIAL de TCK-004: só `requireRole` é substituído (verificar sessão
 * exigiria Supabase). `enforceRateLimit`, as políticas e `errorResponse`
 * continuam sendo os reais — os 429 e os cabeçalhos exercitados aqui saem do
 * código de produção. Dos 401/403 o que se testa é a COSTURA: que o handler
 * chama o guard, devolve a resposta dele intacta e não toca no banco.
 */
const authMock = vi.hoisted(() => ({ requireRole: vi.fn() }));
vi.mock('@/lib/auth-helpers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth-helpers')>();
  return { ...actual, requireRole: authMock.requireRole };
});

const prismaMock = vi.hoisted(() => ({
  podcast: { findFirst: vi.fn() },
  episode: {
    count: vi.fn(),
    findMany: vi.fn(),
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock, default: prismaMock }));

const { clearRateLimit } = await import('@/lib/auth-helpers');

const { GET: listEpisodes, POST: createEpisode } = await import('@/app/api/episodes/route');
const {
  GET: getEpisode,
  PATCH: patchEpisode,
  DELETE: deleteEpisode,
} = await import('@/app/api/episodes/[id]/route');

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

const PODCAST_ID = '11111111-1111-4111-8111-111111111111';
const EPISODE_ID = '22222222-2222-4222-8222-222222222222';
const OTHER_EPISODE_ID = '33333333-3333-4333-8333-333333333333';
const YT_ID = 'dQw4w9WgXcQ';
const OTHER_YT_ID = '_-aBcDeF123';
const SP_ID = '4rOoJ6Egrf8K2IrywzwOMk';
const YOUTUBE_URL = `https://www.youtube.com/watch?v=${YT_ID}&t=30`;
const SPOTIFY_URL = `https://open.spotify.com/episode/${SP_ID}?si=abc123`;

type EpisodeRow = Record<string, unknown>;

function episodeRow(overrides: EpisodeRow = {}): EpisodeRow {
  return {
    id: EPISODE_ID,
    podcastId: PODCAST_ID,
    number: 1,
    title: 'Horizonte Digital — piloto',
    description: 'Conversa sobre o futuro do trabalho.',
    thumbnail: '/images/episodes/piloto.jpg',
    duration: '45:30',
    publishedAt: new Date('2024-03-01T12:00:00.000Z'),
    youtubeUrl: `https://youtu.be/${YT_ID}`,
    youtubeEmbed: YT_ID,
    spotifyUrl: null,
    spotifyEmbed: null,
    createdAt: new Date('2024-03-01T12:05:00.000Z'),
    ...overrides,
  };
}

function validCreateBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    podcastId: PODCAST_ID,
    number: 7,
    title: 'Episódio 7',
    description: 'Descrição do episódio 7.',
    duration: '1:02:10',
    publishedAt: '2024-05-10T18:00:00.000Z',
    youtubeUrl: YOUTUBE_URL,
    spotifyUrl: SPOTIFY_URL,
    ...overrides,
  };
}

function listRequest(params: Record<string, string> = {}): NextRequest {
  const url = new URL('http://localhost:3000/api/episodes');
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return new NextRequest(url);
}

function jsonRequest(method: string, body: unknown, path = '/api/episodes'): NextRequest {
  return new NextRequest(`http://localhost:3000${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function context(id: string): { params: { id: string } } {
  return { params: { id } };
}

/** Requisição de leitura vinda de um IP específico (balde de rate limit por IP). */
function listRequestFrom(ip: string): NextRequest {
  const url = new URL('http://localhost:3000/api/episodes');
  url.searchParams.set('podcastId', PODCAST_ID);
  return new NextRequest(url, { headers: { 'x-forwarded-for': ip } });
}

/** Requisição de mutação vinda de um IP específico. */
function mutationRequest(
  method: string,
  body: unknown,
  ip: string,
  path = '/api/episodes',
): NextRequest {
  return new NextRequest(`http://localhost:3000${path}`, {
    method,
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify(body),
  });
}

async function bodyOf(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

/** Sessão administrativa válida, o cenário padrão dos testes de mutação. */
const ADMIN_SESSION = {
  ok: true as const,
  user: {
    id: '44444444-4444-4444-8444-444444444444',
    email: 'admin@reinersmedia.com',
    name: 'Admin',
    role: 'ADMIN' as const,
    lastLoginAt: null,
    createdAt: '2024-01-01T00:00:00.000Z',
  },
  session: { authenticated: true, user: null, expiresAt: null },
};

function denyWith(status: number, code: string): { ok: false; response: NextResponse } {
  return {
    ok: false,
    response: NextResponse.json({ error: { code, message: 'negado' } }, { status }),
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  clearRateLimit();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  authMock.requireRole.mockResolvedValue(ADMIN_SESSION);
  prismaMock.podcast.findFirst.mockResolvedValue({ id: PODCAST_ID });
  prismaMock.episode.findFirst.mockResolvedValue(null);
});

/* -------------------------------------------------------------------------- */
/* GET /api/episodes                                                          */
/* -------------------------------------------------------------------------- */

describe('GET /api/episodes', () => {
  it('devolve lista paginada ordenada por publishedAt desc por padrão', async () => {
    prismaMock.episode.count.mockResolvedValue(3);
    prismaMock.episode.findMany.mockResolvedValue([
      episodeRow({ id: EPISODE_ID, number: 3 }),
      episodeRow({ id: OTHER_EPISODE_ID, number: 2 }),
    ]);

    const response = await listEpisodes(listRequest({ podcastId: PODCAST_ID }));
    const body = await bodyOf(response);

    expect(response.status).toBe(200);
    expect(() => episodeListResponseSchema.parse(body)).not.toThrow();
    expect(body.meta).toEqual({ page: 1, limit: 20, total: 3, totalPages: 1 });
    expect(prismaMock.episode.findMany).toHaveBeenCalledWith({
      where: { podcastId: PODCAST_ID },
      orderBy: { publishedAt: 'desc' },
      skip: 0,
      take: 20,
    });
  });

  it('aplica page, limit, sort e order da querystring', async () => {
    prismaMock.episode.count.mockResolvedValue(45);
    prismaMock.episode.findMany.mockResolvedValue([]);

    const response = await listEpisodes(
      listRequest({ podcastId: PODCAST_ID, page: '3', limit: '10', sort: 'number', order: 'asc' }),
    );
    const body = await bodyOf(response);

    expect(response.status).toBe(200);
    expect(body.meta).toEqual({ page: 3, limit: 10, total: 45, totalPages: 5 });
    expect(prismaMock.episode.findMany).toHaveBeenCalledWith({
      where: { podcastId: PODCAST_ID },
      orderBy: { number: 'asc' },
      skip: 20,
      take: 10,
    });
  });

  it('ignora parâmetros desconhecidos (query não é estrita)', async () => {
    prismaMock.episode.count.mockResolvedValue(0);
    prismaMock.episode.findMany.mockResolvedValue([]);

    const response = await listEpisodes(
      listRequest({ podcastId: PODCAST_ID, utm_source: 'newsletter' }),
    );

    expect(response.status).toBe(200);
  });

  it('serializa Date em ISO-8601 e não vaza coluna fora do contrato', async () => {
    prismaMock.episode.count.mockResolvedValue(1);
    prismaMock.episode.findMany.mockResolvedValue([
      episodeRow({ internalNote: 'coluna nova do banco', deletedAt: null }),
    ]);

    const response = await listEpisodes(listRequest({ podcastId: PODCAST_ID }));
    const body = await bodyOf(response);
    const [first] = body.data as Array<Record<string, unknown>>;

    expect(response.status).toBe(200);
    expect(first.publishedAt).toBe('2024-03-01T12:00:00.000Z');
    expect(first.createdAt).toBe('2024-03-01T12:05:00.000Z');
    expect(first).not.toHaveProperty('internalNote');
    expect(first).not.toHaveProperty('deletedAt');
  });

  it('rejeita ausência de podcastId com 422', async () => {
    const response = await listEpisodes(listRequest());
    const body = await bodyOf(response);

    expect(response.status).toBe(422);
    expect(() => errorResponseSchema.parse(body)).not.toThrow();
    expect((body.error as Record<string, unknown>).code).toBe('VALIDATION_ERROR');
    expect(prismaMock.episode.findMany).not.toHaveBeenCalled();
  });

  it('rejeita podcastId que não é UUID com 422', async () => {
    const response = await listEpisodes(listRequest({ podcastId: 'nao-e-uuid' }));
    expect(response.status).toBe(422);
  });

  it('rejeita limit acima do teto de 100 com 422', async () => {
    const response = await listEpisodes(listRequest({ podcastId: PODCAST_ID, limit: '500' }));
    expect(response.status).toBe(422);
  });

  it('devolve 404 quando o programa não existe', async () => {
    prismaMock.podcast.findFirst.mockResolvedValue(null);

    const response = await listEpisodes(listRequest({ podcastId: PODCAST_ID }));
    const body = await bodyOf(response);

    expect(response.status).toBe(404);
    expect((body.error as Record<string, unknown>).code).toBe('NOT_FOUND');
    expect(prismaMock.episode.findMany).not.toHaveBeenCalled();
  });

  it('não lista episódios de programa soft-deleted', async () => {
    prismaMock.podcast.findFirst.mockResolvedValue(null);
    await listEpisodes(listRequest({ podcastId: PODCAST_ID }));

    expect(prismaMock.podcast.findFirst).toHaveBeenCalledWith({
      where: { id: PODCAST_ID, deletedAt: null },
      select: { id: true },
    });
  });

  it('devolve 500 no envelope padrão quando o banco falha', async () => {
    prismaMock.episode.count.mockRejectedValue(new Error('connection refused'));
    prismaMock.episode.findMany.mockRejectedValue(new Error('connection refused'));

    const response = await listEpisodes(listRequest({ podcastId: PODCAST_ID }));
    const body = await bodyOf(response);

    expect(response.status).toBe(500);
    expect(() => errorResponseSchema.parse(body)).not.toThrow();
    expect((body.error as Record<string, unknown>).code).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(body)).not.toContain('connection refused');
  });
});

/* -------------------------------------------------------------------------- */
/* POST /api/episodes                                                         */
/* -------------------------------------------------------------------------- */

describe('POST /api/episodes', () => {
  it('cria o episódio derivando youtubeEmbed e spotifyEmbed no servidor', async () => {
    prismaMock.episode.create.mockImplementation(async ({ data }: { data: EpisodeRow }) =>
      episodeRow({ ...data, id: OTHER_EPISODE_ID }),
    );

    const response = await createEpisode(jsonRequest('POST', validCreateBody()));
    const body = await bodyOf(response);

    expect(response.status).toBe(201);
    expect(() => episodeResponseSchema.parse(body)).not.toThrow();

    const createArgs = prismaMock.episode.create.mock.calls[0][0] as { data: EpisodeRow };
    expect(createArgs.data.youtubeEmbed).toBe(YT_ID);
    expect(createArgs.data.spotifyEmbed).toBe(`spotify:episode:${SP_ID}`);
    expect(createArgs.data.publishedAt).toBeInstanceOf(Date);
    expect((body.data as Record<string, unknown>).youtubeEmbed).toBe(YT_ID);
    expect((body.data as Record<string, unknown>).spotifyEmbed).toBe(`spotify:episode:${SP_ID}`);
  });

  it('deriva apenas o embed da trilha informada', async () => {
    prismaMock.episode.create.mockImplementation(async ({ data }: { data: EpisodeRow }) =>
      episodeRow({ ...data, id: OTHER_EPISODE_ID }),
    );

    const response = await createEpisode(
      jsonRequest('POST', validCreateBody({ youtubeUrl: undefined, spotifyUrl: SPOTIFY_URL })),
    );
    const body = await bodyOf(response);

    expect(response.status).toBe(201);
    expect((body.data as Record<string, unknown>).youtubeEmbed).toBeNull();
    expect((body.data as Record<string, unknown>).spotifyEmbed).toBe(`spotify:episode:${SP_ID}`);
  });

  it('BR-004: rejeita com 422 quando nenhuma trilha é informada', async () => {
    const response = await createEpisode(
      jsonRequest('POST', validCreateBody({ youtubeUrl: undefined, spotifyUrl: undefined })),
    );
    const body = await bodyOf(response);

    expect(response.status).toBe(422);
    expect(() => errorResponseSchema.parse(body)).not.toThrow();
    expect((body.error as Record<string, unknown>).code).toBe('VALIDATION_ERROR');
    expect(JSON.stringify(body)).toContain('BR-004');
    expect(prismaMock.episode.create).not.toHaveBeenCalled();
  });

  it('BR-004: null explícito nas duas trilhas também é 422', async () => {
    const response = await createEpisode(
      jsonRequest('POST', validCreateBody({ youtubeUrl: null, spotifyUrl: null })),
    );
    expect(response.status).toBe(422);
  });

  it('rejeita youtubeEmbed enviado pelo cliente (campo derivado no servidor)', async () => {
    const response = await createEpisode(
      jsonRequest('POST', validCreateBody({ youtubeEmbed: 'hackeado123' })),
    );
    const body = await bodyOf(response);

    expect(response.status).toBe(422);
    expect(JSON.stringify(body)).toContain('unrecognized_keys');
    expect(prismaMock.episode.create).not.toHaveBeenCalled();
  });

  it('rejeita URL de YouTube fora dos formatos canônicos', async () => {
    const response = await createEpisode(
      jsonRequest('POST', validCreateBody({ youtubeUrl: 'https://vimeo.com/123456789' })),
    );
    expect(response.status).toBe(422);
  });

  it('rejeita duração fora de MM:SS / H:MM:SS', async () => {
    const response = await createEpisode(jsonRequest('POST', validCreateBody({ duration: '90m' })));
    expect(response.status).toBe(422);
  });

  it('devolve 400 para JSON malformado', async () => {
    const response = await createEpisode(jsonRequest('POST', '{"title": '));
    const body = await bodyOf(response);

    expect(response.status).toBe(400);
    expect((body.error as Record<string, unknown>).code).toBe('BAD_REQUEST');
  });

  it('devolve 404 quando o programa informado não existe', async () => {
    prismaMock.podcast.findFirst.mockResolvedValue(null);

    const response = await createEpisode(jsonRequest('POST', validCreateBody()));

    expect(response.status).toBe(404);
    expect(prismaMock.episode.create).not.toHaveBeenCalled();
  });

  it('devolve 409 quando o número já existe no programa', async () => {
    prismaMock.episode.findFirst.mockResolvedValue({ id: EPISODE_ID });

    const response = await createEpisode(jsonRequest('POST', validCreateBody({ number: 7 })));
    const body = await bodyOf(response);

    expect(response.status).toBe(409);
    expect((body.error as Record<string, unknown>).code).toBe('CONFLICT');
    expect(prismaMock.episode.create).not.toHaveBeenCalled();
  });

  it('valida o payload antes de consultar o banco', async () => {
    await createEpisode(jsonRequest('POST', { title: 'incompleto' }));
    expect(prismaMock.podcast.findFirst).not.toHaveBeenCalled();
  });
});

/* -------------------------------------------------------------------------- */
/* Rate limiting — NFR-005 / docs/SECURITY.md                                 */
/* -------------------------------------------------------------------------- */

describe('rate limiting', () => {
  it('GET /api/episodes: 100 req/min por IP, a 101ª vira 429', async () => {
    prismaMock.episode.count.mockResolvedValue(0);
    prismaMock.episode.findMany.mockResolvedValue([]);

    const statuses = new Set<number>();
    let last: Response | undefined;
    for (let attempt = 0; attempt < 101; attempt += 1) {
      last = await listEpisodes(listRequestFrom('203.0.113.10'));
      statuses.add(last.status);
    }

    expect(statuses).toEqual(new Set([200, 429]));
    expect(last?.status).toBe(429);
    expect(last?.headers.get('X-RateLimit-Limit')).toBe('100');
    expect(last?.headers.get('Retry-After')).toBeTruthy();

    const body = await bodyOf(last as Response);
    expect(errorResponseSchema.parse(body).error.code).toBe('RATE_LIMITED');
    // A requisição barrada não pode custar query ao Postgres.
    expect(prismaMock.episode.findMany).toHaveBeenCalledTimes(100);
  });

  it('conta por IP: um cliente estourado não bloqueia os outros', async () => {
    prismaMock.episode.count.mockResolvedValue(0);
    prismaMock.episode.findMany.mockResolvedValue([]);

    for (let attempt = 0; attempt < 101; attempt += 1) {
      await listEpisodes(listRequestFrom('203.0.113.11'));
    }

    const other = await listEpisodes(listRequestFrom('198.51.100.4'));
    expect(other.status).toBe(200);
  });

  it('conta por rota: estourar a lista não derruba o detalhe', async () => {
    prismaMock.episode.count.mockResolvedValue(0);
    prismaMock.episode.findMany.mockResolvedValue([]);
    prismaMock.episode.findUnique.mockResolvedValue(episodeRow());

    for (let attempt = 0; attempt < 101; attempt += 1) {
      await listEpisodes(listRequestFrom('203.0.113.12'));
    }

    const detail = await getEpisode(
      new NextRequest(`http://localhost:3000/api/episodes/${EPISODE_ID}`, {
        headers: { 'x-forwarded-for': '203.0.113.12' },
      }),
      context(EPISODE_ID),
    );

    expect(detail.status).toBe(200);
  });

  it('mutações usam a política administrativa de 60 req/min', async () => {
    prismaMock.episode.create.mockImplementation(async ({ data }: { data: EpisodeRow }) =>
      episodeRow(data),
    );

    let last: Response | undefined;
    for (let attempt = 0; attempt < 61; attempt += 1) {
      last = await createEpisode(mutationRequest('POST', validCreateBody(), '203.0.113.20'));
    }

    expect(last?.status).toBe(429);
    expect(last?.headers.get('X-RateLimit-Limit')).toBe('60');
    expect(prismaMock.episode.create).toHaveBeenCalledTimes(60);
  });
});

/* -------------------------------------------------------------------------- */
/* Cabeçalhos                                                                 */
/* -------------------------------------------------------------------------- */

describe('cabeçalhos das respostas de erro', () => {
  it('todo erro sai com Cache-Control: no-store', async () => {
    prismaMock.episode.findUnique.mockResolvedValue(null);

    const validation = await listEpisodes(listRequest());
    const missing = await getEpisode(
      new NextRequest(`http://localhost:3000/api/episodes/${EPISODE_ID}`),
      context(EPISODE_ID),
    );

    expect(validation.status).toBe(422);
    expect(validation.headers.get('cache-control')).toBe('no-store');
    expect(missing.status).toBe(404);
    expect(missing.headers.get('cache-control')).toBe('no-store');
  });
});

/* -------------------------------------------------------------------------- */
/* RBAC — costura com o guard de TCK-004                                      */
/* -------------------------------------------------------------------------- */

describe('mutações exigem sessão administrativa', () => {
  it('POST devolve o 401 do guard sem tocar no banco', async () => {
    authMock.requireRole.mockResolvedValue(denyWith(401, 'UNAUTHORIZED'));

    const response = await createEpisode(jsonRequest('POST', validCreateBody()));

    expect(response.status).toBe(401);
    expect(authMock.requireRole).toHaveBeenCalledWith('EDITOR', expect.anything());
    expect(prismaMock.podcast.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.episode.create).not.toHaveBeenCalled();
  });

  it('PATCH devolve o 401 do guard sem ler o episódio', async () => {
    authMock.requireRole.mockResolvedValue(denyWith(401, 'UNAUTHORIZED'));

    const response = await patchEpisode(
      jsonRequest('PATCH', { title: 'x' }, `/api/episodes/${EPISODE_ID}`),
      context(EPISODE_ID),
    );

    expect(response.status).toBe(401);
    expect(prismaMock.episode.findUnique).not.toHaveBeenCalled();
  });

  it('BR-002: DELETE exige ADMIN e propaga o 403 do guard', async () => {
    authMock.requireRole.mockResolvedValue(denyWith(403, 'FORBIDDEN'));

    const response = await deleteEpisode(
      new NextRequest(`http://localhost:3000/api/episodes/${EPISODE_ID}`, { method: 'DELETE' }),
      context(EPISODE_ID),
    );

    expect(response.status).toBe(403);
    expect(authMock.requireRole).toHaveBeenCalledWith('ADMIN', expect.anything());
    expect(prismaMock.episode.delete).not.toHaveBeenCalled();
  });

  it('o rate limit é consumido ANTES da autorização', async () => {
    // Sessão negada: sem o limite antes do guard, as 61 chamadas seriam 401 e a
    // rota administrativa ficaria sem teto para força bruta de sessão.
    authMock.requireRole.mockResolvedValue(denyWith(401, 'UNAUTHORIZED'));

    let last: Response | undefined;
    for (let attempt = 0; attempt < 61; attempt += 1) {
      last = await createEpisode(mutationRequest('POST', validCreateBody(), '203.0.113.21'));
    }

    expect(last?.status).toBe(429);
  });

  it('leitura pública não passa pelo guard', async () => {
    prismaMock.episode.count.mockResolvedValue(0);
    prismaMock.episode.findMany.mockResolvedValue([]);
    prismaMock.episode.findUnique.mockResolvedValue(episodeRow());

    await listEpisodes(listRequest({ podcastId: PODCAST_ID }));
    await getEpisode(
      new NextRequest(`http://localhost:3000/api/episodes/${EPISODE_ID}`),
      context(EPISODE_ID),
    );

    expect(authMock.requireRole).not.toHaveBeenCalled();
  });
});

/* -------------------------------------------------------------------------- */
/* GET /api/episodes/:id                                                      */
/* -------------------------------------------------------------------------- */

describe('GET /api/episodes/:id', () => {
  it('devolve o episódio no envelope de recurso único', async () => {
    prismaMock.episode.findUnique.mockResolvedValue(episodeRow());

    const response = await getEpisode(
      new NextRequest(`http://localhost:3000/api/episodes/${EPISODE_ID}`),
      context(EPISODE_ID),
    );
    const body = await bodyOf(response);

    expect(response.status).toBe(200);
    expect(() => episodeResponseSchema.parse(body)).not.toThrow();
    expect((body.data as Record<string, unknown>).id).toBe(EPISODE_ID);
  });

  it('devolve 404 para id inexistente', async () => {
    prismaMock.episode.findUnique.mockResolvedValue(null);

    const response = await getEpisode(
      new NextRequest(`http://localhost:3000/api/episodes/${EPISODE_ID}`),
      context(EPISODE_ID),
    );

    expect(response.status).toBe(404);
  });

  it('devolve 404 quando o programa pai está soft-deletado', async () => {
    prismaMock.episode.findUnique.mockResolvedValue(episodeRow());
    prismaMock.podcast.findFirst.mockResolvedValue(null);

    const response = await getEpisode(
      new NextRequest(`http://localhost:3000/api/episodes/${EPISODE_ID}`),
      context(EPISODE_ID),
    );
    const body = await bodyOf(response);

    expect(response.status).toBe(404);
    expect((body.error as Record<string, unknown>).code).toBe('NOT_FOUND');
    expect(prismaMock.podcast.findFirst).toHaveBeenCalledWith({
      where: { id: PODCAST_ID, deletedAt: null },
      select: { id: true },
    });
    // O link direto não pode vazar título, descrição nem embeds do episódio.
    expect(JSON.stringify(body)).not.toContain(YT_ID);
  });

  it('devolve 422 para id que não é UUID', async () => {
    const response = await getEpisode(
      new NextRequest('http://localhost:3000/api/episodes/abc'),
      context('abc'),
    );

    expect(response.status).toBe(422);
    expect(prismaMock.episode.findUnique).not.toHaveBeenCalled();
  });
});

/* -------------------------------------------------------------------------- */
/* PATCH /api/episodes/:id                                                    */
/* -------------------------------------------------------------------------- */

describe('PATCH /api/episodes/:id', () => {
  beforeEach(() => {
    prismaMock.episode.update.mockImplementation(async ({ data }: { data: EpisodeRow }) =>
      episodeRow(data),
    );
  });

  it('atualiza campo simples preservando as trilhas persistidas', async () => {
    prismaMock.episode.findUnique.mockResolvedValue(episodeRow());

    const response = await patchEpisode(
      jsonRequest('PATCH', { title: 'Título revisado' }, `/api/episodes/${EPISODE_ID}`),
      context(EPISODE_ID),
    );
    const body = await bodyOf(response);

    expect(response.status).toBe(200);
    expect(() => episodeResponseSchema.parse(body)).not.toThrow();

    const updateArgs = prismaMock.episode.update.mock.calls[0][0] as { data: EpisodeRow };
    expect(updateArgs.data.title).toBe('Título revisado');
    expect(updateArgs.data.youtubeUrl).toBe(`https://youtu.be/${YT_ID}`);
    expect(updateArgs.data.youtubeEmbed).toBe(YT_ID);
  });

  it('re-deriva o embed quando a URL da trilha muda', async () => {
    prismaMock.episode.findUnique.mockResolvedValue(episodeRow());

    const response = await patchEpisode(
      jsonRequest(
        'PATCH',
        { youtubeUrl: `https://www.youtube.com/embed/${OTHER_YT_ID}` },
        `/api/episodes/${EPISODE_ID}`,
      ),
      context(EPISODE_ID),
    );

    expect(response.status).toBe(200);
    const updateArgs = prismaMock.episode.update.mock.calls[0][0] as { data: EpisodeRow };
    expect(updateArgs.data.youtubeEmbed).toBe(OTHER_YT_ID);
  });

  it('limpa o embed junto com a URL quando ainda resta outra trilha', async () => {
    prismaMock.episode.findUnique.mockResolvedValue(
      episodeRow({ spotifyUrl: SPOTIFY_URL, spotifyEmbed: `spotify:episode:${SP_ID}` }),
    );

    const response = await patchEpisode(
      jsonRequest('PATCH', { youtubeUrl: null }, `/api/episodes/${EPISODE_ID}`),
      context(EPISODE_ID),
    );

    expect(response.status).toBe(200);
    const updateArgs = prismaMock.episode.update.mock.calls[0][0] as { data: EpisodeRow };
    expect(updateArgs.data.youtubeUrl).toBeNull();
    expect(updateArgs.data.youtubeEmbed).toBeNull();
    expect(updateArgs.data.spotifyEmbed).toBe(`spotify:episode:${SP_ID}`);
  });

  it('BR-004: 409 quando o patch parcial zeraria a última trilha', async () => {
    prismaMock.episode.findUnique.mockResolvedValue(
      episodeRow({ spotifyUrl: null, spotifyEmbed: null }),
    );

    const response = await patchEpisode(
      jsonRequest('PATCH', { youtubeUrl: null }, `/api/episodes/${EPISODE_ID}`),
      context(EPISODE_ID),
    );
    const body = await bodyOf(response);

    expect(response.status).toBe(409);
    expect(() => errorResponseSchema.parse(body)).not.toThrow();
    expect((body.error as Record<string, unknown>).code).toBe('CONFLICT');
    expect(JSON.stringify(body)).toContain('BR-004');
    expect(prismaMock.episode.update).not.toHaveBeenCalled();
  });

  it('BR-004: 422 quando as duas trilhas vêm nulas no mesmo payload', async () => {
    prismaMock.episode.findUnique.mockResolvedValue(episodeRow());

    const response = await patchEpisode(
      jsonRequest('PATCH', { youtubeUrl: null, spotifyUrl: null }, `/api/episodes/${EPISODE_ID}`),
      context(EPISODE_ID),
    );

    expect(response.status).toBe(422);
    expect(prismaMock.episode.update).not.toHaveBeenCalled();
  });

  it('permite trocar uma trilha pela outra no mesmo patch', async () => {
    prismaMock.episode.findUnique.mockResolvedValue(episodeRow());

    const response = await patchEpisode(
      jsonRequest(
        'PATCH',
        { youtubeUrl: null, spotifyUrl: SPOTIFY_URL },
        `/api/episodes/${EPISODE_ID}`,
      ),
      context(EPISODE_ID),
    );

    expect(response.status).toBe(200);
    const updateArgs = prismaMock.episode.update.mock.calls[0][0] as { data: EpisodeRow };
    expect(updateArgs.data.youtubeEmbed).toBeNull();
    expect(updateArgs.data.spotifyEmbed).toBe(`spotify:episode:${SP_ID}`);
  });

  it('rejeita podcastId no corpo: episódio não migra de programa', async () => {
    prismaMock.episode.findUnique.mockResolvedValue(episodeRow());

    const response = await patchEpisode(
      jsonRequest('PATCH', { podcastId: OTHER_EPISODE_ID }, `/api/episodes/${EPISODE_ID}`),
      context(EPISODE_ID),
    );

    expect(response.status).toBe(422);
    expect(prismaMock.episode.update).not.toHaveBeenCalled();
  });

  it('devolve 409 quando o novo número já pertence a outro episódio', async () => {
    prismaMock.episode.findUnique.mockResolvedValue(episodeRow({ number: 1 }));
    prismaMock.episode.findFirst.mockResolvedValue({ id: OTHER_EPISODE_ID });

    const response = await patchEpisode(
      jsonRequest('PATCH', { number: 2 }, `/api/episodes/${EPISODE_ID}`),
      context(EPISODE_ID),
    );

    expect(response.status).toBe(409);
    expect(prismaMock.episode.findFirst).toHaveBeenCalledWith({
      where: { podcastId: PODCAST_ID, number: 2, id: { not: EPISODE_ID } },
      select: { id: true },
    });
  });

  it('não checa duplicidade quando o número não muda', async () => {
    prismaMock.episode.findUnique.mockResolvedValue(episodeRow({ number: 1 }));

    const response = await patchEpisode(
      jsonRequest('PATCH', { number: 1 }, `/api/episodes/${EPISODE_ID}`),
      context(EPISODE_ID),
    );

    expect(response.status).toBe(200);
    expect(prismaMock.episode.findFirst).not.toHaveBeenCalled();
  });

  it('converte publishedAt para Date antes de gravar', async () => {
    prismaMock.episode.findUnique.mockResolvedValue(episodeRow());

    await patchEpisode(
      jsonRequest('PATCH', { publishedAt: '2025-01-02T03:04:05.000Z' }, `/api/episodes/${EPISODE_ID}`),
      context(EPISODE_ID),
    );

    const updateArgs = prismaMock.episode.update.mock.calls[0][0] as { data: EpisodeRow };
    expect(updateArgs.data.publishedAt).toBeInstanceOf(Date);
    expect((updateArgs.data.publishedAt as Date).toISOString()).toBe('2025-01-02T03:04:05.000Z');
  });

  it('devolve 404 para episódio inexistente', async () => {
    prismaMock.episode.findUnique.mockResolvedValue(null);

    const response = await patchEpisode(
      jsonRequest('PATCH', { title: 'x' }, `/api/episodes/${EPISODE_ID}`),
      context(EPISODE_ID),
    );

    expect(response.status).toBe(404);
  });

  it('devolve 400 para JSON malformado', async () => {
    const response = await patchEpisode(
      jsonRequest('PATCH', '{', `/api/episodes/${EPISODE_ID}`),
      context(EPISODE_ID),
    );

    expect(response.status).toBe(400);
  });

  it('devolve 422 para id fora do formato UUID', async () => {
    const response = await patchEpisode(
      jsonRequest('PATCH', { title: 'x' }, '/api/episodes/abc'),
      context('abc'),
    );

    expect(response.status).toBe(422);
  });

  it('traduz corrida de remoção (P2025) em 404', async () => {
    prismaMock.episode.findUnique.mockResolvedValue(episodeRow());
    prismaMock.episode.update.mockRejectedValue(Object.assign(new Error('not found'), { code: 'P2025' }));

    const response = await patchEpisode(
      jsonRequest('PATCH', { title: 'x' }, `/api/episodes/${EPISODE_ID}`),
      context(EPISODE_ID),
    );

    expect(response.status).toBe(404);
  });
});

/* -------------------------------------------------------------------------- */
/* DELETE /api/episodes/:id                                                   */
/* -------------------------------------------------------------------------- */

describe('DELETE /api/episodes/:id', () => {
  it('remove o episódio e devolve o registro apagado', async () => {
    prismaMock.episode.findUnique.mockResolvedValue(episodeRow());
    prismaMock.episode.delete.mockResolvedValue(episodeRow());

    const response = await deleteEpisode(
      new NextRequest(`http://localhost:3000/api/episodes/${EPISODE_ID}`, { method: 'DELETE' }),
      context(EPISODE_ID),
    );
    const body = await bodyOf(response);

    expect(response.status).toBe(200);
    expect(() => episodeResponseSchema.parse(body)).not.toThrow();
    expect((body.data as Record<string, unknown>).id).toBe(EPISODE_ID);
    expect(prismaMock.episode.delete).toHaveBeenCalledWith({ where: { id: EPISODE_ID } });
  });

  it('devolve 404 para episódio inexistente', async () => {
    prismaMock.episode.findUnique.mockResolvedValue(null);

    const response = await deleteEpisode(
      new NextRequest(`http://localhost:3000/api/episodes/${EPISODE_ID}`, { method: 'DELETE' }),
      context(EPISODE_ID),
    );

    expect(response.status).toBe(404);
    expect(prismaMock.episode.delete).not.toHaveBeenCalled();
  });

  it('devolve 422 para id fora do formato UUID', async () => {
    const response = await deleteEpisode(
      new NextRequest('http://localhost:3000/api/episodes/abc', { method: 'DELETE' }),
      context('abc'),
    );

    expect(response.status).toBe(422);
  });

  it('traduz corrida de remoção (P2025) em 404', async () => {
    prismaMock.episode.findUnique.mockResolvedValue(episodeRow());
    prismaMock.episode.delete.mockRejectedValue(Object.assign(new Error('gone'), { code: 'P2025' }));

    const response = await deleteEpisode(
      new NextRequest(`http://localhost:3000/api/episodes/${EPISODE_ID}`, { method: 'DELETE' }),
      context(EPISODE_ID),
    );

    expect(response.status).toBe(404);
  });
});

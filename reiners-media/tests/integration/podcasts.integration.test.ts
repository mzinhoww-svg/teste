// @vitest-environment node
/**
 * TCK-005 — testes de integração dos route handlers de `/api/podcasts`.
 *
 * ESCOPO DESTES TESTES (e o que eles deliberadamente NÃO cobrem):
 * o ambiente não tem PostgreSQL nem Supabase. São duplos apenas as duas
 * fronteiras externas: o `PrismaClient` e a resolução de sessão de TCK-004
 * (`requireRole`). Todo o resto roda de verdade — construímos um `NextRequest`
 * real, chamamos o handler exportado e verificamos status, corpo e os
 * argumentos entregues ao Prisma. Isso exercita o contrato de resposta, a
 * validação Zod, o mapeamento 401/403/409 e as regras BR-003/BR-005/BR-006 de
 * ponta a ponta. Não exercita SQL, índices nem migrações — isso fica para o
 * ambiente com banco real.
 *
 * O duplo de sessão não "aprova por fora": ele lê o cookie da requisição real e
 * reusa `hasRoleRank` e `errorResponse` do próprio TCK-004, de modo que o 401 e
 * o 403 observados aqui são os do código de produção.
 */
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock, authMock } = vi.hoisted(() => ({
  prismaMock: {
    podcast: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
  authMock: { requireRole: vi.fn() },
}));

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock, default: prismaMock }));

// Mock PARCIAL de TCK-004: só a decisão de sessão é substituída. `errorResponse`,
// `hasRoleRank`, `enforceRateLimit` e as políticas continuam sendo os reais —
// os 401/403 e os 429 exercitados aqui saem do código de produção.
vi.mock('@/lib/auth-helpers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth-helpers')>();
  return { ...actual, requireRole: authMock.requireRole };
});

import { DELETE, GET as GET_DETAIL, PATCH } from '@/app/api/podcasts/[idOrSlug]/route';
import { GET, POST } from '@/app/api/podcasts/route';
import { clearRateLimit, errorResponse, hasRoleRank } from '@/lib/auth-helpers';
import {
  MAX_FEATURED_PODCASTS,
  errorResponseSchema,
  podcastAdminResponseSchema,
  podcastDetailResponseSchema,
  podcastListResponseSchema,
  podcastResponseSchema,
} from '@/lib/schemas';

const PODCAST_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ID = '22222222-2222-4222-8222-222222222222';

type Role = 'ADMIN' | 'EDITOR';

/** Sessões válidas, indexadas pelo valor do cookie `sb-access-token`. */
const SESSION_BY_TOKEN: Record<string, { id: string; email: string; name: string | null; role: Role }> = {
  'token-admin': {
    id: 'aaaaaaaa-1111-4111-8111-111111111111',
    email: 'admin@reiners.media',
    name: 'Admin',
    role: 'ADMIN',
  },
  'token-editor': {
    id: 'bbbbbbbb-2222-4222-8222-222222222222',
    email: 'editor@reiners.media',
    name: 'Editor',
    role: 'EDITOR',
  },
};

/** Linha do Prisma — com `deletedAt` e `Date`, exatamente como o banco devolve. */
function podcastRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: PODCAST_ID,
    slug: 'horizonte-digital',
    title: 'Horizonte Digital',
    tagline: 'Tecnologia sem hype',
    description: 'Conversas sobre o futuro digital.',
    coverImage: '/images/podcasts/horizonte-digital-cover.jpg',
    heroImage: null,
    category: 'Tecnologia',
    status: 'ACTIVE',
    visualStyle: 'PHOTO_REAL',
    year: 2024,
    accentColor: '#d87dff',
    hosts: [{ name: 'Marina Reiners', initial: 'MR', photo: null, bio: null }],
    socialLinks: { instagram: 'https://instagram.com/reiners' },
    featured: false,
    displayOrder: 0,
    deletedAt: null,
    createdAt: new Date('2024-01-10T12:00:00.000Z'),
    updatedAt: new Date('2024-02-10T12:00:00.000Z'),
    ...overrides,
  };
}

function episodeRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: '33333333-3333-4333-8333-333333333333',
    podcastId: PODCAST_ID,
    number: 1,
    title: 'Piloto',
    description: 'Episódio de estreia.',
    thumbnail: null,
    duration: '45:30',
    publishedAt: new Date('2024-01-15T12:00:00.000Z'),
    youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ',
    youtubeEmbed: 'dQw4w9WgXcQ',
    spotifyUrl: null,
    spotifyEmbed: null,
    createdAt: new Date('2024-01-15T12:00:00.000Z'),
    ...overrides,
  };
}

/** Corpo válido de POST /api/podcasts. */
function createPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    slug: 'novo-programa',
    title: 'Novo Programa',
    description: 'Descrição do novo programa.',
    coverImage: '/images/podcasts/novo.jpg',
    category: 'Cultura',
    year: 2025,
    hosts: [{ name: 'Marina Reiners', initial: 'MR' }],
    ...overrides,
  };
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  token?: string;
  headers?: Record<string, string>;
  rawBody?: string;
}

function apiRequest(url: string, options: RequestOptions = {}): NextRequest {
  const headers = new Headers(options.headers ?? {});
  if (options.token) headers.set('cookie', `sb-access-token=${options.token}`);

  let body: string | undefined;
  if (options.rawBody !== undefined) {
    body = options.rawBody;
    if (!headers.has('content-type')) headers.set('content-type', 'application/json');
  } else if (options.body !== undefined) {
    body = JSON.stringify(options.body);
    headers.set('content-type', 'application/json');
  }

  return new NextRequest(url, { method: options.method ?? 'GET', headers, body });
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

beforeEach(() => {
  clearRateLimit();
  // `mockReset` (e não apenas `clearAllMocks`) porque `mockResolvedValue`
  // sobrevive ao clear e vazaria o cenário de um teste para o seguinte.
  for (const fn of Object.values(prismaMock.podcast)) fn.mockReset();

  // Duplo de sessão: lê o cookie da requisição real e aplica a MESMA hierarquia
  // de papéis de TCK-004 (`hasRoleRank`), devolvendo os erros reais do módulo.
  authMock.requireRole.mockReset();
  authMock.requireRole.mockImplementation(
    async (required: Role, options: { request?: NextRequest }) => {
      const token = options?.request?.cookies.get('sb-access-token')?.value ?? '';
      const user = SESSION_BY_TOKEN[token];
      if (!user) return { ok: false, response: errorResponse('UNAUTHORIZED') };
      if (!hasRoleRank(user.role, required)) {
        return {
          ok: false,
          response: errorResponse('FORBIDDEN', 'BR-002: EDITOR não pode excluir recursos.'),
        };
      }
      return { ok: true, user, session: { authenticated: true, user, expiresAt: null } };
    },
  );
});

/* -------------------------------------------------------------------------- */
/* GET /api/podcasts                                                          */
/* -------------------------------------------------------------------------- */

describe('GET /api/podcasts', () => {
  it('devolve lista paginada dentro do contrato e sem vazar deletedAt', async () => {
    prismaMock.podcast.findMany.mockResolvedValue([podcastRow(), podcastRow({ id: OTHER_ID })]);
    prismaMock.podcast.count.mockResolvedValue(2);

    const response = await GET(apiRequest('http://localhost/api/podcasts'));
    const body = await readJson(response);

    expect(response.status).toBe(200);
    expect(podcastListResponseSchema.safeParse(body).success).toBe(true);
    expect(JSON.stringify(body)).not.toContain('deletedAt');
    expect(body.meta).toEqual({ page: 1, limit: 20, total: 2, totalPages: 1 });
    // Serialização: `Date` -> ISO-8601 (o schema de resposta exige string).
    expect((body.data as Record<string, unknown>[])[0].createdAt).toBe('2024-01-10T12:00:00.000Z');
  });

  it('esconde programas soft-deletados filtrando por deletedAt nulo', async () => {
    prismaMock.podcast.findMany.mockResolvedValue([]);
    prismaMock.podcast.count.mockResolvedValue(0);

    await GET(apiRequest('http://localhost/api/podcasts'));

    expect(prismaMock.podcast.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ deletedAt: null }) }),
    );
  });

  it('aplica filtros de status, categoria e destaque', async () => {
    prismaMock.podcast.findMany.mockResolvedValue([]);
    prismaMock.podcast.count.mockResolvedValue(0);

    await GET(
      apiRequest('http://localhost/api/podcasts?status=ENDED&category=Cultura&featured=true'),
    );

    expect(prismaMock.podcast.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          deletedAt: null,
          status: 'ENDED',
          featured: true,
          category: { equals: 'Cultura', mode: 'insensitive' },
        },
      }),
    );
  });

  it('aceita featured=1 e featured=0 (coerção de querystring)', async () => {
    prismaMock.podcast.findMany.mockResolvedValue([]);
    prismaMock.podcast.count.mockResolvedValue(0);

    await GET(apiRequest('http://localhost/api/podcasts?featured=1'));
    expect(prismaMock.podcast.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ featured: true }) }),
    );

    await GET(apiRequest('http://localhost/api/podcasts?featured=0'));
    expect(prismaMock.podcast.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ featured: false }) }),
    );
  });

  it('pagina com skip/take e calcula totalPages', async () => {
    prismaMock.podcast.findMany.mockResolvedValue([]);
    prismaMock.podcast.count.mockResolvedValue(47);

    const response = await GET(apiRequest('http://localhost/api/podcasts?page=3&limit=10'));
    const body = await readJson(response);

    expect(prismaMock.podcast.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 20, take: 10 }),
    );
    expect(body.meta).toEqual({ page: 3, limit: 10, total: 47, totalPages: 5 });
  });

  it('ordena pelo campo pedido com desempate estável por id', async () => {
    prismaMock.podcast.findMany.mockResolvedValue([]);
    prismaMock.podcast.count.mockResolvedValue(0);

    await GET(apiRequest('http://localhost/api/podcasts?sort=year&order=desc'));

    expect(prismaMock.podcast.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: [{ year: 'desc' }, { id: 'asc' }] }),
    );
  });

  it('usa displayOrder asc como ordenação padrão', async () => {
    prismaMock.podcast.findMany.mockResolvedValue([]);
    prismaMock.podcast.count.mockResolvedValue(0);

    await GET(apiRequest('http://localhost/api/podcasts'));

    expect(prismaMock.podcast.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }] }),
    );
  });

  it('ignora parâmetros vazios e desconhecidos', async () => {
    prismaMock.podcast.findMany.mockResolvedValue([]);
    prismaMock.podcast.count.mockResolvedValue(0);

    const response = await GET(
      apiRequest('http://localhost/api/podcasts?status=&category=&utm_source=news'),
    );

    expect(response.status).toBe(200);
    expect(prismaMock.podcast.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { deletedAt: null } }),
    );
  });

  it('recusa querystring inválida com 422', async () => {
    for (const query of ['page=0', 'limit=101', 'status=CANCELADO', 'sort=nada', 'order=ambos']) {
      const response = await GET(apiRequest(`http://localhost/api/podcasts?${query}`));
      expect(response.status).toBe(422);
      const body = await readJson(response);
      expect(errorResponseSchema.parse(body).error.code).toBe('VALIDATION_ERROR');
    }
    expect(prismaMock.podcast.findMany).not.toHaveBeenCalled();
  });

  it('não exige autenticação (rota pública)', async () => {
    prismaMock.podcast.findMany.mockResolvedValue([]);
    prismaMock.podcast.count.mockResolvedValue(0);

    const response = await GET(apiRequest('http://localhost/api/podcasts'));

    expect(response.status).toBe(200);
    expect(authMock.requireRole).not.toHaveBeenCalled();
  });

  it('devolve 500 no envelope padrão quando o banco falha', async () => {
    prismaMock.podcast.findMany.mockRejectedValue(new Error('conexão perdida'));
    prismaMock.podcast.count.mockResolvedValue(0);

    const response = await GET(apiRequest('http://localhost/api/podcasts'));
    const body = await readJson(response);

    expect(response.status).toBe(500);
    expect(errorResponseSchema.parse(body).error.code).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(body)).not.toContain('conexão perdida');
  });
});

/* -------------------------------------------------------------------------- */
/* GET /api/podcasts/:slug                                                    */
/* -------------------------------------------------------------------------- */

describe('GET /api/podcasts/:slug', () => {
  it('devolve o programa com os episódios embutidos', async () => {
    prismaMock.podcast.findFirst.mockResolvedValue({
      ...podcastRow(),
      episodes: [episodeRow(), episodeRow({ id: OTHER_ID, number: 2 })],
    });

    const response = await GET_DETAIL(
      apiRequest('http://localhost/api/podcasts/horizonte-digital'),
      { params: { idOrSlug: 'horizonte-digital' } },
    );
    const body = await readJson(response);

    expect(response.status).toBe(200);
    expect(podcastDetailResponseSchema.safeParse(body).success).toBe(true);
    expect((body.data as { episodes: unknown[] }).episodes).toHaveLength(2);
    expect(JSON.stringify(body)).not.toContain('deletedAt');
    expect(prismaMock.podcast.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { slug: 'horizonte-digital', deletedAt: null } }),
    );
  });

  it('aceita também o id (atalho para o painel administrativo)', async () => {
    prismaMock.podcast.findFirst.mockResolvedValue({ ...podcastRow(), episodes: [] });

    const response = await GET_DETAIL(apiRequest(`http://localhost/api/podcasts/${PODCAST_ID}`), {
      params: { idOrSlug: PODCAST_ID },
    });

    expect(response.status).toBe(200);
    expect(prismaMock.podcast.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: PODCAST_ID, deletedAt: null } }),
    );
  });

  it('devolve 404 para programa inexistente ou soft-deletado', async () => {
    prismaMock.podcast.findFirst.mockResolvedValue(null);

    const response = await GET_DETAIL(apiRequest('http://localhost/api/podcasts/sumiu'), {
      params: { idOrSlug: 'sumiu' },
    });
    const body = await readJson(response);

    expect(response.status).toBe(404);
    expect(errorResponseSchema.parse(body).error.code).toBe('NOT_FOUND');
  });

  it('recusa slug fora do padrão kebab-case com 422', async () => {
    const response = await GET_DETAIL(apiRequest('http://localhost/api/podcasts/Slug_Invalido'), {
      params: { idOrSlug: 'Slug_Invalido' },
    });

    expect(response.status).toBe(422);
    expect(prismaMock.podcast.findFirst).not.toHaveBeenCalled();
  });
});

/* -------------------------------------------------------------------------- */
/* POST /api/podcasts                                                         */
/* -------------------------------------------------------------------------- */

describe('POST /api/podcasts', () => {
  it('cria o programa e devolve 201 dentro do contrato', async () => {
    prismaMock.podcast.count.mockResolvedValue(0);
    prismaMock.podcast.findFirst.mockResolvedValue(null);
    prismaMock.podcast.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) =>
      podcastRow({ ...data, id: OTHER_ID }),
    );

    const response = await POST(
      apiRequest('http://localhost/api/podcasts', {
        method: 'POST',
        token: 'token-admin',
        body: createPayload(),
      }),
    );
    const body = await readJson(response);

    expect(response.status).toBe(201);
    expect(podcastResponseSchema.safeParse(body).success).toBe(true);
    // Defaults do schema chegam ao banco preenchidos (`status` é NOT NULL).
    expect(prismaMock.podcast.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        slug: 'novo-programa',
        status: 'ACTIVE',
        visualStyle: 'PHOTO_REAL',
        accentColor: '#d87dff',
        featured: false,
        displayOrder: 0,
        socialLinks: {},
      }),
    });
  });

  it('aceita EDITOR (BR-002 restringe apenas o delete)', async () => {
    prismaMock.podcast.count.mockResolvedValue(0);
    prismaMock.podcast.findFirst.mockResolvedValue(null);
    prismaMock.podcast.create.mockResolvedValue(podcastRow());

    const response = await POST(
      apiRequest('http://localhost/api/podcasts', {
        method: 'POST',
        token: 'token-editor',
        body: createPayload(),
      }),
    );

    expect(response.status).toBe(201);
  });

  it('devolve 401 sem cookie de sessão', async () => {
    const response = await POST(
      apiRequest('http://localhost/api/podcasts', { method: 'POST', body: createPayload() }),
    );
    const body = await readJson(response);

    expect(response.status).toBe(401);
    expect(errorResponseSchema.parse(body).error.code).toBe('UNAUTHORIZED');
    expect(prismaMock.podcast.create).not.toHaveBeenCalled();
  });

  it('devolve 401 com token que a sessão recusa', async () => {
    const response = await POST(
      apiRequest('http://localhost/api/podcasts', {
        method: 'POST',
        token: 'token-forjado',
        body: createPayload(),
      }),
    );

    expect(response.status).toBe(401);
  });

  it('exige papel EDITOR (ou superior) e delega a decisão a TCK-004', async () => {
    prismaMock.podcast.count.mockResolvedValue(0);
    prismaMock.podcast.findFirst.mockResolvedValue(null);
    prismaMock.podcast.create.mockResolvedValue(podcastRow());

    await POST(
      apiRequest('http://localhost/api/podcasts', {
        method: 'POST',
        token: 'token-admin',
        body: createPayload(),
      }),
    );

    expect(authMock.requireRole).toHaveBeenCalledWith('EDITOR', expect.anything());
  });

  it('BR-003: recusa programa sem host com 422', async () => {
    const response = await POST(
      apiRequest('http://localhost/api/podcasts', {
        method: 'POST',
        token: 'token-admin',
        body: createPayload({ hosts: [] }),
      }),
    );
    const body = await readJson(response);

    expect(response.status).toBe(422);
    expect(JSON.stringify(body)).toContain('BR-003');
    expect(prismaMock.podcast.create).not.toHaveBeenCalled();
  });

  it('BR-005: recusa o 4º destaque com 409', async () => {
    prismaMock.podcast.count.mockResolvedValue(MAX_FEATURED_PODCASTS);
    prismaMock.podcast.findFirst.mockResolvedValue(null);

    const response = await POST(
      apiRequest('http://localhost/api/podcasts', {
        method: 'POST',
        token: 'token-admin',
        body: createPayload({ featured: true }),
      }),
    );
    const body = await readJson(response);

    expect(response.status).toBe(409);
    expect(errorResponseSchema.parse(body).error.code).toBe('CONFLICT');
    expect(JSON.stringify(body)).toContain('BR-005');
    expect(prismaMock.podcast.create).not.toHaveBeenCalled();
    // A contagem considera apenas destaques vivos.
    expect(prismaMock.podcast.count).toHaveBeenCalledWith({
      where: { featured: true, deletedAt: null },
    });
  });

  it('BR-005: o 3º destaque ainda passa', async () => {
    prismaMock.podcast.count.mockResolvedValue(MAX_FEATURED_PODCASTS - 1);
    prismaMock.podcast.findFirst.mockResolvedValue(null);
    prismaMock.podcast.create.mockResolvedValue(podcastRow({ featured: true }));

    const response = await POST(
      apiRequest('http://localhost/api/podcasts', {
        method: 'POST',
        token: 'token-admin',
        body: createPayload({ featured: true }),
      }),
    );

    expect(response.status).toBe(201);
  });

  it('BR-006: recusa criar ENDED em destaque com 422 (fechado no schema)', async () => {
    prismaMock.podcast.count.mockResolvedValue(0);

    const response = await POST(
      apiRequest('http://localhost/api/podcasts', {
        method: 'POST',
        token: 'token-admin',
        body: createPayload({ status: 'ENDED', featured: true }),
      }),
    );
    const body = await readJson(response);

    expect(response.status).toBe(422);
    expect(JSON.stringify(body)).toContain('BR-006');
  });

  it('recusa slug duplicado com 409', async () => {
    prismaMock.podcast.count.mockResolvedValue(0);
    prismaMock.podcast.findFirst.mockResolvedValue({ id: PODCAST_ID });

    const response = await POST(
      apiRequest('http://localhost/api/podcasts', {
        method: 'POST',
        token: 'token-admin',
        body: createPayload(),
      }),
    );
    const body = await readJson(response);

    expect(response.status).toBe(409);
    expect(errorResponseSchema.parse(body).error.code).toBe('CONFLICT');
  });

  it('não ecoa o nome da coluna do banco num P2002 de coluna desconhecida', async () => {
    prismaMock.podcast.count.mockResolvedValue(0);
    prismaMock.podcast.findFirst.mockResolvedValue(null);
    prismaMock.podcast.create.mockRejectedValue(
      Object.assign(new Error('unique'), {
        code: 'P2002',
        meta: { target: ['podcast_internal_legacy_col'] },
      }),
    );

    const response = await POST(
      apiRequest('http://localhost/api/podcasts', {
        method: 'POST',
        token: 'token-admin',
        body: createPayload(),
      }),
    );
    const body = await readJson(response);

    expect(response.status).toBe(409);
    // Topologia do banco não é contrato: coluna fora do mapa vira genérico.
    expect(JSON.stringify(body)).not.toContain('podcast_internal_legacy_col');
    expect(errorResponseSchema.parse(body).error.message).toBe('Registro duplicado');
  });

  it('traduz violação de unicidade do Prisma (P2002) em 409', async () => {
    prismaMock.podcast.count.mockResolvedValue(0);
    prismaMock.podcast.findFirst.mockResolvedValue(null);
    prismaMock.podcast.create.mockRejectedValue(
      Object.assign(new Error('unique'), { code: 'P2002', meta: { target: ['slug'] } }),
    );

    const response = await POST(
      apiRequest('http://localhost/api/podcasts', {
        method: 'POST',
        token: 'token-admin',
        body: createPayload(),
      }),
    );

    expect(response.status).toBe(409);
  });

  it('recusa chave desconhecida com 422 (body é .strict())', async () => {
    const response = await POST(
      apiRequest('http://localhost/api/podcasts', {
        method: 'POST',
        token: 'token-admin',
        body: createPayload({ youtubeEmbed: 'abc' }),
      }),
    );

    expect(response.status).toBe(422);
  });

  it('recusa imagem com esquema perigoso e aceita path root-relativo', async () => {
    const rejected = await POST(
      apiRequest('http://localhost/api/podcasts', {
        method: 'POST',
        token: 'token-admin',
        body: createPayload({ coverImage: 'javascript:alert(1)' }),
      }),
    );
    expect(rejected.status).toBe(422);

    prismaMock.podcast.count.mockResolvedValue(0);
    prismaMock.podcast.findFirst.mockResolvedValue(null);
    prismaMock.podcast.create.mockResolvedValue(podcastRow());

    const accepted = await POST(
      apiRequest('http://localhost/api/podcasts', {
        method: 'POST',
        token: 'token-admin',
        body: createPayload({ coverImage: '/images/edição.jpg?v=2' }),
      }),
    );
    expect(accepted.status).toBe(201);
  });

  it('recusa JSON malformado com 400', async () => {
    const response = await POST(
      apiRequest('http://localhost/api/podcasts', {
        method: 'POST',
        token: 'token-admin',
        rawBody: '{ "slug": ',
      }),
    );
    const body = await readJson(response);

    expect(response.status).toBe(400);
    expect(errorResponseSchema.parse(body).error.code).toBe('BAD_REQUEST');
  });
});

/* -------------------------------------------------------------------------- */
/* PATCH /api/podcasts/:id                                                    */
/* -------------------------------------------------------------------------- */

describe('PATCH /api/podcasts/:id', () => {
  const context = { params: { idOrSlug: PODCAST_ID } };

  it('atualiza e devolve 200 dentro do contrato', async () => {
    prismaMock.podcast.findFirst.mockResolvedValue({
      id: PODCAST_ID,
      slug: 'horizonte-digital',
      status: 'ACTIVE',
      featured: false,
    });
    prismaMock.podcast.count.mockResolvedValue(0);
    prismaMock.podcast.update.mockResolvedValue(podcastRow({ title: 'Novo Título' }));

    const response = await PATCH(
      apiRequest(`http://localhost/api/podcasts/${PODCAST_ID}`, {
        method: 'PATCH',
        token: 'token-editor',
        body: { title: 'Novo Título' },
      }),
      context,
    );
    const body = await readJson(response);

    expect(response.status).toBe(200);
    expect(podcastResponseSchema.safeParse(body).success).toBe(true);
    expect(JSON.stringify(body)).not.toContain('deletedAt');
    expect(prismaMock.podcast.update).toHaveBeenCalledWith({
      where: { id: PODCAST_ID },
      data: { title: 'Novo Título' },
    });
  });

  it('BR-006: {"featured": true} em programa ENDED devolve 409', async () => {
    // O caso que o schema parcial NÃO pega: `status` não vem no payload.
    prismaMock.podcast.findFirst.mockResolvedValue({
      id: PODCAST_ID,
      slug: 'oficio',
      status: 'ENDED',
      featured: false,
    });
    prismaMock.podcast.count.mockResolvedValue(0);

    const response = await PATCH(
      apiRequest(`http://localhost/api/podcasts/${PODCAST_ID}`, {
        method: 'PATCH',
        token: 'token-admin',
        body: { featured: true },
      }),
      context,
    );
    const body = await readJson(response);

    expect(response.status).toBe(409);
    expect(errorResponseSchema.parse(body).error.code).toBe('CONFLICT');
    expect(JSON.stringify(body)).toContain('BR-006');
    expect(prismaMock.podcast.update).not.toHaveBeenCalled();
  });

  it('BR-005: virar o 4º destaque devolve 409 e exclui o próprio id da contagem', async () => {
    prismaMock.podcast.findFirst.mockResolvedValue({
      id: PODCAST_ID,
      slug: 'horizonte-digital',
      status: 'ACTIVE',
      featured: false,
    });
    prismaMock.podcast.count.mockResolvedValue(MAX_FEATURED_PODCASTS);

    const response = await PATCH(
      apiRequest(`http://localhost/api/podcasts/${PODCAST_ID}`, {
        method: 'PATCH',
        token: 'token-admin',
        body: { featured: true },
      }),
      context,
    );
    const body = await readJson(response);

    expect(response.status).toBe(409);
    expect(JSON.stringify(body)).toContain('BR-005');
    expect(prismaMock.podcast.count).toHaveBeenCalledWith({
      where: { featured: true, deletedAt: null, id: { not: PODCAST_ID } },
    });
  });

  it('BR-005: reordenar um destaque já existente não dá conflito', async () => {
    prismaMock.podcast.findFirst.mockResolvedValue({
      id: PODCAST_ID,
      slug: 'horizonte-digital',
      status: 'ACTIVE',
      featured: true,
    });
    prismaMock.podcast.count.mockResolvedValue(MAX_FEATURED_PODCASTS - 1);
    prismaMock.podcast.update.mockResolvedValue(podcastRow({ featured: true, displayOrder: 2 }));

    const response = await PATCH(
      apiRequest(`http://localhost/api/podcasts/${PODCAST_ID}`, {
        method: 'PATCH',
        token: 'token-admin',
        body: { displayOrder: 2 },
      }),
      context,
    );

    expect(response.status).toBe(200);
  });

  it('permite tirar o destaque de um programa ENDED', async () => {
    prismaMock.podcast.findFirst.mockResolvedValue({
      id: PODCAST_ID,
      slug: 'oficio',
      status: 'ENDED',
      featured: true,
    });
    prismaMock.podcast.count.mockResolvedValue(0);
    prismaMock.podcast.update.mockResolvedValue(
      podcastRow({ status: 'ENDED', featured: false, slug: 'oficio' }),
    );

    const response = await PATCH(
      apiRequest(`http://localhost/api/podcasts/${PODCAST_ID}`, {
        method: 'PATCH',
        token: 'token-admin',
        body: { featured: false },
      }),
      context,
    );

    expect(response.status).toBe(200);
  });

  it('BR-006: encerrar um programa que está em destaque devolve 409', async () => {
    prismaMock.podcast.findFirst.mockResolvedValue({
      id: PODCAST_ID,
      slug: 'horizonte-digital',
      status: 'ACTIVE',
      featured: true,
    });
    prismaMock.podcast.count.mockResolvedValue(0);

    const response = await PATCH(
      apiRequest(`http://localhost/api/podcasts/${PODCAST_ID}`, {
        method: 'PATCH',
        token: 'token-admin',
        body: { status: 'ENDED' },
      }),
      context,
    );

    expect(response.status).toBe(409);
  });

  it('devolve 404 para programa inexistente ou já deletado', async () => {
    prismaMock.podcast.findFirst.mockResolvedValue(null);
    prismaMock.podcast.count.mockResolvedValue(0);

    const response = await PATCH(
      apiRequest(`http://localhost/api/podcasts/${PODCAST_ID}`, {
        method: 'PATCH',
        token: 'token-admin',
        body: { title: 'x' },
      }),
      context,
    );

    expect(response.status).toBe(404);
    expect(prismaMock.podcast.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: PODCAST_ID, deletedAt: null } }),
    );
  });

  it('devolve 401 sem sessão e 422 para id que não é UUID', async () => {
    const unauthenticated = await PATCH(
      apiRequest(`http://localhost/api/podcasts/${PODCAST_ID}`, {
        method: 'PATCH',
        body: { title: 'x' },
      }),
      context,
    );
    expect(unauthenticated.status).toBe(401);

    const badId = await PATCH(
      apiRequest('http://localhost/api/podcasts/nao-e-uuid', {
        method: 'PATCH',
        token: 'token-admin',
        body: { title: 'x' },
      }),
      { params: { idOrSlug: 'nao-e-uuid' } },
    );
    expect(badId.status).toBe(422);
  });

  it('recusa slug já usado por outro programa com 409', async () => {
    prismaMock.podcast.findFirst
      .mockResolvedValueOnce({
        id: PODCAST_ID,
        slug: 'horizonte-digital',
        status: 'ACTIVE',
        featured: false,
      })
      .mockResolvedValueOnce({ id: OTHER_ID });
    prismaMock.podcast.count.mockResolvedValue(0);

    const response = await PATCH(
      apiRequest(`http://localhost/api/podcasts/${PODCAST_ID}`, {
        method: 'PATCH',
        token: 'token-admin',
        body: { slug: 'outro-programa' },
      }),
      context,
    );

    expect(response.status).toBe(409);
    expect(prismaMock.podcast.update).not.toHaveBeenCalled();
  });

  it('aceita null explícito para campos opcionais', async () => {
    prismaMock.podcast.findFirst.mockResolvedValue({
      id: PODCAST_ID,
      slug: 'horizonte-digital',
      status: 'ACTIVE',
      featured: false,
    });
    prismaMock.podcast.count.mockResolvedValue(0);
    prismaMock.podcast.update.mockResolvedValue(podcastRow({ tagline: null }));

    const response = await PATCH(
      apiRequest(`http://localhost/api/podcasts/${PODCAST_ID}`, {
        method: 'PATCH',
        token: 'token-admin',
        body: { tagline: null },
      }),
      context,
    );

    expect(response.status).toBe(200);
    expect(prismaMock.podcast.update).toHaveBeenCalledWith({
      where: { id: PODCAST_ID },
      data: { tagline: null },
    });
  });
});

/* -------------------------------------------------------------------------- */
/* DELETE /api/podcasts/:id                                                   */
/* -------------------------------------------------------------------------- */

describe('DELETE /api/podcasts/:id', () => {
  const context = { params: { idOrSlug: PODCAST_ID } };

  it('BR-002: EDITOR recebe 403 e nada é alterado', async () => {
    const response = await DELETE(
      apiRequest(`http://localhost/api/podcasts/${PODCAST_ID}`, {
        method: 'DELETE',
        token: 'token-editor',
      }),
      context,
    );
    const body = await readJson(response);

    expect(response.status).toBe(403);
    expect(errorResponseSchema.parse(body).error.code).toBe('FORBIDDEN');
    expect(authMock.requireRole).toHaveBeenCalledWith('ADMIN', expect.anything());
    expect(prismaMock.podcast.update).not.toHaveBeenCalled();
  });

  it('ADMIN faz soft delete: preenche deletedAt e não remove a linha', async () => {
    prismaMock.podcast.findFirst.mockResolvedValue({ id: PODCAST_ID });
    prismaMock.podcast.update.mockResolvedValue(
      podcastRow({ deletedAt: new Date('2024-03-01T00:00:00.000Z') }),
    );

    const response = await DELETE(
      apiRequest(`http://localhost/api/podcasts/${PODCAST_ID}`, {
        method: 'DELETE',
        token: 'token-admin',
      }),
      context,
    );
    const body = await readJson(response);

    expect(response.status).toBe(200);
    expect(podcastAdminResponseSchema.safeParse(body).success).toBe(true);
    // Resposta administrativa: aqui `deletedAt` DEVE aparecer.
    expect((body.data as Record<string, unknown>).deletedAt).toBe('2024-03-01T00:00:00.000Z');
    expect(prismaMock.podcast.update).toHaveBeenCalledWith({
      where: { id: PODCAST_ID },
      data: { deletedAt: expect.any(Date) },
    });
  });

  it('devolve 401 sem sessão', async () => {
    const response = await DELETE(
      apiRequest(`http://localhost/api/podcasts/${PODCAST_ID}`, { method: 'DELETE' }),
      context,
    );

    expect(response.status).toBe(401);
  });

  it('devolve 404 quando o programa já está deletado', async () => {
    prismaMock.podcast.findFirst.mockResolvedValue(null);

    const response = await DELETE(
      apiRequest(`http://localhost/api/podcasts/${PODCAST_ID}`, {
        method: 'DELETE',
        token: 'token-admin',
      }),
      context,
    );

    expect(response.status).toBe(404);
    expect(prismaMock.podcast.update).not.toHaveBeenCalled();
  });
});

/* -------------------------------------------------------------------------- */
/* Rate limiting                                                              */
/* -------------------------------------------------------------------------- */

describe('rate limiting', () => {
  it('conta a requisição ANÔNIMA no POST: flood sem sessão chega a 429, não fica em 401', async () => {
    // Ordem correta é limite -> autorização. Ao contrário, um flood anônimo
    // sairia sempre no 401 sem consumir o contador, gastando uma verificação de
    // sessão no Supabase por requisição.
    let last: Response | undefined;
    for (let i = 0; i < 61; i += 1) {
      last = await POST(
        apiRequest('http://localhost/api/podcasts', {
          method: 'POST',
          body: createPayload(),
          headers: { 'x-forwarded-for': '203.0.113.13' },
        }),
      );
    }

    expect(last?.status).toBe(429);
    expect(prismaMock.podcast.create).not.toHaveBeenCalled();
  });

  it('conta a requisição ANÔNIMA no DELETE, antes de decidir BR-002', async () => {
    let last: Response | undefined;
    for (let i = 0; i < 61; i += 1) {
      last = await DELETE(
        apiRequest(`http://localhost/api/podcasts/${PODCAST_ID}`, {
          method: 'DELETE',
          headers: { 'x-forwarded-for': '203.0.113.14' },
        }),
        { params: { idOrSlug: PODCAST_ID } },
      );
    }

    expect(last?.status).toBe(429);
    expect(prismaMock.podcast.update).not.toHaveBeenCalled();
  });

  it('devolve 429 com Retry-After depois de estourar a janela pública', async () => {
    prismaMock.podcast.findMany.mockResolvedValue([]);
    prismaMock.podcast.count.mockResolvedValue(0);

    let last: Response | undefined;
    for (let i = 0; i < 101; i += 1) {
      last = await GET(
        apiRequest('http://localhost/api/podcasts', { headers: { 'x-forwarded-for': '203.0.113.7' } }),
      );
    }

    expect(last?.status).toBe(429);
    expect(last?.headers.get('Retry-After')).toBeTruthy();
    const body = await readJson(last as Response);
    expect(errorResponseSchema.parse(body).error.code).toBe('RATE_LIMITED');
  });
});

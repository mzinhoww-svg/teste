// @vitest-environment node
/**
 * TCK-005 — teste de CONTRATO das rotas de podcasts.
 *
 * `tests/integration/contract-validation.test.ts` (TCK-003) já garante que
 * `contracts/api/podcasts.yaml` e `src/lib/schemas.ts` não divergem. O que falta
 * — e é o que este arquivo faz — é amarrar a IMPLEMENTAÇÃO ao mesmo contrato:
 *
 * 1. lê do YAML, por `operationId`, os status documentados e o schema declarado
 *    em `x-zod-response`;
 * 2. executa os handlers exportados em cenários reais (NextRequest -> handler);
 * 3. exige que TODO status devolvido esteja documentado, que todo corpo 2xx
 *    valide contra o schema declarado no YAML (não contra um schema escolhido
 *    pelo teste) e que todo corpo de erro use o envelope `ErrorResponse` com o
 *    `code` cujo status canônico é o status HTTP devolvido.
 *
 * Como no restante de TCK-005, o Prisma e a resolução de sessão de TCK-004 são
 * duplos: o ambiente não tem PostgreSQL nem Supabase. O que se verifica aqui é
 * contrato de interface, não comportamento de SQL.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { z } from 'zod';

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

// Mock PARCIAL de TCK-004: só a resolução de sessão é substituída; o envelope
// de erro, a hierarquia de papéis e o rate limit continuam sendo os reais.
vi.mock('@/lib/auth-helpers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth-helpers')>();
  return { ...actual, requireRole: authMock.requireRole };
});

import { DELETE, GET as GET_DETAIL, PATCH } from '@/app/api/podcasts/[idOrSlug]/route';
import { GET, POST } from '@/app/api/podcasts/route';
import { clearRateLimit, errorResponse, hasRoleRank } from '@/lib/auth-helpers';
import * as schemas from '@/lib/schemas';
import { ERROR_STATUS_BY_CODE, MAX_FEATURED_PODCASTS, errorResponseSchema } from '@/lib/schemas';

/* -------------------------------------------------------------------------- */
/* Leitura do contrato OpenAPI                                                */
/* -------------------------------------------------------------------------- */

interface OperationContract {
  statuses: Set<string>;
  zodResponse?: string;
  zodRequest?: string;
  zodQuery?: string;
  zodParams?: string;
}

/**
 * Extrai, por `operationId`, os status documentados e as extensões `x-zod-*`.
 * Leitura posicional (o YAML dos contratos é bloco puro e indentação fixa):
 * `operationId` e `x-zod-*` ficam em 6 espaços, as chaves de status em 8.
 */
function readOperationContracts(yamlPath: string): Record<string, OperationContract> {
  const operations: Record<string, OperationContract> = {};
  let current: OperationContract | null = null;

  for (const line of readFileSync(yamlPath, 'utf8').split('\n')) {
    const operationId = /^ {6}operationId:\s*(\S+)\s*$/.exec(line);
    if (operationId) {
      current = { statuses: new Set<string>() };
      operations[operationId[1]] = current;
      continue;
    }
    if (!current) continue;

    const extension = /^ {6}x-zod-(response|request|query|params):\s*(\S+)\s*$/.exec(line);
    if (extension) {
      const key = extension[1];
      if (key === 'response') current.zodResponse = extension[2];
      if (key === 'request') current.zodRequest = extension[2];
      if (key === 'query') current.zodQuery = extension[2];
      if (key === 'params') current.zodParams = extension[2];
      continue;
    }

    const status = /^ {8}"(\d{3})":\s*$/.exec(line);
    if (status) current.statuses.add(status[1]);
  }

  return operations;
}

const CONTRACT = readOperationContracts(
  path.join(process.cwd(), 'contracts', 'api', 'podcasts.yaml'),
);

function schemaByName(name: string): z.ZodTypeAny {
  const schema = (schemas as Record<string, unknown>)[name];
  if (!schema) throw new Error(`Schema "${name}" não é exportado por src/lib/schemas.ts`);
  return schema as z.ZodTypeAny;
}

/**
 * Núcleo do teste: confronta a resposta real do handler com o que o YAML
 * documenta para aquela operação.
 */
async function assertMatchesContract(
  operationId: string,
  response: Response,
): Promise<Record<string, unknown>> {
  const contract = CONTRACT[operationId];
  expect(contract, `operationId ${operationId} ausente no YAML`).toBeDefined();

  const status = String(response.status);
  expect(
    contract.statuses.has(status),
    `${operationId} devolveu ${status}, que não está documentado (${[...contract.statuses].join(', ')})`,
  ).toBe(true);

  expect(response.headers.get('content-type')).toContain('application/json');
  const body = (await response.json()) as Record<string, unknown>;

  if (response.status >= 400) {
    const parsed = errorResponseSchema.parse(body);
    expect(ERROR_STATUS_BY_CODE[parsed.error.code]).toBe(response.status);
    return body;
  }

  const schema = schemaByName(contract.zodResponse as string);
  const parsed = schema.safeParse(body);
  expect(parsed.success, `corpo fora de ${contract.zodResponse}`).toBe(true);
  return body;
}

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

const PODCAST_ID = '11111111-1111-4111-8111-111111111111';

/** Linha CRUA do Prisma: com `deletedAt`, `Date` e `Json` — o formato que quebra o `.strict()`. */
function rawPrismaRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: PODCAST_ID,
    slug: 'horizonte-digital',
    title: 'Horizonte Digital',
    tagline: null,
    description: 'Conversas sobre o futuro digital.',
    coverImage: '/images/podcasts/horizonte-digital-cover.jpg',
    heroImage: null,
    category: 'Tecnologia',
    status: 'ACTIVE',
    visualStyle: 'PHOTO_REAL',
    year: 2024,
    accentColor: '#d87dff',
    hosts: [{ name: 'Marina Reiners', initial: 'MR', photo: null, bio: null }],
    socialLinks: null,
    featured: false,
    displayOrder: 0,
    deletedAt: null,
    createdAt: new Date('2024-01-10T12:00:00.000Z'),
    updatedAt: new Date('2024-02-10T12:00:00.000Z'),
    ...overrides,
  };
}

function createPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    slug: 'novo-programa',
    title: 'Novo Programa',
    description: 'Descrição.',
    coverImage: 'https://cdn.supabase.co/storage/v1/object/public/reiners-media/podcasts/x.jpg',
    category: 'Cultura',
    year: 2025,
    hosts: [{ name: 'Marina Reiners', initial: 'MR' }],
    ...overrides,
  };
}

function request(
  url: string,
  options: { method?: string; token?: string; body?: unknown; rawBody?: string } = {},
): NextRequest {
  const headers = new Headers();
  if (options.token) headers.set('cookie', `sb-access-token=${options.token}`);

  let body: string | undefined;
  if (options.rawBody !== undefined) {
    body = options.rawBody;
    headers.set('content-type', 'application/json');
  } else if (options.body !== undefined) {
    body = JSON.stringify(options.body);
    headers.set('content-type', 'application/json');
  }

  return new NextRequest(url, { method: options.method ?? 'GET', headers, body });
}

type Role = 'ADMIN' | 'EDITOR';

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

beforeEach(() => {
  clearRateLimit();
  for (const fn of Object.values(prismaMock.podcast)) fn.mockReset();

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
/* O contrato lido do YAML                                                    */
/* -------------------------------------------------------------------------- */

describe('contrato lido de contracts/api/podcasts.yaml', () => {
  it('cobre as cinco operações de podcasts', () => {
    expect(Object.keys(CONTRACT).sort()).toEqual([
      'createPodcast',
      'deletePodcast',
      'getPodcastBySlug',
      'listPodcasts',
      'updatePodcast',
    ]);
  });

  it('declara schemas Zod realmente exportados', () => {
    for (const [operationId, contract] of Object.entries(CONTRACT)) {
      expect(contract.zodResponse, `${operationId} sem x-zod-response`).toBeTruthy();
      for (const name of [
        contract.zodResponse,
        contract.zodRequest,
        contract.zodQuery,
        contract.zodParams,
      ]) {
        if (name) expect(() => schemaByName(name)).not.toThrow();
      }
    }
  });

  it('documenta 401/403 nas operações protegidas e 404 nas que têm parâmetro', () => {
    for (const operationId of ['createPodcast', 'updatePodcast', 'deletePodcast']) {
      expect(CONTRACT[operationId].statuses.has('401')).toBe(true);
      expect(CONTRACT[operationId].statuses.has('403')).toBe(true);
    }
    for (const operationId of ['getPodcastBySlug', 'updatePodcast', 'deletePodcast']) {
      expect(CONTRACT[operationId].statuses.has('404')).toBe(true);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* listPodcasts                                                               */
/* -------------------------------------------------------------------------- */

describe('listPodcasts', () => {
  it('200 valida contra podcastListResponseSchema mesmo com linha crua do Prisma', async () => {
    // A armadilha documentada em contracts/README.md: `deletedAt`, `Date` e
    // `socialLinks` nulo numa linha crua derrubariam o `.strict()` com 500.
    prismaMock.podcast.findMany.mockResolvedValue([
      rawPrismaRow(),
      rawPrismaRow({ id: '22222222-2222-4222-8222-222222222222', slug: 'oficio', socialLinks: {} }),
    ]);
    prismaMock.podcast.count.mockResolvedValue(2);

    const response = await GET(request('http://localhost/api/podcasts'));
    const body = await assertMatchesContract('listPodcasts', response);

    expect(response.status).toBe(200);
    expect(JSON.stringify(body)).not.toContain('deletedAt');
    const [first] = body.data as Record<string, unknown>[];
    expect(typeof first.createdAt).toBe('string');
    expect(first.socialLinks).toEqual({});
  });

  it('422 quando a querystring não passa em podcastQuerySchema', async () => {
    const response = await GET(request('http://localhost/api/podcasts?limit=999'));
    await assertMatchesContract('listPodcasts', response);
    expect(response.status).toBe(422);
  });

  it('429 quando a janela de rate limit estoura', async () => {
    prismaMock.podcast.findMany.mockResolvedValue([]);
    prismaMock.podcast.count.mockResolvedValue(0);

    let last: Response | undefined;
    for (let i = 0; i < 101; i += 1) {
      last = await GET(request('http://localhost/api/podcasts'));
    }

    await assertMatchesContract('listPodcasts', last as Response);
    expect(last?.status).toBe(429);
  });

  it('500 no envelope padrão quando a serialização sai do contrato', async () => {
    // Linha sem host viola BR-003; a resposta é 500 documentado, nunca um corpo
    // fora de contrato vazando para o cliente.
    prismaMock.podcast.findMany.mockResolvedValue([rawPrismaRow({ hosts: null })]);
    prismaMock.podcast.count.mockResolvedValue(1);

    const response = await GET(request('http://localhost/api/podcasts'));
    await assertMatchesContract('listPodcasts', response);
    expect(response.status).toBe(500);
  });
});

/* -------------------------------------------------------------------------- */
/* getPodcastBySlug                                                           */
/* -------------------------------------------------------------------------- */

describe('getPodcastBySlug', () => {
  it('200 valida contra podcastDetailResponseSchema com episódios', async () => {
    prismaMock.podcast.findFirst.mockResolvedValue({
      ...rawPrismaRow(),
      episodes: [
        {
          id: '33333333-3333-4333-8333-333333333333',
          podcastId: PODCAST_ID,
          number: 1,
          title: 'Piloto',
          description: 'Estreia.',
          thumbnail: null,
          duration: '45:30',
          publishedAt: new Date('2024-01-15T12:00:00.000Z'),
          youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ',
          youtubeEmbed: 'dQw4w9WgXcQ',
          spotifyUrl: null,
          spotifyEmbed: null,
          createdAt: new Date('2024-01-15T12:00:00.000Z'),
        },
      ],
    });

    const response = await GET_DETAIL(request('http://localhost/api/podcasts/horizonte-digital'), {
      params: { idOrSlug: 'horizonte-digital' },
    });
    const body = await assertMatchesContract('getPodcastBySlug', response);

    expect(response.status).toBe(200);
    expect(JSON.stringify(body)).not.toContain('deletedAt');
  });

  it('404 para programa inexistente ou soft-deletado', async () => {
    prismaMock.podcast.findFirst.mockResolvedValue(null);

    const response = await GET_DETAIL(request('http://localhost/api/podcasts/sumiu'), {
      params: { idOrSlug: 'sumiu' },
    });

    await assertMatchesContract('getPodcastBySlug', response);
    expect(response.status).toBe(404);
  });

  it('422 para slug fora do padrão', async () => {
    const response = await GET_DETAIL(request('http://localhost/api/podcasts/NAO_VALE'), {
      params: { idOrSlug: 'NAO_VALE' },
    });

    await assertMatchesContract('getPodcastBySlug', response);
    expect(response.status).toBe(422);
  });
});

/* -------------------------------------------------------------------------- */
/* createPodcast                                                              */
/* -------------------------------------------------------------------------- */

describe('createPodcast', () => {
  it('201 valida contra podcastResponseSchema', async () => {
    prismaMock.podcast.count.mockResolvedValue(0);
    prismaMock.podcast.findFirst.mockResolvedValue(null);
    prismaMock.podcast.create.mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => rawPrismaRow(data),
    );

    const response = await POST(
      request('http://localhost/api/podcasts', {
        method: 'POST',
        token: 'token-admin',
        body: createPayload(),
      }),
    );

    await assertMatchesContract('createPodcast', response);
    expect(response.status).toBe(201);
  });

  it('401 sem sessão', async () => {
    const response = await POST(
      request('http://localhost/api/podcasts', { method: 'POST', body: createPayload() }),
    );

    await assertMatchesContract('createPodcast', response);
    expect(response.status).toBe(401);
  });

  it('400 com JSON malformado', async () => {
    const response = await POST(
      request('http://localhost/api/podcasts', {
        method: 'POST',
        token: 'token-admin',
        rawBody: '{',
      }),
    );

    await assertMatchesContract('createPodcast', response);
    expect(response.status).toBe(400);
  });

  it('422 quando o corpo não passa em podcastCreateSchema', async () => {
    const response = await POST(
      request('http://localhost/api/podcasts', {
        method: 'POST',
        token: 'token-admin',
        body: createPayload({ hosts: [] }),
      }),
    );

    await assertMatchesContract('createPodcast', response);
    expect(response.status).toBe(422);
  });

  it('409 no 4º destaque (BR-005)', async () => {
    prismaMock.podcast.count.mockResolvedValue(MAX_FEATURED_PODCASTS);
    prismaMock.podcast.findFirst.mockResolvedValue(null);

    const response = await POST(
      request('http://localhost/api/podcasts', {
        method: 'POST',
        token: 'token-admin',
        body: createPayload({ featured: true }),
      }),
    );

    const body = await assertMatchesContract('createPodcast', response);
    expect(response.status).toBe(409);
    expect(JSON.stringify(body)).toContain('BR-005');
  });
});

/* -------------------------------------------------------------------------- */
/* updatePodcast                                                              */
/* -------------------------------------------------------------------------- */

describe('updatePodcast', () => {
  const context = { params: { idOrSlug: PODCAST_ID } };

  it('200 valida contra podcastResponseSchema e não expõe deletedAt', async () => {
    prismaMock.podcast.findFirst.mockResolvedValue({
      id: PODCAST_ID,
      slug: 'horizonte-digital',
      status: 'ACTIVE',
      featured: false,
    });
    prismaMock.podcast.count.mockResolvedValue(0);
    prismaMock.podcast.update.mockResolvedValue(rawPrismaRow({ title: 'Outro' }));

    const response = await PATCH(
      request(`http://localhost/api/podcasts/${PODCAST_ID}`, {
        method: 'PATCH',
        token: 'token-editor',
        body: { title: 'Outro' },
      }),
      context,
    );

    const body = await assertMatchesContract('updatePodcast', response);
    expect(response.status).toBe(200);
    expect(JSON.stringify(body)).not.toContain('deletedAt');
  });

  it('409 quando {"featured": true} cai em programa ENDED (BR-006)', async () => {
    prismaMock.podcast.findFirst.mockResolvedValue({
      id: PODCAST_ID,
      slug: 'oficio',
      status: 'ENDED',
      featured: false,
    });
    prismaMock.podcast.count.mockResolvedValue(0);

    const response = await PATCH(
      request(`http://localhost/api/podcasts/${PODCAST_ID}`, {
        method: 'PATCH',
        token: 'token-admin',
        body: { featured: true },
      }),
      context,
    );

    const body = await assertMatchesContract('updatePodcast', response);
    expect(response.status).toBe(409);
    expect(JSON.stringify(body)).toContain('BR-006');
  });

  it('404 para programa inexistente', async () => {
    prismaMock.podcast.findFirst.mockResolvedValue(null);
    prismaMock.podcast.count.mockResolvedValue(0);

    const response = await PATCH(
      request(`http://localhost/api/podcasts/${PODCAST_ID}`, {
        method: 'PATCH',
        token: 'token-admin',
        body: { title: 'x' },
      }),
      context,
    );

    await assertMatchesContract('updatePodcast', response);
    expect(response.status).toBe(404);
  });

  it('422 quando o id de rota não passa em idParamSchema', async () => {
    const response = await PATCH(
      request('http://localhost/api/podcasts/abc', {
        method: 'PATCH',
        token: 'token-admin',
        body: { title: 'x' },
      }),
      { params: { idOrSlug: 'abc' } },
    );

    await assertMatchesContract('updatePodcast', response);
    expect(response.status).toBe(422);
  });
});

/* -------------------------------------------------------------------------- */
/* deletePodcast                                                              */
/* -------------------------------------------------------------------------- */

describe('deletePodcast', () => {
  const context = { params: { idOrSlug: PODCAST_ID } };

  it('200 valida contra podcastAdminResponseSchema e EXPÕE deletedAt', async () => {
    prismaMock.podcast.findFirst.mockResolvedValue({ id: PODCAST_ID });
    prismaMock.podcast.update.mockResolvedValue(
      rawPrismaRow({ deletedAt: new Date('2024-03-01T00:00:00.000Z') }),
    );

    const response = await DELETE(
      request(`http://localhost/api/podcasts/${PODCAST_ID}`, {
        method: 'DELETE',
        token: 'token-admin',
      }),
      context,
    );

    const body = await assertMatchesContract('deletePodcast', response);
    expect(response.status).toBe(200);
    // Rota administrativa: PodcastAdmin inclui o metadado de soft delete.
    expect((body.data as Record<string, unknown>).deletedAt).toBe('2024-03-01T00:00:00.000Z');
  });

  it('403 para EDITOR (BR-002)', async () => {
    const response = await DELETE(
      request(`http://localhost/api/podcasts/${PODCAST_ID}`, {
        method: 'DELETE',
        token: 'token-editor',
      }),
      context,
    );

    await assertMatchesContract('deletePodcast', response);
    expect(response.status).toBe(403);
  });

  it('401 sem sessão', async () => {
    const response = await DELETE(
      request(`http://localhost/api/podcasts/${PODCAST_ID}`, { method: 'DELETE' }),
      context,
    );

    await assertMatchesContract('deletePodcast', response);
    expect(response.status).toBe(401);
  });

  it('404 quando já estava deletado', async () => {
    prismaMock.podcast.findFirst.mockResolvedValue(null);

    const response = await DELETE(
      request(`http://localhost/api/podcasts/${PODCAST_ID}`, {
        method: 'DELETE',
        token: 'token-admin',
      }),
      context,
    );

    await assertMatchesContract('deletePodcast', response);
    expect(response.status).toBe(404);
  });
});

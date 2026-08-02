// @vitest-environment node
/**
 * TCK-006 — CONTRACT-007: conformidade entre `contracts/api/episodes.yaml` e a
 * implementação real das rotas.
 *
 * `tests/integration/contract-validation.test.ts` (TCK-003) já garante que o
 * YAML e `src/lib/schemas.ts` não divergem. O que falta — e é o que este
 * arquivo cobre — é a terceira ponta: os **route handlers**. Aqui cada operação
 * documentada é executada de verdade e a resposta é conferida contra o schema
 * apontado por `x-zod-response`, com o status precisando estar entre os
 * documentados para aquela operação.
 *
 * AMBIENTE: sem PostgreSQL, o `PrismaClient` é mockado em `@/lib/prisma`; os
 * handlers exercitados são os de produção.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { z } from 'zod';

import * as schemas from '@/lib/schemas';

/**
 * Mock PARCIAL de TCK-004: só `requireRole` é substituído. `enforceRateLimit`,
 * as políticas e `errorResponse` continuam reais, então o 429 verificado aqui é
 * o de produção.
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
const collectionRoute = await import('@/app/api/episodes/route');
const itemRoute = await import('@/app/api/episodes/[id]/route');

/* -------------------------------------------------------------------------- */
/* Leitura mínima do YAML (mesmo estilo de bloco usado nos contratos)         */
/* -------------------------------------------------------------------------- */

const YAML_PATH = path.join(process.cwd(), 'contracts/api/episodes.yaml');
const YAML_SOURCE = readFileSync(YAML_PATH, 'utf8');

interface YamlLine {
  indent: number;
  text: string;
}

function yamlLines(source: string): YamlLine[] {
  return source
    .split('\n')
    .map((raw) => raw.replace(/\t/g, '  ').replace(/\r$/, ''))
    .filter((raw) => raw.trim() !== '' && !raw.trim().startsWith('#'))
    .map((raw) => ({ indent: raw.length - raw.trimStart().length, text: raw.trim() }));
}

interface Operation {
  method: string;
  path: string;
  operationId: string;
  zod: Record<string, string>;
  statuses: number[];
  secured: boolean;
}

const HTTP_METHODS = new Set(['get', 'post', 'patch', 'put', 'delete']);

function readOperations(source: string): Operation[] {
  const operations: Operation[] = [];
  let currentPath: string | null = null;
  let current: Operation | null = null;
  let inResponses = false;

  for (const line of yamlLines(source)) {
    if (line.indent === 0) {
      currentPath = null;
      current = null;
      inResponses = false;
      continue;
    }

    if (line.indent === 2 && line.text.startsWith('/') && line.text.endsWith(':')) {
      currentPath = line.text.slice(0, -1);
      current = null;
      inResponses = false;
      continue;
    }

    if (currentPath !== null && line.indent === 4 && HTTP_METHODS.has(line.text.replace(':', ''))) {
      current = {
        method: line.text.replace(':', '').toUpperCase(),
        path: currentPath,
        operationId: '',
        zod: {},
        statuses: [],
        secured: false,
      };
      operations.push(current);
      inResponses = false;
      continue;
    }

    if (current === null) continue;

    if (line.indent === 6) {
      inResponses = line.text === 'responses:';
      const operationId = /^operationId:\s*(\S+)$/.exec(line.text);
      if (operationId) current.operationId = operationId[1];
      const zodRef = /^(x-zod-[a-z]+):\s*(\S+)$/.exec(line.text);
      if (zodRef) current.zod[zodRef[1]] = zodRef[2];
      if (line.text === 'security:') current.secured = true;
      if (line.text === 'security: []') current.secured = false;
    }

    if (inResponses && line.indent === 8) {
      const status = /^"(\d{3})":$/.exec(line.text);
      if (status) current.statuses.push(Number(status[1]));
    }
  }

  return operations;
}

/** Propriedades declaradas por um componente de `components.schemas`. */
function componentProperties(source: string, componentName: string): string[] {
  const lines = yamlLines(source);
  const properties: string[] = [];
  let inComponent = false;
  let inProperties = false;

  for (const line of lines) {
    if (line.indent === 4 && line.text === `${componentName}:`) {
      inComponent = true;
      continue;
    }
    if (!inComponent) continue;
    if (line.indent <= 4) break;

    if (line.indent === 6) inProperties = line.text === 'properties:';
    if (inProperties && line.indent === 8) {
      const key = /^([A-Za-z0-9_]+):$/.exec(line.text);
      if (key) properties.push(key[1]);
    }
  }

  return properties;
}

const OPERATIONS = readOperations(YAML_SOURCE);

function operationOf(method: string, endpoint: string): Operation {
  const operation = OPERATIONS.find((item) => item.method === method && item.path === endpoint);
  if (operation === undefined) throw new Error(`Operação ${method} ${endpoint} não está no YAML`);
  return operation;
}

const schemaRegistry = schemas as unknown as Record<string, unknown>;

function zodSchemaFor(operation: Operation, extension: string): z.ZodTypeAny {
  const exportName = operation.zod[extension];
  const candidate = schemaRegistry[exportName];
  if (candidate === undefined) {
    throw new Error(`${operation.operationId}: ${extension} aponta para ${exportName}, inexistente`);
  }
  return candidate as z.ZodTypeAny;
}

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

const PODCAST_ID = '11111111-1111-4111-8111-111111111111';
const EPISODE_ID = '22222222-2222-4222-8222-222222222222';
const YT_ID = 'dQw4w9WgXcQ';
const SP_ID = '4rOoJ6Egrf8K2IrywzwOMk';

function episodeRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: EPISODE_ID,
    podcastId: PODCAST_ID,
    number: 1,
    title: 'Piloto',
    description: 'Primeiro episódio.',
    thumbnail: '/images/episodes/piloto.jpg',
    duration: '45:30',
    publishedAt: new Date('2024-03-01T12:00:00.000Z'),
    youtubeUrl: `https://youtu.be/${YT_ID}`,
    youtubeEmbed: YT_ID,
    spotifyUrl: `https://open.spotify.com/episode/${SP_ID}`,
    spotifyEmbed: `spotify:episode:${SP_ID}`,
    createdAt: new Date('2024-03-01T12:05:00.000Z'),
    // Colunas que NÃO podem vazar na resposta pública.
    deletedAt: null,
    internalNote: 'metadado interno',
    ...overrides,
  };
}

function createBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    podcastId: PODCAST_ID,
    number: 2,
    title: 'Segundo episódio',
    description: 'Descrição.',
    duration: '30:00',
    publishedAt: '2024-04-01T10:00:00.000Z',
    youtubeUrl: `https://youtu.be/${YT_ID}`,
    ...overrides,
  };
}

function jsonRequest(method: string, body: unknown, endpoint: string): NextRequest {
  return new NextRequest(`http://localhost:3000${endpoint}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** Executa a operação e devolve status + corpo já parseado. */
async function callHandler(
  handler: () => Promise<Response>,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await handler();
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

/**
 * Confere o resultado contra o contrato da operação: status documentado e corpo
 * no schema apontado por `x-zod-response` (2xx) ou no envelope `ErrorResponse`.
 */
function expectContract(
  operation: Operation,
  result: { status: number; body: Record<string, unknown> },
): void {
  expect(operation.statuses).toContain(result.status);
  const schema =
    result.status < 400 ? zodSchemaFor(operation, 'x-zod-response') : schemas.errorResponseSchema;
  const parsed = schema.safeParse(result.body);
  expect(parsed.success ? null : parsed.error?.issues).toBeNull();
}

beforeEach(() => {
  vi.resetAllMocks();
  clearRateLimit();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  authMock.requireRole.mockResolvedValue({
    ok: true,
    user: { id: PODCAST_ID, email: 'admin@reinersmedia.com', name: null, role: 'ADMIN' },
    session: { authenticated: true, user: null, expiresAt: null },
  });
  prismaMock.podcast.findFirst.mockResolvedValue({ id: PODCAST_ID });
  prismaMock.episode.findFirst.mockResolvedValue(null);
});

/** Resposta de negativa do guard, no envelope de `ErrorResponse`. */
function denyWith(status: number, code: string): void {
  authMock.requireRole.mockResolvedValue({
    ok: false,
    response: NextResponse.json({ error: { code, message: 'negado' } }, { status }),
  });
}

/* -------------------------------------------------------------------------- */
/* O YAML e os handlers descrevem o mesmo recurso                             */
/* -------------------------------------------------------------------------- */

describe('CONTRACT-007 — superfície documentada', () => {
  it('documenta exatamente as operações implementadas', () => {
    const documented = OPERATIONS.map((operation) => `${operation.method} ${operation.path}`).sort();
    expect(documented).toEqual([
      'DELETE /episodes/{id}',
      'GET /episodes',
      'GET /episodes/{id}',
      'PATCH /episodes/{id}',
      'POST /episodes',
    ]);
  });

  it('exporta um handler para cada método documentado', () => {
    const handlers: Record<string, unknown> = {
      'GET /episodes': collectionRoute.GET,
      'POST /episodes': collectionRoute.POST,
      'GET /episodes/{id}': itemRoute.GET,
      'PATCH /episodes/{id}': itemRoute.PATCH,
      'DELETE /episodes/{id}': itemRoute.DELETE,
    };
    for (const operation of OPERATIONS) {
      expect(typeof handlers[`${operation.method} ${operation.path}`]).toBe('function');
    }
  });

  it.each(OPERATIONS.map((operation) => [operation.operationId, operation] as const))(
    '%s aponta x-zod-* para schemas realmente exportados',
    (_id, operation) => {
      expect(Object.keys(operation.zod).length).toBeGreaterThan(0);
      for (const extension of Object.keys(operation.zod)) {
        expect(zodSchemaFor(operation, extension)).toBeDefined();
      }
    },
  );

  it('mantém youtubeEmbed e spotifyEmbed fora dos corpos de escrita (derivados no servidor)', () => {
    for (const component of ['EpisodeCreate', 'EpisodeUpdate']) {
      const properties = componentProperties(YAML_SOURCE, component);
      expect(properties.length).toBeGreaterThan(0);
      expect(properties).not.toContain('youtubeEmbed');
      expect(properties).not.toContain('spotifyEmbed');
    }
    expect(componentProperties(YAML_SOURCE, 'Episode')).toEqual(
      expect.arrayContaining(['youtubeEmbed', 'spotifyEmbed']),
    );
  });

  it('mantém podcastId fora do corpo de atualização (episódio não migra de programa)', () => {
    expect(componentProperties(YAML_SOURCE, 'EpisodeUpdate')).not.toContain('podcastId');
  });
});

/* -------------------------------------------------------------------------- */
/* Respostas reais x contrato                                                 */
/* -------------------------------------------------------------------------- */

describe('CONTRACT-007 — GET /episodes', () => {
  const operation = operationOf('GET', '/episodes');

  it('200 respeita EpisodeListResponse e não vaza coluna interna', async () => {
    prismaMock.episode.count.mockResolvedValue(1);
    prismaMock.episode.findMany.mockResolvedValue([episodeRow()]);

    const result = await callHandler(() =>
      collectionRoute.GET(
        new NextRequest(`http://localhost:3000/api/episodes?podcastId=${PODCAST_ID}`),
      ),
    );

    expectContract(operation, result);
    expect(result.status).toBe(200);
    const [first] = result.body.data as Array<Record<string, unknown>>;
    expect(Object.keys(first).sort()).toEqual(componentProperties(YAML_SOURCE, 'Episode').sort());
  });

  it('422 e 404 saem no envelope ErrorResponse documentado', async () => {
    expectContract(
      operation,
      await callHandler(() =>
        collectionRoute.GET(new NextRequest('http://localhost:3000/api/episodes')),
      ),
    );

    prismaMock.podcast.findFirst.mockResolvedValue(null);
    expectContract(
      operation,
      await callHandler(() =>
        collectionRoute.GET(
          new NextRequest(`http://localhost:3000/api/episodes?podcastId=${PODCAST_ID}`),
        ),
      ),
    );
  });

  it('429 documentado é realmente alcançável e sai no envelope ErrorResponse', async () => {
    expect(operation.statuses).toContain(429);
    prismaMock.episode.count.mockResolvedValue(0);
    prismaMock.episode.findMany.mockResolvedValue([]);

    let result = { status: 0, body: {} as Record<string, unknown> };
    for (let attempt = 0; attempt < 101; attempt += 1) {
      result = await callHandler(() =>
        collectionRoute.GET(
          new NextRequest(`http://localhost:3000/api/episodes?podcastId=${PODCAST_ID}`, {
            headers: { 'x-forwarded-for': '203.0.113.99' },
          }),
        ),
      );
    }

    expectContract(operation, result);
    expect(result.status).toBe(429);
  });

  it('a query obedece ao schema declarado em x-zod-query', () => {
    const querySchema = zodSchemaFor(operation, 'x-zod-query');
    expect(querySchema.safeParse({ podcastId: PODCAST_ID }).success).toBe(true);
    expect(querySchema.safeParse({}).success).toBe(false);
  });
});

describe('CONTRACT-007 — POST /episodes', () => {
  const operation = operationOf('POST', '/episodes');

  it('201 devolve EpisodeResponse com os embeds derivados', async () => {
    prismaMock.episode.create.mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => episodeRow(data),
    );

    const result = await callHandler(() =>
      collectionRoute.POST(jsonRequest('POST', createBody(), '/api/episodes')),
    );

    expectContract(operation, result);
    expect(result.status).toBe(201);
    expect((result.body.data as Record<string, unknown>).youtubeEmbed).toBe(YT_ID);
  });

  it('422 (BR-004), 404 e 409 saem no envelope documentado', async () => {
    expectContract(
      operation,
      await callHandler(() =>
        collectionRoute.POST(
          jsonRequest('POST', createBody({ youtubeUrl: undefined }), '/api/episodes'),
        ),
      ),
    );

    prismaMock.episode.findFirst.mockResolvedValue({ id: EPISODE_ID });
    expectContract(
      operation,
      await callHandler(() =>
        collectionRoute.POST(jsonRequest('POST', createBody(), '/api/episodes')),
      ),
    );

    prismaMock.podcast.findFirst.mockResolvedValue(null);
    expectContract(
      operation,
      await callHandler(() =>
        collectionRoute.POST(jsonRequest('POST', createBody(), '/api/episodes')),
      ),
    );
  });

  it('é operação protegida e devolve 401 no envelope documentado', async () => {
    expect(operation.secured).toBe(true);
    expect(operation.statuses).toEqual(expect.arrayContaining([401, 403]));

    denyWith(401, 'UNAUTHORIZED');
    const result = await callHandler(() =>
      collectionRoute.POST(jsonRequest('POST', createBody(), '/api/episodes')),
    );

    expectContract(operation, result);
    expect(result.status).toBe(401);
  });
});

describe('CONTRACT-007 — GET /episodes/{id}', () => {
  const operation = operationOf('GET', '/episodes/{id}');

  it('200 e 404 respeitam o contrato', async () => {
    prismaMock.episode.findUnique.mockResolvedValue(episodeRow());
    const found = await callHandler(() =>
      itemRoute.GET(new NextRequest(`http://localhost:3000/api/episodes/${EPISODE_ID}`), {
        params: { id: EPISODE_ID },
      }),
    );
    expectContract(operation, found);
    expect(found.status).toBe(200);

    prismaMock.episode.findUnique.mockResolvedValue(null);
    const missing = await callHandler(() =>
      itemRoute.GET(new NextRequest(`http://localhost:3000/api/episodes/${EPISODE_ID}`), {
        params: { id: EPISODE_ID },
      }),
    );
    expectContract(operation, missing);
    expect(missing.status).toBe(404);
  });

  it('valida o parâmetro de rota com o schema de x-zod-params', () => {
    const paramsSchema = zodSchemaFor(operation, 'x-zod-params');
    expect(paramsSchema.safeParse({ id: EPISODE_ID }).success).toBe(true);
    expect(paramsSchema.safeParse({ id: 'abc' }).success).toBe(false);
  });
});

describe('CONTRACT-007 — PATCH /episodes/{id}', () => {
  const operation = operationOf('PATCH', '/episodes/{id}');

  it('200 devolve EpisodeResponse', async () => {
    prismaMock.episode.findUnique.mockResolvedValue(episodeRow());
    prismaMock.episode.update.mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => episodeRow(data),
    );

    const result = await callHandler(() =>
      itemRoute.PATCH(jsonRequest('PATCH', { title: 'Novo título' }, `/api/episodes/${EPISODE_ID}`), {
        params: { id: EPISODE_ID },
      }),
    );

    expectContract(operation, result);
    expect(result.status).toBe(200);
  });

  it('409 de BR-004 sobre o estado mesclado está entre os status documentados', async () => {
    prismaMock.episode.findUnique.mockResolvedValue(
      episodeRow({ spotifyUrl: null, spotifyEmbed: null }),
    );

    const result = await callHandler(() =>
      itemRoute.PATCH(jsonRequest('PATCH', { youtubeUrl: null }, `/api/episodes/${EPISODE_ID}`), {
        params: { id: EPISODE_ID },
      }),
    );

    expectContract(operation, result);
    expect(result.status).toBe(409);
    expect(operation.statuses).toContain(409);
  });

  it('422 de payload inválido está entre os status documentados', async () => {
    prismaMock.episode.findUnique.mockResolvedValue(episodeRow());

    const result = await callHandler(() =>
      itemRoute.PATCH(jsonRequest('PATCH', { number: 0 }, `/api/episodes/${EPISODE_ID}`), {
        params: { id: EPISODE_ID },
      }),
    );

    expectContract(operation, result);
    expect(result.status).toBe(422);
  });
});

describe('CONTRACT-007 — DELETE /episodes/{id}', () => {
  const operation = operationOf('DELETE', '/episodes/{id}');

  it('200 devolve o episódio removido no envelope EpisodeResponse', async () => {
    prismaMock.episode.findUnique.mockResolvedValue(episodeRow());
    prismaMock.episode.delete.mockResolvedValue(episodeRow());

    const result = await callHandler(() =>
      itemRoute.DELETE(
        new NextRequest(`http://localhost:3000/api/episodes/${EPISODE_ID}`, { method: 'DELETE' }),
        { params: { id: EPISODE_ID } },
      ),
    );

    expectContract(operation, result);
    expect(result.status).toBe(200);
  });

  it('404 respeita o envelope de erro', async () => {
    prismaMock.episode.findUnique.mockResolvedValue(null);

    const result = await callHandler(() =>
      itemRoute.DELETE(
        new NextRequest(`http://localhost:3000/api/episodes/${EPISODE_ID}`, { method: 'DELETE' }),
        { params: { id: EPISODE_ID } },
      ),
    );

    expectContract(operation, result);
    expect(result.status).toBe(404);
  });

  it('BR-002: 403 do EDITOR sai no envelope documentado', async () => {
    expect(operation.secured).toBe(true);
    expect(operation.statuses).toEqual(expect.arrayContaining([401, 403]));

    denyWith(403, 'FORBIDDEN');
    const result = await callHandler(() =>
      itemRoute.DELETE(
        new NextRequest(`http://localhost:3000/api/episodes/${EPISODE_ID}`, { method: 'DELETE' }),
        { params: { id: EPISODE_ID } },
      ),
    );

    expectContract(operation, result);
    expect(result.status).toBe(403);
  });
});

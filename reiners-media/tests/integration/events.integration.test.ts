/**
 * TCK-007 — testes de integração das rotas `/api/events` e `/api/events/summary`.
 *
 * Sem PostgreSQL no ambiente: o handler real é exercitado de ponta a ponta
 * (`NextRequest` -> handler -> status/corpo) com o `PrismaClient` mockado e a
 * ponte de autorização (TCK-004) substituída, de modo que 401/403 sejam
 * verificáveis sem sessão Supabase.
 */
import type { NextRequest } from 'next/server';
import { NextRequest as NextRequestCtor } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RATE_LIMIT_POLICIES, clearRateLimit } from '@/lib/auth-helpers';
import {
  EVENTS_RATE_LIMIT_PER_MINUTE,
  eventListResponseSchema,
  eventResponseSchema,
} from '@/lib/schemas';

/** Política aplicada por `POST /api/events` (docs/SECURITY.md + contrato). */
const PUBLIC_LIMIT = RATE_LIMIT_POLICIES.publicApi.limit;

const mocks = vi.hoisted(() => {
  const eventLog = {
    create: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
    deleteMany: vi.fn(),
  };
  return {
    prisma: { eventLog },
    eventLog,
    auth: {
      result: { ok: true, user: { id: 'admin-1', email: 'admin@reiners.media', role: 'ADMIN' } } as
        | { ok: true; user: { id: string; email: string; role: 'ADMIN' | 'EDITOR' } }
        | { ok: false; code: 'UNAUTHORIZED' | 'FORBIDDEN'; message: string },
    },
  };
});

vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma, default: mocks.prisma }));
vi.mock('@/app/api/events/_lib/admin-auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/app/api/events/_lib/admin-auth')>();
  return { ...actual, authorizeAdminRequest: vi.fn(async () => mocks.auth.result) };
});

const { GET, POST } = await import('@/app/api/events/route');
const { GET: GET_SUMMARY } = await import('@/app/api/events/summary/route');

const ADMIN = {
  ok: true as const,
  user: { id: 'admin-1', email: 'admin@reiners.media', role: 'ADMIN' as const },
};
const EDITOR_DENIED = {
  ok: false as const,
  code: 'FORBIDDEN' as const,
  message: 'Operação restrita ao papel ADMIN',
};
const NO_SESSION = {
  ok: false as const,
  code: 'UNAUTHORIZED' as const,
  message: 'Sessão ausente ou expirada',
};

const EVENT_ROW = {
  id: '3f6c3f2e-6c2b-4c8f-9a5e-6b1f9a2d4c11',
  eventType: 'PAGE_VIEW',
  payload: { path: '/' },
  createdAt: new Date('2026-08-02T12:00:00.000Z'),
};

function postRequest(body: unknown, ip = '203.0.113.1'): NextRequest {
  return new NextRequestCtor('http://localhost:3000/api/events', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function getRequest(path: string, ip = '203.0.113.2'): NextRequest {
  return new NextRequestCtor(`http://localhost:3000${path}`, {
    method: 'GET',
    headers: { 'x-forwarded-for': ip },
  });
}

beforeEach(() => {
  clearRateLimit();
  vi.clearAllMocks();
  mocks.auth.result = ADMIN;
  mocks.eventLog.create.mockImplementation(
    async (args: { data: { eventType: string; payload?: unknown } }) => ({
      ...EVENT_ROW,
      eventType: args.data.eventType,
      payload: args.data.payload ?? null,
    }),
  );
  mocks.eventLog.findMany.mockResolvedValue([EVENT_ROW]);
  mocks.eventLog.count.mockResolvedValue(1);
});

afterEach(() => {
  vi.restoreAllMocks();
});

/* -------------------------------------------------------------------------- */
/* POST /api/events — ingestão pública                                        */
/* -------------------------------------------------------------------------- */

describe('POST /api/events', () => {
  it('persiste o evento e responde 201 no envelope do contrato', async () => {
    const response = await POST(postRequest({ eventType: 'PAGE_VIEW', payload: { path: '/' } }));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(eventResponseSchema.safeParse(body).success).toBe(true);
    expect(body.data.eventType).toBe('PAGE_VIEW');
    expect(body.data.createdAt).toBe('2026-08-02T12:00:00.000Z');
    expect(mocks.eventLog.create).toHaveBeenCalledWith({
      data: { eventType: 'PAGE_VIEW', payload: { path: '/' } },
    });
  });

  it('aceita evento sem payload', async () => {
    const response = await POST(postRequest({ eventType: 'ADMIN_LOGIN' }));
    expect(response.status).toBe(201);
    expect(mocks.eventLog.create).toHaveBeenCalledWith({
      data: { eventType: 'ADMIN_LOGIN', payload: undefined },
    });
  });

  it('anexa os headers de rate limit à resposta de sucesso', async () => {
    const response = await POST(postRequest({ eventType: 'PAGE_VIEW' }));
    expect(response.headers.get('X-RateLimit-Limit')).toBe(String(PUBLIC_LIMIT));
    expect(response.headers.get('X-RateLimit-Remaining')).toBe(String(PUBLIC_LIMIT - 1));
  });

  it('recusa eventType fora do enum com 422 e não toca o banco', async () => {
    const response = await POST(postRequest({ eventType: 'HACK_ATTEMPT' }));
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(mocks.eventLog.create).not.toHaveBeenCalled();
  });

  it('recusa chave desconhecida no corpo (schema .strict())', async () => {
    const response = await POST(
      postRequest({ eventType: 'PAGE_VIEW', userId: 'quem-mandou-isso' }),
    );
    expect(response.status).toBe(422);
    expect(mocks.eventLog.create).not.toHaveBeenCalled();
  });

  it.each([
    ['poluição de protótipo', '{"eventType":"PAGE_VIEW","payload":{"__proto__":{"admin":true}}}'],
    [
      'profundidade excessiva',
      '{"eventType":"PAGE_VIEW","payload":{"a":{"b":{"c":{"d":{"e":{"f":1}}}}}}}',
    ],
    ['chave hostil', '{"eventType":"PAGE_VIEW","payload":{"$where":"1==1"}}'],
  ])('recusa payload hostil com 422: %s', async (_label, raw) => {
    const response = await POST(postRequest(raw));
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(mocks.eventLog.create).not.toHaveBeenCalled();
  });

  it('recusa corpo acima do teto de bytes', async () => {
    const response = await POST(
      postRequest({ eventType: 'PAGE_VIEW', payload: { path: 'x'.repeat(9_000) } }),
    );
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.error.message).toContain('bytes');
    expect(mocks.eventLog.create).not.toHaveBeenCalled();
  });

  it('recusa corpo malformado ou vazio com 400', async () => {
    const malformed = await POST(postRequest('{ isto nao e json'));
    expect(malformed.status).toBe(400);
    expect((await malformed.json()).error.code).toBe('BAD_REQUEST');

    const empty = await POST(postRequest(''));
    expect(empty.status).toBe(400);
  });

  it('a política pública bate com o rate limit publicado no contrato', () => {
    expect(PUBLIC_LIMIT).toBe(EVENTS_RATE_LIMIT_PER_MINUTE);
  });

  it(`bloqueia com 429 depois de ${EVENTS_RATE_LIMIT_PER_MINUTE} requisições no mesmo IP`, async () => {
    const ip = '198.51.100.77';
    for (let i = 0; i < PUBLIC_LIMIT; i += 1) {
      const allowed = await POST(postRequest({ eventType: 'PAGE_VIEW' }, ip));
      expect(allowed.status).toBe(201);
    }

    const blocked = await POST(postRequest({ eventType: 'PAGE_VIEW' }, ip));
    const body = await blocked.json();

    expect(blocked.status).toBe(429);
    expect(body.error.code).toBe('RATE_LIMITED');
    expect(Number(blocked.headers.get('Retry-After'))).toBeGreaterThanOrEqual(1);
    expect(mocks.eventLog.create).toHaveBeenCalledTimes(PUBLIC_LIMIT);
  });

  it('o rate limit é por IP: outro cliente continua passando', async () => {
    const ip = '198.51.100.78';
    for (let i = 0; i < PUBLIC_LIMIT; i += 1) {
      await POST(postRequest({ eventType: 'PAGE_VIEW' }, ip));
    }
    expect((await POST(postRequest({ eventType: 'PAGE_VIEW' }, ip))).status).toBe(429);
    expect((await POST(postRequest({ eventType: 'PAGE_VIEW' }, '198.51.100.79'))).status).toBe(201);
  });

  it('traduz falha do banco em 500 sem vazar detalhe interno', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.eventLog.create.mockRejectedValueOnce(new Error('connect ECONNREFUSED 127.0.0.1:5432'));

    const response = await POST(postRequest({ eventType: 'PAGE_VIEW' }));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error.code).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(body)).not.toContain('ECONNREFUSED');
    expect(error).toHaveBeenCalled();
  });
});

/* -------------------------------------------------------------------------- */
/* GET /api/events — listagem protegida                                       */
/* -------------------------------------------------------------------------- */

describe('GET /api/events', () => {
  it('devolve 401 sem sessão e não consulta o banco', async () => {
    mocks.auth.result = NO_SESSION;
    const response = await GET(getRequest('/api/events'));

    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe('UNAUTHORIZED');
    expect(mocks.eventLog.findMany).not.toHaveBeenCalled();
  });

  it('devolve 403 para EDITOR (BR-001/BR-002)', async () => {
    mocks.auth.result = EDITOR_DENIED;
    const response = await GET(getRequest('/api/events'));

    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe('FORBIDDEN');
    expect(mocks.eventLog.findMany).not.toHaveBeenCalled();
  });

  it('lista paginada para ADMIN, com Date serializado em ISO-8601', async () => {
    const response = await GET(getRequest('/api/events?page=1&limit=20'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(eventListResponseSchema.safeParse(body).success).toBe(true);
    expect(body.data[0].createdAt).toBe('2026-08-02T12:00:00.000Z');
    expect(body.meta).toEqual({ page: 1, limit: 20, total: 1, totalPages: 1 });
  });

  it('aplica filtros de tipo e intervalo na consulta', async () => {
    await GET(
      getRequest(
        '/api/events?eventType=YOUTUBE_CLICK&from=2026-07-01T00:00:00Z&to=2026-08-01T00:00:00Z&page=2&limit=10&order=asc',
      ),
    );

    expect(mocks.eventLog.findMany).toHaveBeenCalledWith({
      where: {
        eventType: 'YOUTUBE_CLICK',
        createdAt: {
          gte: new Date('2026-07-01T00:00:00Z'),
          lte: new Date('2026-08-01T00:00:00Z'),
        },
      },
      orderBy: { createdAt: 'asc' },
      skip: 10,
      take: 10,
    });
  });

  it('ignora parâmetros desconhecidos na query (utm_*)', async () => {
    const response = await GET(getRequest('/api/events?utm_source=newsletter'));
    expect(response.status).toBe(200);
  });

  it.each([
    ['limit acima do teto', '/api/events?limit=500'],
    ['page inválida', '/api/events?page=0'],
    ['eventType inválido', '/api/events?eventType=NAO_EXISTE'],
    ['from não ISO', '/api/events?from=ontem'],
  ])('recusa query inválida com 422: %s', async (_label, path) => {
    const response = await GET(getRequest(path));
    expect(response.status).toBe(422);
    expect((await response.json()).error.code).toBe('VALIDATION_ERROR');
  });

  it('recusa intervalo invertido com 422', async () => {
    const response = await GET(
      getRequest('/api/events?from=2026-08-02T00:00:00Z&to=2026-08-01T00:00:00Z'),
    );
    expect(response.status).toBe(422);
  });
});

/* -------------------------------------------------------------------------- */
/* GET /api/events/summary — agregações (TCK-020)                             */
/* -------------------------------------------------------------------------- */

describe('GET /api/events/summary', () => {
  beforeEach(() => {
    mocks.eventLog.findMany.mockResolvedValue([
      { eventType: 'PAGE_VIEW', createdAt: new Date('2026-08-01T10:00:00.000Z') },
      { eventType: 'PAGE_VIEW', createdAt: new Date('2026-08-02T10:00:00.000Z') },
      { eventType: 'YOUTUBE_CLICK', createdAt: new Date('2026-08-02T11:00:00.000Z') },
    ]);
  });

  it('exige sessão ADMIN', async () => {
    mocks.auth.result = NO_SESSION;
    expect((await GET_SUMMARY(getRequest('/api/events/summary'))).status).toBe(401);

    mocks.auth.result = EDITOR_DENIED;
    expect((await GET_SUMMARY(getRequest('/api/events/summary'))).status).toBe(403);
    expect(mocks.eventLog.findMany).not.toHaveBeenCalled();
  });

  it('agrega contagem por tipo e série temporal no intervalo pedido', async () => {
    const response = await GET_SUMMARY(
      getRequest('/api/events/summary?from=2026-08-01T00:00:00Z&to=2026-08-02T23:59:59Z'),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.total).toBe(3);
    expect(body.data.range.bucket).toBe('day');
    expect(body.data.byType[0]).toEqual({ eventType: 'PAGE_VIEW', count: 2 });
    expect(body.data.timeSeries.map((point: { bucket: string }) => point.bucket)).toEqual([
      '2026-08-01',
      '2026-08-02',
    ]);
    expect(body.data.timeSeries[1].byType.YOUTUBE_CLICK).toBe(1);
  });

  it('aceita balde por hora e filtro por tipo', async () => {
    const response = await GET_SUMMARY(
      getRequest(
        '/api/events/summary?bucket=hour&eventType=PAGE_VIEW&from=2026-08-02T10:00:00Z&to=2026-08-02T11:00:00Z',
      ),
    );

    expect(response.status).toBe(200);
    expect(mocks.eventLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ eventType: 'PAGE_VIEW' }),
        select: { eventType: true, createdAt: true },
      }),
    );
  });

  it.each([
    ['balde inválido', '/api/events/summary?bucket=semana'],
    ['intervalo invertido', '/api/events/summary?from=2026-08-02T00:00:00Z&to=2026-08-01T00:00:00Z'],
    [
      'janela horária longa demais',
      '/api/events/summary?bucket=hour&from=2025-01-01T00:00:00Z&to=2026-01-01T00:00:00Z',
    ],
  ])('recusa parâmetros inválidos com 422: %s', async (_label, path) => {
    const response = await GET_SUMMARY(getRequest(path));
    expect(response.status).toBe(422);
    expect((await response.json()).error.code).toBe('VALIDATION_ERROR');
  });
});

/* -------------------------------------------------------------------------- */
/* Ponte de autorização (dependência de TCK-004)                              */
/* -------------------------------------------------------------------------- */

describe('normalizeAuthResult (ponte para requireAuth de TCK-004)', () => {
  const load = async () =>
    vi.importActual<typeof import('@/app/api/events/_lib/admin-auth')>(
      '@/app/api/events/_lib/admin-auth',
    );

  it('nega quando requireAuth devolve vazio', async () => {
    const { normalizeAuthResult } = await load();
    expect(normalizeAuthResult(null, 'ADMIN')).toMatchObject({ ok: false, code: 'UNAUTHORIZED' });
    expect(normalizeAuthResult(undefined, 'ADMIN')).toMatchObject({ code: 'UNAUTHORIZED' });
    expect(normalizeAuthResult({ user: null }, 'ADMIN')).toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('traduz o AuthOutcome real de TCK-004', async () => {
    const { normalizeAuthResult } = await load();
    const user = { id: 'u1', email: 'a@b.co', role: 'ADMIN' };

    expect(normalizeAuthResult({ ok: true, user, session: {} }, 'ADMIN')).toEqual({
      ok: true,
      user,
    });
    expect(
      normalizeAuthResult({ ok: false, response: new Response(null, { status: 401 }) }, 'ADMIN'),
    ).toMatchObject({ ok: false, code: 'UNAUTHORIZED' });
    expect(
      normalizeAuthResult({ ok: false, response: new Response(null, { status: 403 }) }, 'ADMIN'),
    ).toMatchObject({ ok: false, code: 'FORBIDDEN' });
  });

  it('aceita as formas plausíveis de retorno do helper', async () => {
    const { normalizeAuthResult } = await load();
    const user = { id: 'u1', email: 'a@b.co', role: 'ADMIN' };
    expect(normalizeAuthResult(user, 'ADMIN')).toEqual({ ok: true, user });
    expect(normalizeAuthResult({ user }, 'ADMIN')).toEqual({ ok: true, user });
    expect(normalizeAuthResult({ data: { user } }, 'ADMIN')).toEqual({ ok: true, user });
  });

  it('traduz Response de erro em 401/403', async () => {
    const { normalizeAuthResult } = await load();
    expect(normalizeAuthResult(new Response(null, { status: 401 }), 'ADMIN')).toMatchObject({
      code: 'UNAUTHORIZED',
    });
    expect(normalizeAuthResult(new Response(null, { status: 403 }), 'ADMIN')).toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('EDITOR não passa onde ADMIN é exigido (BR-002)', async () => {
    const { normalizeAuthResult } = await load();
    const editor = { id: 'u2', email: 'editor@b.co', role: 'EDITOR' };
    expect(normalizeAuthResult(editor, 'ADMIN')).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    expect(normalizeAuthResult(editor, 'EDITOR')).toMatchObject({ ok: true });
  });

  it('nega por padrão quando a resolução da sessão explode', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const actual = await load();

    // Sem cookie de sessão e sem Supabase configurado, `requireAuth` falha:
    // o contrato desta ponte é nunca deixar a rota aberta nesse caso.
    const result = await actual.authorizeAdminRequest(
      new Request('http://localhost:3000/api/events'),
      'ADMIN',
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('UNAUTHORIZED');
    warn.mockRestore();
  });
});

/**
 * TCK-007 — testes de integração de `/api/site-config`.
 *
 * `GET` é público; `PATCH` exige ADMIN (BR-001/BR-002). Sem PostgreSQL: o
 * handler real roda com `PrismaClient` mockado e a ponte de autorização
 * (TCK-004) substituída.
 */
import type { NextRequest } from 'next/server';
import { NextRequest as NextRequestCtor } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RATE_LIMIT_POLICIES, clearRateLimit } from '@/lib/auth-helpers';
import { siteConfigResponseSchema } from '@/lib/schemas';

/** Política de escrita administrativa (docs/SECURITY.md — "APIs admin"). */
const ADMIN_LIMIT = RATE_LIMIT_POLICIES.adminApi.limit;

const mocks = vi.hoisted(() => {
  const siteConfig = { findFirst: vi.fn(), update: vi.fn() };
  return {
    prisma: { siteConfig },
    siteConfig,
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

const { GET, PATCH } = await import('@/app/api/site-config/route');

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

/** Linha crua do Prisma: `Date` nos timestamps, `null` nas colunas opcionais. */
const CONFIG_ROW = {
  id: '3f6c3f2e-6c2b-4c8f-9a5e-6b1f9a2d4c22',
  siteName: 'Reiners Media',
  tagline: 'Conteúdo que conecta',
  logoUrl: '/images/logo.svg',
  faviconUrl: null,
  primaryColor: '#d87dff',
  seoTitle: null,
  seoDescription: null,
  analyticsId: null,
  facebookPixel: null,
  customCss: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-08-01T00:00:00.000Z'),
};

function getRequest(ip = '203.0.113.10'): NextRequest {
  return new NextRequestCtor('http://localhost:3000/api/site-config', {
    method: 'GET',
    headers: { 'x-forwarded-for': ip },
  });
}

function patchRequest(body: unknown, ip = '203.0.113.11'): NextRequest {
  return new NextRequestCtor('http://localhost:3000/api/site-config', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  clearRateLimit();
  vi.clearAllMocks();
  mocks.auth.result = ADMIN;
  mocks.siteConfig.findFirst.mockResolvedValue(CONFIG_ROW);
  mocks.siteConfig.update.mockImplementation(
    async (args: { data: Record<string, unknown> }) => ({
      ...CONFIG_ROW,
      ...args.data,
      updatedAt: new Date('2026-08-02T12:00:00.000Z'),
    }),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

/* -------------------------------------------------------------------------- */
/* GET /api/site-config — público                                             */
/* -------------------------------------------------------------------------- */

describe('GET /api/site-config', () => {
  it('devolve a configuração no envelope do contrato, sem sessão', async () => {
    const response = await GET(getRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(siteConfigResponseSchema.safeParse(body).success).toBe(true);
    expect(body.data.siteName).toBe('Reiners Media');
    expect(body.data.createdAt).toBe('2026-01-01T00:00:00.000Z');
    expect(body.data.updatedAt).toBe('2026-08-01T00:00:00.000Z');
  });

  it('não quebra quando a tabela ganha colunas novas (armadilha do schema .strict())', async () => {
    mocks.siteConfig.findFirst.mockResolvedValueOnce({
      ...CONFIG_ROW,
      internalNotes: 'coluna futura',
      deletedAt: null,
    });

    const response = await GET(getRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).not.toHaveProperty('internalNotes');
  });

  it('responde 404 enquanto o seed não criou o registro', async () => {
    mocks.siteConfig.findFirst.mockResolvedValueOnce(null);

    const response = await GET(getRequest());
    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe('NOT_FOUND');
  });

  it('permite cache de borda na leitura pública', async () => {
    const response = await GET(getRequest());
    expect(response.headers.get('Cache-Control')).toContain('s-maxage=60');
  });

  it('traduz falha do banco em 500', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.siteConfig.findFirst.mockRejectedValueOnce(new Error('pool esgotado'));

    const response = await GET(getRequest());
    expect(response.status).toBe(500);
    expect((await response.json()).error.code).toBe('INTERNAL_ERROR');
    expect(error).toHaveBeenCalled();
  });
});

/* -------------------------------------------------------------------------- */
/* PATCH /api/site-config — ADMIN                                             */
/* -------------------------------------------------------------------------- */

describe('PATCH /api/site-config', () => {
  it('devolve 401 sem sessão e não escreve no banco', async () => {
    mocks.auth.result = NO_SESSION;

    const response = await PATCH(patchRequest({ siteName: 'Invasor' }));

    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe('UNAUTHORIZED');
    expect(mocks.siteConfig.update).not.toHaveBeenCalled();
  });

  it('devolve 403 para EDITOR (BR-001/BR-002)', async () => {
    mocks.auth.result = EDITOR_DENIED;

    const response = await PATCH(patchRequest({ siteName: 'Editor tentando' }));

    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe('FORBIDDEN');
    expect(mocks.siteConfig.update).not.toHaveBeenCalled();
  });

  it('atualiza parcialmente para ADMIN e devolve a configuração serializada', async () => {
    const response = await PATCH(
      patchRequest({ siteName: 'Reiners Studio', primaryColor: '#9a7b35' }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(siteConfigResponseSchema.safeParse(body).success).toBe(true);
    expect(body.data.siteName).toBe('Reiners Studio');
    expect(body.data.primaryColor).toBe('#9a7b35');
    expect(body.data.updatedAt).toBe('2026-08-02T12:00:00.000Z');
    expect(mocks.siteConfig.update).toHaveBeenCalledWith({
      where: { id: CONFIG_ROW.id },
      data: { siteName: 'Reiners Studio', primaryColor: '#9a7b35' },
    });
  });

  it('aceita anular campos opcionais', async () => {
    const response = await PATCH(patchRequest({ seoTitle: null }));

    expect(response.status).toBe(200);
    expect(mocks.siteConfig.update).toHaveBeenCalledWith({
      where: { id: CONFIG_ROW.id },
      data: { seoTitle: null },
    });
  });

  it.each([
    ['cor fora do padrão hex', { primaryColor: 'azul' }],
    ['siteName vazio', { siteName: '' }],
    ['seoTitle longo demais', { seoTitle: 'x'.repeat(71) }],
    ['logoUrl com path traversal', { logoUrl: '/../../etc/passwd' }],
    ['logoUrl javascript:', { logoUrl: 'javascript:alert(1)' }],
    ['chave desconhecida (schema .strict())', { naoExiste: true }],
    ['tentativa de poluição de protótipo', '{"__proto__":{"role":"ADMIN"}}'],
  ])('recusa payload inválido com 422: %s', async (_label, body) => {
    const response = await PATCH(patchRequest(body));

    expect(response.status).toBe(422);
    expect((await response.json()).error.code).toBe('VALIDATION_ERROR');
    expect(mocks.siteConfig.update).not.toHaveBeenCalled();
  });

  it('recusa PATCH sem nenhum campo', async () => {
    const response = await PATCH(patchRequest({}));

    expect(response.status).toBe(422);
    expect((await response.json()).error.message).toContain('ao menos um campo');
    expect(mocks.siteConfig.update).not.toHaveBeenCalled();
  });

  it('recusa corpo malformado com 400', async () => {
    const response = await PATCH(patchRequest('{ nao e json'));
    expect(response.status).toBe(400);
  });

  it('responde 404 quando a configuração ainda não existe', async () => {
    mocks.siteConfig.findFirst.mockResolvedValueOnce(null);

    const response = await PATCH(patchRequest({ siteName: 'Reiners Studio' }));

    expect(response.status).toBe(404);
    expect(mocks.siteConfig.update).not.toHaveBeenCalled();
  });

  it('responde 409 quando o registro some no meio da escrita concorrente', async () => {
    mocks.siteConfig.update.mockRejectedValueOnce(
      Object.assign(new Error('Record to update not found'), { code: 'P2025' }),
    );

    const response = await PATCH(patchRequest({ siteName: 'Reiners Studio' }));

    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe('CONFLICT');
  });

  it('aplica rate limit na escrita administrativa', async () => {
    const ip = '198.51.100.44';
    let blocked: Response | null = null;

    for (let attempt = 0; attempt < ADMIN_LIMIT + 5; attempt += 1) {
      const response = await PATCH(patchRequest({ siteName: `Nome ${attempt}` }, ip));
      if (response.status === 429) {
        blocked = response;
        break;
      }
      expect(response.status).toBe(200);
    }

    expect(blocked).not.toBeNull();
    expect((await blocked!.json()).error.code).toBe('RATE_LIMITED');
    expect(blocked!.headers.get('Retry-After')).not.toBeNull();
  });
});

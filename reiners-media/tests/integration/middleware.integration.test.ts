// @vitest-environment node
/**
 * TCK-004 — testes de integração de `src/middleware.ts`.
 *
 * Cada teste constrói um `NextRequest` real, chama a função `middleware`
 * exportada e inspeciona a resposta que o Next.js receberia: status, `Location`,
 * cabeçalhos de segurança, corpo JSON de erro e cookies.
 *
 * O client Supabase é mockado (não há Supabase neste ambiente), mas toda a
 * lógica de decisão — proteção de `/admin/*`, 401 nas APIs mutantes, BR-001 e
 * BR-002 — é a de produção.
 */
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { NextRequest, type NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/supabase')>();
  return {
    ...actual,
    createMiddlewareSupabaseClient: vi.fn(),
  };
});

import { errorResponseSchema } from '@/lib/schemas';
import { createMiddlewareSupabaseClient } from '@/lib/supabase';
import {
  ADMIN_LOGIN_PATH,
  buildContentSecurityPolicy,
  config,
  middleware,
  securityHeaders,
} from '@/middleware';

const USER_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

function makeUser(role: string | null = 'ADMIN'): User {
  return {
    id: USER_ID,
    aud: 'authenticated',
    email: 'admin@reiners.media',
    app_metadata: role ? { role } : {},
    user_metadata: {},
    created_at: '2024-01-01T00:00:00.000Z',
  };
}

const getUser = vi.fn();
/** Cookie que o client de middleware "renova" durante o `getUser`. */
let cookieToRefresh: { name: string; value: string } | null = null;

function givenSupabaseUser(user: User | null): void {
  getUser.mockResolvedValue(
    user ? { data: { user }, error: null } : { data: { user: null }, error: { message: 'no user' } },
  );
}

function request(
  pathname: string,
  init: { method?: string; search?: string } = {},
): NextRequest {
  return new NextRequest(`https://reiners.media${pathname}${init.search ?? ''}`, {
    method: init.method ?? 'GET',
  });
}

function isPassThrough(response: NextResponse): boolean {
  return response.headers.get('x-middleware-next') === '1';
}

beforeEach(() => {
  vi.clearAllMocks();
  cookieToRefresh = null;
  givenSupabaseUser(null);

  vi.mocked(createMiddlewareSupabaseClient).mockImplementation((_request, response) => {
    if (cookieToRefresh) {
      response.cookies.set(cookieToRefresh.name, cookieToRefresh.value, { httpOnly: true });
    }
    return { auth: { getUser } } as unknown as SupabaseClient;
  });
});

/* -------------------------------------------------------------------------- */
/* Proteção de /admin/*                                                       */
/* -------------------------------------------------------------------------- */

describe('/admin/* — sessão obrigatória', () => {
  it('redireciona o não-autenticado para o login com o parâmetro next', async () => {
    const response = await middleware(request('/admin/dashboard'));

    expect(response.status).toBe(307);
    const location = new URL(response.headers.get('location') ?? '');
    expect(location.pathname).toBe(ADMIN_LOGIN_PATH);
    expect(location.searchParams.get('next')).toBe('/admin/dashboard');
  });

  it('preserva a querystring do destino no parâmetro next', async () => {
    const response = await middleware(request('/admin/podcasts', { search: '?page=2&sort=title' }));

    const location = new URL(response.headers.get('location') ?? '');
    expect(location.searchParams.get('next')).toBe('/admin/podcasts?page=2&sort=title');
  });

  it('o parâmetro next é sempre um caminho relativo (sem open redirect)', async () => {
    const response = await middleware(request('/admin/dashboard'));
    const next = new URL(response.headers.get('location') ?? '').searchParams.get('next') ?? '';

    expect(next.startsWith('/')).toBe(true);
    expect(next.startsWith('//')).toBe(false);
    expect(next).not.toContain('://');
  });

  it('não protege a própria página de login (evita loop de redirect)', async () => {
    const response = await middleware(request(ADMIN_LOGIN_PATH));

    expect(isPassThrough(response)).toBe(true);
    expect(createMiddlewareSupabaseClient).not.toHaveBeenCalled();
  });

  it('deixa passar o usuário autenticado', async () => {
    givenSupabaseUser(makeUser('EDITOR'));

    const response = await middleware(request('/admin/podcasts'));
    expect(isPassThrough(response)).toBe(true);
    expect(response.status).toBe(200);
  });

  it('trata usuário sem papel administrativo como não autenticado', async () => {
    givenSupabaseUser(makeUser(null));

    const response = await middleware(request('/admin'));
    expect(response.status).toBe(307);
  });

  it('falha fechado quando o Supabase está indisponível (sem 500 e sem stack)', async () => {
    vi.mocked(createMiddlewareSupabaseClient).mockImplementation(() => {
      throw new Error('Configuração Supabase ausente: NEXT_PUBLIC_SUPABASE_URL');
    });

    const page = await middleware(request('/admin/dashboard'));
    expect(page.status).toBe(307);

    const api = await middleware(request('/api/podcasts', { method: 'POST' }));
    const raw = await api.text();
    expect(api.status).toBe(401);
    expect(raw).not.toContain('NEXT_PUBLIC_SUPABASE_URL');
  });

  it('não intercepta páginas públicas', async () => {
    const response = await middleware(request('/portfolio/horizonte-digital'));

    expect(isPassThrough(response)).toBe(true);
    expect(createMiddlewareSupabaseClient).not.toHaveBeenCalled();
  });
});

/* -------------------------------------------------------------------------- */
/* Proteção das APIs mutantes                                                 */
/* -------------------------------------------------------------------------- */

describe('APIs mutantes — 401 sem sessão', () => {
  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])(
    '%s /api/podcasts sem sessão devolve 401 no envelope padronizado',
    async (method) => {
      const response = await middleware(request('/api/podcasts', { method }));
      const body = await response.json();

      expect(response.status).toBe(401);
      expect(response.headers.get('content-type')).toContain('application/json');
      expect(errorResponseSchema.safeParse(body).success).toBe(true);
      expect(body.error.code).toBe('UNAUTHORIZED');
    },
  );

  it('não bloqueia leitura pública', async () => {
    const response = await middleware(request('/api/podcasts'));

    expect(isPassThrough(response)).toBe(true);
    expect(createMiddlewareSupabaseClient).not.toHaveBeenCalled();
  });

  it.each(['/api/auth/login', '/api/events'])(
    'POST %s é público (mutação sem sessão permitida)',
    async (pathname) => {
      const response = await middleware(request(pathname, { method: 'POST' }));

      expect(isPassThrough(response)).toBe(true);
      expect(createMiddlewareSupabaseClient).not.toHaveBeenCalled();
    },
  );

  it('POST /api/auth/logout exige sessão', async () => {
    const response = await middleware(request('/api/auth/logout', { method: 'POST' }));
    expect(response.status).toBe(401);
  });

  it('deixa passar a mutação de um EDITOR autenticado', async () => {
    givenSupabaseUser(makeUser('EDITOR'));

    const response = await middleware(request('/api/podcasts', { method: 'POST' }));
    expect(isPassThrough(response)).toBe(true);
  });

  it('a resposta 401 não vaza detalhe interno', async () => {
    const raw = await (await middleware(request('/api/podcasts', { method: 'POST' }))).text();

    expect(raw).not.toContain('supabase');
    expect(raw).not.toContain('Supabase');
    expect(raw).not.toMatch(/at .*\.ts:\d+/);
  });
});

/* -------------------------------------------------------------------------- */
/* BR-002 — EDITOR não deleta                                                 */
/* -------------------------------------------------------------------------- */

describe('BR-002 — EDITOR não deleta', () => {
  it('DELETE de EDITOR devolve 403 citando a regra', async () => {
    givenSupabaseUser(makeUser('EDITOR'));

    const response = await middleware(
      request('/api/podcasts/11111111-2222-4333-8444-555555555555', { method: 'DELETE' }),
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(errorResponseSchema.safeParse(body).success).toBe(true);
    expect(body.error.code).toBe('FORBIDDEN');
    expect(body.error.message).toContain('BR-002');
    expect(body.error.details.rule).toBe('BR-002');
  });

  it('DELETE de ADMIN passa', async () => {
    givenSupabaseUser(makeUser('ADMIN'));

    const response = await middleware(
      request('/api/episodes/11111111-2222-4333-8444-555555555555', { method: 'DELETE' }),
    );
    expect(isPassThrough(response)).toBe(true);
  });

  it('EDITOR continua podendo criar e editar', async () => {
    givenSupabaseUser(makeUser('EDITOR'));

    expect(isPassThrough(await middleware(request('/api/episodes', { method: 'POST' })))).toBe(true);
    expect(isPassThrough(await middleware(request('/api/episodes/1', { method: 'PATCH' })))).toBe(
      true,
    );
  });
});

/* -------------------------------------------------------------------------- */
/* BR-001 — ADMIN gerencia usuários                                           */
/* -------------------------------------------------------------------------- */

describe('BR-001 — ADMIN gerencia usuários', () => {
  it('POST /api/admin/users de EDITOR devolve 403', async () => {
    givenSupabaseUser(makeUser('EDITOR'));

    const response = await middleware(request('/api/admin/users', { method: 'POST' }));
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error.message).toContain('BR-001');
    expect(body.error.details.rule).toBe('BR-001');
  });

  it('POST /api/admin/users de ADMIN passa', async () => {
    givenSupabaseUser(makeUser('ADMIN'));

    const response = await middleware(request('/api/admin/users', { method: 'POST' }));
    expect(isPassThrough(response)).toBe(true);
  });

  it('EDITOR autenticado é desviado da página /admin/users', async () => {
    givenSupabaseUser(makeUser('EDITOR'));

    const response = await middleware(request('/admin/users'));
    const location = new URL(response.headers.get('location') ?? '');

    expect(response.status).toBe(307);
    expect(location.pathname).toBe('/admin');
    expect(location.searchParams.get('error')).toBe('forbidden');
  });

  it('ADMIN acessa a página /admin/users', async () => {
    givenSupabaseUser(makeUser('ADMIN'));

    expect(isPassThrough(await middleware(request('/admin/users')))).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* Cookies renovados                                                          */
/* -------------------------------------------------------------------------- */

describe('renovação de sessão', () => {
  it('preserva o cookie renovado pelo Supabase na resposta de redirect', async () => {
    cookieToRefresh = { name: 'sb-projeto-auth-token', value: 'token-renovado' };

    const response = await middleware(request('/admin/dashboard'));

    expect(response.status).toBe(307);
    expect(response.cookies.get('sb-projeto-auth-token')?.value).toBe('token-renovado');
  });

  it('preserva o cookie renovado na resposta 403', async () => {
    givenSupabaseUser(makeUser('EDITOR'));
    cookieToRefresh = { name: 'sb-projeto-auth-token', value: 'token-renovado' };

    const response = await middleware(request('/api/podcasts/1', { method: 'DELETE' }));

    expect(response.status).toBe(403);
    expect(response.cookies.get('sb-projeto-auth-token')?.value).toBe('token-renovado');
  });
});

/* -------------------------------------------------------------------------- */
/* Cabeçalhos de segurança (NFR-005)                                          */
/* -------------------------------------------------------------------------- */

describe('cabeçalhos de segurança', () => {
  const expectHardened = (response: NextResponse): void => {
    const csp = response.headers.get('content-security-policy') ?? '';
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self' 'unsafe-inline'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('x-frame-options')).toBe('DENY');
    expect(response.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
    expect(response.headers.get('permissions-policy')).toContain('camera=()');
  };

  it('aplica em página pública', async () => {
    expectHardened(await middleware(request('/')));
  });

  it('aplica na resposta de redirect para o login', async () => {
    expectHardened(await middleware(request('/admin/dashboard')));
  });

  it('aplica na resposta 401 de API', async () => {
    expectHardened(await middleware(request('/api/podcasts', { method: 'POST' })));
  });

  it('aplica na resposta 403 de BR-002', async () => {
    givenSupabaseUser(makeUser('EDITOR'));
    expectHardened(await middleware(request('/api/podcasts/1', { method: 'DELETE' })));
  });

  it('libera os embeds de YouTube e Spotify e o Supabase', () => {
    const csp = buildContentSecurityPolicy(false);
    expect(csp).toContain('https://www.youtube.com');
    expect(csp).toContain('https://open.spotify.com');
    expect(csp).toContain('https://*.supabase.co');
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("form-action 'self'");
  });

  it('só adiciona HSTS e upgrade-insecure-requests em produção', () => {
    expect(securityHeaders(false)['Strict-Transport-Security']).toBeUndefined();
    expect(buildContentSecurityPolicy(false)).not.toContain('upgrade-insecure-requests');

    expect(securityHeaders(true)['Strict-Transport-Security']).toContain('max-age=63072000');
    expect(buildContentSecurityPolicy(true)).toContain('upgrade-insecure-requests');
  });
});

/* -------------------------------------------------------------------------- */
/* Matcher                                                                    */
/* -------------------------------------------------------------------------- */

describe('config.matcher', () => {
  const matcher = new RegExp(`^${config.matcher[0]}$`);

  it.each([
    '/',
    '/admin',
    '/admin/dashboard',
    '/api/podcasts',
    '/portfolio/horizonte-digital',
  ])('intercepta %s', (pathname) => {
    expect(matcher.test(pathname)).toBe(true);
  });

  it.each([
    '/_next/static/chunks/main.js',
    '/_next/image',
    '/favicon.ico',
    '/robots.txt',
    '/sitemap.xml',
    '/images/podcasts/capa.jpg',
    '/fonts/borna.woff2',
    '/logo.svg',
    '/styles.css',
  ])('não intercepta o asset %s', (pathname) => {
    expect(matcher.test(pathname)).toBe(false);
  });
});

// @vitest-environment node
/**
 * TCK-004 — testes de integração das rotas `src/app/api/auth/**`.
 *
 * Não há PostgreSQL nem Supabase neste ambiente, então o CLIENT do Supabase é
 * mockado — mas os handlers exercitados são os de produção: cada teste monta um
 * `NextRequest` de verdade, chama a função exportada da rota e assere status,
 * cabeçalhos e corpo contra os schemas de `contracts/api/auth.yaml`.
 */
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/supabase')>();
  return {
    ...actual,
    createRouteHandlerSupabaseClient: vi.fn(),
  };
});

import { clearRateLimit, requireAuth, requireRole } from '@/lib/auth-helpers';
import {
  errorResponseSchema,
  logoutResponseSchema,
  sessionResponseSchema,
} from '@/lib/schemas';
import { createRouteHandlerSupabaseClient } from '@/lib/supabase';
import { POST as loginRoute } from '@/app/api/auth/login/route';
import { POST as logoutRoute } from '@/app/api/auth/logout/route';
import { GET as sessionRoute } from '@/app/api/auth/session/route';

const USER_ID = '11111111-2222-4333-8444-555555555555';
const PASSWORD = 'senha-super-secreta-123';
const EXPIRES_AT = 1_800_000_000;

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: USER_ID,
    aud: 'authenticated',
    email: 'admin@reiners.media',
    app_metadata: { role: 'ADMIN' },
    user_metadata: { name: 'Marina Reiners' },
    created_at: '2024-01-01T00:00:00.000Z',
    last_sign_in_at: '2024-06-01T12:00:00.000Z',
    ...overrides,
  };
}

const signInWithPassword = vi.fn();
const getUser = vi.fn();
const getSession = vi.fn();
const signOut = vi.fn();

const supabaseStub = {
  auth: { signInWithPassword, getUser, getSession, signOut },
} as unknown as SupabaseClient;

/** Sessão autenticada no stub (usado por `getSession`/`requireAuth`). */
function givenAuthenticatedUser(user: User = makeUser()): void {
  getUser.mockResolvedValue({ data: { user }, error: null });
  getSession.mockResolvedValue({ data: { session: { expires_at: EXPIRES_AT } }, error: null });
}

function givenAnonymous(): void {
  getUser.mockResolvedValue({ data: { user: null }, error: { message: 'no session' } });
  getSession.mockResolvedValue({ data: { session: null }, error: null });
}

function loginRequest(body: unknown, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest('https://reiners.media/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.10', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function logoutRequest(cookie?: string): NextRequest {
  return new NextRequest('https://reiners.media/api/auth/logout', {
    method: 'POST',
    headers: {
      'x-forwarded-for': '203.0.113.20',
      ...(cookie ? { cookie } : {}),
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  clearRateLimit();
  vi.mocked(createRouteHandlerSupabaseClient).mockResolvedValue(supabaseStub);
  signOut.mockResolvedValue({ error: null });
  givenAnonymous();
});

/* -------------------------------------------------------------------------- */
/* POST /api/auth/login                                                       */
/* -------------------------------------------------------------------------- */

describe('POST /api/auth/login', () => {
  it('autentica e devolve a sessão no formato do contrato', async () => {
    const user = makeUser();
    signInWithPassword.mockResolvedValue({
      data: { user, session: { expires_at: EXPIRES_AT } },
      error: null,
    });

    const response = await loginRoute(loginRequest({ email: user.email, password: PASSWORD }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(sessionResponseSchema.safeParse(body).success).toBe(true);
    expect(body.data.authenticated).toBe(true);
    expect(body.data.user.role).toBe('ADMIN');
    expect(body.data.user.id).toBe(USER_ID);
    expect(body.data.expiresAt).toBe(new Date(EXPIRES_AT * 1000).toISOString());
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(signInWithPassword).toHaveBeenCalledWith({
      email: 'admin@reiners.media',
      password: PASSWORD,
    });
  });

  it('devolve o papel EDITOR quando é esse o claim de app_metadata', async () => {
    signInWithPassword.mockResolvedValue({
      data: {
        user: makeUser({ app_metadata: { role: 'EDITOR' } }),
        session: { expires_at: EXPIRES_AT },
      },
      error: null,
    });

    const response = await loginRoute(
      loginRequest({ email: 'editor@reiners.media', password: PASSWORD }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.user.role).toBe('EDITOR');
  });

  it('devolve 401 genérico para credenciais inválidas, sem repassar o erro do Supabase', async () => {
    signInWithPassword.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: 'Invalid login credentials for user admin@reiners.media' },
    });

    const response = await loginRoute(loginRequest({ email: 'a@b.com', password: PASSWORD }));
    const raw = await response.text();

    expect(response.status).toBe(401);
    expect(errorResponseSchema.safeParse(JSON.parse(raw)).success).toBe(true);
    expect(JSON.parse(raw).error.code).toBe('UNAUTHORIZED');
    expect(raw).not.toContain('Invalid login credentials');
    expect(raw).not.toContain('a@b.com');
  });

  it('devolve 403 e derruba a sessão quando o usuário não tem papel administrativo', async () => {
    signInWithPassword.mockResolvedValue({
      data: {
        user: makeUser({ app_metadata: {}, user_metadata: { role: 'ADMIN' } }),
        session: { expires_at: EXPIRES_AT },
      },
      error: null,
    });

    const response = await loginRoute(loginRequest({ email: 'x@y.com', password: PASSWORD }));
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error.code).toBe('FORBIDDEN');
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it('devolve 422 e nunca ecoa a senha enviada', async () => {
    const response = await loginRoute(loginRequest({ email: 'nao-e-email', password: 'curta' }));
    const raw = await response.text();

    expect(response.status).toBe(422);
    expect(JSON.parse(raw).error.code).toBe('VALIDATION_ERROR');
    expect(errorResponseSchema.safeParse(JSON.parse(raw)).success).toBe(true);
    expect(raw).not.toContain('curta');
    expect(raw).not.toContain('nao-e-email');
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it('devolve 422 para campo desconhecido (loginSchema é strict)', async () => {
    const response = await loginRoute(
      loginRequest({ email: 'a@b.com', password: PASSWORD, role: 'ADMIN' }),
    );

    expect(response.status).toBe(422);
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it('devolve 400 para JSON malformado', async () => {
    const response = await loginRoute(loginRequest('{ isso nao e json'));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe('BAD_REQUEST');
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it('bloqueia com 429 depois de 5 tentativas do mesmo IP no mesmo minuto', async () => {
    signInWithPassword.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: 'Invalid login credentials' },
    });

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const response = await loginRoute(loginRequest({ email: 'a@b.com', password: PASSWORD }));
      expect(response.status).toBe(401);
    }

    const blocked = await loginRoute(loginRequest({ email: 'a@b.com', password: PASSWORD }));
    const body = await blocked.json();

    expect(blocked.status).toBe(429);
    expect(body.error.code).toBe('RATE_LIMITED');
    expect(blocked.headers.get('retry-after')).toBeTruthy();
    /* A 6ª tentativa nem chega ao Supabase. */
    expect(signInWithPassword).toHaveBeenCalledTimes(5);
  });

  it('conta o rate limit por IP: outro IP continua liberado', async () => {
    signInWithPassword.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: 'Invalid login credentials' },
    });

    for (let attempt = 1; attempt <= 6; attempt += 1) {
      await loginRoute(loginRequest({ email: 'a@b.com', password: PASSWORD }));
    }

    const other = await loginRoute(
      loginRequest({ email: 'a@b.com', password: PASSWORD }, { 'x-forwarded-for': '198.51.100.1' }),
    );
    expect(other.status).toBe(401);
  });

  it('login bem-sucedido zera o contador de tentativas do IP', async () => {
    signInWithPassword.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: 'Invalid login credentials' },
    });
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      await loginRoute(loginRequest({ email: 'a@b.com', password: PASSWORD }));
    }

    signInWithPassword.mockResolvedValue({
      data: { user: makeUser(), session: { expires_at: EXPIRES_AT } },
      error: null,
    });
    expect((await loginRoute(loginRequest({ email: 'a@b.com', password: PASSWORD }))).status).toBe(
      200,
    );

    signInWithPassword.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: 'Invalid login credentials' },
    });
    /* Sem o reset, esta seria a 6ª marca da janela e voltaria 429. */
    expect((await loginRoute(loginRequest({ email: 'a@b.com', password: PASSWORD }))).status).toBe(
      401,
    );
  });
});

/* -------------------------------------------------------------------------- */
/* GET /api/auth/session                                                      */
/* -------------------------------------------------------------------------- */

describe('GET /api/auth/session', () => {
  it('devolve 200 com authenticated=false sem cookie válido', async () => {
    const response = await sessionRoute();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(sessionResponseSchema.safeParse(body).success).toBe(true);
    expect(body.data).toEqual({ authenticated: false, user: null, expiresAt: null });
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('devolve o usuário autenticado e a expiração', async () => {
    givenAuthenticatedUser();

    const response = await sessionRoute();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(sessionResponseSchema.safeParse(body).success).toBe(true);
    expect(body.data.authenticated).toBe(true);
    expect(body.data.user.email).toBe('admin@reiners.media');
    expect(body.data.expiresAt).toBe(new Date(EXPIRES_AT * 1000).toISOString());
  });

  it('trata usuário autenticado SEM papel administrativo como anônimo', async () => {
    givenAuthenticatedUser(makeUser({ app_metadata: {}, user_metadata: { role: 'ADMIN' } }));

    const body = await (await sessionRoute()).json();
    expect(body.data.authenticated).toBe(false);
    expect(body.data.user).toBeNull();
  });

  it('nunca vaza detalhe de falha interna: responde 200 anônimo', async () => {
    vi.mocked(createRouteHandlerSupabaseClient).mockRejectedValue(
      new Error('Configuração Supabase ausente: NEXT_PUBLIC_SUPABASE_URL'),
    );

    const response = await sessionRoute();
    const raw = await response.text();

    expect(response.status).toBe(200);
    expect(raw).not.toContain('NEXT_PUBLIC_SUPABASE_URL');
    expect(JSON.parse(raw).data.authenticated).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* POST /api/auth/logout                                                      */
/* -------------------------------------------------------------------------- */

describe('POST /api/auth/logout', () => {
  it('devolve 401 sem sessão e não chama signOut', async () => {
    const response = await logoutRoute(logoutRequest());
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(errorResponseSchema.safeParse(body).success).toBe(true);
    expect(body.error.code).toBe('UNAUTHORIZED');
    expect(signOut).not.toHaveBeenCalled();
  });

  it('encerra a sessão e expira os cookies do Supabase', async () => {
    givenAuthenticatedUser();

    const response = await logoutRoute(
      logoutRequest('sb-projeto-auth-token=abc; outro-cookie=mantem'),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(logoutResponseSchema.safeParse(body).success).toBe(true);
    expect(body.data.success).toBe(true);
    expect(signOut).toHaveBeenCalledTimes(1);

    const cleared = response.cookies.get('sb-projeto-auth-token');
    expect(cleared?.value).toBe('');
    expect(cleared?.maxAge).toBe(0);
    expect(cleared?.httpOnly).toBe(true);
    expect(cleared?.sameSite).toBe('strict');
    /* Cookies alheios ao Supabase não são tocados. */
    expect(response.cookies.get('outro-cookie')).toBeUndefined();
  });
});

/* -------------------------------------------------------------------------- */
/* Guards consumidos por TCK-005/006/017/018/019                              */
/* -------------------------------------------------------------------------- */

describe('requireAuth / requireRole', () => {
  const deleteRequest = new Request(
    'https://reiners.media/api/podcasts/11111111-2222-4333-8444-555555555555',
    { method: 'DELETE' },
  );
  const postRequest = new Request('https://reiners.media/api/podcasts', { method: 'POST' });

  it('requireAuth devolve 401 sem sessão', async () => {
    const auth = await requireAuth();

    expect(auth.ok).toBe(false);
    if (auth.ok) return;
    expect(auth.response.status).toBe(401);
    expect((await auth.response.json()).error.code).toBe('UNAUTHORIZED');
  });

  it('requireAuth devolve o usuário autenticado', async () => {
    givenAuthenticatedUser();

    const auth = await requireAuth({ request: postRequest });
    expect(auth.ok).toBe(true);
    if (!auth.ok) return;
    expect(auth.user.role).toBe('ADMIN');
    expect(auth.session.authenticated).toBe(true);
  });

  it('requireRole(ADMIN) barra um EDITOR com 403', async () => {
    givenAuthenticatedUser(makeUser({ app_metadata: { role: 'EDITOR' } }));

    const auth = await requireRole('ADMIN');
    expect(auth.ok).toBe(false);
    if (auth.ok) return;
    expect(auth.response.status).toBe(403);
    expect((await auth.response.json()).error.code).toBe('FORBIDDEN');
  });

  it('BR-002: requireRole(EDITOR) barra DELETE de EDITOR com 403', async () => {
    givenAuthenticatedUser(makeUser({ app_metadata: { role: 'EDITOR' } }));

    const auth = await requireRole('EDITOR', { request: deleteRequest });
    expect(auth.ok).toBe(false);
    if (auth.ok) return;

    const body = await auth.response.json();
    expect(auth.response.status).toBe(403);
    expect(body.error.message).toContain('BR-002');
    expect(body.error.details.rule).toBe('BR-002');
  });

  it('BR-002: o mesmo DELETE passa para ADMIN', async () => {
    givenAuthenticatedUser();

    expect((await requireRole('EDITOR', { request: deleteRequest })).ok).toBe(true);
  });

  it('EDITOR continua autorizado a criar', async () => {
    givenAuthenticatedUser(makeUser({ app_metadata: { role: 'EDITOR' } }));

    expect((await requireRole('EDITOR', { request: postRequest })).ok).toBe(true);
  });

  it('BR-001: requireRole barra EDITOR na gestão de usuários', async () => {
    givenAuthenticatedUser(makeUser({ app_metadata: { role: 'EDITOR' } }));

    const auth = await requireRole('EDITOR', {
      request: new Request('https://reiners.media/api/admin/users', { method: 'POST' }),
    });

    expect(auth.ok).toBe(false);
    if (auth.ok) return;
    expect((await auth.response.json()).error.details.rule).toBe('BR-001');
  });

  it('aceita a forma posicional requireAuth(request, { role })', async () => {
    givenAuthenticatedUser(makeUser({ app_metadata: { role: 'EDITOR' } }));

    expect((await requireAuth(postRequest, { role: 'EDITOR' })).ok).toBe(true);

    const denied = await requireAuth(postRequest, { role: 'ADMIN' });
    expect(denied.ok).toBe(false);
    if (denied.ok) return;
    expect(denied.response.status).toBe(403);
  });
});

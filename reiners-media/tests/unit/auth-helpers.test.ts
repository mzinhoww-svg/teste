// @vitest-environment node
/**
 * TCK-004 — testes unitários de `src/lib/auth-helpers.ts`.
 *
 * Ambiente `node` (e não o jsdom padrão do projeto) porque `next/server`
 * depende de `Request`/`Response`/`Headers` do runtime, que o jsdom não
 * implementa.
 *
 * Foco: as decisões que, se sumirem, viram falha de segurança —
 * BR-001, BR-002, origem do papel (`app_metadata` x `user_metadata`), janela
 * deslizante do rate limiter e ausência de vazamento nas respostas de erro.
 */
import type { User } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  ADMIN_ONLY_PATH_PREFIXES,
  ANONYMOUS_SESSION,
  GENERIC_ERROR_MESSAGES,
  RATE_LIMIT_POLICIES,
  ROLE_RANK,
  authorize,
  clearRateLimit,
  consumeRateLimit,
  enforceRateLimit,
  errorBody,
  errorResponse,
  getClientIp,
  hasRoleRank,
  isAdminOnlyPath,
  isDestructiveMethod,
  isMutatingMethod,
  mapSupabaseUser,
  rateLimitHeaders,
  rateLimitKey,
  readAdminRole,
  safeIssueDetails,
  toExpiresAt,
} from '@/lib/auth-helpers';
import { ERROR_STATUS_BY_CODE, adminUserSchema, errorResponseSchema, loginSchema } from '@/lib/schemas';

const USER_ID = '9f8e7d6c-5b4a-4321-9876-543210fedcba';

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

function makeHeaders(init: Record<string, string> = {}): { headers: Headers } {
  return { headers: new Headers(init) };
}

describe('errorBody / errorResponse', () => {
  it('produz o envelope padronizado da API', () => {
    const body = errorBody('UNAUTHORIZED');
    expect(errorResponseSchema.safeParse(body).success).toBe(true);
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it.each(Object.keys(ERROR_STATUS_BY_CODE) as (keyof typeof ERROR_STATUS_BY_CODE)[])(
    'usa o status canônico de ERROR_STATUS_BY_CODE para %s',
    (code) => {
      expect(errorResponse(code).status).toBe(ERROR_STATUS_BY_CODE[code]);
    },
  );

  it('responde JSON com Cache-Control no-store', async () => {
    const response = errorResponse('FORBIDDEN');
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(errorResponseSchema.safeParse(await response.json()).success).toBe(true);
  });

  it('não expõe nenhuma mensagem genérica vazia', () => {
    for (const message of Object.values(GENERIC_ERROR_MESSAGES)) {
      expect(message.length).toBeGreaterThan(0);
    }
  });
});

describe('safeIssueDetails', () => {
  it('devolve apenas caminho e código, nunca o valor enviado', () => {
    const parsed = loginSchema.safeParse({ email: 'nao-e-email', password: 'senha-super-secreta' });
    expect(parsed.success).toBe(false);
    if (parsed.success) return;

    const details = safeIssueDetails(parsed.error.issues);
    expect(JSON.stringify(details)).not.toContain('senha-super-secreta');
    expect(JSON.stringify(details)).not.toContain('nao-e-email');
    expect(details).toEqual({ fields: [{ path: 'email', code: 'invalid_string' }] });
  });
});

describe('RBAC — hierarquia de papéis', () => {
  it('ADMIN tem rank maior que EDITOR', () => {
    expect(ROLE_RANK.ADMIN).toBeGreaterThan(ROLE_RANK.EDITOR);
  });

  it('EDITOR não satisfaz uma exigência de ADMIN', () => {
    expect(hasRoleRank('EDITOR', 'ADMIN')).toBe(false);
    expect(hasRoleRank('ADMIN', 'ADMIN')).toBe(true);
    expect(hasRoleRank('ADMIN', 'EDITOR')).toBe(true);
    expect(hasRoleRank('EDITOR', 'EDITOR')).toBe(true);
  });
});

describe('RBAC — métodos', () => {
  it.each(['POST', 'PUT', 'PATCH', 'DELETE', 'delete'])('%s é mutante', (method) => {
    expect(isMutatingMethod(method)).toBe(true);
  });

  it.each(['GET', 'HEAD', 'OPTIONS'])('%s não é mutante', (method) => {
    expect(isMutatingMethod(method)).toBe(false);
  });

  it('apenas DELETE é destrutivo', () => {
    expect(isDestructiveMethod('DELETE')).toBe(true);
    expect(isDestructiveMethod('delete')).toBe(true);
    expect(isDestructiveMethod('PATCH')).toBe(false);
  });
});

describe('BR-001 — ADMIN gerencia usuários', () => {
  it.each(ADMIN_ONLY_PATH_PREFIXES)('%s é caminho exclusivo de ADMIN', (prefix) => {
    expect(isAdminOnlyPath(prefix)).toBe(true);
    expect(isAdminOnlyPath(`${prefix}/123`)).toBe(true);
  });

  it('não confunde caminho vizinho com prefixo administrativo', () => {
    expect(isAdminOnlyPath('/api/usersession')).toBe(false);
    expect(isAdminOnlyPath('/api/podcasts')).toBe(false);
    expect(isAdminOnlyPath('/admin/podcasts')).toBe(false);
  });

  it('bloqueia EDITOR em GET /api/admin/users', () => {
    const decision = authorize('EDITOR', 'GET', '/api/admin/users');
    expect(decision.allowed).toBe(false);
    expect(decision.rule).toBe('BR-001');
  });

  it('bloqueia EDITOR até na página /admin/users', () => {
    expect(authorize('EDITOR', 'GET', '/admin/users').allowed).toBe(false);
  });

  it('libera ADMIN na gestão de usuários', () => {
    expect(authorize('ADMIN', 'POST', '/api/admin/users').allowed).toBe(true);
    expect(authorize('ADMIN', 'DELETE', '/api/admin/users/123').allowed).toBe(true);
  });
});

describe('BR-002 — EDITOR não deleta', () => {
  it('nega DELETE para EDITOR em qualquer recurso', () => {
    for (const pathname of ['/api/podcasts/1', '/api/episodes/1', '/api/site-config']) {
      const decision = authorize('EDITOR', 'DELETE', pathname);
      expect(decision.allowed).toBe(false);
      expect(decision.rule).toBe('BR-002');
      expect(decision.message).toContain('BR-002');
    }
  });

  it('permite ao EDITOR criar e editar', () => {
    expect(authorize('EDITOR', 'POST', '/api/podcasts').allowed).toBe(true);
    expect(authorize('EDITOR', 'PATCH', '/api/podcasts/1').allowed).toBe(true);
    expect(authorize('EDITOR', 'GET', '/api/podcasts').allowed).toBe(true);
  });

  it('permite DELETE para ADMIN', () => {
    expect(authorize('ADMIN', 'DELETE', '/api/podcasts/1').allowed).toBe(true);
  });
});

describe('readAdminRole', () => {
  it('lê o papel de app_metadata.role', () => {
    expect(readAdminRole({ app_metadata: { role: 'ADMIN' } })).toBe('ADMIN');
    expect(readAdminRole({ app_metadata: { role: 'EDITOR' } })).toBe('EDITOR');
  });

  it('aceita a chave alternativa admin_role', () => {
    expect(readAdminRole({ app_metadata: { admin_role: 'EDITOR' } })).toBe('EDITOR');
  });

  it('devolve null para papel desconhecido, vazio ou ausente', () => {
    expect(readAdminRole({ app_metadata: { role: 'SUPERADMIN' } })).toBeNull();
    expect(readAdminRole({ app_metadata: { role: 'admin' } })).toBeNull();
    expect(readAdminRole({ app_metadata: {} })).toBeNull();
  });
});

describe('mapSupabaseUser', () => {
  it('mapeia um ADMIN válido para o contrato AdminUser', () => {
    const user = mapSupabaseUser(makeUser());
    expect(user).not.toBeNull();
    expect(adminUserSchema.safeParse(user).success).toBe(true);
    expect(user?.role).toBe('ADMIN');
    expect(user?.email).toBe('admin@reiners.media');
    expect(user?.name).toBe('Marina Reiners');
    expect(user?.lastLoginAt).toBe('2024-06-01T12:00:00.000Z');
  });

  it('IGNORA role vindo de user_metadata (escalação de privilégio)', () => {
    const forged = makeUser({ app_metadata: {}, user_metadata: { role: 'ADMIN' } });
    expect(mapSupabaseUser(forged)).toBeNull();
  });

  it('não deixa user_metadata sobrescrever o papel de app_metadata', () => {
    const forged = makeUser({
      app_metadata: { role: 'EDITOR' },
      user_metadata: { role: 'ADMIN', name: 'Editor' },
    });
    expect(mapSupabaseUser(forged)?.role).toBe('EDITOR');
  });

  it('devolve null sem papel administrativo (least privilege, sem default EDITOR)', () => {
    expect(mapSupabaseUser(makeUser({ app_metadata: {} }))).toBeNull();
  });

  it('devolve null para identidade inválida', () => {
    expect(mapSupabaseUser(makeUser({ id: 'nao-e-uuid' }))).toBeNull();
    expect(mapSupabaseUser(makeUser({ email: undefined }))).toBeNull();
    expect(mapSupabaseUser(makeUser({ email: 'sem-arroba' }))).toBeNull();
    expect(mapSupabaseUser(null)).toBeNull();
    expect(mapSupabaseUser(undefined)).toBeNull();
  });

  it('normaliza datas para ISO-8601 com offset', () => {
    const user = mapSupabaseUser(
      makeUser({ created_at: '2024-03-04T05:06:07+00:00', last_sign_in_at: undefined }),
    );
    expect(user?.createdAt).toBe('2024-03-04T05:06:07.000Z');
    expect(user?.lastLoginAt).toBeNull();
  });

  it('trunca nome acima de 80 chars em vez de invalidar o usuário', () => {
    const user = mapSupabaseUser(makeUser({ user_metadata: { name: 'x'.repeat(200) } }));
    expect(user?.name).toHaveLength(80);
  });

  it('usa fallback full_name e trata nome em branco como null', () => {
    expect(mapSupabaseUser(makeUser({ user_metadata: { full_name: 'Ana' } }))?.name).toBe('Ana');
    expect(mapSupabaseUser(makeUser({ user_metadata: { name: '   ' } }))?.name).toBeNull();
  });
});

describe('toExpiresAt', () => {
  it('converte epoch em segundos para ISO', () => {
    expect(toExpiresAt(1_700_000_000)).toBe(new Date(1_700_000_000_000).toISOString());
  });

  it('devolve null para valor ausente ou inválido', () => {
    expect(toExpiresAt(undefined)).toBeNull();
    expect(toExpiresAt(null)).toBeNull();
    expect(toExpiresAt(Number.NaN)).toBeNull();
  });
});

describe('ANONYMOUS_SESSION', () => {
  it('não carrega usuário nem expiração', () => {
    expect(ANONYMOUS_SESSION).toEqual({ authenticated: false, user: null, expiresAt: null });
  });
});

describe('getClientIp', () => {
  it('usa o primeiro endereço de x-forwarded-for', () => {
    expect(getClientIp(makeHeaders({ 'x-forwarded-for': '203.0.113.5, 10.0.0.1, 10.0.0.2' }))).toBe(
      '203.0.113.5',
    );
  });

  it('cai para x-real-ip e depois para unknown', () => {
    expect(getClientIp(makeHeaders({ 'x-real-ip': '198.51.100.7' }))).toBe('198.51.100.7');
    expect(getClientIp(makeHeaders())).toBe('unknown');
  });
});

describe('rate limiter — janela deslizante', () => {
  beforeEach(() => {
    clearRateLimit();
  });

  const policy = { limit: 3, windowMs: 60_000 };

  it('permite até o limite e bloqueia a requisição seguinte', () => {
    const key = rateLimitKey('POST /api/auth/login', '203.0.113.5');
    const now = 1_000_000;

    for (let attempt = 1; attempt <= policy.limit; attempt += 1) {
      const result = consumeRateLimit(key, policy, now);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(policy.limit - attempt);
    }

    const blocked = consumeRateLimit(key, policy, now);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfterSeconds).toBe(60);
  });

  it('desliza: libera vaga 1ms após a marca mais antiga sair da janela', () => {
    const key = rateLimitKey('POST /api/auth/login', '203.0.113.9');
    const start = 5_000_000;

    consumeRateLimit(key, policy, start);
    consumeRateLimit(key, policy, start + 10_000);
    consumeRateLimit(key, policy, start + 20_000);

    /* Ainda dentro da janela da marca mais antiga: bloqueado. */
    expect(consumeRateLimit(key, policy, start + 59_999).allowed).toBe(false);
    /* A marca mais antiga expirou: exatamente uma vaga liberada. */
    expect(consumeRateLimit(key, policy, start + 60_001).allowed).toBe(true);
    expect(consumeRateLimit(key, policy, start + 60_002).allowed).toBe(false);
  });

  it('NÃO zera em bloco como uma janela fixa faria', () => {
    const key = rateLimitKey('rota', 'ip');
    const start = 9_000_000;

    for (let i = 0; i < policy.limit; i += 1) consumeRateLimit(key, policy, start + i);

    /* Numa janela fixa de 60s, o contador zeraria e as 3 vagas voltariam de uma
       vez. Aqui só a marca que realmente venceu (a de `start`) libera vaga: uma
       requisição passa, a seguinte já é barrada. */
    expect(consumeRateLimit(key, policy, start + 60_000).allowed).toBe(true);
    expect(consumeRateLimit(key, policy, start + 60_000).allowed).toBe(false);
  });

  it('isola chaves distintas por IP e por rota', () => {
    const policyOne = { limit: 1, windowMs: 60_000 };
    const now = 2_000_000;

    expect(consumeRateLimit(rateLimitKey('rota-a', '1.1.1.1'), policyOne, now).allowed).toBe(true);
    expect(consumeRateLimit(rateLimitKey('rota-a', '1.1.1.1'), policyOne, now).allowed).toBe(false);
    /* Outro IP na mesma rota não é afetado... */
    expect(consumeRateLimit(rateLimitKey('rota-a', '2.2.2.2'), policyOne, now).allowed).toBe(true);
    /* ...nem o mesmo IP em outra rota. */
    expect(consumeRateLimit(rateLimitKey('rota-b', '1.1.1.1'), policyOne, now).allowed).toBe(true);
  });

  it('clearRateLimit(key) libera apenas a chave informada', () => {
    const policyOne = { limit: 1, windowMs: 60_000 };
    const now = 3_000_000;
    const keyA = rateLimitKey('rota-a', '1.1.1.1');
    const keyB = rateLimitKey('rota-b', '1.1.1.1');

    consumeRateLimit(keyA, policyOne, now);
    consumeRateLimit(keyB, policyOne, now);
    clearRateLimit(keyA);

    expect(consumeRateLimit(keyA, policyOne, now).allowed).toBe(true);
    expect(consumeRateLimit(keyB, policyOne, now).allowed).toBe(false);
  });

  it('expõe as políticas de docs/SECURITY.md', () => {
    expect(RATE_LIMIT_POLICIES.login).toEqual({ limit: 5, windowMs: 60_000 });
    expect(RATE_LIMIT_POLICIES.publicApi).toEqual({ limit: 100, windowMs: 60_000 });
    expect(RATE_LIMIT_POLICIES.adminApi).toEqual({ limit: 60, windowMs: 60_000 });
    expect(RATE_LIMIT_POLICIES.upload).toEqual({ limit: 10, windowMs: 60_000 });
  });
});

describe('rateLimitHeaders', () => {
  it('só emite Retry-After quando bloqueado', () => {
    const allowed = rateLimitHeaders({
      allowed: true,
      limit: 5,
      remaining: 4,
      retryAfterSeconds: 0,
      resetAt: 60_000,
    });
    expect(allowed['Retry-After']).toBeUndefined();
    expect(allowed['X-RateLimit-Remaining']).toBe('4');

    const blocked = rateLimitHeaders({
      allowed: false,
      limit: 5,
      remaining: 0,
      retryAfterSeconds: 42,
      resetAt: 60_000,
    });
    expect(blocked['Retry-After']).toBe('42');
  });
});

describe('enforceRateLimit', () => {
  beforeEach(() => {
    clearRateLimit();
  });

  it('devolve null enquanto dentro do limite e 429 depois', async () => {
    const request = makeHeaders({ 'x-forwarded-for': '203.0.113.44' });
    const policy = { limit: 2, windowMs: 60_000 };

    expect(enforceRateLimit(request, 'rota', policy)).toBeNull();
    expect(enforceRateLimit(request, 'rota', policy)).toBeNull();

    const blocked = enforceRateLimit(request, 'rota', policy);
    expect(blocked).not.toBeNull();
    expect(blocked?.status).toBe(429);
    expect(blocked?.headers.get('retry-after')).toBeTruthy();

    const body = await blocked?.json();
    expect(errorResponseSchema.safeParse(body).success).toBe(true);
    expect(body.error.code).toBe('RATE_LIMITED');
  });

  it('conta por IP: um IP bloqueado não bloqueia outro', () => {
    const policy = { limit: 1, windowMs: 60_000 };
    const attacker = makeHeaders({ 'x-forwarded-for': '203.0.113.66' });
    const visitor = makeHeaders({ 'x-forwarded-for': '203.0.113.77' });

    expect(enforceRateLimit(attacker, 'rota', policy)).toBeNull();
    expect(enforceRateLimit(attacker, 'rota', policy)).not.toBeNull();
    expect(enforceRateLimit(visitor, 'rota', policy)).toBeNull();
  });
});

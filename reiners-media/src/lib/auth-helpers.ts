/**
 * Reiners Media Podcast Studio — autenticação, RBAC e rate limiting (TCK-004).
 *
 * Este módulo é a ÚNICA fonte de verdade de "quem é o usuário" e "o que ele
 * pode fazer". `src/middleware.ts`, as rotas de `src/app/api/auth/**` e as
 * rotas administrativas de TCK-005/006/017/018/019 compartilham exatamente as
 * mesmas funções — se a decisão de autorização divergir entre a borda e o
 * handler, existe um bypass.
 *
 * Regras de negócio implementadas (docs/PRD.md §11):
 * - BR-001 — ADMIN gerencia usuários: qualquer rota sob
 *   `ADMIN_ONLY_PATH_PREFIXES` exige papel ADMIN, em qualquer método.
 * - BR-002 — EDITOR não deleta: método destrutivo (DELETE) exige papel ADMIN.
 *
 * PROIBIDO neste módulo: importar `next/headers` estaticamente (quebraria o
 * middleware no edge runtime). Ver o cabeçalho de `src/lib/supabase.ts`.
 */
import type { SupabaseClient, User as SupabaseAuthUser } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

import { ERROR_STATUS_BY_CODE, adminRoleSchema, adminUserSchema } from '@/lib/schemas';
import { createRouteHandlerSupabaseClient } from '@/lib/supabase';
import type { AdminRole, AdminUser, ApiErrorResponse, ErrorCode, Session } from '@/types/api';

/* -------------------------------------------------------------------------- */
/* Respostas de erro padronizadas                                             */
/* -------------------------------------------------------------------------- */

/**
 * Mensagens genéricas por código.
 *
 * docs/SECURITY.md — "Logs de erro sem stack traces em produção" e o contrato
 * `contracts/api/auth.yaml` ("credenciais inválidas devolvem 401 sem revelar
 * qual campo falhou"). Nenhuma mensagem daqui pode conter dado do usuário,
 * texto de erro do Supabase ou nome de coluna do banco.
 */
export const GENERIC_ERROR_MESSAGES: Record<ErrorCode, string> = {
  BAD_REQUEST: 'Requisição malformada.',
  VALIDATION_ERROR: 'Dados inválidos.',
  UNAUTHORIZED: 'Autenticação necessária.',
  FORBIDDEN: 'Acesso negado.',
  NOT_FOUND: 'Recurso não encontrado.',
  CONFLICT: 'Conflito de estado.',
  PAYLOAD_TOO_LARGE: 'Conteúdo excede o tamanho permitido.',
  UNSUPPORTED_MEDIA_TYPE: 'Tipo de conteúdo não suportado.',
  RATE_LIMITED: 'Muitas requisições. Tente novamente em instantes.',
  INTERNAL_ERROR: 'Erro interno.',
};

export interface ErrorResponseInit {
  /** Metadados seguros (nomes de campo, regra violada). NUNCA valores enviados. */
  details?: Record<string, unknown>;
  headers?: Record<string, string>;
}

/** Corpo `{ error: { code, message, details? } }` — formato único da API. */
export function errorBody(
  code: ErrorCode,
  message: string = GENERIC_ERROR_MESSAGES[code],
  details?: Record<string, unknown>,
): ApiErrorResponse {
  return { error: details ? { code, message, details } : { code, message } };
}

/**
 * Resposta de erro com o status canônico de `ERROR_STATUS_BY_CODE`.
 *
 * O status nunca é passado à mão: o mapa em `@/lib/schemas` é o que os testes
 * de contrato verificam contra os YAMLs.
 */
export function errorResponse(
  code: ErrorCode,
  message: string = GENERIC_ERROR_MESSAGES[code],
  init: ErrorResponseInit = {},
): NextResponse {
  return NextResponse.json(errorBody(code, message, init.details), {
    status: ERROR_STATUS_BY_CODE[code],
    headers: { 'Cache-Control': 'no-store', ...init.headers },
  });
}

/**
 * Converte issues do Zod em `details` seguros: apenas o caminho do campo e o
 * código do erro. O valor recebido (que pode ser uma senha) jamais é ecoado.
 */
export function safeIssueDetails(
  issues: readonly { path: (string | number)[]; code: string }[],
): Record<string, unknown> {
  return {
    fields: issues.map((issue) => ({
      path: issue.path.join('.'),
      code: issue.code,
    })),
  };
}

/* -------------------------------------------------------------------------- */
/* RBAC — BR-001 / BR-002                                                     */
/* -------------------------------------------------------------------------- */

/** Hierarquia de papéis: ADMIN engloba tudo que o EDITOR pode fazer. */
export const ROLE_RANK: Record<AdminRole, number> = { EDITOR: 1, ADMIN: 2 };

export const MUTATING_METHODS: readonly string[] = ['POST', 'PUT', 'PATCH', 'DELETE'];

/** BR-002 — métodos que apagam estado e por isso são exclusivos do ADMIN. */
export const DESTRUCTIVE_METHODS: readonly string[] = ['DELETE'];

/** BR-001 — superfícies de gestão de usuários, exclusivas do ADMIN. */
export const ADMIN_ONLY_PATH_PREFIXES: readonly string[] = [
  '/api/admin/users',
  '/api/users',
  '/admin/users',
];

export function isMutatingMethod(method: string): boolean {
  return MUTATING_METHODS.includes(method.toUpperCase());
}

export function isDestructiveMethod(method: string): boolean {
  return DESTRUCTIVE_METHODS.includes(method.toUpperCase());
}

/** `true` se o pathname pertence à gestão de usuários (BR-001). */
export function isAdminOnlyPath(pathname: string): boolean {
  return ADMIN_ONLY_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/** `true` se `role` tem pelo menos o nível de `required`. */
export function hasRoleRank(role: AdminRole, required: AdminRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[required];
}

export interface AuthorizationDecision {
  allowed: boolean;
  /** Regra de negócio que negou o acesso, quando houve negativa. */
  rule?: 'BR-001' | 'BR-002';
  message: string;
}

const ALLOWED_DECISION: AuthorizationDecision = { allowed: true, message: 'Autorizado.' };

/**
 * Decisão de autorização única, compartilhada pelo middleware (borda) e pelos
 * route handlers (defesa em profundidade).
 *
 * Ordem das regras importa: BR-001 é avaliada antes de BR-002 porque é mais
 * abrangente (nega o EDITOR até em `GET /admin/users`).
 */
export function authorize(
  role: AdminRole,
  method: string,
  pathname: string,
): AuthorizationDecision {
  if (isAdminOnlyPath(pathname) && role !== 'ADMIN') {
    return {
      allowed: false,
      rule: 'BR-001',
      message: 'BR-001: apenas ADMIN pode gerenciar usuários.',
    };
  }

  if (isDestructiveMethod(method) && role !== 'ADMIN') {
    return {
      allowed: false,
      rule: 'BR-002',
      message: 'BR-002: EDITOR não pode excluir recursos.',
    };
  }

  return ALLOWED_DECISION;
}

/* -------------------------------------------------------------------------- */
/* Mapeamento Supabase -> AdminUser                                           */
/* -------------------------------------------------------------------------- */

/**
 * Chaves de `app_metadata` consultadas para descobrir o papel, em ordem.
 *
 * ATENÇÃO DE SEGURANÇA — só `app_metadata` é lido. `user_metadata` é gravável
 * pelo próprio usuário autenticado (`supabase.auth.updateUser`), então aceitar
 * um papel vindo de lá seria escalação de privilégio de uma linha:
 * qualquer EDITOR viraria ADMIN sozinho. `app_metadata` só muda com a service
 * role key, que nunca sai do servidor (docs/SECURITY.md).
 */
export const ROLE_CLAIM_KEYS: readonly string[] = ['role', 'admin_role'];

/** Papel administrativo confiável do usuário, ou `null` se não houver nenhum. */
export function readAdminRole(user: Pick<SupabaseAuthUser, 'app_metadata'>): AdminRole | null {
  const metadata: Record<string, unknown> = user.app_metadata ?? {};

  for (const key of ROLE_CLAIM_KEYS) {
    const parsed = adminRoleSchema.safeParse(metadata[key]);
    if (parsed.success) return parsed.data;
  }

  return null;
}

function toIsoOrNull(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function readDisplayName(metadata: Record<string, unknown> | undefined): string | null {
  const candidate = metadata?.name ?? metadata?.full_name;
  if (typeof candidate !== 'string') return null;
  const trimmed = candidate.trim();
  /** `adminUserSchema` limita o nome a 80 chars: truncar > devolver `null`. */
  return trimmed.length === 0 ? null : trimmed.slice(0, 80);
}

/**
 * Converte o usuário do Supabase Auth no `AdminUser` do contrato.
 *
 * Devolve `null` — isto é, "não é um usuário administrativo" — quando:
 * - não há usuário;
 * - não há papel confiável em `app_metadata` (least privilege: a ausência de
 *   claim NÃO vira EDITOR por default, senão qualquer conta do projeto Supabase
 *   entraria no painel);
 * - a identidade não satisfaz `adminUserSchema` (id não-uuid, e-mail ausente).
 *
 * O papel gravado na tabela `AdminUser` (Prisma) é espelho deste claim: a rota
 * de gestão de usuários (BR-001, fora do escopo de TCK-004) precisa escrever os
 * dois lados na mesma operação.
 */
export function mapSupabaseUser(user: SupabaseAuthUser | null | undefined): AdminUser | null {
  if (!user) return null;

  const role = readAdminRole(user);
  if (!role) return null;

  const parsed = adminUserSchema.safeParse({
    id: user.id,
    email: user.email,
    name: readDisplayName(user.user_metadata),
    role,
    lastLoginAt: toIsoOrNull(user.last_sign_in_at),
    createdAt: toIsoOrNull(user.created_at) ?? new Date(0).toISOString(),
  });

  return parsed.success ? parsed.data : null;
}

/** Converte `expires_at` (segundos epoch) do Supabase em ISO-8601. */
export function toExpiresAt(expiresAt: number | null | undefined): string | null {
  if (typeof expiresAt !== 'number' || !Number.isFinite(expiresAt)) return null;
  return new Date(expiresAt * 1000).toISOString();
}

/* -------------------------------------------------------------------------- */
/* Sessão                                                                     */
/* -------------------------------------------------------------------------- */

/** Sessão de visitante — nunca `null`, para o handler não precisar checar. */
export const ANONYMOUS_SESSION: Session = {
  authenticated: false,
  user: null,
  expiresAt: null,
};

/**
 * Sessão atual, sempre verificada no servidor de auth do Supabase.
 *
 * Usa `auth.getUser()` (que valida o JWT contra o servidor) e NÃO apenas
 * `auth.getSession()` (que confia no cookie e é falsificável). `getSession` só
 * é consultado depois, para descobrir o instante de expiração.
 *
 * @param client Cliente já criado (o middleware passa o dele). Sem argumento,
 *   cria o client de route handler.
 */
export async function getSession(client?: SupabaseClient): Promise<Session> {
  const supabase = client ?? (await createRouteHandlerSupabaseClient());

  const { data, error } = await supabase.auth.getUser();
  if (error) return ANONYMOUS_SESSION;

  const user = mapSupabaseUser(data?.user);
  if (!user) return ANONYMOUS_SESSION;

  const { data: sessionData } = await supabase.auth.getSession();

  return {
    authenticated: true,
    user,
    expiresAt: toExpiresAt(sessionData?.session?.expires_at),
  };
}

/* -------------------------------------------------------------------------- */
/* Guards de rota                                                             */
/* -------------------------------------------------------------------------- */

export interface AuthOptions {
  /** Client Supabase já construído (middleware). Opcional nos route handlers. */
  client?: SupabaseClient;
  /**
   * Requisição em curso. Fornece método e pathname, sem os quais BR-001 e
   * BR-002 não podem ser avaliadas.
   */
  request?: Pick<Request, 'method' | 'url'>;
  /** Papel mínimo exigido — equivale a chamar `requireRole(role, ...)`. */
  role?: AdminRole;
}

/** A própria requisição também é aceita, por conveniência de chamada. */
export type AuthOptionsInput = AuthOptions | Request;

export type AuthOutcome =
  | { ok: true; user: AdminUser; session: Session }
  | { ok: false; response: NextResponse };

function isRequestLike(value: AuthOptionsInput): value is Request {
  if (typeof Request !== 'undefined' && value instanceof Request) return true;
  return 'method' in value && 'url' in value && 'headers' in value;
}

function normalizeAuthOptions(
  input: AuthOptionsInput = {},
  extra: { role?: AdminRole } = {},
): AuthOptions {
  const options: AuthOptions = isRequestLike(input) ? { request: input } : { ...input };
  if (extra.role) options.role = extra.role;
  return options;
}

/** Resolve a sessão e devolve 401 quando não há usuário administrativo. */
async function resolveAuth(options: AuthOptions): Promise<AuthOutcome> {
  const session = await getSession(options.client);

  if (!session.authenticated || !session.user) {
    return { ok: false, response: errorResponse('UNAUTHORIZED') };
  }

  return { ok: true, user: session.user, session };
}

function readPathname(request: Pick<Request, 'url'> | undefined): string | null {
  if (!request?.url) return null;
  try {
    return new URL(request.url).pathname;
  } catch {
    return null;
  }
}

/** Aplica hierarquia de papéis + BR-001/BR-002 sobre uma sessão já resolvida. */
function enforceRole(
  auth: Extract<AuthOutcome, { ok: true }>,
  required: AdminRole,
  request: Pick<Request, 'method' | 'url'> | undefined,
): AuthOutcome {
  if (!hasRoleRank(auth.user.role, required)) {
    return {
      ok: false,
      response: errorResponse('FORBIDDEN', `Acesso restrito ao papel ${required}.`),
    };
  }

  const pathname = readPathname(request);
  if (request && pathname) {
    const decision = authorize(auth.user.role, request.method, pathname);
    if (!decision.allowed) {
      return {
        ok: false,
        response: errorResponse('FORBIDDEN', decision.message, {
          details: { rule: decision.rule },
        }),
      };
    }
  }

  return auth;
}

/**
 * Exige sessão válida.
 *
 * ```ts
 * const auth = await requireAuth({ request });
 * if (!auth.ok) return auth.response; // 401 já formatado
 * ```
 *
 * Também aceita a forma posicional `requireAuth(request, { role: 'ADMIN' })`,
 * usada pelas pontes de autorização escritas em paralelo (TCK-007).
 */
export async function requireAuth(
  input: AuthOptionsInput = {},
  extra: { role?: AdminRole } = {},
): Promise<AuthOutcome> {
  const options = normalizeAuthOptions(input, extra);
  const auth = await resolveAuth(options);

  if (!auth.ok || !options.role) return auth;
  return enforceRole(auth, options.role, options.request);
}

/**
 * Exige sessão válida COM papel mínimo, e aplica BR-001/BR-002 sobre o método e
 * o caminho da requisição.
 *
 * ```ts
 * // DELETE /api/podcasts/:id — só ADMIN passa (BR-002)
 * const auth = await requireRole('EDITOR', { request });
 * if (!auth.ok) return auth.response; // 401 ou 403 já formatado
 * ```
 *
 * Passar `request` é o que faz o DELETE de um EDITOR virar 403. Sem ele, apenas
 * a hierarquia de papéis é verificada.
 */
export async function requireRole(
  required: AdminRole,
  input: AuthOptionsInput = {},
): Promise<AuthOutcome> {
  const options = normalizeAuthOptions(input);
  const auth = await resolveAuth(options);
  if (!auth.ok) return auth;

  return enforceRole(auth, required, options.request);
}

/* -------------------------------------------------------------------------- */
/* Rate limiting                                                              */
/* -------------------------------------------------------------------------- */

/**
 * LIMITAÇÃO CONHECIDA E DELIBERADA — este rate limiter é in-memory.
 *
 * O contador vive no processo. Na Vercel, cada instância serverless/edge tem o
 * seu, e instâncias frias começam zeradas; o limite efetivo é, portanto,
 * `limite x número de instâncias`. Isso é BEST-EFFORT: freia scraping e força
 * bruta oportunista, mas não é uma garantia distribuída.
 *
 * A solução durável é um contador compartilhado (Upstash Redis / Vercel KV) com
 * `INCR` + `EXPIRE` atômicos. A troca é local: manter as assinaturas de
 * `consumeRateLimit` / `enforceRateLimit` e reimplementar o corpo de forma
 * assíncrona. NENHUMA dependência nova foi adicionada neste ticket — o
 * `package.json` está fora dos write_paths de TCK-004.
 */
export interface RateLimitPolicy {
  limit: number;
  windowMs: number;
}

/** Políticas de docs/SECURITY.md §"Rate Limiting". */
export const RATE_LIMIT_POLICIES = {
  /** "Bloqueio de IPs após 5 tentativas de login falhas". */
  login: { limit: 5, windowMs: 60_000 },
  /** "APIs públicas: 100 req/min por IP". */
  publicApi: { limit: 100, windowMs: 60_000 },
  /** "APIs admin: 60 req/min por usuário". */
  adminApi: { limit: 60, windowMs: 60_000 },
  /** "Upload: 10 req/min por IP". */
  upload: { limit: 10, windowMs: 60_000 },
} as const satisfies Record<string, RateLimitPolicy>;

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  /** Segundos até a janela liberar uma vaga. `0` quando permitido. */
  retryAfterSeconds: number;
  /** Epoch em ms em que a vaga mais antiga expira. */
  resetAt: number;
}

/** Janela deslizante: timestamps das requisições aceitas, por chave. */
const rateLimitBuckets = new Map<string, number[]>();

/** Teto de chaves rastreadas; protege contra crescimento por IP spoofado. */
const MAX_TRACKED_KEYS = 10_000;

/** Chave do balde: rota + identificador (IP). Ver `enforceRateLimit`. */
export function rateLimitKey(routeId: string, identifier: string): string {
  return `${routeId}:${identifier}`;
}

/**
 * IP do cliente, em ordem DECRESCENTE de confiança.
 *
 * 1. `request.ip` — preenchido pela própria plataforma (`NextRequest.ip` na
 *    Vercel) a partir da conexão TCP. É o único valor que o cliente não
 *    consegue escolher, então vem primeiro.
 * 2. `x-forwarded-for` / `x-real-ip` — cabeçalhos, e portanto FALSIFICÁVEIS por
 *    quem fala direto com a aplicação. Só são consultados quando a plataforma
 *    não fornece o IP (self-host atrás de um proxy reverso confiável, ambiente
 *    de teste). `x-forwarded-for` é a lista `cliente, proxy1, proxy2`: apenas o
 *    primeiro elemento identifica o cliente.
 *
 * A ordem importa: com os cabeçalhos na frente, um atacante gira o
 * `x-forwarded-for` a cada requisição, cai numa chave de rate limit nova toda
 * vez e nunca é bloqueado. Na Vercel o cabeçalho é reescrito pela borda e o
 * ataque não se aplica — mas depender dessa normalização seria confiar num
 * detalhe de plataforma para uma garantia de segurança.
 */
export function getClientIp(request: { headers: Headers; ip?: string }): string {
  const platformIp = request.ip?.trim();
  if (platformIp) return platformIp;

  const forwardedFor = request.headers.get('x-forwarded-for');
  const first = forwardedFor?.split(',')[0]?.trim();
  if (first) return first;

  return request.headers.get('x-real-ip')?.trim() || 'unknown';
}

/** Remove baldes cujas marcas já saíram da janela. */
function sweepExpired(now: number, windowMs: number): void {
  for (const [key, timestamps] of rateLimitBuckets) {
    if (timestamps.length === 0 || timestamps[timestamps.length - 1] <= now - windowMs) {
      rateLimitBuckets.delete(key);
    }
  }
}

/**
 * Consome uma vaga da janela deslizante de `key`.
 *
 * Deslizante de verdade: cada requisição aceita guarda o próprio timestamp e
 * expira 60s DEPOIS dele. Uma janela fixa (contador que zera no minuto cheio)
 * aceitaria `2 x limite` requisições na virada.
 */
export function consumeRateLimit(
  key: string,
  policy: RateLimitPolicy,
  now: number = Date.now(),
): RateLimitResult {
  const windowStart = now - policy.windowMs;
  const timestamps = (rateLimitBuckets.get(key) ?? []).filter((hit) => hit > windowStart);

  if (timestamps.length >= policy.limit) {
    rateLimitBuckets.set(key, timestamps);
    const oldest = timestamps[0];
    const resetAt = oldest + policy.windowMs;
    return {
      allowed: false,
      limit: policy.limit,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((resetAt - now) / 1000)),
      resetAt,
    };
  }

  timestamps.push(now);
  rateLimitBuckets.set(key, timestamps);

  if (rateLimitBuckets.size > MAX_TRACKED_KEYS) sweepExpired(now, policy.windowMs);

  return {
    allowed: true,
    limit: policy.limit,
    remaining: policy.limit - timestamps.length,
    retryAfterSeconds: 0,
    resetAt: timestamps[0] + policy.windowMs,
  };
}

/**
 * Zera o contador de uma chave (ou de todas, sem argumento).
 *
 * Usado no login bem-sucedido — o limite existe contra força bruta, não contra
 * quem acertou a senha — e no `beforeEach` dos testes.
 */
export function clearRateLimit(key?: string): void {
  if (key === undefined) {
    rateLimitBuckets.clear();
    return;
  }
  rateLimitBuckets.delete(key);
}

/** Cabeçalhos informativos padrão de rate limit. */
export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  const headers: Record<string, string> = {
    'X-RateLimit-Limit': String(result.limit),
    'X-RateLimit-Remaining': String(result.remaining),
    'X-RateLimit-Reset': String(Math.ceil(result.resetAt / 1000)),
  };
  if (!result.allowed) headers['Retry-After'] = String(result.retryAfterSeconds);
  return headers;
}

/**
 * Aplica o rate limit por IP+rota e devolve a resposta 429 pronta quando
 * estourado, ou `null` para seguir o fluxo.
 *
 * ```ts
 * const limited = enforceRateLimit(request, 'POST /api/upload', RATE_LIMIT_POLICIES.upload);
 * if (limited) return limited;
 * ```
 */
export function enforceRateLimit(
  request: { headers: Headers; ip?: string },
  routeId: string,
  policy: RateLimitPolicy,
): NextResponse | null {
  const key = rateLimitKey(routeId, getClientIp(request));
  const result = consumeRateLimit(key, policy);

  if (result.allowed) return null;

  return errorResponse('RATE_LIMITED', GENERIC_ERROR_MESSAGES.RATE_LIMITED, {
    headers: rateLimitHeaders(result),
  });
}

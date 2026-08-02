/**
 * Ponte de autorização das rotas protegidas de TCK-007
 * (`GET /api/events`, `GET /api/events/summary`, `PATCH /api/site-config`).
 *
 * A decisão de autorização é DELEGADA a `requireAuth` de TCK-004
 * (`src/lib/auth-helpers.ts`): `requireAuth(request, { role })` aplica a
 * hierarquia de papéis e as regras BR-001/BR-002 sobre método e pathname, e
 * devolve `{ ok: true, user, session }` ou `{ ok: false, response }` com a
 * resposta 401/403 pronta. Nada de RBAC é reimplementado aqui — a única
 * conferência local é a asserção final documentada em `normalizeAuthResult`.
 *
 * O que esta ponte acrescenta:
 * 1. traduz o resultado para `{ ok, code, message }`, para que os handlers de
 *    TCK-007 emitam o erro no MESMO envelope das demais respostas e com os
 *    headers de rate limit já calculados;
 * 2. nega por padrão diante de qualquer exceção (sessão corrompida, Supabase
 *    fora do ar): uma rota protegida nunca abre por falha de infraestrutura.
 *
 * POR QUE VIVE AQUI: os write_paths de TCK-007 são `src/app/api/events/`,
 * `src/app/api/site-config/` e `src/lib/analytics.ts` — um módulo compartilhado
 * pelas duas rotas precisa morar dentro de um deles. Ver o cabeçalho de
 * `./http.ts`. Pastas com prefixo `_` não viram rota no App Router.
 */
import type { z } from 'zod';

import { requireAuth } from '@/lib/auth-helpers';
import { adminRoleSchema } from '@/lib/schemas';

export type AdminRoleValue = z.infer<typeof adminRoleSchema>;

export interface AuthenticatedAdmin {
  id: string;
  email: string;
  role: AdminRoleValue;
}

export type AuthorizationResult =
  | { ok: true; user: AuthenticatedAdmin }
  | { ok: false; code: 'UNAUTHORIZED' | 'FORBIDDEN'; message: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readUser(candidate: unknown): AuthenticatedAdmin | null {
  if (!isRecord(candidate)) return null;
  const role = adminRoleSchema.safeParse(candidate.role);
  if (!role.success) return null;
  const id = typeof candidate.id === 'string' ? candidate.id : null;
  if (id === null) return null;
  const email = typeof candidate.email === 'string' ? candidate.email : '';
  return { id, email, role: role.data };
}

const UNAUTHORIZED: AuthorizationResult = {
  ok: false,
  code: 'UNAUTHORIZED',
  message: 'Sessão ausente ou expirada',
};

function forbidden(requiredRole: AdminRoleValue): AuthorizationResult {
  return { ok: false, code: 'FORBIDDEN', message: `Operação restrita ao papel ${requiredRole}` };
}

/** Status HTTP de uma resposta de negativa, quando disponível. */
function statusOf(value: unknown): number | null {
  if (typeof Response !== 'undefined' && value instanceof Response) return value.status;
  if (isRecord(value) && typeof value.status === 'number') return value.status;
  return null;
}

/**
 * Normaliza o `AuthOutcome` de TCK-004 para o formato dos handlers.
 *
 * Formas reconhecidas — exatamente as que `requireAuth` devolve:
 * - `{ ok: true, user, session }` -> autorizado
 * - `{ ok: false, response }`     -> negado, com 401/403 lido da resposta
 *
 * Qualquer outra coisa (`null`, exceção já tratada, retorno inesperado de uma
 * versão futura do helper) degrada para **negado com 401**. É deliberado que o
 * caso desconhecido feche a porta em vez de tentar adivinhar.
 *
 * A conferência de papel abaixo NÃO é uma segunda implementação de RBAC — a
 * decisão continua sendo do `authorize()` de TCK-004, que já roda dentro de
 * `requireAuth`. É uma asserção final: se um dia alguém chamar esta ponte sem
 * `role`, ou o helper mudar o default, a rota ainda não abre para EDITOR.
 */
export function normalizeAuthResult(
  raw: unknown,
  requiredRole: AdminRoleValue,
): AuthorizationResult {
  if (!isRecord(raw)) return UNAUTHORIZED;

  if (raw.ok !== true) {
    return statusOf(raw.response) === 403 ? forbidden(requiredRole) : UNAUTHORIZED;
  }

  const user = readUser(raw.user);
  if (user === null) return UNAUTHORIZED;

  // Asserção de defesa em profundidade (BR-001/BR-002 já foram avaliadas).
  if (requiredRole === 'ADMIN' && user.role !== 'ADMIN') return forbidden(requiredRole);

  return { ok: true, user };
}

/**
 * Autoriza a requisição exigindo sessão válida e, por padrão, papel ADMIN.
 * Nega por padrão: qualquer exceção vira 401.
 */
export async function authorizeAdminRequest(
  request: Request,
  requiredRole: AdminRoleValue = 'ADMIN',
): Promise<AuthorizationResult> {
  try {
    const outcome = await requireAuth(request, { role: requiredRole });
    return normalizeAuthResult(outcome, requiredRole);
  } catch (error) {
    // eslint-disable-next-line no-console -- WARN de segurança (docs/OBSERVABILITY.md §1)
    console.warn('[auth] falha ao resolver a sessão: negando por padrão', {
      message: error instanceof Error ? error.message : String(error),
    });
    return UNAUTHORIZED;
  }
}

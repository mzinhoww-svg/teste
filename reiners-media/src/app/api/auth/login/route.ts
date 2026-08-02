/**
 * POST /api/auth/login — contracts/api/auth.yaml (operationId `login`).
 *
 * Rota pública com rate limit por IP. O cookie httpOnly de sessão é emitido
 * pelo próprio `@supabase/ssr` através do adaptador de cookies do client de
 * route handler (`src/lib/supabase.ts`), já com `httpOnly`/`secure`/`sameSite`
 * endurecidos.
 *
 * Contrato de erros:
 * - 400 BAD_REQUEST      — corpo não é JSON válido;
 * - 401 UNAUTHORIZED     — credenciais inválidas (mensagem genérica: não revela
 *                          se o e-mail existe — enumeração de usuários);
 * - 403 FORBIDDEN        — autenticou no Supabase mas não tem papel
 *                          administrativo; a sessão recém-criada é derrubada;
 * - 422 VALIDATION_ERROR — corpo reprovado por `loginSchema`;
 * - 429 RATE_LIMITED     — acima de 5 tentativas/min por IP.
 */
import { type NextRequest, NextResponse } from 'next/server';

import {
  RATE_LIMIT_POLICIES,
  clearRateLimit,
  enforceRateLimit,
  errorResponse,
  getClientIp,
  mapSupabaseUser,
  rateLimitKey,
  safeIssueDetails,
  toExpiresAt,
} from '@/lib/auth-helpers';
import { loginSchema } from '@/lib/schemas';
import { createRouteHandlerSupabaseClient } from '@/lib/supabase';
import type { SessionResponse } from '@/types/api';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Identificador da rota na chave do rate limit (chave = rota + IP).
 * NÃO exportado: um `route.ts` do App Router só pode exportar handlers e as
 * chaves de configuração reconhecidas pelo Next.js.
 */
const LOGIN_ROUTE_ID = 'POST /api/auth/login';

const NO_STORE = { 'Cache-Control': 'no-store' } as const;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const limited = enforceRateLimit(request, LOGIN_ROUTE_ID, RATE_LIMIT_POLICIES.login);
  if (limited) return limited;

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return errorResponse('BAD_REQUEST', 'Corpo da requisição não é JSON válido.');
  }

  const parsed = loginSchema.safeParse(rawBody);
  if (!parsed.success) {
    /* `details` carrega apenas caminhos de campo — jamais a senha enviada. */
    return errorResponse('VALIDATION_ERROR', 'Dados de login inválidos.', {
      details: safeIssueDetails(parsed.error.issues),
    });
  }

  const supabase = await createRouteHandlerSupabaseClient();

  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  /* A mensagem do Supabase nunca é repassada: ela distingue "usuário não
     existe" de "senha errada" em alguns casos e habilitaria enumeração. */
  if (error || !data?.user) {
    return errorResponse('UNAUTHORIZED', 'Credenciais inválidas.');
  }

  const user = mapSupabaseUser(data.user);
  if (!user) {
    /* Conta válida no Supabase, mas sem papel administrativo confiável em
       `app_metadata`: a sessão recém-emitida é revogada antes de responder. */
    await supabase.auth.signOut();
    return errorResponse('FORBIDDEN', 'Usuário sem papel administrativo.');
  }

  /* O limite existe contra força bruta; quem acertou a senha não fica preso. */
  clearRateLimit(rateLimitKey(LOGIN_ROUTE_ID, getClientIp(request)));

  const body: SessionResponse = {
    data: {
      authenticated: true,
      user,
      expiresAt: toExpiresAt(data.session?.expires_at),
    },
  };

  return NextResponse.json(body, { status: 200, headers: NO_STORE });
}

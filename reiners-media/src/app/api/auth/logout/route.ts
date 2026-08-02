/**
 * POST /api/auth/logout — contracts/api/auth.yaml (operationId `logout`).
 *
 * Requer sessão válida (401 sem ela). `signOut()` revoga o refresh token no
 * Supabase e o adaptador de cookies remove o cookie httpOnly; a limpeza
 * explícita abaixo é o cinto de segurança para o caso de o `setAll` não ser
 * chamado (por exemplo, se o token já estava expirado do lado do servidor).
 */
import { type NextRequest, NextResponse } from 'next/server';

import {
  RATE_LIMIT_POLICIES,
  enforceRateLimit,
  errorResponse,
  getSession,
} from '@/lib/auth-helpers';
import { EXPIRED_COOKIE_OPTIONS, createRouteHandlerSupabaseClient } from '@/lib/supabase';
import type { LogoutResponse } from '@/types/api';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const LOGOUT_ROUTE_ID = 'POST /api/auth/logout';

/** Prefixo dos cookies de sessão do `@supabase/ssr` (`sb-<ref>-auth-token`). */
const SUPABASE_COOKIE_PREFIX = 'sb-';

const NO_STORE = { 'Cache-Control': 'no-store' } as const;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const limited = enforceRateLimit(request, LOGOUT_ROUTE_ID, RATE_LIMIT_POLICIES.adminApi);
  if (limited) return limited;

  const supabase = await createRouteHandlerSupabaseClient();

  const session = await getSession(supabase);
  if (!session.authenticated) {
    return errorResponse('UNAUTHORIZED');
  }

  await supabase.auth.signOut();

  const body: LogoutResponse = { data: { success: true } };
  const response = NextResponse.json(body, { status: 200, headers: NO_STORE });

  for (const cookie of request.cookies.getAll()) {
    if (cookie.name.startsWith(SUPABASE_COOKIE_PREFIX)) {
      response.cookies.set(cookie.name, '', EXPIRED_COOKIE_OPTIONS);
    }
  }

  return response;
}

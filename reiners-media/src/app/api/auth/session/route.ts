/**
 * GET /api/auth/session — contracts/api/auth.yaml (operationId `getSession`).
 *
 * SEMPRE 200. Sem cookie válido devolve `{ authenticated: false, user: null }`.
 * Esta é a única forma de o browser descobrir a sessão: o cookie é `httpOnly`,
 * logo invisível para JavaScript (ver `src/lib/supabase.ts`).
 *
 * `Cache-Control: no-store` é obrigatório — uma resposta de sessão em cache de
 * CDN entregaria a identidade de um admin para o visitante seguinte.
 */
import { NextResponse } from 'next/server';

import { ANONYMOUS_SESSION, getSession } from '@/lib/auth-helpers';
import type { SessionResponse } from '@/types/api';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const NO_STORE = { 'Cache-Control': 'no-store' } as const;

export async function GET(): Promise<NextResponse> {
  let session = ANONYMOUS_SESSION;

  try {
    session = await getSession();
  } catch {
    /* Supabase indisponível ou ambiente mal configurado: para o consumidor
       isso é indistinguível de "não autenticado". Nenhum detalhe vaza. */
    session = ANONYMOUS_SESSION;
  }

  const body: SessionResponse = { data: session };

  return NextResponse.json(body, { status: 200, headers: NO_STORE });
}

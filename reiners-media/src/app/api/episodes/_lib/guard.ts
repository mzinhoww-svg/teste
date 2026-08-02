/**
 * RBAC das rotas de episódio (TCK-006) — costura fina sobre TCK-004.
 *
 * BR-001/BR-002 pertencem a TCK-004 (`contracts/README.md`), e o middleware já
 * barra mutação sem sessão na borda. Ainda assim os handlers chamam o guard:
 * o próprio TCK-004 registra que a borda é "defesa em profundidade, nunca
 * substituição" — uma rota invocada fora do matcher do middleware (chamada
 * interna, mudança de config, teste de carga) não pode virar escrita anônima.
 *
 * Nenhuma verificação de sessão é reimplementada aqui: `requireRole` de
 * `src/lib/auth-helpers.ts` é a única fonte de decisão, e ela já devolve o 401
 * e o 403 no envelope padronizado. Este módulo existe só para dar nome à
 * exigência de cada verbo:
 *
 * | Verbo  | Papel mínimo | Contrato                                  |
 * |--------|--------------|-------------------------------------------|
 * | POST   | EDITOR       | `createEpisode`: ADMIN ou EDITOR          |
 * | PATCH  | EDITOR       | `updateEpisode`: ADMIN ou EDITOR          |
 * | DELETE | ADMIN        | `deleteEpisode`: BR-002 barra o EDITOR    |
 */
import type { NextRequest, NextResponse } from 'next/server';

import { requireRole } from '@/lib/auth-helpers';

export type GuardResult = { ok: true } | { ok: false; response: NextResponse };

async function guard(role: 'ADMIN' | 'EDITOR', request: NextRequest): Promise<GuardResult> {
  const outcome = await requireRole(role, { request });
  return outcome.ok ? { ok: true } : { ok: false, response: outcome.response };
}

/** Exige sessão com papel ADMIN ou EDITOR (criação e edição). */
export function requireEditor(request: NextRequest): Promise<GuardResult> {
  return guard('EDITOR', request);
}

/** BR-002 — exige ADMIN. É o que impede um EDITOR de apagar episódio. */
export function requireAdmin(request: NextRequest): Promise<GuardResult> {
  return guard('ADMIN', request);
}

/**
 * RBAC das rotas de podcast e de upload (TCK-005) — costura fina sobre TCK-004.
 *
 * NENHUMA verificação de sessão é reimplementada aqui. `requireRole` de
 * `src/lib/auth-helpers.ts` é a única fonte de decisão de autorização do
 * projeto (BR-001/BR-002, `contracts/README.md`), já devolve 401/403 no
 * envelope padronizado e é a mesma função que o middleware usa na borda — se a
 * decisão divergisse entre borda e handler, existiria bypass.
 *
 * Passar `request` é obrigatório: é dele que saem o método e o pathname que
 * fazem `authorize` aplicar BR-002 (DELETE exige ADMIN).
 *
 * | Rota                        | Papel mínimo | Contrato                          |
 * |-----------------------------|--------------|-----------------------------------|
 * | POST   /api/podcasts        | EDITOR       | `createPodcast`: ADMIN ou EDITOR  |
 * | PATCH  /api/podcasts/:id    | EDITOR       | `updatePodcast`: ADMIN ou EDITOR  |
 * | DELETE /api/podcasts/:id    | ADMIN        | `deletePodcast`: BR-002 barra EDITOR |
 * | POST   /api/upload          | EDITOR       | `uploadImage`: ADMIN ou EDITOR    |
 */
import type { NextRequest, NextResponse } from 'next/server';

import { requireRole } from '@/lib/auth-helpers';
import type { AdminUser } from '@/types/api';

export type GuardResult = { ok: true; user: AdminUser } | { ok: false; response: NextResponse };

async function guard(role: 'ADMIN' | 'EDITOR', request: NextRequest): Promise<GuardResult> {
  const outcome = await requireRole(role, { request });
  return outcome.ok ? { ok: true, user: outcome.user } : { ok: false, response: outcome.response };
}

/** Exige sessão com papel ADMIN ou EDITOR (criação, edição e upload). */
export function requireEditor(request: NextRequest): Promise<GuardResult> {
  return guard('EDITOR', request);
}

/** BR-002 — exige ADMIN. É o que transforma o DELETE de um EDITOR em 403. */
export function requireAdmin(request: NextRequest): Promise<GuardResult> {
  return guard('ADMIN', request);
}

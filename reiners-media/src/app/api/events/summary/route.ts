/**
 * `GET /api/events/summary` — agregações de analytics para o dashboard admin
 * (TCK-007, consumido por TCK-020/TCK-021).
 *
 * EXTENSÃO DE CONTRATO: `contracts/api/events.yaml` (CONTRACT-003, dono TCK-003)
 * documenta apenas `POST /api/events` e `GET /api/events`, e o teste
 * `tests/integration/contract-validation.test.ts` fixa essa lista de endpoints.
 * As agregações não cabem no envelope paginado de `eventListResponseSchema`,
 * então vivem aqui, com contrato executável próprio em `src/lib/analytics.ts`
 * (`eventSummaryQuerySchema` / `eventSummaryResponseSchema`). Ao integrar,
 * publicar a operação no YAML — o arquivo pertence a TCK-003.
 *
 * Restrito a ADMIN, igual a `GET /api/events`.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import {
  eventSummaryQuerySchema,
  eventSummaryResponseSchema,
  fetchEventSummary,
  resolveSummaryRange,
} from '@/lib/analytics';
import { RATE_LIMIT_POLICIES } from '@/lib/auth-helpers';
import prisma from '@/lib/prisma';

import { authorizeAdminRequest } from '../_lib/admin-auth';
import { apiError, enforceRateLimit, internalError, zodDetails } from '../_lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const limit = enforceRateLimit(
    request,
    'GET /api/events/summary',
    RATE_LIMIT_POLICIES.adminApi,
  );
  if (limit.blocked !== null) return limit.blocked;

  const auth = await authorizeAdminRequest(request, 'ADMIN');
  if (!auth.ok) return apiError(auth.code, auth.message, undefined, { headers: limit.headers });

  const query = eventSummaryQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams.entries()),
  );
  if (!query.success) {
    return apiError(
      'VALIDATION_ERROR',
      'Parâmetros de agregação inválidos',
      zodDetails(query.error),
      { headers: limit.headers },
    );
  }

  const range = resolveSummaryRange(query.data);
  if (!range.ok) {
    return apiError('VALIDATION_ERROR', range.reason, { path: range.path }, {
      headers: limit.headers,
    });
  }

  try {
    const summary = await fetchEventSummary(prisma, range.range, {
      eventType: query.data.eventType,
    });
    const body = eventSummaryResponseSchema.parse({ data: summary });
    return NextResponse.json(body, { status: 200, headers: limit.headers });
  } catch (error) {
    return internalError('GET /api/events/summary', error);
  }
}

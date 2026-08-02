/**
 * `/api/events` — TCK-007 (CONTRACT-008, `contracts/api/events.yaml`).
 *
 * - `POST`  público, rate limit de 100 req/min por IP, payload saneado antes de
 *           tocar o banco (a rota é o único caminho de escrita pública do
 *           produto: sem saneamento ela vira vetor de inflar o `EventLog`).
 * - `GET`   restrito a ADMIN, listagem paginada consumida pelo dashboard
 *           (TCK-020). As agregações ficam em `GET /api/events/summary`.
 */
import type { Prisma } from '@prisma/client';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { AnalyticsPayloadError, recordEvent, toPublicEvent } from '@/lib/analytics';
import { RATE_LIMIT_POLICIES } from '@/lib/auth-helpers';
import prisma from '@/lib/prisma';
import {
  eventCreateSchema,
  eventListResponseSchema,
  eventQuerySchema,
  eventResponseSchema,
} from '@/lib/schemas';

import { authorizeAdminRequest } from './_lib/admin-auth';
import { apiError, enforceRateLimit, internalError, readJsonBody, zodDetails } from './_lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Teto do corpo de `POST /api/events`, bem acima do payload legítimo. */
const EVENT_REQUEST_MAX_BYTES = 8_192;

/**
 * Lê `payload` DIRETO do corpo cru, por descritor de propriedade própria.
 *
 * ARMADILHA REAL (pega por `events.integration.test.ts`): o objeto devolvido
 * pelo Zod NÃO serve para o saneamento. `JSON.parse('{"__proto__":{...}}')`
 * cria uma propriedade PRÓPRIA `__proto__`, mas o Zod remonta o objeto com
 * atribuição (`out[key] = value`), e atribuir `__proto__` troca o protótipo em
 * vez de criar a chave. Resultado: o payload hostil some da visão de
 * `Object.keys()` e o saneamento aprovaria um objeto com protótipo poluído.
 * Por isso a ordem é: valida com Zod (eventType/strict) -> saneia o CRU.
 */
function readRawPayload(body: unknown): unknown {
  if (typeof body !== 'object' || body === null) return undefined;
  return Object.getOwnPropertyDescriptor(body, 'payload')?.value;
}

/* -------------------------------------------------------------------------- */
/* POST /api/events — ingestão pública                                        */
/* -------------------------------------------------------------------------- */

export async function POST(request: NextRequest): Promise<NextResponse> {
  const limit = enforceRateLimit(request, 'POST /api/events', RATE_LIMIT_POLICIES.publicApi);
  if (limit.blocked !== null) return limit.blocked;

  const body = await readJsonBody(request, EVENT_REQUEST_MAX_BYTES);
  if (!body.ok) return body.response;

  const parsed = eventCreateSchema.safeParse(body.value);
  if (!parsed.success) {
    return apiError(
      'VALIDATION_ERROR',
      'Evento inválido: verifique eventType e payload',
      zodDetails(parsed.error),
      { headers: limit.headers },
    );
  }

  try {
    const event = await recordEvent(prisma, {
      eventType: parsed.data.eventType,
      payload: readRawPayload(body.value),
    });
    const responseBody = eventResponseSchema.parse({ data: event });
    return NextResponse.json(responseBody, { status: 201, headers: limit.headers });
  } catch (error) {
    if (error instanceof AnalyticsPayloadError) {
      return apiError('VALIDATION_ERROR', error.message, { path: error.path }, {
        headers: limit.headers,
      });
    }
    return internalError('POST /api/events', error);
  }
}

/* -------------------------------------------------------------------------- */
/* GET /api/events — listagem paginada (ADMIN)                                */
/* -------------------------------------------------------------------------- */

export async function GET(request: NextRequest): Promise<NextResponse> {
  const limit = enforceRateLimit(request, 'GET /api/events', RATE_LIMIT_POLICIES.adminApi);
  if (limit.blocked !== null) return limit.blocked;

  const auth = await authorizeAdminRequest(request, 'ADMIN');
  if (!auth.ok) return apiError(auth.code, auth.message, undefined, { headers: limit.headers });

  const query = eventQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams.entries()),
  );
  if (!query.success) {
    return apiError('VALIDATION_ERROR', 'Parâmetros de consulta inválidos', zodDetails(query.error), {
      headers: limit.headers,
    });
  }

  const { page, limit: pageSize, order, eventType, from, to } = query.data;
  if (from !== undefined && to !== undefined && new Date(from) > new Date(to)) {
    return apiError('VALIDATION_ERROR', 'from precisa ser anterior ou igual a to', {
      from,
      to,
    }, { headers: limit.headers });
  }

  const createdAt: Prisma.DateTimeFilter = {
    ...(from === undefined ? {} : { gte: new Date(from) }),
    ...(to === undefined ? {} : { lte: new Date(to) }),
  };
  const where: Prisma.EventLogWhereInput = {
    ...(eventType === undefined ? {} : { eventType }),
    ...(from === undefined && to === undefined ? {} : { createdAt }),
  };

  try {
    const [total, rows] = await Promise.all([
      prisma.eventLog.count({ where }),
      prisma.eventLog.findMany({
        where,
        orderBy: { createdAt: order },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    const body = eventListResponseSchema.parse({
      data: rows.map((row) => toPublicEvent(row as unknown as Record<string, unknown>)),
      meta: {
        page,
        limit: pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    });
    return NextResponse.json(body, { status: 200, headers: limit.headers });
  } catch (error) {
    return internalError('GET /api/events', error);
  }
}

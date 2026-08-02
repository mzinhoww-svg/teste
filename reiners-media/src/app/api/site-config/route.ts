/**
 * `/api/site-config` — TCK-007 (CONTRACT-003, `contracts/api/site-config.yaml`).
 *
 * Registro singleton:
 * - `GET`    público (layout raiz e SEO). 404 enquanto o seed não rodou.
 * - `PATCH`  restrito a ADMIN (BR-001/BR-002): EDITOR recebe 403.
 *
 * O plumbing HTTP e a ponte de autorização são compartilhados com as rotas de
 * `/api/events` porque os write_paths de TCK-007 não incluem um diretório
 * comum — ver o cabeçalho de `src/app/api/events/_lib/http.ts`.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { authorizeAdminRequest } from '@/app/api/events/_lib/admin-auth';
import {
  apiError,
  enforceRateLimit,
  internalError,
  readJsonBody,
  zodDetails,
} from '@/app/api/events/_lib/http';
import { toPublicSiteConfig } from '@/lib/analytics';
import { RATE_LIMIT_POLICIES } from '@/lib/auth-helpers';
import prisma from '@/lib/prisma';
import { siteConfigResponseSchema, siteConfigUpdateSchema } from '@/lib/schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** `customCss` sozinho pode ter 50k caracteres — o teto do corpo precisa caber. */
const SITE_CONFIG_REQUEST_MAX_BYTES = 131_072;

/** Prisma: registro não encontrado durante `update` (escrita concorrente). */
const PRISMA_RECORD_NOT_FOUND = 'P2025';

function isPrismaErrorCode(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === code
  );
}

/* -------------------------------------------------------------------------- */
/* GET /api/site-config — público                                             */
/* -------------------------------------------------------------------------- */

export async function GET(request: NextRequest): Promise<NextResponse> {
  const limit = enforceRateLimit(
    request,
    'GET /api/site-config',
    RATE_LIMIT_POLICIES.publicApi,
  );
  if (limit.blocked !== null) return limit.blocked;

  try {
    const row = await prisma.siteConfig.findFirst({ orderBy: { createdAt: 'asc' } });
    if (row === null) {
      return apiError('NOT_FOUND', 'Configuração do site ainda não foi criada', undefined, {
        headers: limit.headers,
      });
    }

    const body = siteConfigResponseSchema.parse({
      data: toPublicSiteConfig(row as unknown as Record<string, unknown>),
    });
    return NextResponse.json(body, {
      status: 200,
      headers: {
        ...limit.headers,
        // Configuração muda raramente; o CDN absorve a maior parte do tráfego.
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
      },
    });
  } catch (error) {
    return internalError('GET /api/site-config', error);
  }
}

/* -------------------------------------------------------------------------- */
/* PATCH /api/site-config — ADMIN                                             */
/* -------------------------------------------------------------------------- */

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const limit = enforceRateLimit(
    request,
    'PATCH /api/site-config',
    RATE_LIMIT_POLICIES.adminApi,
  );
  if (limit.blocked !== null) return limit.blocked;

  const auth = await authorizeAdminRequest(request, 'ADMIN');
  if (!auth.ok) return apiError(auth.code, auth.message, undefined, { headers: limit.headers });

  const body = await readJsonBody(request, SITE_CONFIG_REQUEST_MAX_BYTES);
  if (!body.ok) return body.response;

  const parsed = siteConfigUpdateSchema.safeParse(body.value);
  if (!parsed.success) {
    return apiError(
      'VALIDATION_ERROR',
      'Configuração inválida: verifique os campos enviados',
      zodDetails(parsed.error),
      { headers: limit.headers },
    );
  }
  if (Object.keys(parsed.data).length === 0) {
    return apiError('VALIDATION_ERROR', 'Informe ao menos um campo para atualizar', undefined, {
      headers: limit.headers,
    });
  }

  try {
    const current = await prisma.siteConfig.findFirst({ orderBy: { createdAt: 'asc' } });
    if (current === null) {
      return apiError('NOT_FOUND', 'Configuração do site ainda não foi criada', undefined, {
        headers: limit.headers,
      });
    }

    const updated = await prisma.siteConfig.update({
      where: { id: current.id },
      data: parsed.data,
    });

    const responseBody = siteConfigResponseSchema.parse({
      data: toPublicSiteConfig(updated as unknown as Record<string, unknown>),
    });
    return NextResponse.json(responseBody, { status: 200, headers: limit.headers });
  } catch (error) {
    if (isPrismaErrorCode(error, PRISMA_RECORD_NOT_FOUND)) {
      return apiError(
        'CONFLICT',
        'A configuração foi alterada ou removida por outra escrita concorrente',
        undefined,
        { headers: limit.headers },
      );
    }
    return internalError('PATCH /api/site-config', error);
  }
}

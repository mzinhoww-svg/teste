/**
 * Infraestrutura compartilhada dos route handlers de TCK-005
 * (`/api/podcasts/**` e `/api/upload`).
 *
 * Concentra o envelope de resposta do CONTRACT-003:
 * - sucesso único: `{ data: <recurso> }`
 * - lista:         `{ data: [...], meta: { page, limit, total, totalPages } }`
 * - erro:          `{ error: { code, message, details? } }`
 *
 * Toda resposta 2xx passa pelo schema Zod correspondente antes de sair
 * (`validatedJson`). Isso transforma um erro de serialização em 500 explícito
 * em vez de um corpo fora de contrato chegando silenciosamente ao cliente —
 * foi exatamente por causa disso que os serializadores `toPublicPodcast` /
 * `toAdminPodcast` existem (ver `contracts/README.md`).
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { errorResponse } from '@/lib/auth-helpers';
import { errorResponseSchema, type BusinessRuleViolation } from '@/lib/schemas';

export type ApiErrorCode = z.infer<typeof errorResponseSchema>['error']['code'];

/** Resultado de um passo do handler: segue em frente ou devolve resposta pronta. */
export type Guard<T> = { ok: true; value: T } | { ok: false; response: NextResponse };

/**
 * `{ error: { code, message, details? } }` com o status canônico do código.
 *
 * Delega em `errorResponse` de TCK-004 para que exista UM único construtor de
 * erro na API: mesmo mapa `ERROR_STATUS_BY_CODE`, mesmo `Cache-Control:
 * no-store`, mesmo formato que o middleware devolve na borda.
 */
export function apiError(
  code: ApiErrorCode,
  message: string,
  details?: Record<string, unknown>,
): NextResponse {
  return errorResponse(code, message, details === undefined ? {} : { details });
}

/** 422 a partir de um `ZodError`, com os problemas por campo em `details.issues`. */
export function validationError(error: z.ZodError, message = 'Falha de validação'): NextResponse {
  return apiError('VALIDATION_ERROR', message, {
    issues: error.issues.map((issue) => ({
      path: issue.path.join('.'),
      code: issue.code,
      message: issue.message,
    })),
  });
}

/** 409 a partir das violações devolvidas por `validatePodcastRules`. */
export function businessRuleConflict(violations: BusinessRuleViolation[]): NextResponse {
  const [first] = violations;
  return apiError('CONFLICT', first?.message ?? 'Conflito de regra de negócio', {
    violations: violations.map((violation) => ({
      rule: violation.rule,
      message: violation.message,
      path: violation.path.join('.'),
    })),
  });
}

/**
 * Serializa uma resposta de sucesso VALIDANDO contra o schema do contrato.
 * Falha de validação vira 500 (bug do servidor), nunca corpo fora de contrato.
 */
export function validatedJson<TSchema extends z.ZodTypeAny>(
  schema: TSchema,
  payload: unknown,
  status = 200,
): NextResponse {
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    return apiError('INTERNAL_ERROR', 'Resposta gerada fora do contrato da API', {
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        code: issue.code,
        message: issue.message,
      })),
    });
  }
  return NextResponse.json(parsed.data, { status });
}

/**
 * Lê o corpo JSON da requisição. Corpo ausente ou malformado é 400
 * BAD_REQUEST — 422 fica reservado para o que o Zod recusa.
 */
export async function readJsonBody(request: Request): Promise<Guard<unknown>> {
  const contentType = request.headers.get('content-type') ?? '';
  if (contentType !== '' && !contentType.toLowerCase().includes('application/json')) {
    return {
      ok: false,
      response: apiError('BAD_REQUEST', 'Content-Type deve ser application/json'),
    };
  }

  try {
    const raw = await request.text();
    if (raw.trim() === '') {
      return { ok: false, response: apiError('BAD_REQUEST', 'Corpo da requisição vazio') };
    }
    return { ok: true, value: JSON.parse(raw) as unknown };
  } catch {
    return { ok: false, response: apiError('BAD_REQUEST', 'Corpo da requisição não é JSON válido') };
  }
}

/**
 * Aplica um schema a um valor já lido, devolvendo 422 formatado quando falha.
 * Usado para body, params de rota e querystring.
 */
export function parseWith<TSchema extends z.ZodTypeAny>(
  schema: TSchema,
  value: unknown,
  message: string,
): Guard<z.infer<TSchema>> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    return { ok: false, response: validationError(parsed.error, message) };
  }
  return { ok: true, value: parsed.data };
}

/**
 * Converte a querystring em objeto para os schemas de query (que usam
 * `z.coerce`). Parâmetros vazios (`?status=`) são descartados: um filtro em
 * branco significa "sem filtro", não "valor inválido". Chaves desconhecidas
 * (`utm_*`) são ignoradas pelo schema, que não é `.strict()`.
 */
export function searchParamsToObject(searchParams: URLSearchParams): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of searchParams.entries()) {
    if (value === '') continue;
    result[key] = value;
  }
  return result;
}

interface PrismaLikeError {
  code: string;
  meta?: { target?: unknown };
}

function isPrismaError(error: unknown): error is PrismaLikeError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof (error as { code: unknown }).code === 'string' &&
    /^P\d{4}$/.test((error as { code: string }).code)
  );
}

/**
 * Último recurso de qualquer handler: traduz erros conhecidos do Prisma e
 * devolve 500 genérico para o resto (sem vazar stack trace, ver
 * docs/SECURITY.md "Logging Seguro").
 */
export function handleRouteError(error: unknown): NextResponse {
  // Entrada do cliente NUNCA chega aqui como ZodError: body, params e query
  // passam por `parseWith`, que devolve 422 formatado. Um ZodError solto vem
  // dos serializadores (`toPublicPodcast` & cia.) tropeçando em dado do banco
  // fora do contrato — isso é defeito do servidor, logo 500 e não 422.
  if (error instanceof z.ZodError) {
    return apiError('INTERNAL_ERROR', 'Dados persistidos fora do contrato da API', {
      issues: error.issues.map((issue) => ({
        path: issue.path.join('.'),
        code: issue.code,
        message: issue.message,
      })),
    });
  }

  if (isPrismaError(error)) {
    if (error.code === 'P2002') {
      const target = Array.isArray(error.meta?.target) ? error.meta?.target.join(', ') : undefined;
      return apiError(
        'CONFLICT',
        target ? `Já existe um registro com esse ${target}` : 'Registro duplicado',
      );
    }
    if (error.code === 'P2025') {
      return apiError('NOT_FOUND', 'Recurso não encontrado');
    }
  }

  return apiError('INTERNAL_ERROR', 'Erro inesperado ao processar a requisição');
}

/**
 * Helpers de resposta das rotas de episódio (TCK-006).
 *
 * Vive sob `src/app/api/episodes/_lib/` porque este é o `write_path` do ticket:
 * pastas iniciadas por `_` não viram rota no App Router, então o módulo é
 * privado do recurso. Quando TCK-005/TCK-007 estabilizarem um utilitário
 * comum de resposta, esta camada some sem mudar nenhum handler.
 *
 * Todo corpo de erro sai no envelope único do contrato
 * (`{ error: { code, message, details? } }`) e é validado por
 * `errorResponseSchema` antes de ir para a rede — assim uma mensagem vazia ou
 * um código fora de `ErrorCode` falha aqui, e não no cliente.
 */
import { NextResponse } from 'next/server';
import type { z } from 'zod';

import {
  ERROR_STATUS_BY_CODE,
  type BusinessRuleViolation,
  errorCodeSchema,
  errorResponseSchema,
} from '@/lib/schemas';

export type ApiErrorCode = z.infer<typeof errorCodeSchema>;

/** `details` do envelope de erro: mapa livre, serializável em JSON. */
export type ApiErrorDetails = Record<string, unknown>;

/** Resposta de erro no envelope padronizado, com o status canônico do código. */
export function apiError(
  code: ApiErrorCode,
  message: string,
  details?: ApiErrorDetails,
): NextResponse {
  const body = errorResponseSchema.parse({
    error: details === undefined ? { code, message } : { code, message, details },
  });
  return NextResponse.json(body, { status: ERROR_STATUS_BY_CODE[code] });
}

/** 400 — corpo ilegível (JSON malformado). */
export function badRequest(message: string, details?: ApiErrorDetails): NextResponse {
  return apiError('BAD_REQUEST', message, details);
}

/** 404 — recurso inexistente (episódio ou programa). */
export function notFound(message: string): NextResponse {
  return apiError('NOT_FOUND', message);
}

/** 409 — payload válido que conflita com o estado persistido. */
export function conflict(message: string, details?: ApiErrorDetails): NextResponse {
  return apiError('CONFLICT', message, details);
}

/** 500 — falha inesperada. A mensagem é genérica de propósito. */
export function internalError(): NextResponse {
  return apiError('INTERNAL_ERROR', 'Erro interno ao processar a requisição');
}

/**
 * 422 — falha de validação Zod. Os `issues` viajam em `details` para o
 * formulário do admin (TCK-019) conseguir apontar o campo culpado.
 */
export function validationError(error: z.ZodError, message?: string): NextResponse {
  return apiError('VALIDATION_ERROR', message ?? 'Payload inválido', {
    issues: error.issues.map((issue) => ({
      path: issue.path.map(String),
      code: issue.code,
      message: issue.message,
    })),
  });
}

/**
 * Violação de regra de negócio avaliada sobre o estado MESCLADO.
 *
 * Sai como 409 CONFLICT (e não 422) porque, neste ponto, o payload já passou
 * pelo schema: o que falha é a combinação dele com a linha persistida — é um
 * conflito com o estado atual, não um corpo malformado. Um POST sem trilha
 * continua sendo 422, fechado pelo `.refine` de `episodeCreateSchema`.
 */
export function ruleConflict(violations: BusinessRuleViolation[]): NextResponse {
  const [first] = violations;
  return conflict(first?.message ?? 'Violação de regra de negócio', {
    violations: violations.map((violation) => ({
      rule: violation.rule,
      message: violation.message,
      path: violation.path,
    })),
  });
}

/** Resultado de `readJsonBody`: ou o valor cru, ou a resposta 400 pronta. */
export type JsonBodyResult =
  | { ok: true; value: unknown }
  | { ok: false; response: NextResponse };

/**
 * Lê o corpo como JSON. Corpo ilegível é 400 (requisição malformada); corpo
 * legível porém inválido é 422, decidido depois pelo schema Zod.
 */
export async function readJsonBody(request: Request): Promise<JsonBodyResult> {
  try {
    return { ok: true, value: (await request.json()) as unknown };
  } catch {
    return { ok: false, response: badRequest('Corpo da requisição não é JSON válido') };
  }
}

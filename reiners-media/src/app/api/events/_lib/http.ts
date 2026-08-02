/**
 * Plumbing HTTP compartilhado pelas rotas de TCK-007 (`/api/events`,
 * `/api/events/summary`, `/api/site-config`).
 *
 * POR QUE ISTO VIVE EM `api/events/_lib`: TCK-007 só pode escrever em
 * `src/app/api/events/`, `src/app/api/site-config/` e `src/lib/analytics.ts`.
 * Um módulo compartilhado precisa morar dentro de um desses caminhos; duplicar
 * o envelope de erro nas duas rotas seria pior. Quando existir um helper de API
 * comum a todos os tickets de backend (candidato natural: `src/lib/api.ts`),
 * este arquivo deve ser absorvido por ele.
 *
 * Pastas prefixadas com `_` são privadas no App Router: nada aqui vira rota.
 */
import { NextResponse } from 'next/server';
import type { z } from 'zod';

import { utf8ByteLength } from '@/lib/analytics';
import type { RateLimitPolicy, RateLimitResult } from '@/lib/auth-helpers';
import {
  consumeRateLimit,
  errorResponse,
  getClientIp,
  rateLimitHeaders,
  rateLimitKey,
} from '@/lib/auth-helpers';
import { errorResponseSchema } from '@/lib/schemas';

export type ApiErrorCode = z.infer<typeof errorResponseSchema>['error']['code'];

/**
 * Envelope de erro único da API: `{ error: { code, message, details? } }`.
 *
 * Delega em `errorResponse` de TCK-004 — mesmo construtor usado pelo middleware,
 * por `/api/auth/**` e pelos handlers de TCK-005/006. Isso garante o mesmo mapa
 * `ERROR_STATUS_BY_CODE` e, principalmente, o mesmo `Cache-Control: no-store`:
 * uma resposta de erro cacheada na borda serviria 403 (ou 429) a quem tinha
 * direito de passar.
 */
export function apiError(
  code: ApiErrorCode,
  message: string,
  details?: Record<string, unknown>,
  init?: { headers?: Record<string, string> },
): NextResponse {
  return errorResponse(code, message, {
    ...(details === undefined ? {} : { details }),
    ...(init?.headers === undefined ? {} : { headers: init.headers }),
  });
}

/** Detalhes padronizados de uma falha de validação Zod. */
export function zodDetails(error: z.ZodError): Record<string, unknown> {
  return {
    issues: error.issues.slice(0, 20).map((issue) => ({
      path: issue.path.join('.'),
      code: issue.code,
      message: issue.message,
    })),
  };
}

export interface RateLimitOutcome {
  result: RateLimitResult;
  headers: Record<string, string>;
  /** Resposta 429 pronta quando a janela estourou; `null` quando liberado. */
  blocked: NextResponse | null;
}

/**
 * Aplica o rate limit por IP e já devolve a resposta 429 formatada.
 *
 * O CONTADOR É O DE TCK-004 (`consumeRateLimit`, janela deslizante, políticas
 * de `docs/SECURITY.md`): um segundo limitador só para estas rotas criaria duas
 * verdades sobre "quantas requisições este IP já fez". O que este wrapper
 * acrescenta é o envelope de erro padronizado e os headers também nas respostas
 * de sucesso.
 *
 * Chamado ANTES de qualquer acesso ao banco: o objetivo do limite é justamente
 * não deixar a rota tocar o PostgreSQL.
 */
export function enforceRateLimit(
  request: Request & { ip?: string },
  routeId: string,
  policy: RateLimitPolicy,
): RateLimitOutcome {
  const result = consumeRateLimit(rateLimitKey(routeId, getClientIp(request)), policy);
  const headers = rateLimitHeaders(result);
  return {
    result,
    headers,
    blocked: result.allowed
      ? null
      : apiError(
          'RATE_LIMITED',
          `Limite de ${result.limit} requisições por minuto excedido. Tente novamente em ${result.retryAfterSeconds}s.`,
          { retryAfterSeconds: result.retryAfterSeconds, routeId },
          { headers },
        ),
  };
}

/**
 * Lê e faz `JSON.parse` do corpo com teto de bytes, sem estourar exceção.
 *
 * O teto é medido em BYTES UTF-8 (`utf8ByteLength`), não em `String.length`:
 * `'漢'.repeat(7000)` tem `length` 7.000 e ocupa 21.000 bytes — passaria por um
 * teto de 8.192 medido em unidades UTF-16. `String.length` é apenas um limite
 * INFERIOR do tamanho real, então não serve como guarda: a medição é sempre a
 * de bytes, feita uma única vez sobre o corpo já materializado por `.text()`.
 *
 * Excesso de tamanho responde 413 PAYLOAD_TOO_LARGE — o mesmo código que
 * `POST /api/upload` usa para arquivo acima de 5MB.
 */
export async function readJsonBody(
  request: Request,
  maxBytes: number,
): Promise<
  | { ok: true; value: unknown }
  | { ok: false; response: NextResponse }
> {
  const tooLarge = (receivedBytes: number): { ok: false; response: NextResponse } => ({
    ok: false,
    response: apiError('PAYLOAD_TOO_LARGE', `Corpo da requisição excede ${maxBytes} bytes`, {
      maxBytes,
      receivedBytes,
    }),
  });

  const raw = await request.text();
  const receivedBytes = utf8ByteLength(raw);
  if (receivedBytes > maxBytes) return tooLarge(receivedBytes);
  if (raw.trim() === '') {
    return { ok: false, response: apiError('BAD_REQUEST', 'Corpo da requisição é obrigatório') };
  }
  try {
    return { ok: true, value: JSON.parse(raw) as unknown };
  } catch {
    return { ok: false, response: apiError('BAD_REQUEST', 'Corpo da requisição não é JSON válido') };
  }
}

/**
 * Traduz uma exceção inesperada em 500 sem vazar detalhe interno para o
 * cliente. A mensagem original vai para o log (Vercel Logs — ver
 * `docs/OBSERVABILITY.md` §1).
 */
export function internalError(scope: string, error: unknown): NextResponse {
  // eslint-disable-next-line no-console -- ERROR vai para o Vercel Logs em produção
  console.error('[api] erro inesperado', {
    scope,
    message: error instanceof Error ? error.message : String(error),
  });
  return apiError('INTERNAL_ERROR', 'Erro inesperado ao processar a requisição');
}

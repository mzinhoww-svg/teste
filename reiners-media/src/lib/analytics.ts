/**
 * Reiners Media Podcast Studio — helpers de analytics (TCK-007, CONTRACT-008).
 *
 * Este módulo concentra TODA a lógica de produto das rotas `/api/events`:
 * saneamento do payload público, serialização Prisma -> resposta, agregações do
 * dashboard (TCK-020) e a política de retenção BR-009.
 *
 * Nada aqui importa `next/server` nem instancia o Prisma: as funções são puras
 * ou recebem o client por parâmetro, de modo que os testes unitários rodam sem
 * PostgreSQL e sem runtime de rota.
 *
 * RATE LIMITING NÃO MORA AQUI: o limitador é o de `@/lib/auth-helpers`
 * (TCK-004), com as políticas de `docs/SECURITY.md` em `RATE_LIMIT_POLICIES`.
 * Duas implementações concorrentes de rate limit no mesmo código seriam um
 * defeito de segurança — quem precisa limitar uma rota usa `enforceRateLimit`
 * de `src/app/api/events/_lib/http.ts`, que embrulha aquele contador.
 *
 * ---------------------------------------------------------------------------
 * BR-009 — retenção de 90 dias
 * ---------------------------------------------------------------------------
 * `purgeExpiredEvents()` apaga todo `EventLog` com `createdAt` estritamente
 * anterior a `now - EVENT_LOG_RETENTION_DAYS`. O expurgo é idempotente e não
 * depende de estado local, então pode ser reexecutado à vontade.
 *
 * AGENDAMENTO (responsabilidade de TCK-024 — NÃO criar cron aqui):
 *
 * ```jsonc
 * // vercel.json
 * {
 *   "crons": [
 *     { "path": "/api/cron/purge-events", "schedule": "0 4 * * *" }
 *   ]
 * }
 * ```
 *
 * A rota de cron (TCK-024) deve:
 * 1. exigir o header `Authorization: Bearer ${process.env.CRON_SECRET}` — o
 *    endpoint fica público na internet e um expurgo é destrutivo;
 * 2. chamar `purgeExpiredEvents(prisma)`;
 * 3. logar `{ deleted, cutoff, retentionDays }` no formato de
 *    `docs/OBSERVABILITY.md` (nível INFO, ou WARN quando `deleted` for
 *    anormalmente alto).
 *
 * Enquanto o cron não existe, o expurgo pode ser disparado manualmente por um
 * script `tsx` que importe esta função — nenhuma outra parte do sistema apaga
 * eventos.
 */
import type { Prisma, PrismaClient } from '@prisma/client';
import { z } from 'zod';

import {
  EVENT_LOG_RETENTION_DAYS,
  eventPayloadSchema,
  eventSchema,
  eventTypeSchema,
  isoDateTimeSchema,
  siteConfigSchema,
} from '@/lib/schemas';

/* -------------------------------------------------------------------------- */
/* Tipos                                                                      */
/* -------------------------------------------------------------------------- */

export type EventTypeValue = z.infer<typeof eventTypeSchema>;
export type PublicEvent = z.infer<typeof eventSchema>;
export type PublicSiteConfig = z.infer<typeof siteConfigSchema>;

/** Todos os valores de `EventType`, na ordem declarada no contrato. */
export const EVENT_TYPES: readonly EventTypeValue[] = eventTypeSchema.options;

/* -------------------------------------------------------------------------- */
/* Saneamento do payload (rota pública -> coluna Json)                        */
/* -------------------------------------------------------------------------- */

/**
 * `POST /api/events` é público e escreve no banco. `payload` é `Json?` no
 * Prisma, ou seja: sem limite de tamanho, de profundidade e de nomes de chave.
 * Sem o saneamento abaixo, um único cliente malicioso infla a tabela (custo de
 * armazenamento e de scan das agregações) com um objeto profundo de megabytes.
 *
 * Os limites são deliberadamente apertados: o payload legítimo do produto
 * (`docs/OBSERVABILITY.md` §4) é raso e pequeno — `{path, referrer, userAgent}`
 * ou `{podcastId, episodeId}`.
 */
export const EVENT_PAYLOAD_MAX_BYTES = 4096;
export const EVENT_PAYLOAD_MAX_DEPTH = 4;
/** Chaves por objeto (em qualquer nível). */
export const EVENT_PAYLOAD_MAX_KEYS = 40;
/** Nós no total (objetos + arrays + escalares) — barra árvores largas e rasas. */
export const EVENT_PAYLOAD_MAX_NODES = 200;
export const EVENT_PAYLOAD_MAX_ARRAY_ITEMS = 20;
export const EVENT_PAYLOAD_MAX_STRING_LENGTH = 2048;

/** Nome de chave aceito: identificador curto, sem espaço e sem caractere de controle. */
export const EVENT_PAYLOAD_KEY_REGEX = /^[A-Za-z_][A-Za-z0-9_.-]{0,39}$/;

/**
 * Chaves recusadas independentemente do regex. `__proto__`/`constructor`/
 * `prototype` viram poluição de protótipo assim que o objeto é reidratado por
 * `JSON.parse` em qualquer consumidor; `$`/`.` no início são a assinatura de
 * operadores de query em bancos documentais.
 */
export const FORBIDDEN_PAYLOAD_KEYS: readonly string[] = [
  '__proto__',
  'constructor',
  'prototype',
];

export type SanitizedPayload = Record<string, unknown> | null;

/**
 * Motivo da recusa, que o handler traduz em status HTTP.
 *
 * REGRA: `PAYLOAD_TOO_LARGE` (413) é reservado a limite de TAMANHO EM BYTES —
 * o mesmo significado que `POST /api/upload` dá ao arquivo acima de 5MB.
 * Limite estrutural (profundidade, nº de chaves, itens de lista, tamanho de
 * texto) é `VALIDATION_ERROR` (422): o cliente conserta reestruturando o
 * payload, não encolhendo bytes.
 */
export type PayloadRejectionCode = 'VALIDATION_ERROR' | 'PAYLOAD_TOO_LARGE';

export type PayloadSanitizationResult =
  | { ok: true; payload: SanitizedPayload }
  | { ok: false; code: PayloadRejectionCode; reason: string; path: string };

/**
 * Tamanho em BYTES UTF-8 — que é o que ocupa disco na coluna `Json` e o que
 * trafega na rede.
 *
 * `String.length` conta unidades UTF-16 e SUBCONTA em até 3x: `'漢'.length` é 1
 * e ocupa 3 bytes; um emoji fora do BMP tem `length` 2 e ocupa 4 bytes. Como
 * `POST /api/events` é público e escreve no banco, medir errado aqui é
 * exatamente o buraco que o teto deveria fechar.
 */
export function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function formatPath(segments: (string | number)[]): string {
  return segments.length === 0 ? 'payload' : `payload.${segments.join('.')}`;
}

/**
 * Normaliza e valida um payload de evento vindo da rede.
 *
 * Recusa (em vez de truncar silenciosamente) para que o cliente perceba o
 * problema: um evento gravado pela metade é pior do que um evento recusado.
 * Valores `undefined` são a única exceção — são descartados, porque
 * `JSON.stringify` faria isso de qualquer forma.
 */
export function sanitizeEventPayload(input: unknown): PayloadSanitizationResult {
  if (input === undefined || input === null) return { ok: true, payload: null };
  if (!isPlainObject(input)) {
    return {
      ok: false,
      code: 'VALIDATION_ERROR',
      reason: 'payload deve ser um objeto JSON',
      path: 'payload',
    };
  }

  let nodes = 0;
  let failure: { code: PayloadRejectionCode; reason: string; path: string } | null = null;

  function walk(value: unknown, depth: number, path: (string | number)[]): unknown {
    if (failure !== null) return undefined;
    // `undefined` some no JSON: descartamos em silêncio, como faria JSON.stringify.
    if (value === undefined) return undefined;

    nodes += 1;
    if (nodes > EVENT_PAYLOAD_MAX_NODES) {
      failure = {
        code: 'VALIDATION_ERROR',
        reason: `payload excede ${EVENT_PAYLOAD_MAX_NODES} nós`,
        path: formatPath(path),
      };
      return undefined;
    }

    if (depth > EVENT_PAYLOAD_MAX_DEPTH) {
      failure = {
        code: 'VALIDATION_ERROR',
        reason: `payload excede a profundidade máxima de ${EVENT_PAYLOAD_MAX_DEPTH}`,
        path: formatPath(path),
      };
      return undefined;
    }

    if (value === null) return null;

    switch (typeof value) {
      case 'string':
        if (value.length > EVENT_PAYLOAD_MAX_STRING_LENGTH) {
          failure = {
            code: 'VALIDATION_ERROR',
            reason: `texto excede ${EVENT_PAYLOAD_MAX_STRING_LENGTH} caracteres`,
            path: formatPath(path),
          };
          return undefined;
        }
        return value;
      case 'boolean':
        return value;
      case 'number':
        if (!Number.isFinite(value)) {
          failure = {
            code: 'VALIDATION_ERROR',
            reason: 'número precisa ser finito',
            path: formatPath(path),
          };
          return undefined;
        }
        return value;
      case 'object':
        break;
      default:
        failure = {
          code: 'VALIDATION_ERROR',
          reason: `tipo ${typeof value} não é serializável em JSON`,
          path: formatPath(path),
        };
        return undefined;
    }

    if (Array.isArray(value)) {
      if (value.length > EVENT_PAYLOAD_MAX_ARRAY_ITEMS) {
        failure = {
          code: 'VALIDATION_ERROR',
          reason: `lista excede ${EVENT_PAYLOAD_MAX_ARRAY_ITEMS} itens`,
          path: formatPath(path),
        };
        return undefined;
      }
      const items: unknown[] = [];
      for (let index = 0; index < value.length; index += 1) {
        const item = walk(value[index], depth + 1, [...path, index]);
        if (failure !== null) return undefined;
        if (item !== undefined) items.push(item);
      }
      return items;
    }

    if (!isPlainObject(value)) {
      failure = {
        code: 'VALIDATION_ERROR',
        reason: 'objeto não serializável em JSON',
        path: formatPath(path),
      };
      return undefined;
    }

    const keys = Object.keys(value);
    if (keys.length > EVENT_PAYLOAD_MAX_KEYS) {
      failure = {
        code: 'VALIDATION_ERROR',
        reason: `objeto excede ${EVENT_PAYLOAD_MAX_KEYS} chaves`,
        path: formatPath(path),
      };
      return undefined;
    }

    const result: Record<string, unknown> = {};
    for (const key of keys) {
      if (FORBIDDEN_PAYLOAD_KEYS.includes(key.toLowerCase())) {
        failure = {
          code: 'VALIDATION_ERROR',
          reason: `chave "${key}" não é permitida`,
          path: formatPath([...path, key]),
        };
        return undefined;
      }
      if (!EVENT_PAYLOAD_KEY_REGEX.test(key)) {
        failure = {
          code: 'VALIDATION_ERROR',
          reason: `chave "${key}" fora do formato aceito (${EVENT_PAYLOAD_KEY_REGEX.source})`,
          path: formatPath([...path, key]),
        };
        return undefined;
      }
      const child = walk(value[key], depth + 1, [...path, key]);
      if (failure !== null) return undefined;
      if (child !== undefined) result[key] = child;
    }
    return result;
  }

  const sanitized = walk(input, 1, []);
  if (failure !== null) {
    // O cast existe porque o fluxo de controle não enxerga as atribuições
    // feitas dentro de `walk`, e por isso estreita `failure` para `null`.
    const rejection = failure as { code: PayloadRejectionCode; reason: string; path: string };
    return { ok: false, code: rejection.code, reason: rejection.reason, path: rejection.path };
  }

  // BYTES UTF-8, não `String.length`: ver `utf8ByteLength`.
  const serializedBytes = utf8ByteLength(JSON.stringify(sanitized ?? {}));
  if (serializedBytes > EVENT_PAYLOAD_MAX_BYTES) {
    return {
      ok: false,
      code: 'PAYLOAD_TOO_LARGE',
      reason: `payload serializado excede ${EVENT_PAYLOAD_MAX_BYTES} bytes UTF-8 (recebido: ${serializedBytes})`,
      path: 'payload',
    };
  }

  const parsed = eventPayloadSchema.safeParse(sanitized);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      code: 'VALIDATION_ERROR',
      reason: issue?.message ?? 'payload inválido',
      path: formatPath(issue?.path ?? []),
    };
  }

  return { ok: true, payload: parsed.data as Record<string, unknown> };
}

/** Erro lançado por `recordEvent` quando o payload não passa no saneamento. */
export class AnalyticsPayloadError extends Error {
  readonly path: string;
  /** `PAYLOAD_TOO_LARGE` -> 413; `VALIDATION_ERROR` -> 422. */
  readonly code: PayloadRejectionCode;

  constructor(reason: string, path: string, code: PayloadRejectionCode = 'VALIDATION_ERROR') {
    super(reason);
    this.name = 'AnalyticsPayloadError';
    this.path = path;
    this.code = code;
  }
}

/* -------------------------------------------------------------------------- */
/* Serialização Prisma -> resposta                                            */
/* -------------------------------------------------------------------------- */

/**
 * ARMADILHA (a mesma documentada em `contracts/README.md`): o Prisma devolve
 * `Date` nos timestamps e `null` nas colunas `Json?`, enquanto os schemas de
 * resposta exigem string ISO-8601 e, no caso de `SiteConfig`, são `.strict()`.
 * Passar a linha crua para `.parse()` derruba a rota com 500.
 */
function toIsoIfDate(value: unknown): unknown {
  return value instanceof Date ? value.toISOString() : value;
}

/**
 * Payload persistido -> payload de resposta. Linhas antigas (ou gravadas antes
 * do saneamento) podem conter qualquer JSON: em vez de derrubar uma listagem
 * inteira com 500, o valor incompatível vira `null`.
 */
export function normalizeStoredPayload(value: unknown): SanitizedPayload {
  if (value === null || value === undefined) return null;
  if (!isPlainObject(value)) return null;
  const parsed = eventPayloadSchema.safeParse(value);
  return parsed.success ? (parsed.data as Record<string, unknown>) : null;
}

/** Converte uma linha de `EventLog` na forma pública do contrato. */
export function toPublicEvent(row: Record<string, unknown>): PublicEvent {
  return eventSchema.parse({
    id: row.id,
    eventType: row.eventType,
    payload: normalizeStoredPayload(row.payload),
    createdAt: toIsoIfDate(row.createdAt),
  });
}

/** Converte uma linha de `SiteConfig` na forma pública do contrato. */
export function toPublicSiteConfig(row: Record<string, unknown>): PublicSiteConfig {
  const picked: Record<string, unknown> = {};
  for (const key of Object.keys(siteConfigSchema.shape)) {
    picked[key] = toIsoIfDate(row[key]);
  }
  return siteConfigSchema.parse(picked);
}

/* -------------------------------------------------------------------------- */
/* Registro de eventos                                                        */
/* -------------------------------------------------------------------------- */

export interface RecordEventInput {
  eventType: EventTypeValue;
  payload?: unknown;
}

/**
 * Persiste um evento já validado. Usado pelo handler de `POST /api/events` e
 * disponível para os eventos de origem servidor (`ADMIN_LOGIN` em TCK-004,
 * `EPISODE_CREATE` em TCK-006).
 *
 * Lança `AnalyticsPayloadError` quando o payload não passa no saneamento.
 */
export async function recordEvent(
  client: PrismaClient,
  input: RecordEventInput,
): Promise<PublicEvent> {
  const eventType = eventTypeSchema.parse(input.eventType);
  const sanitized = sanitizeEventPayload(input.payload);
  if (!sanitized.ok) {
    throw new AnalyticsPayloadError(sanitized.reason, sanitized.path, sanitized.code);
  }

  const row = await client.eventLog.create({
    data: {
      eventType,
      // O payload já passou pelo saneamento: só há escalares, arrays e objetos
      // simples, exatamente o que `InputJsonObject` aceita.
      payload:
        sanitized.payload === null
          ? undefined
          : (sanitized.payload as Prisma.InputJsonObject),
    },
  });
  return toPublicEvent(row as unknown as Record<string, unknown>);
}

/**
 * Versão que nunca propaga erro: telemetria não pode derrubar o fluxo de
 * negócio que a originou. Devolve `true` quando o evento foi gravado.
 */
export async function recordEventSafe(
  client: PrismaClient,
  input: RecordEventInput,
): Promise<boolean> {
  try {
    await recordEvent(client, input);
    return true;
  } catch (error) {
    // eslint-disable-next-line no-console -- destino de log em produção é o Vercel Logs (docs/OBSERVABILITY.md §1)
    console.warn('[analytics] falha ao registrar evento', {
      eventType: input.eventType,
      message: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

/* -------------------------------------------------------------------------- */
/* Agregações para o dashboard (TCK-020)                                      */
/* -------------------------------------------------------------------------- */

export const EVENT_SUMMARY_BUCKETS = ['hour', 'day'] as const;
export const eventSummaryBucketSchema = z.enum(EVENT_SUMMARY_BUCKETS);
export type EventSummaryBucket = z.infer<typeof eventSummaryBucketSchema>;

/** Janela padrão quando o cliente não informa `from`/`to`. */
export const EVENT_SUMMARY_DEFAULT_DAYS = 30;
/** Janela máxima por granularidade — protege o banco e o tamanho da resposta. */
export const EVENT_SUMMARY_MAX_DAYS: Record<EventSummaryBucket, number> = {
  hour: 31,
  day: 366,
};
/** Teto de linhas lidas por agregação. */
export const EVENT_SUMMARY_MAX_ROWS = 20_000;

const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 86_400_000;

export const eventSummaryQuerySchema = z.object({
  from: isoDateTimeSchema.optional(),
  to: isoDateTimeSchema.optional(),
  bucket: eventSummaryBucketSchema.default('day'),
  eventType: eventTypeSchema.optional(),
});
export type EventSummaryQuery = z.infer<typeof eventSummaryQuerySchema>;

export const eventSummaryPointSchema = z.object({
  /** Chave do balde: `YYYY-MM-DD` (day) ou `YYYY-MM-DDTHH` (hour), sempre UTC. */
  bucket: z.string().min(1),
  startsAt: isoDateTimeSchema,
  total: z.number().int().min(0),
  byType: z.record(eventTypeSchema, z.number().int().min(0)),
});

export const eventSummarySchema = z.object({
  range: z.object({
    from: isoDateTimeSchema,
    to: isoDateTimeSchema,
    bucket: eventSummaryBucketSchema,
  }),
  total: z.number().int().min(0),
  /** `true` quando o teto de `EVENT_SUMMARY_MAX_ROWS` foi atingido. */
  truncated: z.boolean(),
  byType: z.array(z.object({ eventType: eventTypeSchema, count: z.number().int().min(0) })),
  timeSeries: z.array(eventSummaryPointSchema),
});

export const eventSummaryResponseSchema = z.object({ data: eventSummarySchema });
export type EventSummary = z.infer<typeof eventSummarySchema>;

export interface EventSample {
  eventType: string;
  createdAt: Date | string;
}

export interface ResolvedRange {
  from: Date;
  to: Date;
  bucket: EventSummaryBucket;
}

export type RangeResolution =
  | { ok: true; range: ResolvedRange }
  | { ok: false; reason: string; path: string };

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

/** Início do balde em UTC (sem DST, aritmética de ms é segura). */
export function bucketStart(value: Date | string, bucket: EventSummaryBucket): Date {
  const date = toDate(value);
  return bucket === 'hour'
    ? new Date(
        Date.UTC(
          date.getUTCFullYear(),
          date.getUTCMonth(),
          date.getUTCDate(),
          date.getUTCHours(),
        ),
      )
    : new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/** Chave textual do balde, estável e ordenável lexicograficamente. */
export function bucketKey(value: Date | string, bucket: EventSummaryBucket): string {
  const iso = bucketStart(value, bucket).toISOString();
  return bucket === 'hour' ? iso.slice(0, 13) : iso.slice(0, 10);
}

/**
 * Resolve `from`/`to` aplicando o padrão de 30 dias e os tetos por
 * granularidade. Devolve violação em vez de lançar, para o handler traduzir em
 * 422 sem `try/catch`.
 */
export function resolveSummaryRange(
  query: Pick<EventSummaryQuery, 'from' | 'to' | 'bucket'>,
  now: Date = new Date(),
): RangeResolution {
  const bucket = query.bucket;
  const to = query.to === undefined ? now : new Date(query.to);
  const from =
    query.from === undefined
      ? new Date(to.getTime() - EVENT_SUMMARY_DEFAULT_DAYS * MS_PER_DAY)
      : new Date(query.from);

  if (Number.isNaN(from.getTime())) {
    return { ok: false, reason: 'from não é uma data válida', path: 'from' };
  }
  if (Number.isNaN(to.getTime())) {
    return { ok: false, reason: 'to não é uma data válida', path: 'to' };
  }
  if (from.getTime() > to.getTime()) {
    return { ok: false, reason: 'from precisa ser anterior ou igual a to', path: 'from' };
  }

  const maxDays = EVENT_SUMMARY_MAX_DAYS[bucket];
  if (to.getTime() - from.getTime() > maxDays * MS_PER_DAY) {
    return {
      ok: false,
      reason: `intervalo excede ${maxDays} dias para o balde "${bucket}"`,
      path: 'from',
    };
  }

  return { ok: true, range: { from, to, bucket } };
}

function emptyCounts(): Record<EventTypeValue, number> {
  const counts = {} as Record<EventTypeValue, number>;
  for (const type of EVENT_TYPES) counts[type] = 0;
  return counts;
}

/**
 * Contagem por tipo, com todos os tipos do enum presentes (zero incluído) —
 * o dashboard de TCK-020 não precisa tratar chave ausente. Ordenado por
 * contagem decrescente e, no empate, pelo nome.
 */
export function countEventsByType(
  samples: readonly EventSample[],
): { eventType: EventTypeValue; count: number }[] {
  const counts = emptyCounts();
  for (const sample of samples) {
    const parsed = eventTypeSchema.safeParse(sample.eventType);
    if (parsed.success) counts[parsed.data] += 1;
  }
  return EVENT_TYPES.map((eventType) => ({ eventType, count: counts[eventType] })).sort(
    (a, b) => b.count - a.count || a.eventType.localeCompare(b.eventType),
  );
}

/**
 * Série temporal com baldes vazios preenchidos: um gráfico sem zero-fill mente
 * sobre os dias em que nada aconteceu.
 */
export function buildTimeSeries(
  samples: readonly EventSample[],
  range: ResolvedRange,
): z.infer<typeof eventSummaryPointSchema>[] {
  const step = range.bucket === 'hour' ? MS_PER_HOUR : MS_PER_DAY;
  const first = bucketStart(range.from, range.bucket).getTime();
  const last = bucketStart(range.to, range.bucket).getTime();

  const points = new Map<string, z.infer<typeof eventSummaryPointSchema>>();
  for (let cursor = first; cursor <= last; cursor += step) {
    const startsAt = new Date(cursor);
    points.set(bucketKey(startsAt, range.bucket), {
      bucket: bucketKey(startsAt, range.bucket),
      startsAt: startsAt.toISOString(),
      total: 0,
      byType: emptyCounts(),
    });
  }

  for (const sample of samples) {
    const parsed = eventTypeSchema.safeParse(sample.eventType);
    if (!parsed.success) continue;
    const key = bucketKey(sample.createdAt, range.bucket);
    const point = points.get(key);
    if (point === undefined) continue;
    point.total += 1;
    const byType = point.byType as Record<EventTypeValue, number>;
    byType[parsed.data] += 1;
  }

  return [...points.values()];
}

/** Agrega uma coleção de amostras já carregada (função pura, testável isolada). */
export function summarizeEvents(
  samples: readonly EventSample[],
  range: ResolvedRange,
  options: { truncated?: boolean } = {},
): EventSummary {
  return {
    range: {
      from: range.from.toISOString(),
      to: range.to.toISOString(),
      bucket: range.bucket,
    },
    total: samples.length,
    truncated: options.truncated ?? false,
    byType: countEventsByType(samples),
    timeSeries: buildTimeSeries(samples, range),
  };
}

/**
 * Carrega as amostras do intervalo e agrega. Uma varredura única em memória
 * substitui `groupBy` + SQL bruto: o volume esperado do produto é pequeno e o
 * teto de `EVENT_SUMMARY_MAX_ROWS` mantém o custo limitado. Se o volume crescer,
 * trocar por `$queryRaw` com `date_trunc` mantendo esta assinatura.
 */
export async function fetchEventSummary(
  client: PrismaClient,
  range: ResolvedRange,
  filters: { eventType?: EventTypeValue } = {},
): Promise<EventSummary> {
  const rows = await client.eventLog.findMany({
    where: {
      createdAt: { gte: range.from, lte: range.to },
      ...(filters.eventType === undefined ? {} : { eventType: filters.eventType }),
    },
    select: { eventType: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
    take: EVENT_SUMMARY_MAX_ROWS,
  });

  return summarizeEvents(rows as EventSample[], range, {
    truncated: rows.length >= EVENT_SUMMARY_MAX_ROWS,
  });
}

/* -------------------------------------------------------------------------- */
/* BR-009 — retenção de 90 dias                                               */
/* -------------------------------------------------------------------------- */

/** Dias de retenção do `EventLog` (BR-009). Reexportado por conveniência. */
export const EVENT_RETENTION_DAYS = EVENT_LOG_RETENTION_DAYS;

const MAX_RETENTION_DAYS = 3_650;

function assertRetentionDays(retentionDays: number): void {
  if (!Number.isInteger(retentionDays) || retentionDays < 1 || retentionDays > MAX_RETENTION_DAYS) {
    throw new RangeError(`retentionDays deve ser um inteiro entre 1 e ${MAX_RETENTION_DAYS}`);
  }
}

/**
 * Data-limite do expurgo: eventos com `createdAt` **estritamente menor** que
 * este instante são apagados. Um evento com exatamente 90 dias sobrevive.
 */
export function resolveRetentionCutoff(
  now: Date = new Date(),
  retentionDays: number = EVENT_RETENTION_DAYS,
): Date {
  assertRetentionDays(retentionDays);
  return new Date(now.getTime() - retentionDays * MS_PER_DAY);
}

/** `true` quando o evento já ultrapassou a janela de retenção. */
export function isEventExpired(
  createdAt: Date | string,
  now: Date = new Date(),
  retentionDays: number = EVENT_RETENTION_DAYS,
): boolean {
  return toDate(createdAt).getTime() < resolveRetentionCutoff(now, retentionDays).getTime();
}

export interface PurgeResult {
  deleted: number;
  /** Corte aplicado, em ISO-8601, para log e auditoria. */
  cutoff: string;
  retentionDays: number;
}

/**
 * BR-009 — apaga todo `EventLog` anterior ao corte de retenção.
 *
 * Idempotente: rodar duas vezes seguidas devolve `deleted: 0` na segunda.
 * O agendamento (cron da Vercel) é de TCK-024 — ver o cabeçalho deste arquivo.
 */
export async function purgeExpiredEvents(
  client: PrismaClient,
  options: { now?: Date; retentionDays?: number } = {},
): Promise<PurgeResult> {
  const retentionDays = options.retentionDays ?? EVENT_RETENTION_DAYS;
  const cutoff = resolveRetentionCutoff(options.now ?? new Date(), retentionDays);
  const { count } = await client.eventLog.deleteMany({ where: { createdAt: { lt: cutoff } } });
  return { deleted: count, cutoff: cutoff.toISOString(), retentionDays };
}

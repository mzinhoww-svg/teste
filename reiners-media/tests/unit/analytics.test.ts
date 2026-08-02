/**
 * TCK-007 — testes unitários de `src/lib/analytics.ts`.
 *
 * Cobre saneamento de payload (a rota pública escreve no banco), serialização
 * Prisma -> resposta, agregações do dashboard (TCK-020) e a política de
 * retenção de 90 dias (BR-009).
 *
 * O rate limiting NÃO é testado aqui: quem limita é `consumeRateLimit` de
 * `@/lib/auth-helpers` (TCK-004). O efeito nas rotas de TCK-007 (429) está
 * coberto nos testes de integração.
 *
 * Sem PostgreSQL: as funções que tocam o banco recebem um client falso.
 */
import type { PrismaClient } from '@prisma/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  AnalyticsPayloadError,
  EVENT_PAYLOAD_MAX_ARRAY_ITEMS,
  EVENT_PAYLOAD_MAX_BYTES,
  EVENT_PAYLOAD_MAX_DEPTH,
  EVENT_PAYLOAD_MAX_KEYS,
  EVENT_PAYLOAD_MAX_NODES,
  EVENT_PAYLOAD_MAX_STRING_LENGTH,
  EVENT_RETENTION_DAYS,
  EVENT_SUMMARY_DEFAULT_DAYS,
  EVENT_SUMMARY_MAX_DAYS,
  EVENT_TYPES,
  bucketKey,
  bucketStart,
  buildTimeSeries,
  countEventsByType,
  eventSummaryResponseSchema,
  fetchEventSummary,
  isEventExpired,
  normalizeStoredPayload,
  purgeExpiredEvents,
  recordEvent,
  recordEventSafe,
  resolveRetentionCutoff,
  resolveSummaryRange,
  sanitizeEventPayload,
  summarizeEvents,
  toPublicEvent,
  toPublicSiteConfig,
  utf8ByteLength,
} from '@/lib/analytics';
import { EVENT_LOG_RETENTION_DAYS } from '@/lib/schemas';

const MS_PER_DAY = 86_400_000;
const NOW = new Date('2026-08-02T12:00:00.000Z');

function daysAgo(days: number, from: Date = NOW): Date {
  return new Date(from.getTime() - days * MS_PER_DAY);
}

/* -------------------------------------------------------------------------- */
/* Saneamento de payload                                                      */
/* -------------------------------------------------------------------------- */

describe('sanitizeEventPayload', () => {
  it('aceita o payload legítimo do produto (docs/OBSERVABILITY.md §4)', () => {
    const result = sanitizeEventPayload({
      path: '/portfolio',
      referrer: 'https://google.com',
      userAgent: 'Mozilla/5.0',
      podcastId: '3f6c3f2e-6c2b-4c8f-9a5e-6b1f9a2d4c11',
    });
    expect(result).toEqual({
      ok: true,
      payload: {
        path: '/portfolio',
        referrer: 'https://google.com',
        userAgent: 'Mozilla/5.0',
        podcastId: '3f6c3f2e-6c2b-4c8f-9a5e-6b1f9a2d4c11',
      },
    });
  });

  it('trata ausência de payload como null', () => {
    expect(sanitizeEventPayload(undefined)).toEqual({ ok: true, payload: null });
    expect(sanitizeEventPayload(null)).toEqual({ ok: true, payload: null });
  });

  it.each([
    ['string', 'nao-e-objeto'],
    ['número', 42],
    ['array', [1, 2, 3]],
    ['booleano', true],
  ])('recusa payload que não é objeto: %s', (_label, value) => {
    const result = sanitizeEventPayload(value);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.path).toBe('payload');
  });

  it.each(['__proto__', 'constructor', 'prototype'])(
    'recusa a chave perigosa "%s"',
    (key) => {
      const payload = JSON.parse(`{"${key}": {"polluted": true}}`) as unknown;
      const result = sanitizeEventPayload(payload);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toContain(key);
    },
  );

  it.each([
    ['operador de query', '$where'],
    ['espaço', 'chave com espaço'],
    ['vazia', ''],
    ['início inválido', '1abc'],
    ['longa demais', 'a'.repeat(41)],
  ])('recusa nome de chave inválido: %s', (_label, key) => {
    const result = sanitizeEventPayload({ [key]: 'x' });
    expect(result.ok).toBe(false);
  });

  it('recusa payload mais profundo que o limite', () => {
    let deep: Record<string, unknown> = { leaf: 1 };
    for (let i = 0; i < EVENT_PAYLOAD_MAX_DEPTH + 2; i += 1) deep = { nested: deep };
    const result = sanitizeEventPayload(deep);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('profundidade');
  });

  it('recusa objeto com chaves demais', () => {
    const wide: Record<string, unknown> = {};
    for (let i = 0; i <= EVENT_PAYLOAD_MAX_KEYS; i += 1) wide[`k${i}`] = 1;
    const result = sanitizeEventPayload(wide);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('chaves');
  });

  it('recusa árvore com nós demais', () => {
    const payload: Record<string, unknown> = {};
    for (let i = 0; i < 20; i += 1) {
      payload[`g${i}`] = Object.fromEntries(
        Array.from({ length: 20 }, (_value, index) => [`k${index}`, index]),
      );
    }
    const result = sanitizeEventPayload(payload);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/nós|chaves/);
  });

  it('recusa lista com itens demais', () => {
    const result = sanitizeEventPayload({
      items: Array.from({ length: EVENT_PAYLOAD_MAX_ARRAY_ITEMS + 1 }, (_v, i) => i),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('itens');
  });

  it('recusa string acima do limite', () => {
    const result = sanitizeEventPayload({ note: 'x'.repeat(EVENT_PAYLOAD_MAX_STRING_LENGTH + 1) });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.path).toBe('payload.note');
  });

  it('recusa payload serializado acima do teto de bytes', () => {
    const chunk = 'x'.repeat(EVENT_PAYLOAD_MAX_STRING_LENGTH);
    const payload: Record<string, unknown> = {};
    for (let i = 0; i < 5; i += 1) payload[`f${i}`] = chunk;
    const result = sanitizeEventPayload(payload);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain(String(EVENT_PAYLOAD_MAX_BYTES));
      expect(result.code).toBe('PAYLOAD_TOO_LARGE');
    }
  });

  it('mede o teto em BYTES UTF-8, não em unidades UTF-16', () => {
    // 1500 ideogramas: `length` 1.500 (< 4096, passaria pela medida errada),
    // mas 4.500 bytes UTF-8 — acima do teto.
    const cjk = '漢'.repeat(1_500);
    expect(cjk.length).toBeLessThan(EVENT_PAYLOAD_MAX_BYTES);
    expect(utf8ByteLength(cjk)).toBeGreaterThan(EVENT_PAYLOAD_MAX_BYTES);

    const result = sanitizeEventPayload({ path: cjk });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('emoji fora do BMP conta 4 bytes, não 2 unidades UTF-16', () => {
    expect('🎙'.length).toBe(2);
    expect(utf8ByteLength('🎙')).toBe(4);

    // Dois campos de 1.000 emojis: cada string tem `length` 2.000 e passa no
    // limite por texto (2.048), mas o payload inteiro tem ~8.000 bytes UTF-8 —
    // acima do teto de 4.096. Medido em `String.length` (4.000) passaria.
    const chunk = '🎙'.repeat(1_000);
    expect(chunk.length).toBeLessThanOrEqual(EVENT_PAYLOAD_MAX_STRING_LENGTH);
    const payload = { a: chunk, b: chunk };
    expect(JSON.stringify(payload).length).toBeLessThan(EVENT_PAYLOAD_MAX_BYTES + 100);
    expect(utf8ByteLength(JSON.stringify(payload))).toBeGreaterThan(EVENT_PAYLOAD_MAX_BYTES);

    const result = sanitizeEventPayload(payload);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('aceita conteúdo multibyte que cabe no teto real', () => {
    const result = sanitizeEventPayload({ path: '/programa/edição-especial-🎙' });
    expect(result.ok).toBe(true);
  });

  it('recusa número não finito', () => {
    const result = sanitizeEventPayload({ ratio: Number.POSITIVE_INFINITY });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('VALIDATION_ERROR');
  });

  it('413 é só para bytes; limite estrutural é 422', () => {
    // Estrutural -> VALIDATION_ERROR (o cliente conserta reestruturando).
    for (const structural of [
      JSON.parse('{"__proto__": {"a": 1}}') as unknown,
      { items: Array.from({ length: EVENT_PAYLOAD_MAX_ARRAY_ITEMS + 1 }, (_v, i) => i) },
      { a: { b: { c: { d: { e: 1 } } } } },
      { note: 'x'.repeat(EVENT_PAYLOAD_MAX_STRING_LENGTH + 1) },
    ]) {
      const result = sanitizeEventPayload(structural);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe('VALIDATION_ERROR');
    }

    // Tamanho em bytes -> PAYLOAD_TOO_LARGE.
    const big = sanitizeEventPayload({ path: '漢'.repeat(1_500) });
    expect(big.ok).toBe(false);
    if (!big.ok) expect(big.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('descarta valores undefined em vez de recusar', () => {
    const result = sanitizeEventPayload({ path: '/home', extra: undefined });
    expect(result).toEqual({ ok: true, payload: { path: '/home' } });
  });

  it('aplica também as regras dos campos conhecidos do contrato', () => {
    const result = sanitizeEventPayload({ podcastId: 'nao-e-uuid' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.path).toBe('payload.podcastId');
  });

  it('preserva estrutura aninhada válida dentro dos limites', () => {
    const result = sanitizeEventPayload({
      path: '/programa/horizonte-digital',
      meta: { source: 'hero', tags: ['a', 'b'], index: 3, active: true, missing: null },
    });
    expect(result).toEqual({
      ok: true,
      payload: {
        path: '/programa/horizonte-digital',
        meta: { source: 'hero', tags: ['a', 'b'], index: 3, active: true, missing: null },
      },
    });
  });

  it('mantém o teto de nós compatível com o teto de chaves', () => {
    expect(EVENT_PAYLOAD_MAX_NODES).toBeGreaterThan(EVENT_PAYLOAD_MAX_KEYS);
  });
});

describe('utf8ByteLength', () => {
  it('conta bytes UTF-8, divergindo de String.length em multibyte', () => {
    expect(utf8ByteLength('abc')).toBe(3);
    expect(utf8ByteLength('漢')).toBe(3);
    expect('漢'.length).toBe(1);
    expect(utf8ByteLength('ç')).toBe(2);
    expect(utf8ByteLength('🎙')).toBe(4);
  });
});

/* -------------------------------------------------------------------------- */
/* Serialização Prisma -> resposta                                            */
/* -------------------------------------------------------------------------- */

describe('toPublicEvent', () => {
  it('converte Date em ISO-8601 (armadilha do contrato)', () => {
    const event = toPublicEvent({
      id: '3f6c3f2e-6c2b-4c8f-9a5e-6b1f9a2d4c11',
      eventType: 'PAGE_VIEW',
      payload: { path: '/' },
      createdAt: new Date('2026-08-01T10:00:00.000Z'),
    });
    expect(event.createdAt).toBe('2026-08-01T10:00:00.000Z');
    expect(event.payload).toEqual({ path: '/' });
  });

  it('normaliza payload nulo e payload incompatível', () => {
    const base = {
      id: '3f6c3f2e-6c2b-4c8f-9a5e-6b1f9a2d4c11',
      eventType: 'PAGE_VIEW',
      createdAt: new Date('2026-08-01T10:00:00.000Z'),
    };
    expect(toPublicEvent({ ...base, payload: null }).payload).toBeNull();
    expect(toPublicEvent({ ...base, payload: 'string-solta' }).payload).toBeNull();
    expect(toPublicEvent({ ...base, payload: { path: 42 } }).payload).toBeNull();
  });

  it('ignora colunas novas da tabela', () => {
    const event = toPublicEvent({
      id: '3f6c3f2e-6c2b-4c8f-9a5e-6b1f9a2d4c11',
      eventType: 'CARD_EXPAND',
      payload: null,
      createdAt: new Date('2026-08-01T10:00:00.000Z'),
      colunaNova: 'ignorada',
    });
    expect(event).not.toHaveProperty('colunaNova');
  });

  it('normalizeStoredPayload devolve null para valores não-objeto', () => {
    expect(normalizeStoredPayload(undefined)).toBeNull();
    expect(normalizeStoredPayload([1, 2])).toBeNull();
    expect(normalizeStoredPayload({ path: '/x' })).toEqual({ path: '/x' });
  });
});

describe('toPublicSiteConfig', () => {
  const row = {
    id: '3f6c3f2e-6c2b-4c8f-9a5e-6b1f9a2d4c22',
    siteName: 'Reiners Media',
    tagline: 'Conteúdo que conecta',
    logoUrl: '/images/logo.svg',
    faviconUrl: null,
    primaryColor: '#d87dff',
    seoTitle: null,
    seoDescription: null,
    analyticsId: null,
    facebookPixel: null,
    customCss: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-08-01T00:00:00.000Z'),
  };

  it('serializa timestamps e mantém os campos do contrato', () => {
    const config = toPublicSiteConfig(row);
    expect(config.createdAt).toBe('2026-01-01T00:00:00.000Z');
    expect(config.updatedAt).toBe('2026-08-01T00:00:00.000Z');
    expect(config.logoUrl).toBe('/images/logo.svg');
    expect(config.faviconUrl).toBeNull();
  });

  it('descarta colunas desconhecidas em vez de estourar no schema .strict()', () => {
    const config = toPublicSiteConfig({ ...row, internalNotes: 'segredo' });
    expect(config).not.toHaveProperty('internalNotes');
  });
});

/* -------------------------------------------------------------------------- */
/* Registro de eventos                                                        */
/* -------------------------------------------------------------------------- */

function createFakeClient(overrides: Record<string, unknown> = {}): {
  client: PrismaClient;
  create: ReturnType<typeof vi.fn>;
} {
  const create = vi.fn(async (args: { data: { eventType: string; payload?: unknown } }) => ({
    id: '3f6c3f2e-6c2b-4c8f-9a5e-6b1f9a2d4c11',
    eventType: args.data.eventType,
    payload: args.data.payload ?? null,
    createdAt: new Date('2026-08-02T12:00:00.000Z'),
  }));
  const client = { eventLog: { create, ...overrides } } as unknown as PrismaClient;
  return { client, create };
}

describe('recordEvent', () => {
  it('persiste o evento saneado e devolve a forma pública', async () => {
    const { client, create } = createFakeClient();
    const event = await recordEvent(client, {
      eventType: 'EPISODE_PLAY',
      payload: { episodeId: '3f6c3f2e-6c2b-4c8f-9a5e-6b1f9a2d4c33', extra: undefined },
    });

    expect(create).toHaveBeenCalledWith({
      data: {
        eventType: 'EPISODE_PLAY',
        payload: { episodeId: '3f6c3f2e-6c2b-4c8f-9a5e-6b1f9a2d4c33' },
      },
    });
    expect(event.createdAt).toBe('2026-08-02T12:00:00.000Z');
  });

  it('grava payload ausente como undefined (coluna Json nula)', async () => {
    const { client, create } = createFakeClient();
    await recordEvent(client, { eventType: 'ADMIN_LOGIN' });
    expect(create).toHaveBeenCalledWith({ data: { eventType: 'ADMIN_LOGIN', payload: undefined } });
  });

  it('lança AnalyticsPayloadError sem tocar o banco quando o payload é hostil', async () => {
    const { client, create } = createFakeClient();
    await expect(
      recordEvent(client, {
        eventType: 'PAGE_VIEW',
        payload: JSON.parse('{"__proto__": {"admin": true}}') as unknown,
      }),
    ).rejects.toBeInstanceOf(AnalyticsPayloadError);
    expect(create).not.toHaveBeenCalled();

    await expect(
      recordEvent(client, { eventType: 'PAGE_VIEW', payload: { path: '漢'.repeat(2_000) } }),
    ).rejects.toMatchObject({ code: 'PAYLOAD_TOO_LARGE' });
  });

  it('recordEventSafe engole a falha e devolve false', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { client } = createFakeClient({
      create: vi.fn(async () => {
        throw new Error('conexão perdida');
      }),
    });
    await expect(recordEventSafe(client, { eventType: 'ADMIN_LOGIN' })).resolves.toBe(false);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('recordEventSafe devolve true no caminho feliz', async () => {
    const { client } = createFakeClient();
    await expect(recordEventSafe(client, { eventType: 'ADMIN_LOGIN' })).resolves.toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* Agregações                                                                 */
/* -------------------------------------------------------------------------- */

describe('agregações', () => {
  const samples = [
    { eventType: 'PAGE_VIEW', createdAt: new Date('2026-08-01T01:00:00.000Z') },
    { eventType: 'PAGE_VIEW', createdAt: new Date('2026-08-01T23:59:59.000Z') },
    { eventType: 'PAGE_VIEW', createdAt: new Date('2026-08-02T05:00:00.000Z') },
    { eventType: 'CARD_EXPAND', createdAt: new Date('2026-08-02T06:00:00.000Z') },
    { eventType: 'DESCONHECIDO', createdAt: new Date('2026-08-02T06:00:00.000Z') },
  ];

  it('countEventsByType preenche zeros e ordena por contagem', () => {
    const counts = countEventsByType(samples);
    expect(counts).toHaveLength(EVENT_TYPES.length);
    expect(counts[0]).toEqual({ eventType: 'PAGE_VIEW', count: 3 });
    expect(counts[1]).toEqual({ eventType: 'CARD_EXPAND', count: 1 });
    expect(counts.every((entry) => entry.count >= 0)).toBe(true);
    expect(counts.map((entry) => entry.eventType)).not.toContain('DESCONHECIDO');
  });

  it('bucketStart/bucketKey trabalham em UTC', () => {
    expect(bucketKey('2026-08-02T23:30:00.000Z', 'day')).toBe('2026-08-02');
    expect(bucketKey('2026-08-02T23:30:00.000Z', 'hour')).toBe('2026-08-02T23');
    expect(bucketStart('2026-08-02T23:30:00.000Z', 'day').toISOString()).toBe(
      '2026-08-02T00:00:00.000Z',
    );
  });

  it('buildTimeSeries preenche baldes vazios no intervalo', () => {
    const series = buildTimeSeries(samples, {
      from: new Date('2026-07-31T00:00:00.000Z'),
      to: new Date('2026-08-02T00:00:00.000Z'),
      bucket: 'day',
    });
    expect(series.map((point) => point.bucket)).toEqual(['2026-07-31', '2026-08-01', '2026-08-02']);
    expect(series[0].total).toBe(0);
    expect(series[1].total).toBe(2);
    expect(series[2].total).toBe(2);
    expect(series[2].byType.CARD_EXPAND).toBe(1);
  });

  it('buildTimeSeries respeita o balde por hora', () => {
    const series = buildTimeSeries(samples, {
      from: new Date('2026-08-02T05:00:00.000Z'),
      to: new Date('2026-08-02T07:00:00.000Z'),
      bucket: 'hour',
    });
    expect(series.map((point) => point.bucket)).toEqual([
      '2026-08-02T05',
      '2026-08-02T06',
      '2026-08-02T07',
    ]);
    expect(series[0].total).toBe(1);
    expect(series[1].total).toBe(1);
    expect(series[2].total).toBe(0);
  });

  it('summarizeEvents produz um corpo válido para o contrato do dashboard', () => {
    const summary = summarizeEvents(samples, {
      from: new Date('2026-08-01T00:00:00.000Z'),
      to: new Date('2026-08-02T00:00:00.000Z'),
      bucket: 'day',
    });
    expect(eventSummaryResponseSchema.safeParse({ data: summary }).success).toBe(true);
    expect(summary.total).toBe(samples.length);
    expect(summary.truncated).toBe(false);
  });
});

describe('resolveSummaryRange', () => {
  it('usa a janela padrão de 30 dias quando from/to não vêm', () => {
    const resolved = resolveSummaryRange({ bucket: 'day' }, NOW);
    expect(resolved.ok).toBe(true);
    if (resolved.ok) {
      expect(resolved.range.to.toISOString()).toBe(NOW.toISOString());
      expect(resolved.range.from.toISOString()).toBe(
        daysAgo(EVENT_SUMMARY_DEFAULT_DAYS).toISOString(),
      );
    }
  });

  it('recusa from posterior a to', () => {
    const resolved = resolveSummaryRange(
      { bucket: 'day', from: '2026-08-02T00:00:00Z', to: '2026-08-01T00:00:00Z' },
      NOW,
    );
    expect(resolved.ok).toBe(false);
  });

  it('recusa intervalos acima do teto de cada granularidade', () => {
    const hour = resolveSummaryRange(
      {
        bucket: 'hour',
        from: daysAgo(EVENT_SUMMARY_MAX_DAYS.hour + 1).toISOString(),
        to: NOW.toISOString(),
      },
      NOW,
    );
    expect(hour.ok).toBe(false);

    const day = resolveSummaryRange(
      {
        bucket: 'day',
        from: daysAgo(EVENT_SUMMARY_MAX_DAYS.day + 1).toISOString(),
        to: NOW.toISOString(),
      },
      NOW,
    );
    expect(day.ok).toBe(false);
  });
});

describe('fetchEventSummary', () => {
  it('consulta apenas o intervalo pedido e agrega o resultado', async () => {
    const findMany = vi.fn(async () => [
      { eventType: 'PAGE_VIEW', createdAt: new Date('2026-08-01T10:00:00.000Z') },
      { eventType: 'YOUTUBE_CLICK', createdAt: new Date('2026-08-02T10:00:00.000Z') },
    ]);
    const client = { eventLog: { findMany } } as unknown as PrismaClient;
    const range = {
      from: new Date('2026-08-01T00:00:00.000Z'),
      to: new Date('2026-08-02T23:59:59.000Z'),
      bucket: 'day' as const,
    };

    const summary = await fetchEventSummary(client, range, { eventType: 'PAGE_VIEW' });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          createdAt: { gte: range.from, lte: range.to },
          eventType: 'PAGE_VIEW',
        },
        select: { eventType: true, createdAt: true },
      }),
    );
    expect(summary.total).toBe(2);
    expect(summary.timeSeries).toHaveLength(2);
    expect(summary.truncated).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* BR-009 — retenção de 90 dias                                               */
/* -------------------------------------------------------------------------- */

describe('BR-009 — retenção de eventos', () => {
  it('a janela vem do contrato (90 dias)', () => {
    expect(EVENT_RETENTION_DAYS).toBe(EVENT_LOG_RETENTION_DAYS);
    expect(EVENT_RETENTION_DAYS).toBe(90);
  });

  it('resolveRetentionCutoff subtrai exatamente a janela', () => {
    expect(resolveRetentionCutoff(NOW).toISOString()).toBe(daysAgo(90).toISOString());
    expect(resolveRetentionCutoff(NOW, 7).toISOString()).toBe(daysAgo(7).toISOString());
  });

  it('recusa janelas de retenção inválidas', () => {
    expect(() => resolveRetentionCutoff(NOW, 0)).toThrow(RangeError);
    expect(() => resolveRetentionCutoff(NOW, 1.5)).toThrow(RangeError);
    expect(() => resolveRetentionCutoff(NOW, 99_999)).toThrow(RangeError);
  });

  it('isEventExpired trata a fronteira exata como ainda dentro da janela', () => {
    expect(isEventExpired(daysAgo(89), NOW)).toBe(false);
    expect(isEventExpired(daysAgo(90), NOW)).toBe(false);
    expect(isEventExpired(new Date(daysAgo(90).getTime() - 1), NOW)).toBe(true);
    expect(isEventExpired(daysAgo(91), NOW)).toBe(true);
  });

  it('purgeExpiredEvents apaga apenas o que passou de 90 dias', async () => {
    const rows = [
      { id: 'hoje', createdAt: daysAgo(0) },
      { id: 'd-1', createdAt: daysAgo(1) },
      { id: 'd-89', createdAt: daysAgo(89) },
      { id: 'd-90-exato', createdAt: daysAgo(90) },
      { id: 'd-91', createdAt: daysAgo(91) },
      { id: 'd-400', createdAt: daysAgo(400) },
    ];
    const deleteMany = vi.fn(async ({ where }: { where: { createdAt: { lt: Date } } }) => {
      const before = rows.length;
      const kept = rows.filter((row) => row.createdAt.getTime() >= where.createdAt.lt.getTime());
      rows.splice(0, rows.length, ...kept);
      return { count: before - rows.length };
    });
    const client = { eventLog: { deleteMany } } as unknown as PrismaClient;

    const result = await purgeExpiredEvents(client, { now: NOW });

    expect(result).toEqual({
      deleted: 2,
      cutoff: daysAgo(90).toISOString(),
      retentionDays: 90,
    });
    expect(rows.map((row) => row.id)).toEqual(['hoje', 'd-1', 'd-89', 'd-90-exato']);
  });

  it('purgeExpiredEvents é idempotente', async () => {
    const rows = [{ id: 'd-400', createdAt: daysAgo(400) }];
    const deleteMany = vi.fn(async ({ where }: { where: { createdAt: { lt: Date } } }) => {
      const before = rows.length;
      const kept = rows.filter((row) => row.createdAt.getTime() >= where.createdAt.lt.getTime());
      rows.splice(0, rows.length, ...kept);
      return { count: before - rows.length };
    });
    const client = { eventLog: { deleteMany } } as unknown as PrismaClient;

    await expect(purgeExpiredEvents(client, { now: NOW })).resolves.toMatchObject({ deleted: 1 });
    await expect(purgeExpiredEvents(client, { now: NOW })).resolves.toMatchObject({ deleted: 0 });
  });

  it('aceita janela customizada (útil para ambiente de teste ou LGPD mais estrita)', async () => {
    const deleteMany = vi.fn(async () => ({ count: 3 }));
    const client = { eventLog: { deleteMany } } as unknown as PrismaClient;

    const result = await purgeExpiredEvents(client, { now: NOW, retentionDays: 30 });

    expect(deleteMany).toHaveBeenCalledWith({ where: { createdAt: { lt: daysAgo(30) } } });
    expect(result.retentionDays).toBe(30);
  });
});

/* -------------------------------------------------------------------------- */
/* Limpeza                                                                    */
/* -------------------------------------------------------------------------- */

afterEach(() => {
  vi.restoreAllMocks();
});

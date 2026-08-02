/**
 * TCK-021 — Testes do cliente de analytics (`@/lib/analytics-client`).
 *
 * Cobertura, na ordem em que uma falha real apareceria:
 *  - paridade com o contrato de TCK-007 (enum e limites de payload);
 *  - `sendBeacon` quando existe, `fetch` + `keepalive` quando não;
 *  - falha de rede / 429 / 500 que NÃO derruba nem lança;
 *  - Do Not Track, GPC e opt-out suprimindo o envio;
 *  - batching: debounce, deduplicação, teto de espera e orçamento local;
 *  - saneamento espelhado (o cliente não emite o que o servidor recusaria);
 *  - descarga no ciclo de vida da página (pagehide / visibilitychange);
 *  - SSR: sem `window`, nada é tocado e nada é enviado;
 *  - ponte GA4.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  EVENT_PAYLOAD_MAX_ARRAY_ITEMS,
  EVENT_PAYLOAD_MAX_BYTES,
  EVENT_PAYLOAD_MAX_DEPTH,
  EVENT_PAYLOAD_MAX_KEYS,
  EVENT_PAYLOAD_MAX_NODES,
  EVENT_PAYLOAD_MAX_STRING_LENGTH,
  EVENT_PAYLOAD_KEY_REGEX,
  FORBIDDEN_PAYLOAD_KEYS,
} from '@/lib/analytics';
import {
  ANALYTICS_ENDPOINT,
  ANALYTICS_EVENT_TYPES,
  ANALYTICS_FLUSH_DELAY_MS,
  ANALYTICS_MAX_EVENTS_PER_MINUTE,
  ANALYTICS_MAX_FLUSH_DELAY_MS,
  ANALYTICS_MAX_QUEUE_SIZE,
  ANALYTICS_OPT_OUT_KEY,
  ANALYTICS_RATE_WINDOW_MS,
  CLIENT_FORBIDDEN_PAYLOAD_KEYS,
  CLIENT_KNOWN_STRING_LIMITS,
  CLIENT_PAYLOAD_KEY_REGEX,
  CLIENT_PAYLOAD_MAX_ARRAY_ITEMS,
  CLIENT_PAYLOAD_MAX_BYTES,
  CLIENT_PAYLOAD_MAX_DEPTH,
  CLIENT_PAYLOAD_MAX_KEYS,
  CLIENT_PAYLOAD_MAX_NODES,
  CLIENT_PAYLOAD_MAX_STRING_LENGTH,
  GA4_EVENT_NAMES,
  clampEventPayload,
  flushAnalytics,
  getAnalyticsOptOut,
  getAnalyticsQueueSize,
  hasDoNotTrack,
  initGa4,
  isAnalyticsEnabled,
  isValidGa4MeasurementId,
  resetAnalyticsClient,
  setAnalyticsOptOut,
  toGa4Params,
  trackEvent,
  trackPageView,
} from '@/lib/analytics-client';
import { eventTypeSchema } from '@/lib/schemas';

/* -------------------------------------------------------------------------- */
/* Dublês                                                                      */
/* -------------------------------------------------------------------------- */

const UUID_A = '11111111-1111-4111-8111-111111111111';
const UUID_B = '22222222-2222-4222-8222-222222222222';
const GA4_ID = 'G-ABC1234567';

interface SentBody {
  eventType?: unknown;
  payload?: unknown;
}

/**
 * O `Blob` do jsdom é opaco: não implementa `text()` nem `arrayBuffer()`, e
 * `FileReader` depende de timers (que aqui estão falsos). Este dublê expõe o
 * conteúdo e ainda deixa asseverar o `type` — o content-type que a rota recebe.
 */
class TestBlob {
  readonly parts: string[];
  readonly type: string;

  constructor(parts: unknown[], options: { type?: string } = {}) {
    this.parts = parts.map((part) => String(part));
    this.type = options.type ?? '';
  }

  text(): string {
    return this.parts.join('');
  }
}

/** Instala `navigator.sendBeacon`. `accepted: false` simula fila cheia. */
function stubSendBeacon(accepted = true): ReturnType<typeof vi.fn> {
  const beacon = vi.fn(() => accepted);
  Object.defineProperty(window.navigator, 'sendBeacon', {
    value: beacon,
    configurable: true,
    writable: true,
  });
  return beacon;
}

/** Remove `sendBeacon` — o browser antigo que obriga o fallback. */
function removeSendBeacon(): void {
  Object.defineProperty(window.navigator, 'sendBeacon', {
    value: undefined,
    configurable: true,
    writable: true,
  });
}

function defineNavigatorSignal(key: string, value: unknown): void {
  Object.defineProperty(window.navigator, key, { value, configurable: true, writable: true });
}

/** Lê o corpo entregue ao beacon (Blob) ou ao fetch (string). */
function readBody(payload: unknown): SentBody {
  if (typeof payload === 'string') return JSON.parse(payload) as SentBody;
  if (payload instanceof TestBlob) return JSON.parse(payload.text()) as SentBody;
  throw new Error(`corpo inesperado: ${String(payload)}`);
}

function okFetch(): ReturnType<typeof vi.fn> {
  const stub = vi.fn(async () => new Response('{}', { status: 201 }));
  vi.stubGlobal('fetch', stub);
  return stub;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('Blob', TestBlob);
  resetAnalyticsClient();
  window.localStorage.clear();
  defineNavigatorSignal('doNotTrack', null);
  defineNavigatorSignal('msDoNotTrack', undefined);
  defineNavigatorSignal('globalPrivacyControl', undefined);
  Object.defineProperty(window, 'doNotTrack', {
    value: undefined,
    configurable: true,
    writable: true,
  });
  delete (window as unknown as Record<string, unknown>).dataLayer;
  delete (window as unknown as Record<string, unknown>).gtag;
  delete (window as unknown as Record<string, unknown>)[`ga-disable-${GA4_ID}`];
});

afterEach(() => {
  resetAnalyticsClient();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/* -------------------------------------------------------------------------- */
/* Paridade com o contrato de TCK-007                                          */
/* -------------------------------------------------------------------------- */

describe('paridade com o servidor (TCK-007)', () => {
  it('replica exatamente os valores de eventTypeSchema', () => {
    expect([...ANALYTICS_EVENT_TYPES]).toEqual([...eventTypeSchema.options]);
  });

  it('replica os limites de saneamento do payload', () => {
    expect(CLIENT_PAYLOAD_MAX_BYTES).toBe(EVENT_PAYLOAD_MAX_BYTES);
    expect(CLIENT_PAYLOAD_MAX_DEPTH).toBe(EVENT_PAYLOAD_MAX_DEPTH);
    expect(CLIENT_PAYLOAD_MAX_KEYS).toBe(EVENT_PAYLOAD_MAX_KEYS);
    expect(CLIENT_PAYLOAD_MAX_NODES).toBe(EVENT_PAYLOAD_MAX_NODES);
    expect(CLIENT_PAYLOAD_MAX_ARRAY_ITEMS).toBe(EVENT_PAYLOAD_MAX_ARRAY_ITEMS);
    expect(CLIENT_PAYLOAD_MAX_STRING_LENGTH).toBe(EVENT_PAYLOAD_MAX_STRING_LENGTH);
    expect(CLIENT_PAYLOAD_KEY_REGEX.source).toBe(EVENT_PAYLOAD_KEY_REGEX.source);
    expect([...CLIENT_FORBIDDEN_PAYLOAD_KEYS]).toEqual([...FORBIDDEN_PAYLOAD_KEYS]);
  });

  it('mapeia todo EventType para um nome GA4 em snake_case', () => {
    for (const eventType of ANALYTICS_EVENT_TYPES) {
      expect(GA4_EVENT_NAMES[eventType]).toBe(eventType.toLowerCase());
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Transporte                                                                  */
/* -------------------------------------------------------------------------- */

describe('transporte', () => {
  it('usa sendBeacon quando disponível e não chama fetch', () => {
    const beacon = stubSendBeacon();
    const fetchStub = okFetch();

    trackEvent('CARD_EXPAND', { podcastId: UUID_A });
    vi.advanceTimersByTime(ANALYTICS_FLUSH_DELAY_MS);

    expect(beacon).toHaveBeenCalledTimes(1);
    expect(fetchStub).not.toHaveBeenCalled();

    const [url, body] = beacon.mock.calls[0] as [string, TestBlob];
    expect(url).toBe(ANALYTICS_ENDPOINT);
    // Mesma origem: `application/json` não custa preflight e a rota lê JSON.
    expect(body.type).toBe('application/json');
    expect(readBody(body)).toEqual({
      eventType: 'CARD_EXPAND',
      payload: { podcastId: UUID_A },
    });
  });

  it('cai para fetch com keepalive quando sendBeacon não existe', () => {
    removeSendBeacon();
    const fetchStub = okFetch();

    trackEvent('SPOTIFY_CLICK', { episodeId: UUID_B });
    vi.advanceTimersByTime(ANALYTICS_FLUSH_DELAY_MS);

    expect(fetchStub).toHaveBeenCalledTimes(1);
    const [url, init] = fetchStub.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(ANALYTICS_ENDPOINT);
    expect(init.method).toBe('POST');
    expect(init.keepalive).toBe(true);
    expect(init.headers).toMatchObject({ 'content-type': 'application/json' });
    expect(readBody(init.body)).toEqual({
      eventType: 'SPOTIFY_CLICK',
      payload: { episodeId: UUID_B },
    });
  });

  it('cai para fetch quando o beacon recusa o corpo (fila cheia)', () => {
    const beacon = stubSendBeacon(false);
    const fetchStub = okFetch();

    trackEvent('EPISODE_PLAY', { episodeId: UUID_B });
    vi.advanceTimersByTime(ANALYTICS_FLUSH_DELAY_MS);

    expect(beacon).toHaveBeenCalledTimes(1);
    expect(fetchStub).toHaveBeenCalledTimes(1);
  });

  it('omite `payload` do corpo quando não há dados (contrato aceita ausência)', () => {
    const beacon = stubSendBeacon();

    trackEvent('ADMIN_LOGIN');
    vi.advanceTimersByTime(ANALYTICS_FLUSH_DELAY_MS);

    const body = readBody((beacon.mock.calls[0] as [string, unknown])[1]);
    expect(body).toEqual({ eventType: 'ADMIN_LOGIN' });
    expect('payload' in body).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* Resiliência                                                                 */
/* -------------------------------------------------------------------------- */

describe('resiliência (REGRA ZERO: telemetria não derruba produto)', () => {
  it('não lança quando a rede falha', async () => {
    removeSendBeacon();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const fetchStub = vi.fn(() => Promise.reject(new Error('offline')));
    vi.stubGlobal('fetch', fetchStub);

    expect(() => {
      trackEvent('YOUTUBE_CLICK', { episodeId: UUID_A });
      vi.advanceTimersByTime(ANALYTICS_FLUSH_DELAY_MS);
    }).not.toThrow();

    // A rejeição precisa ter sido TRATADA (senão vira unhandled rejection).
    await Promise.resolve();
    await Promise.resolve();
    expect(fetchStub).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('POST /api/events falhou'),
      expect.objectContaining({ error: expect.stringContaining('offline') }),
    );
  });

  it('não lança quando o servidor responde 429 ou 500', async () => {
    removeSendBeacon();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const fetchStub = vi.fn(async () => new Response('{}', { status: 429 }));
    vi.stubGlobal('fetch', fetchStub);

    expect(() => {
      trackEvent('CARD_EXPAND', { podcastId: UUID_A });
      vi.advanceTimersByTime(ANALYTICS_FLUSH_DELAY_MS);
    }).not.toThrow();

    await Promise.resolve();
    await Promise.resolve();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('respondeu erro'),
      expect.objectContaining({ status: 429 }),
    );
  });

  it('não lança quando sendBeacon explode', () => {
    const beacon = vi.fn(() => {
      throw new Error('beacon queue full');
    });
    Object.defineProperty(window.navigator, 'sendBeacon', {
      value: beacon,
      configurable: true,
      writable: true,
    });
    const fetchStub = okFetch();

    expect(() => {
      trackEvent('PAGE_VIEW', { path: '/' });
      vi.advanceTimersByTime(ANALYTICS_FLUSH_DELAY_MS);
    }).not.toThrow();
    expect(fetchStub).toHaveBeenCalledTimes(1);
  });

  it('não lança quando não há transporte algum', () => {
    removeSendBeacon();
    vi.stubGlobal('fetch', undefined);

    expect(() => {
      trackEvent('PAGE_VIEW', { path: '/' });
      vi.advanceTimersByTime(ANALYTICS_FLUSH_DELAY_MS);
    }).not.toThrow();
  });

  it('não lança quando localStorage está bloqueado', () => {
    const beacon = stubSendBeacon();
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });

    expect(() => {
      trackEvent('PAGE_VIEW', { path: '/' });
      vi.advanceTimersByTime(ANALYTICS_FLUSH_DELAY_MS);
    }).not.toThrow();
    // Storage inacessível conta como "não optou por sair": o evento segue.
    expect(beacon).toHaveBeenCalledTimes(1);
    getItem.mockRestore();
  });
});

/* -------------------------------------------------------------------------- */
/* Consentimento                                                               */
/* -------------------------------------------------------------------------- */

describe('consentimento', () => {
  it.each([
    ['navigator.doNotTrack = "1"', () => defineNavigatorSignal('doNotTrack', '1')],
    ['navigator.doNotTrack = "yes"', () => defineNavigatorSignal('doNotTrack', 'yes')],
    ['navigator.msDoNotTrack = "1"', () => defineNavigatorSignal('msDoNotTrack', '1')],
    ['globalPrivacyControl', () => defineNavigatorSignal('globalPrivacyControl', true)],
    [
      'window.doNotTrack legado',
      () =>
        Object.defineProperty(window, 'doNotTrack', {
          value: '1',
          configurable: true,
          writable: true,
        }),
    ],
  ])('suprime o envio com %s', (_label, applySignal) => {
    applySignal();
    const beacon = stubSendBeacon();
    const fetchStub = okFetch();

    expect(hasDoNotTrack()).toBe(true);
    expect(isAnalyticsEnabled()).toBe(false);

    trackEvent('CARD_EXPAND', { podcastId: UUID_A });
    trackPageView();
    vi.advanceTimersByTime(ANALYTICS_MAX_FLUSH_DELAY_MS);

    expect(beacon).not.toHaveBeenCalled();
    expect(fetchStub).not.toHaveBeenCalled();
    expect(getAnalyticsQueueSize()).toBe(0);
  });

  it('suprime o envio quando o opt-out está persistido', () => {
    const beacon = stubSendBeacon();
    setAnalyticsOptOut(true);

    expect(window.localStorage.getItem(ANALYTICS_OPT_OUT_KEY)).toBe('1');
    expect(getAnalyticsOptOut()).toBe(true);
    expect(isAnalyticsEnabled()).toBe(false);

    trackEvent('CARD_EXPAND', { podcastId: UUID_A });
    vi.advanceTimersByTime(ANALYTICS_MAX_FLUSH_DELAY_MS);
    expect(beacon).not.toHaveBeenCalled();

    setAnalyticsOptOut(false);
    trackEvent('CARD_EXPAND', { podcastId: UUID_A });
    vi.advanceTimersByTime(ANALYTICS_FLUSH_DELAY_MS);
    expect(beacon).toHaveBeenCalledTimes(1);
  });

  it('descarta a fila pendente quando o usuário opta por sair', () => {
    const beacon = stubSendBeacon();

    trackEvent('CARD_EXPAND', { podcastId: UUID_A });
    expect(getAnalyticsQueueSize()).toBe(1);

    setAnalyticsOptOut(true);
    expect(getAnalyticsQueueSize()).toBe(0);

    vi.advanceTimersByTime(ANALYTICS_MAX_FLUSH_DELAY_MS);
    expect(beacon).not.toHaveBeenCalled();
  });
});

/* -------------------------------------------------------------------------- */
/* Batching                                                                    */
/* -------------------------------------------------------------------------- */

describe('batching', () => {
  it('não envia nada antes do fim da janela de debounce', () => {
    const beacon = stubSendBeacon();

    trackEvent('CARD_EXPAND', { podcastId: UUID_A });
    trackEvent('YOUTUBE_CLICK', { episodeId: UUID_A });

    vi.advanceTimersByTime(ANALYTICS_FLUSH_DELAY_MS - 1);
    expect(beacon).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(beacon).toHaveBeenCalledTimes(2);
  });

  it('deduplica eventos idênticos dentro da janela', () => {
    const beacon = stubSendBeacon();

    trackEvent('CARD_EXPAND', { podcastId: UUID_A });
    trackEvent('CARD_EXPAND', { podcastId: UUID_A });
    trackEvent('CARD_EXPAND', { podcastId: UUID_A });
    trackEvent('CARD_EXPAND', { podcastId: UUID_B });

    expect(getAnalyticsQueueSize()).toBe(2);
    vi.advanceTimersByTime(ANALYTICS_FLUSH_DELAY_MS);
    expect(beacon).toHaveBeenCalledTimes(2);
  });

  it('permite duplicatas explícitas com allowDuplicates', () => {
    const beacon = stubSendBeacon();

    trackEvent('EPISODE_PLAY', { episodeId: UUID_A });
    trackEvent('EPISODE_PLAY', { episodeId: UUID_A }, { allowDuplicates: true });

    vi.advanceTimersByTime(ANALYTICS_FLUSH_DELAY_MS);
    expect(beacon).toHaveBeenCalledTimes(2);
  });

  it('envia na hora com immediate', () => {
    const beacon = stubSendBeacon();

    trackEvent('ADMIN_LOGIN', undefined, { immediate: true });
    expect(beacon).toHaveBeenCalledTimes(1);
  });

  it('respeita o teto de espera mesmo sob rajada contínua', () => {
    const beacon = stubSendBeacon();
    const step = ANALYTICS_FLUSH_DELAY_MS - 100;

    // Cada evento reinicia o debounce: sem o teto, a fila nunca descarregaria.
    for (let index = 0; index < 5; index += 1) {
      trackEvent('CARD_EXPAND', { index });
      vi.advanceTimersByTime(step);
    }
    expect(beacon).not.toHaveBeenCalled();

    trackEvent('CARD_EXPAND', { index: 99 });
    vi.advanceTimersByTime(step);
    expect(beacon).toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('descarrega sozinha ao atingir o tamanho máximo da fila', () => {
    const beacon = stubSendBeacon();

    for (let index = 0; index < ANALYTICS_MAX_QUEUE_SIZE; index += 1) {
      trackEvent('CARD_EXPAND', { index });
    }
    expect(beacon).not.toHaveBeenCalled();

    trackEvent('CARD_EXPAND', { index: ANALYTICS_MAX_QUEUE_SIZE });
    expect(beacon).toHaveBeenCalledTimes(ANALYTICS_MAX_QUEUE_SIZE);
    expect(getAnalyticsQueueSize()).toBe(1);
  });

  it('corta em ANALYTICS_MAX_EVENTS_PER_MINUTE e libera na janela seguinte', () => {
    const beacon = stubSendBeacon();

    for (let index = 0; index < ANALYTICS_MAX_EVENTS_PER_MINUTE + 10; index += 1) {
      trackEvent('CARD_EXPAND', { index });
    }
    flushAnalytics();
    expect(beacon).toHaveBeenCalledTimes(ANALYTICS_MAX_EVENTS_PER_MINUTE);

    vi.advanceTimersByTime(ANALYTICS_RATE_WINDOW_MS);
    trackEvent('CARD_EXPAND', { index: 'depois' });
    vi.advanceTimersByTime(ANALYTICS_FLUSH_DELAY_MS);
    expect(beacon).toHaveBeenCalledTimes(ANALYTICS_MAX_EVENTS_PER_MINUTE + 1);
  });

  it('descarrega quando a aba é escondida ou descarregada', () => {
    const beacon = stubSendBeacon();

    trackEvent('CARD_EXPAND', { podcastId: UUID_A });
    window.dispatchEvent(new Event('pagehide'));
    expect(beacon).toHaveBeenCalledTimes(1);

    trackEvent('YOUTUBE_CLICK', { episodeId: UUID_A });
    Object.defineProperty(document, 'visibilityState', {
      value: 'hidden',
      configurable: true,
    });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(beacon).toHaveBeenCalledTimes(2);
  });

  it('ignora visibilitychange quando a aba continua visível', () => {
    const beacon = stubSendBeacon();

    trackEvent('CARD_EXPAND', { podcastId: UUID_A });
    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      configurable: true,
    });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(beacon).not.toHaveBeenCalled();
  });
});

/* -------------------------------------------------------------------------- */
/* Saneamento espelhado                                                        */
/* -------------------------------------------------------------------------- */

describe('clampEventPayload', () => {
  it('aceita payload nulo e vazio', () => {
    expect(clampEventPayload(undefined)).toEqual({ ok: true, payload: null, adjusted: [] });
    expect(clampEventPayload(null)).toEqual({ ok: true, payload: null, adjusted: [] });
    const empty = clampEventPayload({});
    expect(empty).toMatchObject({ ok: true, payload: null });
  });

  it('recusa entrada que não é objeto', () => {
    expect(clampEventPayload('texto')).toMatchObject({ ok: false, path: 'payload' });
    expect(clampEventPayload([1, 2])).toMatchObject({ ok: false, path: 'payload' });
  });

  it('trunca strings no limite genérico e no limite do campo conhecido', () => {
    const result = clampEventPayload({
      path: 'p'.repeat(CLIENT_PAYLOAD_MAX_STRING_LENGTH + 50),
      userAgent: 'u'.repeat(2_000),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const payload = result.payload as Record<string, string>;
    expect(payload.path).toHaveLength(CLIENT_PAYLOAD_MAX_STRING_LENGTH);
    // `userAgent` tem teto PRÓPRIO de 512 em eventPayloadSchema: truncar pelo
    // limite genérico de 2048 produziria 422 no evento mais comum do produto.
    expect(payload.userAgent).toHaveLength(CLIENT_KNOWN_STRING_LIMITS.userAgent);

    const livre = clampEventPayload({ livre: 'l'.repeat(CLIENT_PAYLOAD_MAX_STRING_LENGTH + 10) });
    expect(livre.ok).toBe(true);
    if (!livre.ok) return;
    expect((livre.payload as Record<string, string>).livre).toHaveLength(
      CLIENT_PAYLOAD_MAX_STRING_LENGTH,
    );
  });

  it('remove chaves de poluição de protótipo e chaves fora do formato', () => {
    const hostile = JSON.parse('{"__proto__":{"admin":true},"a b":1,"ok":2}') as unknown;
    const result = clampEventPayload(hostile);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload).toEqual({ ok: 2 });
    expect(({} as Record<string, unknown>).admin).toBeUndefined();
  });

  it('corta listas, profundidade e nós excedentes', () => {
    // Profundidade contada como no servidor: raiz = 1, logo `d` (nível 5) cai.
    const deep = { a: { b: { c: { d: { e: 'fundo demais' } } } } };
    const deepResult = clampEventPayload(deep);
    expect(deepResult.ok).toBe(true);
    if (!deepResult.ok) return;
    expect(deepResult.payload).toEqual({ a: { b: { c: {} } } });

    const wide = clampEventPayload({
      lista: Array.from({ length: CLIENT_PAYLOAD_MAX_ARRAY_ITEMS + 5 }, (_, i) => i),
    });
    expect(wide.ok).toBe(true);
    if (!wide.ok) return;
    expect((wide.payload as { lista: number[] }).lista).toHaveLength(
      CLIENT_PAYLOAD_MAX_ARRAY_ITEMS,
    );

    const many = clampEventPayload(
      Object.fromEntries(
        Array.from({ length: CLIENT_PAYLOAD_MAX_KEYS + 10 }, (_, i) => [`k${i}`, i]),
      ),
    );
    expect(many.ok).toBe(true);
    if (!many.ok) return;
    expect(Object.keys(many.payload ?? {})).toHaveLength(CLIENT_PAYLOAD_MAX_KEYS);
  });

  it('descarta valores não serializáveis e normaliza Date', () => {
    const result = clampEventPayload({
      quando: new Date('2026-08-02T10:00:00.000Z'),
      fn: () => undefined,
      infinito: Number.POSITIVE_INFINITY,
      bool: false,
      nulo: null,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload).toEqual({
      quando: '2026-08-02T10:00:00.000Z',
      bool: false,
      nulo: null,
    });
  });

  it('recusa UUID malformado em campo tipado (o servidor devolveria 422)', () => {
    expect(clampEventPayload({ podcastId: 'nao-e-uuid' })).toMatchObject({
      ok: false,
      path: 'payload.podcastId',
    });
    expect(clampEventPayload({ episodeId: UUID_B })).toMatchObject({ ok: true });
  });

  it('recusa payload que continua acima do teto de bytes depois de aparado', () => {
    const payload = Object.fromEntries(
      Array.from({ length: CLIENT_PAYLOAD_MAX_KEYS }, (_, i) => [
        `k${i}`,
        'x'.repeat(CLIENT_PAYLOAD_MAX_STRING_LENGTH),
      ]),
    );
    const result = clampEventPayload(payload);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain(String(CLIENT_PAYLOAD_MAX_BYTES));
  });

  it('conta bytes UTF-8, não unidades UTF-16', () => {
    // 1400 emojis fora do BMP: 2 unidades UTF-16 cada, 4 bytes cada.
    const result = clampEventPayload({ texto: '😀'.repeat(1_400) });
    expect(result.ok).toBe(false);
  });

  it('nunca deixa o cliente emitir um evento que o servidor recusaria', () => {
    const beacon = stubSendBeacon();
    trackEvent('CARD_EXPAND', { podcastId: 'id-invalido' });
    vi.advanceTimersByTime(ANALYTICS_MAX_FLUSH_DELAY_MS);
    expect(beacon).not.toHaveBeenCalled();
  });

  it('mantém o payload de PAGE_VIEW dentro do contrato', () => {
    const beacon = stubSendBeacon();
    defineNavigatorSignal('userAgent', 'A'.repeat(900));

    trackPageView({ referrer: 'https://exemplo.com/origem' });
    vi.advanceTimersByTime(ANALYTICS_FLUSH_DELAY_MS);

    const body = readBody((beacon.mock.calls[0] as [string, unknown])[1]);
    const payload = body.payload as Record<string, string>;
    expect(body.eventType).toBe('PAGE_VIEW');
    expect(payload.path).toBe('/');
    expect(payload.referrer).toBe('https://exemplo.com/origem');
    expect(payload.userAgent).toHaveLength(CLIENT_KNOWN_STRING_LIMITS.userAgent);
  });

  it('ignora eventType fora do enum do contrato', () => {
    const beacon = stubSendBeacon();
    trackEvent('NAO_EXISTE' as never, { a: 1 });
    vi.advanceTimersByTime(ANALYTICS_MAX_FLUSH_DELAY_MS);
    expect(beacon).not.toHaveBeenCalled();
  });
});

/* -------------------------------------------------------------------------- */
/* SSR                                                                         */
/* -------------------------------------------------------------------------- */

describe('SSR', () => {
  it('não toca window/navigator e não envia nada sem browser', () => {
    const beacon = stubSendBeacon();
    const fetchStub = okFetch();
    vi.stubGlobal('window', undefined);
    vi.stubGlobal('document', undefined);

    expect(typeof window).toBe('undefined');
    expect(() => {
      trackEvent('PAGE_VIEW', { path: '/programas' });
      trackPageView();
      flushAnalytics();
    }).not.toThrow();

    expect(isAnalyticsEnabled()).toBe(false);
    expect(hasDoNotTrack()).toBe(false);
    expect(getAnalyticsOptOut()).toBe(false);
    expect(initGa4(GA4_ID)).toBe(false);
    expect(getAnalyticsQueueSize()).toBe(0);
    expect(beacon).not.toHaveBeenCalled();
    expect(fetchStub).not.toHaveBeenCalled();
  });
});

/* -------------------------------------------------------------------------- */
/* GA4                                                                         */
/* -------------------------------------------------------------------------- */

describe('ponte GA4', () => {
  it('valida o formato do measurement ID', () => {
    expect(isValidGa4MeasurementId(GA4_ID)).toBe(true);
    expect(isValidGa4MeasurementId('')).toBe(false);
    expect(isValidGa4MeasurementId(undefined)).toBe(false);
    expect(isValidGa4MeasurementId('UA-12345-1')).toBe(false);
    expect(isValidGa4MeasurementId('G-ABC"</script>')).toBe(false);
  });

  it('inicializa dataLayer com js + config e é idempotente', () => {
    expect(initGa4(GA4_ID)).toBe(true);
    expect(initGa4(GA4_ID)).toBe(true);

    const commands = (window.dataLayer ?? []).map((entry) => Array.from(entry as ArrayLike<unknown>));
    expect(commands.filter((command) => command[0] === 'js')).toHaveLength(1);
    const config = commands.find((command) => command[0] === 'config');
    expect(config?.[1]).toBe(GA4_ID);
    // `send_page_view: false` — o PAGE_VIEW é nosso, senão a métrica dobra.
    expect(config?.[2]).toMatchObject({ send_page_view: false });
  });

  it('não inicializa sob DNT e marca ga-disable', () => {
    defineNavigatorSignal('doNotTrack', '1');
    expect(initGa4(GA4_ID)).toBe(false);
    expect(window.dataLayer).toBeUndefined();
    expect((window as unknown as Record<string, unknown>)[`ga-disable-${GA4_ID}`]).toBe(true);
  });

  it('recusa measurement ID inválido', () => {
    expect(initGa4('lixo')).toBe(false);
    expect(window.dataLayer).toBeUndefined();
  });

  it('espelha o evento no gtag além do EventLog', () => {
    const beacon = stubSendBeacon();
    const gtag = vi.fn();
    window.gtag = gtag;

    trackEvent('YOUTUBE_CLICK', { episodeId: UUID_A });
    vi.advanceTimersByTime(ANALYTICS_FLUSH_DELAY_MS);

    expect(gtag).toHaveBeenCalledWith('event', 'youtube_click', { episodeId: UUID_A });
    expect(beacon).toHaveBeenCalledTimes(1);
  });

  it('não espelha no gtag quando o usuário optou por sair', () => {
    const gtag = vi.fn();
    window.gtag = gtag;
    setAnalyticsOptOut(true);

    trackEvent('YOUTUBE_CLICK', { episodeId: UUID_A });
    expect(gtag).not.toHaveBeenCalled();
  });

  it('não derruba o evento interno quando o gtag explode', () => {
    const beacon = stubSendBeacon();
    window.gtag = vi.fn(() => {
      throw new Error('gtag quebrado');
    });

    expect(() => {
      trackEvent('CARD_EXPAND', { podcastId: UUID_A });
      vi.advanceTimersByTime(ANALYTICS_FLUSH_DELAY_MS);
    }).not.toThrow();
    expect(beacon).toHaveBeenCalledTimes(1);
  });

  it('aplaina parâmetros GA4: só escalares de primeiro nível, texto <= 100', () => {
    const params = toGa4Params({
      texto: 'x'.repeat(150),
      numero: 7,
      booleano: true,
      objeto: { a: 1 },
      lista: [1, 2],
      nulo: null,
    });
    expect(params).toEqual({ texto: 'x'.repeat(100), numero: 7, booleano: true });
    expect(toGa4Params(null)).toEqual({});
  });
});

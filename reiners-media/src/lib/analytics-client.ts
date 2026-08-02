/**
 * Reiners Media Podcast Studio — cliente de analytics (TCK-021).
 *
 * FR-016 (event tracking interno), FR-017 (GA4), NFR-009 (observabilidade).
 *
 * Este módulo é o LADO CLIENTE de `POST /api/events` (TCK-007,
 * `contracts/api/events.yaml`). Ele não conhece Prisma, não importa
 * `next/server` e não avalia `window` no topo do arquivo: é seguro importá-lo
 * de um Server Component, de um Client Component ou de um teste em Node.
 *
 * ---------------------------------------------------------------------------
 * REGRA ZERO — telemetria não derruba produto
 * ---------------------------------------------------------------------------
 * Nenhuma função exportada aqui lança. Rede caída, 429, 500, `localStorage`
 * bloqueado, `sendBeacon` ausente: tudo vira no-op silencioso (com `console.warn`
 * apenas fora de produção). O equivalente servidor dessa política é
 * `recordEventSafe` em `@/lib/analytics`.
 *
 * ---------------------------------------------------------------------------
 * POR QUE `sendBeacon` PRIMEIRO
 * ---------------------------------------------------------------------------
 * O evento mais valioso (o último clique antes de sair) é justamente o que se
 * perde: o browser cancela requisições pendentes ao descarregar o documento.
 * `navigator.sendBeacon` entrega o corpo fora do ciclo de vida da página.
 * Onde ele não existe (ou recusa por fila cheia), o fallback é `fetch` com
 * `keepalive: true`, que tem a mesma garantia mas teto de 64 KB por documento
 * — irrelevante aqui, o corpo máximo é ~4 KB.
 *
 * ---------------------------------------------------------------------------
 * POR QUE FILA + DEBOUNCE
 * ---------------------------------------------------------------------------
 * `POST /api/events` é limitado a 100 req/min por IP (`RATE_LIMIT_POLICIES.publicApi`)
 * e o contrato aceita UM evento por requisição (`eventCreateSchema` é `.strict()`
 * e não tem forma de array) — não existe endpoint de lote, e criar um seria
 * mudança de contrato, fora do escopo deste ticket.
 *
 * O que a fila faz, então:
 *  1. DEDUPLICA eventos idênticos (mesmo tipo + mesmo payload) dentro da janela
 *     — o caso real é o duplo-clique / hover repetido / efeito remontado em
 *     StrictMode, que sozinho já estouraria o limite;
 *  2. AGRUPA o disparo em um único ponto no tempo (`ANALYTICS_FLUSH_DELAY_MS`),
 *     com teto absoluto de espera (`ANALYTICS_MAX_FLUSH_DELAY_MS`) para nenhum
 *     evento morrer de fome, e descarga imediata quando a aba é escondida;
 *  3. Aplica um ORÇAMENTO local de `ANALYTICS_MAX_EVENTS_PER_MINUTE` (60),
 *     deliberadamente abaixo dos 100/min do servidor: quando um laço de render
 *     dispara telemetria em excesso, quem corta é o cliente, e a página nunca
 *     começa a tomar 429 — que também custaria a requisição.
 *
 * ---------------------------------------------------------------------------
 * LIMITES DE PAYLOAD — espelho do saneamento do servidor
 * ---------------------------------------------------------------------------
 * `sanitizeEventPayload` (@/lib/analytics) RECUSA o que estoura os limites:
 * 413 para bytes, 422 para estrutura. Um cliente que ignora isso gasta seu
 * orçamento de rate limit em requisições garantidamente perdidas.
 *
 * A assimetria é proposital: o servidor recusa, o cliente APARA (trunca string,
 * corta lista, descarta chave inválida) e só desiste do evento quando nem
 * aparado ele caberia. Assim o evento chega degradado em vez de não chegar.
 * As constantes abaixo são cópias das do servidor porque importá-las
 * arrastaria `@/lib/analytics` -> `@/lib/schemas` -> `zod` para dentro do bundle
 * da landing page (NFR-001). A cópia é blindada em dois níveis: paridade de
 * tipos em tempo de compilação (`EventTypesInSync`, abaixo) e asserção de
 * igualdade numérica em `tests/unit/analytics-client.test.ts`.
 *
 * ---------------------------------------------------------------------------
 * BR-009 (retenção de 90 dias)
 * ---------------------------------------------------------------------------
 * Nada aqui expira ou apaga evento. O expurgo é `purgeExpiredEvents()` de
 * `@/lib/analytics` (TCK-007) e o agendamento é de TCK-024. Duplicar a política
 * no cliente seria uma segunda fonte de verdade para a mesma regra.
 */
import type { EventTypeValue } from '@/lib/analytics';

/* -------------------------------------------------------------------------- */
/* Tipos e enum                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Espelho de `eventTypeSchema.options`. Local (e não importado) para manter o
 * `zod` fora do bundle do cliente; a paridade é garantida pelo tipo
 * `EventTypesInSync` e pelo teste de drift.
 */
export const ANALYTICS_EVENT_TYPES = [
  'PAGE_VIEW',
  'CARD_EXPAND',
  'YOUTUBE_CLICK',
  'SPOTIFY_CLICK',
  'EPISODE_PLAY',
  'ADMIN_LOGIN',
  'EPISODE_CREATE',
] as const;

export type AnalyticsEventType = (typeof ANALYTICS_EVENT_TYPES)[number];

type Equal<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Expect<T extends true> = T;

/**
 * Trava de compilação: se `eventTypeSchema` ganhar ou perder um valor em
 * `@/lib/schemas`, `pnpm typecheck` quebra AQUI, antes de qualquer 422 em
 * produção. `import type` é apagado na emissão — custo zero de runtime.
 */
export type EventTypesInSync = Expect<Equal<AnalyticsEventType, EventTypeValue>>;

/** Payload aceito pelos helpers públicos. Serializável em JSON. */
export type EventPayloadInput = Record<string, unknown>;

/** Payload já aparado, pronto para virar corpo da requisição. */
export type NormalizedPayload = Record<string, unknown> | null;

export interface TrackEventOptions {
  /** Ignora o debounce e descarrega a fila imediatamente. */
  immediate?: boolean;
  /** Desliga a deduplicação contra eventos idênticos já enfileirados. */
  allowDuplicates?: boolean;
}

export interface PageViewInput extends EventPayloadInput {
  /** Padrão: `location.pathname + location.search`. */
  path?: string;
  /** Padrão: `document.referrer` (omitido quando vazio). */
  referrer?: string;
}

/* -------------------------------------------------------------------------- */
/* Constantes de transporte e fila                                            */
/* -------------------------------------------------------------------------- */

/** Rota pública de ingestão (CONTRACT-003). Relativa: sempre mesma origem. */
export const ANALYTICS_ENDPOINT = '/api/events';

/** Chave de opt-out em `localStorage`. Valor `'1'` desliga a coleta. */
export const ANALYTICS_OPT_OUT_KEY = 'reiners-media:analytics-opt-out';

/** Janela de debounce: agrupa interações em rajada num único ponto de envio. */
export const ANALYTICS_FLUSH_DELAY_MS = 1_000;

/** Teto de espera de um evento na fila, mesmo sob rajada contínua. */
export const ANALYTICS_MAX_FLUSH_DELAY_MS = 5_000;

/** Ao atingir este tamanho a fila descarrega sem esperar o debounce. */
export const ANALYTICS_MAX_QUEUE_SIZE = 20;

/** Orçamento local, abaixo dos 100/min do servidor (margem para outras abas). */
export const ANALYTICS_MAX_EVENTS_PER_MINUTE = 60;

/** Janela deslizante do orçamento. */
export const ANALYTICS_RATE_WINDOW_MS = 60_000;

/* -------------------------------------------------------------------------- */
/* Limites espelhados de `sanitizeEventPayload` (@/lib/analytics)             */
/* -------------------------------------------------------------------------- */

/** Teto de bytes UTF-8 do payload serializado (413 no servidor). */
export const CLIENT_PAYLOAD_MAX_BYTES = 4_096;
/** Teto de bytes UTF-8 do CORPO inteiro (`EVENT_REQUEST_MAX_BYTES` da rota). */
export const CLIENT_REQUEST_MAX_BYTES = 8_192;
export const CLIENT_PAYLOAD_MAX_DEPTH = 4;
export const CLIENT_PAYLOAD_MAX_KEYS = 40;
export const CLIENT_PAYLOAD_MAX_NODES = 200;
export const CLIENT_PAYLOAD_MAX_ARRAY_ITEMS = 20;
export const CLIENT_PAYLOAD_MAX_STRING_LENGTH = 2_048;
export const CLIENT_PAYLOAD_KEY_REGEX = /^[A-Za-z_][A-Za-z0-9_.-]{0,39}$/;

/** Poluição de protótipo — recusadas pelo servidor, removidas aqui. */
export const CLIENT_FORBIDDEN_PAYLOAD_KEYS: readonly string[] = [
  '__proto__',
  'constructor',
  'prototype',
];

/**
 * Campos conhecidos de `eventPayloadSchema` têm limite PRÓPRIO, mais apertado
 * que o genérico: `userAgent` é 512, não 2048. Truncar pelo limite genérico
 * produziria 422 justamente no evento mais comum (`PAGE_VIEW`).
 */
export const CLIENT_KNOWN_STRING_LIMITS: Readonly<Record<string, number>> = {
  path: 2_048,
  referrer: 2_048,
  userAgent: 512,
};

/** Campos que o schema exige em formato UUID. */
export const CLIENT_UUID_KEYS: readonly string[] = ['podcastId', 'episodeId'];

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/* -------------------------------------------------------------------------- */
/* Ambiente                                                                   */
/* -------------------------------------------------------------------------- */

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

/** Sinais de privacidade que não estão em `lib.dom.d.ts` de forma portátil. */
type PrivacyAwareNavigator = Navigator & {
  msDoNotTrack?: string | null;
  globalPrivacyControl?: boolean;
};

/**
 * `true` apenas em browser real. Toda API de DOM neste módulo passa por aqui —
 * é o que torna o import seguro em Server Component e em teste Node.
 */
export function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

function getNavigator(): PrivacyAwareNavigator | null {
  if (!isBrowser()) return null;
  return typeof navigator === 'undefined' ? null : (navigator as PrivacyAwareNavigator);
}

const isProduction = (): boolean => process.env.NODE_ENV === 'production';

/**
 * Log de diagnóstico. Silencioso em produção: um evento perdido não é problema
 * do usuário final, e ruído no console de produção esconde erro de verdade.
 */
function devWarn(message: string, context: Record<string, unknown> = {}): void {
  if (isProduction()) return;
  // eslint-disable-next-line no-console -- DEBUG local apenas (docs/OBSERVABILITY.md §1)
  console.warn(`[analytics-client] ${message}`, context);
}

/** Bytes UTF-8, não `String.length` — mesma medida do servidor. */
export function utf8Bytes(value: string): number {
  if (typeof TextEncoder === 'undefined') {
    // Fallback conservador: 4 bytes por unidade UTF-16 nunca subestima.
    return value.length * 4;
  }
  return new TextEncoder().encode(value).length;
}

/* -------------------------------------------------------------------------- */
/* Consentimento: Do Not Track, GPC e opt-out                                 */
/* -------------------------------------------------------------------------- */

/**
 * Do Not Track e Global Privacy Control.
 *
 * Três grafias históricas: `navigator.doNotTrack` (padrão), `window.doNotTrack`
 * (Firefox antigo) e `navigator.msDoNotTrack` (IE 10/11). Firefox chegou a
 * responder `'yes'` em vez de `'1'`. Ler só uma delas deixa navegador de fora,
 * e "respeitar DNT pela metade" é o mesmo que não respeitar.
 */
export function hasDoNotTrack(): boolean {
  const nav = getNavigator();
  if (nav === null) return false;

  const legacyWindowSignal = (window as Window & { doNotTrack?: string | null }).doNotTrack;
  const signals = [nav.doNotTrack, nav.msDoNotTrack, legacyWindowSignal];
  if (signals.some((signal) => signal === '1' || signal === 'yes')) return true;

  return nav.globalPrivacyControl === true;
}

/** Lê o opt-out persistido. `localStorage` indisponível conta como "não optou". */
export function getAnalyticsOptOut(): boolean {
  if (!isBrowser()) return false;
  try {
    return window.localStorage.getItem(ANALYTICS_OPT_OUT_KEY) === '1';
  } catch {
    // Safari em navegação privada, cookies bloqueados, storage cheio.
    return false;
  }
}

/**
 * Liga/desliga a coleta para este browser. Ao optar por sair, a fila pendente é
 * descartada — o usuário não espera que o que já estava na fila ainda saia.
 */
export function setAnalyticsOptOut(optOut: boolean): void {
  if (!isBrowser()) return;
  try {
    if (optOut) {
      window.localStorage.setItem(ANALYTICS_OPT_OUT_KEY, '1');
      clearQueue();
    } else {
      window.localStorage.removeItem(ANALYTICS_OPT_OUT_KEY);
    }
  } catch {
    devWarn('localStorage indisponível: opt-out não foi persistido');
  }
}

/** Porta única de decisão: browser presente, sem DNT/GPC e sem opt-out. */
export function isAnalyticsEnabled(): boolean {
  if (!isBrowser()) return false;
  if (hasDoNotTrack()) return false;
  return !getAnalyticsOptOut();
}

/* -------------------------------------------------------------------------- */
/* Saneamento espelhado                                                       */
/* -------------------------------------------------------------------------- */

export type ClampResult =
  | { ok: true; payload: NormalizedPayload; adjusted: readonly string[] }
  | { ok: false; reason: string; path: string };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function joinPath(segments: (string | number)[]): string {
  return segments.length === 0 ? 'payload' : `payload.${segments.join('.')}`;
}

/**
 * Apara `input` até caber nos limites do servidor.
 *
 * Devolve `ok: false` só quando o evento é irrecuperável: entrada que não é
 * objeto, UUID malformado em campo tipado (erro de programação, visível em dev)
 * ou tamanho ainda excedido depois de aparado.
 */
export function clampEventPayload(input: unknown): ClampResult {
  if (input === undefined || input === null) return { ok: true, payload: null, adjusted: [] };
  if (!isPlainObject(input)) {
    return { ok: false, reason: 'payload precisa ser um objeto JSON', path: 'payload' };
  }

  const adjusted: string[] = [];
  let nodes = 0;

  function walk(value: unknown, depth: number, path: (string | number)[]): unknown {
    if (value === undefined) return undefined;

    nodes += 1;
    if (nodes > CLIENT_PAYLOAD_MAX_NODES) {
      adjusted.push(`${joinPath(path)}: descartado (teto de ${CLIENT_PAYLOAD_MAX_NODES} nós)`);
      return undefined;
    }
    if (depth > CLIENT_PAYLOAD_MAX_DEPTH) {
      adjusted.push(
        `${joinPath(path)}: descartado (profundidade > ${CLIENT_PAYLOAD_MAX_DEPTH})`,
      );
      return undefined;
    }

    if (value === null) return null;

    // `Date` não é serializável como objeto simples para o servidor (ele
    // recusaria), mas é o valor que um chamador naturalmente passaria.
    if (value instanceof Date) {
      return Number.isNaN(value.getTime()) ? undefined : value.toISOString();
    }

    switch (typeof value) {
      case 'boolean':
        return value;
      case 'number':
        if (!Number.isFinite(value)) {
          adjusted.push(`${joinPath(path)}: descartado (número não finito)`);
          return undefined;
        }
        return value;
      case 'string': {
        const limit = resolveStringLimit(path);
        if (value.length <= limit) return value;
        adjusted.push(`${joinPath(path)}: truncado em ${limit} caracteres`);
        return value.slice(0, limit);
      }
      case 'object':
        break;
      default:
        // function, symbol, bigint: JSON.stringify não os representa.
        adjusted.push(`${joinPath(path)}: descartado (tipo ${typeof value})`);
        return undefined;
    }

    if (Array.isArray(value)) {
      const source =
        value.length > CLIENT_PAYLOAD_MAX_ARRAY_ITEMS
          ? value.slice(0, CLIENT_PAYLOAD_MAX_ARRAY_ITEMS)
          : value;
      if (source.length !== value.length) {
        adjusted.push(`${joinPath(path)}: cortado em ${CLIENT_PAYLOAD_MAX_ARRAY_ITEMS} itens`);
      }
      const items: unknown[] = [];
      for (let index = 0; index < source.length; index += 1) {
        const item = walk(source[index], depth + 1, [...path, index]);
        if (item !== undefined) items.push(item);
      }
      return items;
    }

    if (!isPlainObject(value)) {
      adjusted.push(`${joinPath(path)}: descartado (objeto não serializável)`);
      return undefined;
    }

    const result: Record<string, unknown> = {};
    let kept = 0;
    for (const key of Object.keys(value)) {
      if (CLIENT_FORBIDDEN_PAYLOAD_KEYS.includes(key.toLowerCase())) {
        adjusted.push(`${joinPath([...path, key])}: chave proibida removida`);
        continue;
      }
      if (!CLIENT_PAYLOAD_KEY_REGEX.test(key)) {
        adjusted.push(`${joinPath([...path, key])}: chave fora do formato aceito`);
        continue;
      }
      if (kept >= CLIENT_PAYLOAD_MAX_KEYS) {
        adjusted.push(`${joinPath(path)}: chaves excedentes removidas`);
        break;
      }
      const child = walk(value[key], depth + 1, [...path, key]);
      if (child === undefined) continue;
      result[key] = child;
      kept += 1;
    }
    return result;
  }

  const clamped = walk(input, 1, []);
  if (!isPlainObject(clamped)) {
    return { ok: false, reason: 'payload vazio após saneamento', path: 'payload' };
  }

  for (const key of CLIENT_UUID_KEYS) {
    const value = clamped[key];
    if (value === undefined) continue;
    if (typeof value !== 'string' || !UUID_REGEX.test(value)) {
      // Erro de programação: o servidor devolveria 422 e o evento morreria
      // depois de gastar uma requisição do orçamento.
      return { ok: false, reason: `${key} precisa ser um UUID`, path: `payload.${key}` };
    }
  }

  const bytes = utf8Bytes(JSON.stringify(clamped));
  if (bytes > CLIENT_PAYLOAD_MAX_BYTES) {
    return {
      ok: false,
      reason: `payload excede ${CLIENT_PAYLOAD_MAX_BYTES} bytes UTF-8 (${bytes})`,
      path: 'payload',
    };
  }

  return { ok: true, payload: Object.keys(clamped).length === 0 ? null : clamped, adjusted };
}

function resolveStringLimit(path: (string | number)[]): number {
  if (path.length !== 1 || typeof path[0] !== 'string') return CLIENT_PAYLOAD_MAX_STRING_LENGTH;
  return CLIENT_KNOWN_STRING_LIMITS[path[0]] ?? CLIENT_PAYLOAD_MAX_STRING_LENGTH;
}

/* -------------------------------------------------------------------------- */
/* Ponte GA4 (FR-017)                                                         */
/* -------------------------------------------------------------------------- */

/** `EventType` do EventLog -> nome de evento GA4 (snake_case, <= 40 chars). */
export const GA4_EVENT_NAMES: Readonly<Record<AnalyticsEventType, string>> = {
  PAGE_VIEW: 'page_view',
  CARD_EXPAND: 'card_expand',
  YOUTUBE_CLICK: 'youtube_click',
  SPOTIFY_CLICK: 'spotify_click',
  EPISODE_PLAY: 'episode_play',
  ADMIN_LOGIN: 'admin_login',
  EPISODE_CREATE: 'episode_create',
};

/** GA4 corta valor de parâmetro em 100 caracteres — truncamos antes dele. */
export const GA4_PARAM_MAX_LENGTH = 100;

/** Formato canônico do measurement ID GA4. */
export const GA4_MEASUREMENT_ID_REGEX = /^G-[A-Z0-9]{4,20}$/;

/** `id` do `<Script>` — estável para o Next não injetar a tag duas vezes. */
export const GA4_SCRIPT_ID = 'ga4-gtag';

/**
 * Valida o measurement ID.
 *
 * NÃO é preciosismo: o valor vem de `NEXT_PUBLIC_GA4_ID`, é interpolado na URL
 * do script e passado ao `gtag`. Um valor malformado (ou colado errado, com
 * aspas ou espaço) vira requisição inútil a terceiro; um valor hostil, num
 * ambiente onde a env não é confiável, vira injeção. Barrar aqui é barato.
 */
export function isValidGa4MeasurementId(value: string | undefined | null): value is string {
  return typeof value === 'string' && GA4_MEASUREMENT_ID_REGEX.test(value);
}

/** URL do gtag.js para o measurement ID informado. */
export function buildGa4ScriptUrl(measurementId: string): string {
  return `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
}

const initializedGa4Ids = new Set<string>();

/**
 * Aplaina o payload em parâmetros GA4: só escalares de primeiro nível.
 * GA4 não indexa objeto aninhado — mandar o objeto inteiro só gasta banda.
 */
export function toGa4Params(payload: NormalizedPayload): Record<string, string | number | boolean> {
  const params: Record<string, string | number | boolean> = {};
  if (payload === null) return params;
  for (const [key, value] of Object.entries(payload)) {
    if (typeof value === 'string') {
      params[key] = value.length > GA4_PARAM_MAX_LENGTH ? value.slice(0, GA4_PARAM_MAX_LENGTH) : value;
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      params[key] = value;
    }
  }
  return params;
}

/** `gtag` já disponível (o `dataLayer` aceita comandos mesmo antes do load). */
export function getGtag(): ((...args: unknown[]) => void) | null {
  if (!isBrowser()) return null;
  return typeof window.gtag === 'function' ? window.gtag : null;
}

/**
 * Cria `dataLayer`/`gtag` e envia `js` + `config`.
 *
 * Idempotente por measurement ID: chamar de novo (StrictMode remonta o efeito)
 * não duplica a configuração — e configuração duplicada em GA4 vira sessão
 * contada duas vezes.
 *
 * Sem script inline: o shim e os comandos vivem no bundle. Ver a nota de CSP em
 * `src/components/analytics/ga4-script.tsx`.
 */
export function initGa4(measurementId: string): boolean {
  if (!isBrowser()) return false;
  if (!isValidGa4MeasurementId(measurementId)) {
    devWarn('measurement ID GA4 inválido — GA4 não inicializado', { measurementId });
    return false;
  }
  if (!isAnalyticsEnabled()) {
    // Chave oficial de desligamento do GA4: mesmo que o gtag.js carregue (por
    // outra tag, por cache), ele não coleta nada para este ID.
    (window as unknown as Record<string, unknown>)[`ga-disable-${measurementId}`] = true;
    return false;
  }
  if (initializedGa4Ids.has(measurementId)) return true;

  window.dataLayer = window.dataLayer ?? [];
  if (typeof window.gtag !== 'function') {
    // O gtag.js oficial espera o objeto `arguments` no dataLayer, não um array
    // — empurrar `[...args]` quebra o processamento dos comandos.
    function gtagShim(): void {
      // eslint-disable-next-line prefer-rest-params -- exigência do gtag.js
      (window.dataLayer as unknown[]).push(arguments);
    }
    window.gtag = gtagShim as unknown as (...args: unknown[]) => void;
  }

  window.gtag('js', new Date());
  window.gtag('config', measurementId, {
    // `PAGE_VIEW` é enviado por `trackPageView`, que também cobre navegação
    // client-side do App Router. Deixar o automático ligado dobraria a métrica.
    send_page_view: false,
    cookie_flags: 'SameSite=Lax;Secure',
  });
  initializedGa4Ids.add(measurementId);
  return true;
}

/** Espelha o evento no GA4 quando houver `gtag`. No-op silencioso sem ele. */
export function pushGa4Event(eventType: AnalyticsEventType, payload: NormalizedPayload): boolean {
  const gtag = getGtag();
  if (gtag === null) return false;
  try {
    gtag('event', GA4_EVENT_NAMES[eventType], toGa4Params(payload));
    return true;
  } catch (error) {
    devWarn('falha ao enviar evento ao GA4', { eventType, error: String(error) });
    return false;
  }
}

/* -------------------------------------------------------------------------- */
/* Fila, debounce e orçamento                                                 */
/* -------------------------------------------------------------------------- */

interface QueuedEvent {
  eventType: AnalyticsEventType;
  payload: NormalizedPayload;
  /** Assinatura para deduplicação dentro da janela. */
  key: string;
}

let queue: QueuedEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let oldestEnqueuedAt: number | null = null;
let sentAt: number[] = [];
let lifecycleBound = false;

/** Tamanho atual da fila — diagnóstico e teste. */
export function getAnalyticsQueueSize(): number {
  return queue.length;
}

function clearQueue(): void {
  queue = [];
  oldestEnqueuedAt = null;
  if (flushTimer !== null) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
}

function hasBudget(): boolean {
  const now = Date.now();
  sentAt = sentAt.filter((timestamp) => now - timestamp < ANALYTICS_RATE_WINDOW_MS);
  return sentAt.length < ANALYTICS_MAX_EVENTS_PER_MINUTE;
}

function consumeBudget(): void {
  sentAt.push(Date.now());
}

function scheduleFlush(): void {
  if (!isBrowser()) return;
  if (flushTimer !== null) clearTimeout(flushTimer);

  const waited = oldestEnqueuedAt === null ? 0 : Date.now() - oldestEnqueuedAt;
  // O debounce reinicia a cada evento; o teto impede que uma rajada contínua
  // segure indefinidamente o primeiro evento da fila.
  const delay = Math.max(0, Math.min(ANALYTICS_FLUSH_DELAY_MS, ANALYTICS_MAX_FLUSH_DELAY_MS - waited));

  flushTimer = setTimeout(() => {
    flushTimer = null;
    flushAnalytics();
  }, delay);
}

/**
 * A aba pode nunca mais voltar: `visibilitychange -> hidden` e `pagehide` são
 * os dois únicos sinais confiáveis em mobile (`beforeunload`/`unload` não
 * disparam em iOS e cancelam o bfcache).
 */
function bindLifecycleFlush(): void {
  if (lifecycleBound || !isBrowser()) return;
  lifecycleBound = true;
  window.addEventListener('pagehide', handleLifecycleFlush);
  document.addEventListener('visibilitychange', handleLifecycleFlush);
}

function unbindLifecycleFlush(): void {
  if (!lifecycleBound || !isBrowser()) return;
  lifecycleBound = false;
  window.removeEventListener('pagehide', handleLifecycleFlush);
  document.removeEventListener('visibilitychange', handleLifecycleFlush);
}

function handleLifecycleFlush(event: Event): void {
  if (event.type === 'visibilitychange' && document.visibilityState !== 'hidden') return;
  flushAnalytics();
}

/* -------------------------------------------------------------------------- */
/* Transporte                                                                 */
/* -------------------------------------------------------------------------- */

export type AnalyticsTransport = 'beacon' | 'fetch' | 'none';

function sendWithBeacon(body: string): boolean {
  const nav = getNavigator();
  if (nav === null || typeof nav.sendBeacon !== 'function') return false;
  try {
    // `application/json` mantém o corpo legível para a rota; sendo mesma
    // origem, não há preflight a pagar por esse content-type.
    const payload: BodyInit =
      typeof Blob === 'undefined' ? body : new Blob([body], { type: 'application/json' });
    return nav.sendBeacon(ANALYTICS_ENDPOINT, payload) === true;
  } catch {
    // Alguns browsers lançam quando a fila de beacons está cheia.
    return false;
  }
}

function sendWithFetch(body: string): boolean {
  if (typeof fetch !== 'function') return false;
  try {
    void fetch(ANALYTICS_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      // Sobrevive ao descarregamento do documento, como o beacon.
      keepalive: true,
      credentials: 'same-origin',
      cache: 'no-store',
    }).then(
      (response) => {
        if (!response.ok) {
          devWarn('POST /api/events respondeu erro', { status: response.status });
        }
      },
      (error: unknown) => {
        // Rede caída / requisição abortada: engolido de propósito.
        devWarn('POST /api/events falhou', { error: String(error) });
      },
    );
    return true;
  } catch (error) {
    // `fetch` pode lançar de forma síncrona com argumentos inválidos.
    devWarn('fetch indisponível para telemetria', { error: String(error) });
    return false;
  }
}

/** Beacon primeiro, `fetch` + `keepalive` depois. Nunca lança. */
export function sendAnalyticsBody(body: string): AnalyticsTransport {
  if (sendWithBeacon(body)) return 'beacon';
  if (sendWithFetch(body)) return 'fetch';
  return 'none';
}

function dispatch(event: QueuedEvent): boolean {
  const body = JSON.stringify(
    event.payload === null
      ? { eventType: event.eventType }
      : { eventType: event.eventType, payload: event.payload },
  );

  const bytes = utf8Bytes(body);
  if (bytes > CLIENT_REQUEST_MAX_BYTES) {
    devWarn('evento descartado: corpo acima do teto da rota', {
      eventType: event.eventType,
      bytes,
    });
    return false;
  }

  return sendAnalyticsBody(body) !== 'none';
}

/* -------------------------------------------------------------------------- */
/* API pública                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Envia agora tudo o que está na fila. Chamada pelo debounce, pelos eventos de
 * ciclo de vida da página e por quem precisa de garantia pontual (o hook expõe
 * como `flush`). Nunca lança.
 */
export function flushAnalytics(): void {
  if (flushTimer !== null) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (queue.length === 0) {
    oldestEnqueuedAt = null;
    return;
  }
  if (!isAnalyticsEnabled()) {
    // O consentimento pode ter mudado depois do enfileiramento.
    clearQueue();
    return;
  }

  const pending = queue;
  queue = [];
  oldestEnqueuedAt = null;

  for (const event of pending) {
    if (!hasBudget()) {
      devWarn('orçamento local de telemetria esgotado: evento descartado', {
        eventType: event.eventType,
        maxPerMinute: ANALYTICS_MAX_EVENTS_PER_MINUTE,
      });
      continue;
    }
    if (dispatch(event)) consumeBudget();
  }
}

/**
 * Registra um evento de produto: enfileira para `POST /api/events` e espelha no
 * GA4 quando ele estiver presente.
 *
 * Contrato de uso (TCK-011..020): chamar e seguir a vida. A função não devolve
 * status, não retorna Promise e nunca lança — não há nada que o chamador possa
 * fazer com uma falha de telemetria.
 */
export function trackEvent(
  eventType: AnalyticsEventType,
  payload?: EventPayloadInput,
  options: TrackEventOptions = {},
): void {
  try {
    if (!isAnalyticsEnabled()) return;
    if (!ANALYTICS_EVENT_TYPES.includes(eventType)) {
      devWarn('eventType desconhecido ignorado', { eventType });
      return;
    }

    const clamped = clampEventPayload(payload);
    if (!clamped.ok) {
      devWarn('evento descartado no cliente (o servidor recusaria)', {
        eventType,
        reason: clamped.reason,
        path: clamped.path,
      });
      return;
    }
    if (clamped.adjusted.length > 0) {
      devWarn('payload aparado antes do envio', { eventType, adjusted: clamped.adjusted });
    }

    // A deduplicação vem ANTES do GA4: os dois destinos precisam enxergar o
    // mesmo fluxo de eventos, senão a mesma interação aparece com contagens
    // diferentes no dashboard interno e no GA4.
    const key = `${eventType}:${JSON.stringify(clamped.payload)}`;
    if (options.allowDuplicates !== true && queue.some((queued) => queued.key === key)) return;

    // GA4 é síncrono e tem transporte próprio: não passa pela fila.
    pushGa4Event(eventType, clamped.payload);

    if (queue.length >= ANALYTICS_MAX_QUEUE_SIZE) {
      // Fila cheia: descarrega o que há e continua com o evento novo.
      flushAnalytics();
    }

    queue.push({ eventType, payload: clamped.payload, key });
    if (oldestEnqueuedAt === null) oldestEnqueuedAt = Date.now();
    bindLifecycleFlush();

    if (options.immediate === true) {
      flushAnalytics();
      return;
    }
    scheduleFlush();
  } catch (error) {
    // Rede de segurança final da REGRA ZERO.
    devWarn('trackEvent falhou de forma inesperada', { eventType, error: String(error) });
  }
}

/**
 * `PAGE_VIEW` com `{path, referrer, userAgent}` (docs/OBSERVABILITY.md §4).
 * O `path` cai para `location.pathname + location.search` — nunca inclui hash,
 * que é fragmento de cliente e não identifica página.
 */
export function trackPageView(input: PageViewInput = {}): void {
  if (!isBrowser()) return;
  try {
    const { path, referrer, ...rest } = input;
    const resolvedPath = path ?? `${window.location.pathname}${window.location.search}`;
    const resolvedReferrer = referrer ?? document.referrer;
    const userAgent = getNavigator()?.userAgent;

    trackEvent('PAGE_VIEW', {
      path: resolvedPath,
      ...(resolvedReferrer === undefined || resolvedReferrer === ''
        ? {}
        : { referrer: resolvedReferrer }),
      ...(userAgent === undefined || userAgent === '' ? {} : { userAgent }),
      ...rest,
    });
  } catch (error) {
    devWarn('trackPageView falhou de forma inesperada', { error: String(error) });
  }
}

/**
 * Zera todo o estado de módulo: fila, timer, orçamento, listeners e IDs GA4 já
 * configurados. Existe para os testes (e para um eventual "reset de sessão");
 * chamar em produção só perde o que ainda não foi enviado.
 */
export function resetAnalyticsClient(): void {
  clearQueue();
  sentAt = [];
  unbindLifecycleFlush();
  initializedGa4Ids.clear();
}

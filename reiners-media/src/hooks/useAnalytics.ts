'use client';

/**
 * TCK-021 — `useAnalytics`, a porta de entrada de telemetria para as páginas
 * (FR-016, FR-017; consumidores: TCK-011..TCK-020).
 *
 * ---------------------------------------------------------------------------
 * POR QUE UM HOOK, SE `@/lib/analytics-client` JÁ EXPÕE FUNÇÕES
 * ---------------------------------------------------------------------------
 *  1. `'use client'` mora aqui. Componentes consomem o hook sem precisar saber
 *     que telemetria é coisa de browser.
 *  2. Identidade ESTÁVEL. `trackEvent` acaba em `useEffect`/`useCallback` e em
 *     props de componente memoizado; se ela trocasse a cada render, cada
 *     dependência a jusante invalidaria junto — e um `useEffect` que chama
 *     `trackEvent` com ele nas deps viraria laço de eventos, estourando o rate
 *     limit de 100/min. As funções são criadas UMA vez (deps `[]`, delegando a
 *     módulo sem estado de render) e o objeto devolvido é memoizado.
 *  3. Ponto único para evoluir (contexto de consentimento, enriquecimento de
 *     payload) sem tocar em cada chamador.
 *
 * O hook NÃO cria estado de React, NÃO assina store e NÃO renderiza nada: não
 * há re-render causado por telemetria.
 *
 * @example Interação
 * ```tsx
 * 'use client';
 * const { trackEvent } = useAnalytics();
 * <button onClick={() => trackEvent('YOUTUBE_CLICK', { episodeId, podcastId })} />
 * ```
 *
 * @example Page view (uma vez por path, resistente ao StrictMode)
 * ```tsx
 * 'use client';
 * usePageView(); // ou usePageView(pathname) com usePathname() do chamador
 * ```
 */
import { useCallback, useEffect, useMemo, useRef } from 'react';

import {
  flushAnalytics,
  isAnalyticsEnabled,
  trackEvent as trackEventImpl,
  trackPageView as trackPageViewImpl,
  type AnalyticsEventType,
  type EventPayloadInput,
  type PageViewInput,
  type TrackEventOptions,
} from '@/lib/analytics-client';

export interface UseAnalyticsApi {
  /** Enfileira um evento de produto. Não lança, não devolve Promise. */
  trackEvent: (
    eventType: AnalyticsEventType,
    payload?: EventPayloadInput,
    options?: TrackEventOptions,
  ) => void;
  /** `PAGE_VIEW` com `path`/`referrer` resolvidos do documento. */
  trackPageView: (input?: PageViewInput) => void;
  /** Descarrega a fila agora (o ciclo de vida da página já faz isso sozinho). */
  flush: () => void;
  /** `false` sob SSR, Do Not Track/GPC ou opt-out. Leitura pontual, não reativa. */
  isEnabled: () => boolean;
}

/**
 * Devolve a API de telemetria. O objeto e cada função mantêm a mesma
 * identidade por toda a vida do componente.
 */
export function useAnalytics(): UseAnalyticsApi {
  const trackEvent = useCallback(
    (eventType: AnalyticsEventType, payload?: EventPayloadInput, options?: TrackEventOptions) => {
      trackEventImpl(eventType, payload, options);
    },
    [],
  );

  const trackPageView = useCallback((input?: PageViewInput) => {
    trackPageViewImpl(input);
  }, []);

  const flush = useCallback(() => {
    flushAnalytics();
  }, []);

  const isEnabled = useCallback(() => isAnalyticsEnabled(), []);

  return useMemo(
    () => ({ trackEvent, trackPageView, flush, isEnabled }),
    [trackEvent, trackPageView, flush, isEnabled],
  );
}

/**
 * Dispara `PAGE_VIEW` uma vez por path.
 *
 * A guarda de `lastPath` não é zelo excessivo: em desenvolvimento o
 * `reactStrictMode: true` (next.config.js) monta, desmonta e remonta cada
 * componente, executando o efeito DUAS vezes — sem a guarda, todo page view do
 * dev sairia dobrado, e o mesmo aconteceria a cada re-render que mudasse uma
 * dependência.
 *
 * Sem argumento, lê o path do documento no momento do efeito (nunca no render:
 * ler `location` durante o render de um componente server-rendered é hydration
 * mismatch). Quem já tem o pathname do router deve passá-lo — é o que faz o
 * hook reagir a navegação client-side.
 */
export function usePageView(path?: string, input?: PageViewInput): void {
  const lastPath = useRef<string | null>(null);
  // O payload extra não deve, sozinho, redisparar o efeito: guardamos a última
  // referência e lemos no disparo. A escrita acontece em efeito (e não durante
  // o render) porque um render descartado pelo React concorrente não deve
  // deixar rastro; este efeito é declarado ANTES do de envio, então o valor já
  // está fresco quando o page view dispara.
  const latestInput = useRef<PageViewInput | undefined>(input);
  useEffect(() => {
    latestInput.current = input;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const resolved = path ?? `${window.location.pathname}${window.location.search}`;
    if (lastPath.current === resolved) return;
    lastPath.current = resolved;
    trackPageViewImpl({ ...latestInput.current, path: resolved });
  }, [path]);
}

export default useAnalytics;

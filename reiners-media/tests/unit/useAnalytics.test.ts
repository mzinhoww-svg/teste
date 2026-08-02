/**
 * TCK-021 — Testes de `@/hooks/useAnalytics` e do componente GA4.
 *
 * Cobertura:
 *  - identidade ESTÁVEL do hook entre renders (o requisito que impede laço de
 *    eventos em `useEffect` que dependa de `trackEvent`);
 *  - delegação para o cliente de analytics (evento realmente sai);
 *  - `usePageView`: uma vez por path, imune ao duplo efeito do StrictMode;
 *  - SSR: renderização no servidor não toca `window` nem envia nada;
 *  - `Ga4Script`: nada renderizado sem `NEXT_PUBLIC_GA4_ID`, nada com ID
 *    malformado, nada sob Do Not Track; com env válida, `dataLayer` configurado
 *    e gtag.js carregado.
 *
 * Sem JSX: o arquivo é `.ts` (o write_path do ticket), então os elementos são
 * criados com `createElement` — mesma abordagem de `useReducedMotion.test.ts`.
 */
import { render, renderHook } from '@testing-library/react';
import { StrictMode, createElement, useEffect } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import Ga4Script from '@/components/analytics/ga4-script';
import { useAnalytics, usePageView } from '@/hooks/useAnalytics';
import * as analyticsClient from '@/lib/analytics-client';
import {
  ANALYTICS_FLUSH_DELAY_MS,
  flushAnalytics,
  resetAnalyticsClient,
} from '@/lib/analytics-client';

/* -------------------------------------------------------------------------- */
/* Dublês                                                                      */
/* -------------------------------------------------------------------------- */

const GA4_ID = 'G-TESTHOOK01';

/** Ver a nota em `analytics-client.test.ts`: o Blob do jsdom não é legível. */
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

function stubSendBeacon(): ReturnType<typeof vi.fn> {
  const beacon = vi.fn(() => true);
  Object.defineProperty(window.navigator, 'sendBeacon', {
    value: beacon,
    configurable: true,
    writable: true,
  });
  return beacon;
}

function defineNavigatorSignal(key: string, value: unknown): void {
  Object.defineProperty(window.navigator, key, { value, configurable: true, writable: true });
}

/** Remove toda tag de script deixada por um teste anterior. */
function removeInjectedScripts(): void {
  document.querySelectorAll('script').forEach((script) => script.remove());
}

let beacon: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.stubGlobal('Blob', TestBlob);
  resetAnalyticsClient();
  window.localStorage.clear();
  defineNavigatorSignal('doNotTrack', null);
  defineNavigatorSignal('msDoNotTrack', undefined);
  defineNavigatorSignal('globalPrivacyControl', undefined);
  delete (window as unknown as Record<string, unknown>).dataLayer;
  delete (window as unknown as Record<string, unknown>).gtag;
  delete process.env.NEXT_PUBLIC_GA4_ID;
  removeInjectedScripts();
  beacon = stubSendBeacon();
});

afterEach(() => {
  resetAnalyticsClient();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  removeInjectedScripts();
});

/* -------------------------------------------------------------------------- */
/* useAnalytics                                                                */
/* -------------------------------------------------------------------------- */

describe('useAnalytics', () => {
  it('mantém a identidade das funções e do objeto entre renders', () => {
    const { result, rerender } = renderHook(() => useAnalytics());
    const first = result.current;

    rerender();
    rerender();

    const second = result.current;
    expect(second).toBe(first);
    expect(second.trackEvent).toBe(first.trackEvent);
    expect(second.trackPageView).toBe(first.trackPageView);
    expect(second.flush).toBe(first.flush);
    expect(second.isEnabled).toBe(first.isEnabled);
  });

  it('envia o evento pelo cliente de analytics', () => {
    vi.useFakeTimers();
    try {
      const { result } = renderHook(() => useAnalytics());
      result.current.trackEvent('CARD_EXPAND', { podcastId: '11111111-1111-4111-8111-111111111111' });

      expect(beacon).not.toHaveBeenCalled();
      vi.advanceTimersByTime(ANALYTICS_FLUSH_DELAY_MS);
      expect(beacon).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('flush descarrega a fila sem esperar o debounce', () => {
    vi.useFakeTimers();
    try {
      const { result } = renderHook(() => useAnalytics());
      result.current.trackPageView({ path: '/programas' });
      expect(beacon).not.toHaveBeenCalled();

      result.current.flush();
      expect(beacon).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('isEnabled acompanha o sinal de Do Not Track', () => {
    const { result } = renderHook(() => useAnalytics());
    expect(result.current.isEnabled()).toBe(true);

    defineNavigatorSignal('doNotTrack', '1');
    expect(result.current.isEnabled()).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* usePageView                                                                 */
/* -------------------------------------------------------------------------- */

describe('usePageView', () => {
  it('dispara uma única vez por path, mesmo com re-render', () => {
    const { rerender } = renderHook(({ path }: { path: string }) => usePageView(path), {
      initialProps: { path: '/' },
    });
    // Descarregar entre os passos remove a rede de proteção da deduplicação da
    // fila: quem precisa segurar o evento repetido aqui é a guarda do hook.
    flushAnalytics();
    expect(beacon).toHaveBeenCalledTimes(1);

    rerender({ path: '/' });
    flushAnalytics();
    rerender({ path: '/' });
    flushAnalytics();
    expect(beacon).toHaveBeenCalledTimes(1);

    rerender({ path: '/programas' });
    flushAnalytics();
    expect(beacon).toHaveBeenCalledTimes(2);
  });

  it('não dobra o page view sob StrictMode (efeito montado duas vezes)', () => {
    // Espionar a CHAMADA (e não só a requisição) é o que faz este teste medir a
    // guarda do hook: a deduplicação da fila colapsaria dois envios idênticos e
    // esconderia a regressão.
    const spy = vi.spyOn(analyticsClient, 'trackPageView');

    function Probe(): null {
      usePageView('/sobre');
      return null;
    }
    render(createElement(StrictMode, null, createElement(Probe)));
    flushAnalytics();

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ path: '/sobre' }));
    expect(beacon).toHaveBeenCalledTimes(1);
  });

  it('usa o path do documento quando nenhum é informado', () => {
    renderHook(() => usePageView());
    flushAnalytics();

    expect(beacon).toHaveBeenCalledTimes(1);
    const body = JSON.parse((beacon.mock.calls[0] as [string, TestBlob])[1].text()) as {
      eventType: string;
      payload: { path: string };
    };
    expect(body.eventType).toBe('PAGE_VIEW');
    expect(body.payload.path).toBe('/');
  });
});

/* -------------------------------------------------------------------------- */
/* SSR                                                                         */
/* -------------------------------------------------------------------------- */

describe('SSR', () => {
  it('não envia telemetria nem lança ao renderizar no servidor', () => {
    function Page(): null {
      const analytics = useAnalytics();
      usePageView('/servidor');
      useEffect(() => {
        analytics.trackEvent('CARD_EXPAND');
      }, [analytics]);
      return null;
    }

    expect(renderToStaticMarkup(createElement(Page))).toBe('');
    // Efeitos não rodam no servidor: nenhuma requisição de telemetria sai.
    expect(beacon).not.toHaveBeenCalled();
  });

  it('Ga4Script não emite markup no servidor nem com a env definida', () => {
    vi.stubEnv('NEXT_PUBLIC_GA4_ID', GA4_ID);
    // O consentimento só é conhecido no cliente: o HTML do servidor nunca traz
    // a tag, o que também evita hydration mismatch.
    expect(renderToStaticMarkup(createElement(Ga4Script))).toBe('');
  });
});

/* -------------------------------------------------------------------------- */
/* Ga4Script                                                                   */
/* -------------------------------------------------------------------------- */

describe('Ga4Script', () => {
  it('não renderiza nada sem NEXT_PUBLIC_GA4_ID', () => {
    const { container } = render(createElement(Ga4Script));

    expect(process.env.NEXT_PUBLIC_GA4_ID).toBeUndefined();
    expect(container.innerHTML).toBe('');
    expect(document.querySelector('script[src*="googletagmanager"]')).toBeNull();
    expect(window.dataLayer).toBeUndefined();
  });

  it('não renderiza nada com measurement ID malformado', () => {
    vi.stubEnv('NEXT_PUBLIC_GA4_ID', 'UA-123456-1');
    const { container } = render(createElement(Ga4Script));

    expect(container.innerHTML).toBe('');
    expect(document.querySelector('script[src*="googletagmanager"]')).toBeNull();
    expect(window.dataLayer).toBeUndefined();
  });

  it('não carrega o gtag.js sob Do Not Track e desliga o measurement ID', () => {
    defineNavigatorSignal('doNotTrack', '1');
    vi.stubEnv('NEXT_PUBLIC_GA4_ID', GA4_ID);

    const { container } = render(createElement(Ga4Script));

    expect(container.innerHTML).toBe('');
    expect(document.querySelector('script[src*="googletagmanager"]')).toBeNull();
    expect(window.dataLayer).toBeUndefined();
    expect((window as unknown as Record<string, unknown>)[`ga-disable-${GA4_ID}`]).toBe(true);
  });

  it('configura o dataLayer e carrega o gtag.js com a env válida', () => {
    const measurementId = 'G-VALIDCASE1';
    vi.stubEnv('NEXT_PUBLIC_GA4_ID', measurementId);

    render(createElement(Ga4Script));

    const commands = (window.dataLayer ?? []).map((entry) =>
      Array.from(entry as ArrayLike<unknown>),
    );
    const config = commands.find((command) => command[0] === 'config');
    expect(config?.[1]).toBe(measurementId);
    expect(config?.[2]).toMatchObject({ send_page_view: false });

    const script = document.querySelector<HTMLScriptElement>('script[src*="googletagmanager"]');
    expect(script).not.toBeNull();
    expect(script?.src).toContain(`id=${measurementId}`);
  });

  it('aceita measurementId por prop, sobrepondo a env', () => {
    const measurementId = 'G-VIAPROP001';
    vi.stubEnv('NEXT_PUBLIC_GA4_ID', 'G-DAENV00001');

    render(createElement(Ga4Script, { measurementId }));

    const commands = (window.dataLayer ?? []).map((entry) =>
      Array.from(entry as ArrayLike<unknown>),
    );
    expect(commands.find((command) => command[0] === 'config')?.[1]).toBe(measurementId);
  });
});

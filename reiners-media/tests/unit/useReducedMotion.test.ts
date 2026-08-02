/**
 * TCK-010 — Testes do hook `useReducedMotion`.
 *
 * Cobertura:
 *  - valor inicial nos dois estados da preferência;
 *  - reação à MUDANÇA da preferência em runtime (o usuário liga "reduzir
 *    movimento" com a página aberta);
 *  - cleanup do listener no unmount (nada de listener órfão);
 *  - API depreciada do Safari < 14 (`addListener`/`removeListener`);
 *  - SSR-safe: renderização no servidor não toca em `window.matchMedia` e
 *    devolve `false` — o valor que não gera hydration mismatch.
 */
import { act, renderHook } from '@testing-library/react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  REDUCED_MOTION_QUERY,
  prefersReducedMotion,
  reducedMotionStore,
  useReducedMotion,
} from '@/hooks/useReducedMotion';

/* -------------------------------------------------------------------------- */
/* Dublê de matchMedia                                                         */
/* -------------------------------------------------------------------------- */

type ChangeListener = (event: MediaQueryListEvent) => void;

interface MatchMediaHarness {
  readonly matchMedia: (query: string) => MediaQueryList;
  readonly addEventListener: ReturnType<typeof vi.fn>;
  readonly removeEventListener: ReturnType<typeof vi.fn>;
  readonly addListener: ReturnType<typeof vi.fn>;
  readonly removeListener: ReturnType<typeof vi.fn>;
  readonly queries: string[];
  emit(next: boolean): void;
}

/**
 * `matchMedia` de teste. `legacy: true` remove `addEventListener` para simular
 * Safari < 14. `matches` é lido por getter, então cada chamada devolve o valor
 * corrente — igual ao browser.
 */
function createMatchMedia(initial: boolean, legacy = false): MatchMediaHarness {
  let matches = initial;
  const listeners = new Set<ChangeListener>();
  const queries: string[] = [];

  const addEventListener = vi.fn((type: string, listener: ChangeListener) => {
    if (type === 'change') listeners.add(listener);
  });
  const removeEventListener = vi.fn((type: string, listener: ChangeListener) => {
    if (type === 'change') listeners.delete(listener);
  });
  const addListener = vi.fn((listener: ChangeListener) => {
    listeners.add(listener);
  });
  const removeListener = vi.fn((listener: ChangeListener) => {
    listeners.delete(listener);
  });

  const matchMedia = (query: string): MediaQueryList => {
    queries.push(query);

    const base = {
      media: query,
      get matches() {
        return matches;
      },
      onchange: null,
      dispatchEvent: () => false,
      addListener,
      removeListener,
    };

    const withModernApi = legacy ? base : { ...base, addEventListener, removeEventListener };

    return withModernApi as unknown as MediaQueryList;
  };

  return {
    matchMedia,
    addEventListener,
    removeEventListener,
    addListener,
    removeListener,
    queries,
    emit(next: boolean) {
      matches = next;
      const event = { matches: next, media: REDUCED_MOTION_QUERY } as MediaQueryListEvent;
      for (const listener of [...listeners]) listener(event);
    },
  };
}

function installMatchMedia(harness: MatchMediaHarness): void {
  vi.spyOn(window, 'matchMedia').mockImplementation(harness.matchMedia);
}

/** Remove `window.matchMedia` — ambiente sem suporte (jsdom antigo, worker). */
function removeMatchMedia(): void {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: undefined,
  });
}

const originalMatchMedia = window.matchMedia;

afterEach(() => {
  vi.restoreAllMocks();
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: originalMatchMedia,
  });
});

/* -------------------------------------------------------------------------- */
/* 1. Valor inicial                                                            */
/* -------------------------------------------------------------------------- */

describe('useReducedMotion — valor inicial', () => {
  it('devolve false quando a preferência está desligada', () => {
    installMatchMedia(createMatchMedia(false));

    const { result } = renderHook(() => useReducedMotion());

    expect(result.current).toBe(false);
  });

  it('devolve true quando a preferência já está ligada no primeiro render', () => {
    installMatchMedia(createMatchMedia(true));

    const { result } = renderHook(() => useReducedMotion());

    expect(result.current).toBe(true);
  });

  it('consulta exatamente a media query normativa', () => {
    const harness = createMatchMedia(false);
    installMatchMedia(harness);

    renderHook(() => useReducedMotion());

    expect(REDUCED_MOTION_QUERY).toBe('(prefers-reduced-motion: reduce)');
    expect(new Set(harness.queries)).toEqual(new Set([REDUCED_MOTION_QUERY]));
  });
});

/* -------------------------------------------------------------------------- */
/* 2. Reatividade em runtime                                                   */
/* -------------------------------------------------------------------------- */

describe('useReducedMotion — mudança em runtime', () => {
  it('re-renderiza quando o usuário liga a preferência com a página aberta', () => {
    const harness = createMatchMedia(false);
    installMatchMedia(harness);

    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);

    act(() => {
      harness.emit(true);
    });

    expect(result.current).toBe(true);
  });

  it('volta a false quando a preferência é desligada', () => {
    const harness = createMatchMedia(true);
    installMatchMedia(harness);

    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(true);

    act(() => {
      harness.emit(false);
    });

    expect(result.current).toBe(false);
  });

  it('registra o listener via addEventListener("change")', () => {
    const harness = createMatchMedia(false);
    installMatchMedia(harness);

    renderHook(() => useReducedMotion());

    expect(harness.addEventListener).toHaveBeenCalledTimes(1);
    expect(harness.addEventListener.mock.calls[0][0]).toBe('change');
  });
});

/* -------------------------------------------------------------------------- */
/* 3. Cleanup                                                                  */
/* -------------------------------------------------------------------------- */

describe('useReducedMotion — cleanup', () => {
  it('remove o mesmo listener que registrou, no unmount', () => {
    const harness = createMatchMedia(false);
    installMatchMedia(harness);

    const { unmount } = renderHook(() => useReducedMotion());
    expect(harness.removeEventListener).not.toHaveBeenCalled();

    unmount();

    expect(harness.removeEventListener).toHaveBeenCalledTimes(1);
    expect(harness.removeEventListener.mock.calls[0][0]).toBe('change');
    expect(harness.removeEventListener.mock.calls[0][1]).toBe(
      harness.addEventListener.mock.calls[0][1],
    );
  });

  it('não deixa listener órfão: após o unmount, emitir não quebra nada', () => {
    const harness = createMatchMedia(false);
    installMatchMedia(harness);

    const { result, unmount } = renderHook(() => useReducedMotion());
    unmount();

    expect(() => harness.emit(true)).not.toThrow();
    expect(result.current).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* 4. Safari < 14 (API depreciada)                                             */
/* -------------------------------------------------------------------------- */

describe('useReducedMotion — fallback addListener/removeListener', () => {
  it('assina e reage pela API depreciada', () => {
    const harness = createMatchMedia(false, true);
    installMatchMedia(harness);

    const { result, unmount } = renderHook(() => useReducedMotion());

    expect(harness.addListener).toHaveBeenCalledTimes(1);

    act(() => {
      harness.emit(true);
    });
    expect(result.current).toBe(true);

    unmount();
    expect(harness.removeListener).toHaveBeenCalledTimes(1);
    expect(harness.removeListener.mock.calls[0][0]).toBe(
      harness.addListener.mock.calls[0][0],
    );
  });
});

/* -------------------------------------------------------------------------- */
/* 5. Ambientes sem matchMedia / SSR                                           */
/* -------------------------------------------------------------------------- */

describe('useReducedMotion — SSR e ambientes sem matchMedia', () => {
  it('getServerSnapshot é sempre false (evita hydration mismatch)', () => {
    installMatchMedia(createMatchMedia(true));

    expect(reducedMotionStore.getServerSnapshot()).toBe(false);
  });

  it('renderiza no servidor sem tocar em window.matchMedia', () => {
    const matchMedia = vi.fn(() => {
      throw new Error('matchMedia não deveria ser chamado na renderização do servidor');
    });
    vi.spyOn(window, 'matchMedia').mockImplementation(matchMedia as never);

    const Probe = () => createElement('span', null, String(useReducedMotion()));

    expect(renderToStaticMarkup(createElement(Probe))).toBe('<span>false</span>');
    expect(matchMedia).not.toHaveBeenCalled();
  });

  it('não quebra quando window.matchMedia não existe', () => {
    removeMatchMedia();

    const { result, unmount } = renderHook(() => useReducedMotion());

    expect(result.current).toBe(false);
    expect(() => unmount()).not.toThrow();
  });

  it('não quebra quando matchMedia lança', () => {
    vi.spyOn(window, 'matchMedia').mockImplementation(() => {
      throw new Error('media query não suportada');
    });

    const { result } = renderHook(() => useReducedMotion());

    expect(result.current).toBe(false);
  });

  it('prefersReducedMotion faz a leitura imperativa equivalente', () => {
    const harness = createMatchMedia(true);
    installMatchMedia(harness);

    expect(prefersReducedMotion()).toBe(true);

    harness.emit(false);
    expect(prefersReducedMotion()).toBe(false);
  });
});

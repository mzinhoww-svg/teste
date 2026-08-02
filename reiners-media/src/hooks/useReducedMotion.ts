/**
 * TCK-010 — Leitura reativa e SSR-safe de `prefers-reduced-motion`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUE ESTE HOOK EXISTE (NFR-002 / WCAG 2.2 §2.3.3 Animation from
 * Interactions e §2.2.2 Pause, Stop, Hide)
 * ─────────────────────────────────────────────────────────────────────────────
 * `src/styles/globals.css` já zera `animation-duration` / `transition-duration`
 * sob `@media (prefers-reduced-motion: reduce)`, mas isso só alcança animação
 * declarada em CSS. O framer-motion escreve `transform` inline no elemento,
 * quadro a quadro, via JS — o media query do CSS não o toca. Quem respeita a
 * preferência no lado do JS é este hook, e o `src/lib/animations.ts` consome o
 * booleano para DEGRADAR as variantes (remover deslocamento e escala), não para
 * "acelerar" a animação.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUE `useSyncExternalStore` E NÃO `useState` + `useEffect`
 * ─────────────────────────────────────────────────────────────────────────────
 *  1. SSR: `getServerSnapshot` é a única leitura feita no servidor e devolve
 *     `false` — nenhum acesso a `window` acontece durante a renderização do
 *     servidor nem durante a hidratação. O React troca para o valor real logo
 *     após hidratar, sem "Text content did not match" (o padrão sancionado
 *     para estado externo ao React).
 *  2. Runtime: a preferência muda com o sistema operacional ABERTO (macOS
 *     "Reduce motion", Windows "Show animations"). `subscribe` registra o
 *     listener de `change` e devolve a função de cleanup que o React chama no
 *     unmount — sem listener órfão.
 *  3. Tearing: todos os componentes que chamam o hook leem o MESMO snapshot no
 *     mesmo commit.
 *
 * Compatibilidade: Safari < 14 só tem `addListener`/`removeListener`
 * (depreciados). Ambos os caminhos estão cobertos, tipados, sem `any`.
 *
 * @example Uso típico (TCK-013/014/015)
 * ```tsx
 * 'use client';
 * const reduced = useReducedMotion();
 * return <motion.div variants={fadeVariants({ reduced })} initial="hidden" animate="visible" />;
 * ```
 */
import { useSyncExternalStore } from 'react';

/** Media query normativa da preferência de movimento reduzido. */
export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/**
 * `MediaQueryList` com a API depreciada de listener (Safari < 14).
 * Declarado como opcional para que a checagem em runtime seja obrigatória.
 */
type LegacyMediaQueryList = MediaQueryList & {
  addListener?: (listener: (event: MediaQueryListEvent) => void) => void;
  removeListener?: (listener: (event: MediaQueryListEvent) => void) => void;
};

const noop = (): void => undefined;

/**
 * Devolve o `MediaQueryList` da preferência, ou `null` quando não há browser
 * (SSR, worker, ambiente de teste sem `matchMedia`). Nunca lança.
 */
function getMediaQueryList(): MediaQueryList | null {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return null;
  }

  try {
    return window.matchMedia(REDUCED_MOTION_QUERY);
  } catch {
    // Ambientes que expõem `matchMedia` mas não sabem avaliar a query.
    return null;
  }
}

/** Assina mudanças da preferência. O retorno é o cleanup exigido pelo React. */
function subscribe(onStoreChange: () => void): () => void {
  const mediaQueryList = getMediaQueryList();
  if (!mediaQueryList) return noop;

  if (typeof mediaQueryList.addEventListener === 'function') {
    mediaQueryList.addEventListener('change', onStoreChange);
    return () => {
      mediaQueryList.removeEventListener('change', onStoreChange);
    };
  }

  const legacy = mediaQueryList as LegacyMediaQueryList;
  if (typeof legacy.addListener === 'function') {
    legacy.addListener(onStoreChange);
    return () => {
      legacy.removeListener?.(onStoreChange);
    };
  }

  return noop;
}

/** Snapshot do cliente. Sem browser, o padrão é "movimento permitido". */
function getSnapshot(): boolean {
  return getMediaQueryList()?.matches ?? false;
}

/**
 * Snapshot do servidor. SEMPRE `false`: o servidor não tem como conhecer a
 * preferência do usuário, e `false` é o valor que o HTML estático já
 * representa (nenhuma animação rodou ainda). Retornar `true` aqui produziria
 * markup diferente do primeiro render do cliente em toda máquina sem a
 * preferência ligada — exatamente o hydration mismatch que queremos evitar.
 */
function getServerSnapshot(): boolean {
  return false;
}

/**
 * Store externa exposta para teste e para consumidores não-React
 * (ex.: registrar um observador fora da árvore). Consumidores React devem usar
 * o hook `useReducedMotion`.
 */
export const reducedMotionStore = {
  subscribe,
  getSnapshot,
  getServerSnapshot,
} as const;

/**
 * Leitura imperativa e pontual da preferência (sem reatividade).
 * Útil fora de componentes — em componente, use o hook.
 */
export function prefersReducedMotion(): boolean {
  return getSnapshot();
}

/**
 * `true` quando o usuário pediu movimento reduzido no sistema operacional.
 *
 * - SSR/primeiro paint: `false` (sem acesso a `window`, sem mismatch).
 * - Reage à troca da preferência em runtime.
 * - Remove o listener no unmount.
 */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export default useReducedMotion;

/**
 * TCK-008 — Fragmentos de classe compartilhados entre os componentes base.
 *
 * Cada constante existe porque a regra que ela codifica é fácil de esquecer e
 * cara de errar. Nenhuma delas contém cor literal: tudo sai dos tokens.
 */

/**
 * Anel de foco de teclado (WCAG 2.2 §2.4.13 Focus Appearance).
 *
 * `globals.css` já aplica `:focus-visible { outline: 2px solid border.focus }`
 * globalmente. Repetimos aqui de propósito, por dois motivos:
 *   1. o componente passa a carregar o próprio contrato de foco, então ninguém
 *      quebra a acessibilidade de um botão mexendo só no CSS base;
 *   2. `border.focus` é o único token que garante >= 3:1 em TODAS as
 *      superfícies do tema, inclusive `surface.inverse` (ver docblock de
 *      `src/types/tokens.ts`, `BorderKey`). Não troque por `accent-*`.
 *
 * Deliberadamente NÃO usamos `ring-*`: `ring-offset` precisa saber a cor do
 * fundo real, e um botão pode estar sobre `surface-base`, `surface-raised` ou
 * `surface-inverse`. `outline-offset` não tem esse problema.
 */
export const focusRing =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-line-focus';

/**
 * Estado desabilitado. Opacidade (e não uma cor "cinza") porque componentes
 * inativos estão fora do requisito de contraste (WCAG 2.2 §1.4.3, exceção
 * "Incidental"), e porque assim o token de cor original permanece visível.
 */
export const disabledControl =
  'disabled:pointer-events-none disabled:opacity-60 aria-disabled:pointer-events-none aria-disabled:opacity-60';

/**
 * Transição de cor padrão de controles. Duração e curva vêm dos tokens de
 * motion; `globals.css` zera a duração sob `prefers-reduced-motion: reduce`.
 * O sistema de animação completo é do TCK-010 — aqui é só transição CSS.
 */
export const controlTransition = 'transition-colors duration-fast ease-standard';

/**
 * Superfície de controle de formulário.
 *
 * A borda é o ÚNICO limite visual de um input, então ela precisa ser
 * `line-default` (>= 3:1 nos dois temas). `line-subtle` é decorativo (~1.1:1) e
 * reprovaria em WCAG 2.2 §1.4.11.
 */
export const controlSurface =
  'border border-line-default bg-surface-raised text-content-primary placeholder:text-content-muted';

/** Realce de erro dirigido por `aria-invalid="true"` — o mesmo atributo que o AT lê. */
export const invalidControl =
  'aria-[invalid=true]:border-state-danger aria-[invalid=true]:focus-visible:outline-state-danger';

/** Junta ids de `aria-describedby` sem inventar espaços vazios. */
export function joinIds(...ids: Array<string | false | null | undefined>): string | undefined {
  const value = ids.filter((id): id is string => Boolean(id)).join(' ');
  return value.length > 0 ? value : undefined;
}

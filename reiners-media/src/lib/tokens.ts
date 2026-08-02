/**
 * TCK-001 — Design tokens do Reiners Media Podcast Studio.
 *
 * Camadas:
 *   1. `primitives` — a paleta bruta (ÚNICO lugar do projeto com hex literal de cor).
 *   2. `tokens`     — tokens SEMÂNTICOS, que apenas referenciam primitivos.
 *   3. Consumo      — `tailwind.config.ts` e `src/styles/globals.css` derivam daqui.
 *
 * Identidade (CLAUDE.md §2 — Reiners Media DS 2026 + tokens PodFactory):
 *   - Navy   #0B0B0F  (marca)
 *   - Creme  #FAF7F2  (marca)
 *   - Ouro   #9A7B35  (marca)
 *   - PodFactory: `surface.base` #000000, orquídea #d87dff, tipografia Borna
 *   - #d87dff é também o `accentColor` default de um Podcast.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * AJUSTES DE CONTRASTE (WCAG 2.2 AA — NFR-002)
 * ─────────────────────────────────────────────────────────────────────────────
 * Os valores de MARCA nunca foram alterados: estão preservados literalmente em
 * `color.brand.*`. O que foi ajustado são as VARIANTES SEMÂNTICAS de texto:
 *
 *  a) Ouro #9A7B35 sobre Creme #FAF7F2 = 3.74:1 (reprova para corpo de texto).
 *     → `text.brand` usa `gold.700` #6E5726 no tema light (6.43:1 sobre
 *       `surface.base`, 5.74:1 sobre `surface.sunken`) e `gold.400` #B99A50 no
 *       tema dark sobre preto (7.80:1).
 *
 *  b) Orquídea #d87dff sobre Creme #FAF7F2 = 2.42:1 (reprova).
 *     → `text.accent` / `accent.default` usam `orchid.700` #9B3FC0 no tema light
 *       (5.08:1) e mantêm #d87dff no tema dark sobre preto (8.30:1).
 *
 *  c) O token PodFactory `text.inverse` = #d87dff NÃO foi replicado como texto
 *     inverso: sobre a superfície invertida (creme) ele entrega 2.42:1. O valor
 *     segue disponível, sem alteração, em `brand.orchid` / `accent.default`
 *     (dark) e `text.accent`; `text.inverse` recebe o par legível
 *     navy/creme (18.38:1 nos dois esquemas).
 *
 *  d) Verde de sucesso #0E7C66 entrega 4.28:1 sobre `surface.sunken` no tema
 *     light. → `state.success` (light) usa `green.800` #0B6353 (5.99:1).
 *
 *  e) LIMITE DE COMPONENTE (WCAG 2.2 §1.4.11, 3:1). As duas superfícies do
 *     card são de marca e quase idênticas em luminância — `surface.raised`
 *     #0B0B0F sobre `surface.base` #000000 dá 1.07:1 no dark (1.07:1 também no
 *     light, branco sobre creme). Nenhum dos dois valores pode mudar, então
 *     quem carrega o limite é a BORDA, e ela foi elevada:
 *       - `border.default`: #DCD5C8 → `cream.600` #8A8072 (light, min 3.24:1)
 *                           #1C1C24 → `navy.400`  #63636E (dark,  min 3.18:1)
 *       - `border.strong` : #BDB4A4 → `cream.700` #6E665A (light, min 4.72:1)
 *                           #33333F → `navy.300`  #8A8A96 (dark,  min 5.52:1)
 *     `border.subtle` segue baixo de propósito: é decorativo (ver o token).
 *     Ver também o bloco de `shadow`: sombra preta não eleva nada no dark.
 *
 * Contrastes mínimos garantidos por `tests/unit/tokens.test.ts`, que roda o
 * cálculo WCAG sobre a matriz texto × superfície e borda × superfície nos dois
 * esquemas.
 *
 * i18n-ready (NFR-010): nenhum token é direcional (sem `left`/`right`);
 * espaçamentos são simétricos e o CSS base usa propriedades lógicas.
 */

import type {
  BreakpointTokens,
  ColorGroupName,
  ColorScheme,
  ColorToken,
  ColorTokenPath,
  ColorTokens,
  DesignTokens,
  HexColor,
  MotionTokens,
  RadiusTokens,
  RgbChannels,
  ShadowTokens,
  SpacingTokens,
  TypographyScaleKey,
  TypographyTokens,
  ZIndexTokens,
} from '@/types/tokens';

/* ========================================================================== */
/* 1. Primitivos                                                              */
/* ========================================================================== */

/**
 * Paleta primitiva. Único ponto do código com literais de cor.
 * Não consumir diretamente em componentes — use os tokens semânticos.
 */
export const primitives = {
  black: '#000000', // PodFactory surface.base
  white: '#FFFFFF',

  /**
   * Reiners Navy — 900 é o valor oficial de marca.
   * 400/300 existem para as bordas do tema dark: qualquer coisa abaixo de
   * ~#595959 não alcança 3:1 contra `surface.base` #000000 (WCAG 1.4.11).
   */
  navy: {
    900: '#0B0B0F',
    800: '#131319',
    700: '#1C1C24',
    600: '#262630',
    500: '#33333F',
    400: '#63636E',
    300: '#8A8A96',
  },

  /** Neutros frios derivados do Navy, para texto no tema light. */
  ink: {
    700: '#33333F',
    600: '#4A4A55',
    500: '#5C5C68',
    400: '#7A7A85',
    300: '#A3A3AD',
    200: '#CFCFD6',
    100: '#E7E7EC',
  },

  /**
   * Reiners Creme — 100 é o valor oficial de marca.
   * 600/700 são os degraus escuros o bastante para servirem de limite de
   * componente sobre creme/branco (>= 3:1, WCAG 1.4.11).
   */
  cream: {
    50: '#FFFDFA',
    100: '#FAF7F2',
    200: '#EFEAE1',
    300: '#DCD5C8',
    400: '#BDB4A4',
    500: '#9C9282',
    600: '#8A8072',
    700: '#6E665A',
  },

  /** Reiners Ouro — 500 é o valor oficial de marca. */
  gold: {
    700: '#6E5726',
    600: '#84692E',
    500: '#9A7B35',
    400: '#B99A50',
    300: '#D4B978',
    200: '#E8D6A9',
    100: '#F3E9D2',
  },

  /** PodFactory orquídea — 500 (#d87dff) é o accentColor default de Podcast. */
  orchid: {
    950: '#1A0B22',
    900: '#5C1F74',
    800: '#7E2D9E',
    700: '#9B3FC0',
    600: '#C45BEE',
    500: '#d87dff',
    400: '#E29CFF',
    300: '#ECBCFF',
    200: '#F3D9FF',
    100: '#F6E9FD',
  },

  green: {
    900: '#05231A',
    800: '#0B6353',
    700: '#0E7C66',
    400: '#3ECF8E',
    100: '#E3F5EE',
  },

  amber: {
    900: '#2A1B02',
    700: '#8A5A00',
    400: '#F5A524',
    100: '#FBF0DC',
  },

  red: {
    900: '#2B0B0A',
    700: '#B42318',
    400: '#F04438',
    100: '#FCE7E5',
  },

  blue: {
    900: '#071C2C',
    700: '#175CD3',
    400: '#5EB0EF',
    100: '#E4EEFC',
  },
} as const;

/* ========================================================================== */
/* 2. Utilitários de cor                                                      */
/* ========================================================================== */

/** Converte `#RRGGBB` (ou `#RGB`) nos canais `"R G B"` usados nas CSS vars. */
export function hexToChannels(hex: HexColor): RgbChannels {
  const raw = hex.replace('#', '');
  const full =
    raw.length === 3
      ? raw
          .split('')
          .map((c) => `${c}${c}`)
          .join('')
      : raw;

  if (full.length !== 6 || !/^[0-9a-fA-F]{6}$/.test(full)) {
    throw new Error(`Cor hexadecimal inválida: ${hex}`);
  }

  const r = Number.parseInt(full.slice(0, 2), 16);
  const g = Number.parseInt(full.slice(2, 4), 16);
  const b = Number.parseInt(full.slice(4, 6), 16);

  return `${r} ${g} ${b}`;
}

/** Monta uma cor `rgb()` com alpha a partir de um primitivo. */
function alpha(hex: HexColor, value: number): string {
  return `rgb(${hexToChannels(hex)} / ${value})`;
}

/* ========================================================================== */
/* 3. Tokens semânticos — cor                                                 */
/* ========================================================================== */

const color = {
  surface: {
    /** Fundo raiz. Dark: preto PodFactory. Light: creme de marca. */
    base: { light: primitives.cream[100], dark: primitives.black },
    /**
     * Fundo recuado (trilhos, faixas alternadas). No tema dark o preto já é o
     * piso da escala, então `sunken` coincide com `base` — a profundidade vem
     * de `raised`, que sobe para o Navy.
     */
    sunken: { light: primitives.cream[200], dark: primitives.black },
    /** Cards, painéis, poster do catálogo. */
    raised: { light: primitives.white, dark: primitives.navy[900] },
    /** Scrim de modal/overlay — usar com modificador de opacidade. */
    overlay: { light: primitives.navy[900], dark: primitives.black },
    /** Bloco invertido em relação ao esquema atual. */
    inverse: { light: primitives.navy[900], dark: primitives.cream[100] },
    /** Superfície tonal do acento (badges, hovers de item). */
    accent: { light: primitives.orchid[100], dark: primitives.orchid[950] },
  },

  text: {
    /** 18.38:1 (light) / 19.65:1 (dark) sobre `surface.base`. */
    primary: { light: primitives.navy[900], dark: primitives.cream[100] },
    /** 8.18:1 (light) / 10.23:1 (dark) sobre `surface.base`. */
    secondary: { light: primitives.ink[600], dark: primitives.cream[400] },
    /** 6.17:1 (light) / 6.85:1 (dark) — metadados, legendas. */
    muted: { light: primitives.ink[500], dark: primitives.cream[500] },
    /** Texto sobre `surface.inverse`. Ver nota (c) no cabeçalho. */
    inverse: { light: primitives.cream[100], dark: primitives.navy[900] },
    /** Acento legível como texto — ver nota (b). */
    accent: { light: primitives.orchid[700], dark: primitives.orchid[500] },
    /** Ouro legível como texto — ver nota (a). */
    brand: { light: primitives.gold[700], dark: primitives.gold[400] },
    /** Texto/ícone sobre `accent.default` (7.62:1 light, 7.76:1 dark). */
    onAccent: { light: primitives.white, dark: primitives.navy[900] },
    link: { light: primitives.orchid[700], dark: primitives.orchid[400] },
  },

  border: {
    /**
     * DECORATIVO. Hairline de baixo contraste (~1.1:1) para divisórias
     * internas — listas, linhas de tabela, separadores dentro de um bloco que
     * já tem limite próprio.
     *
     * NÃO USAR como único indicador de limite de componente: reprova em
     * WCAG 2.2 §1.4.11 (Non-text Contrast). Card, input, botão fantasma,
     * combobox e afins usam `border.default`.
     */
    subtle: { light: primitives.cream[200], dark: primitives.navy[800] },
    /**
     * Limite de componente padrão — mínimo 3.24:1 (light) / 3.18:1 (dark)
     * contra qualquer superfície de conteúdo. É o token seguro quando a borda
     * é a única coisa que define onde o componente começa e termina.
     */
    default: { light: primitives.cream[600], dark: primitives.navy[400] },
    /** Limite enfático — 4.72:1 (light) / 5.52:1 (dark). */
    strong: { light: primitives.cream[700], dark: primitives.navy[300] },
    accent: { light: primitives.orchid[700], dark: primitives.orchid[500] },
    /** Anel de foco — 5.08:1 (light) / 10.43:1 (dark), acima dos 3:1 de AA. */
    focus: { light: primitives.orchid[700], dark: primitives.orchid[400] },
  },

  accent: {
    default: { light: primitives.orchid[700], dark: primitives.orchid[500] },
    hover: { light: primitives.orchid[800], dark: primitives.orchid[400] },
    active: { light: primitives.orchid[900], dark: primitives.orchid[600] },
    subtle: { light: primitives.orchid[100], dark: primitives.orchid[950] },
    /** Cor de conteúdo colocada sobre o acento sólido. */
    contrast: { light: primitives.white, dark: primitives.navy[900] },
  },

  state: {
    success: { light: primitives.green[800], dark: primitives.green[400] },
    successSurface: { light: primitives.green[100], dark: primitives.green[900] },
    warning: { light: primitives.amber[700], dark: primitives.amber[400] },
    warningSurface: { light: primitives.amber[100], dark: primitives.amber[900] },
    danger: { light: primitives.red[700], dark: primitives.red[400] },
    dangerSurface: { light: primitives.red[100], dark: primitives.red[900] },
    info: { light: primitives.blue[700], dark: primitives.blue[400] },
    infoSurface: { light: primitives.blue[100], dark: primitives.blue[900] },
  },

  /**
   * Valores de marca, idênticos nos dois esquemas e NUNCA ajustados por
   * contraste (uso: logo, selos, ilustrações). Para texto use `text.brand`.
   */
  brand: {
    navy: { light: primitives.navy[900], dark: primitives.navy[900] },
    cream: { light: primitives.cream[100], dark: primitives.cream[100] },
    gold: { light: primitives.gold[500], dark: primitives.gold[500] },
    orchid: { light: primitives.orchid[500], dark: primitives.orchid[500] },
  },
} as const satisfies ColorTokens;

/* ========================================================================== */
/* 4. Tokens semânticos — tipografia                                          */
/* ========================================================================== */

/**
 * Borna é uma fonte licenciada (PodFactory). Não há arquivo web no repositório,
 * então a família semântica declara Borna primeiro e cai em stacks do sistema.
 * O `@font-face` fica comentado em `src/styles/globals.css` — basta soltar os
 * arquivos em `public/fonts/borna/` e descomentar.
 */
const typography = {
  family: {
    display:
      "'Borna', 'Borna Fallback', 'Söhne', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif",
    sans: "'Inter', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    mono: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace",
  },

  weight: {
    light: '300',
    regular: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
    black: '900',
  },

  lineHeight: {
    none: '1',
    tight: '1.1',
    snug: '1.25',
    normal: '1.5',
    relaxed: '1.625',
    loose: '2',
  },

  letterSpacing: {
    tighter: '-0.04em',
    tight: '-0.02em',
    normal: '0em',
    wide: '0.02em',
    wider: '0.06em',
    widest: '0.12em',
  },

  /** Escala modular estritamente crescente (ver `typographyScaleOrder`). */
  scale: {
    '2xs': { fontSize: '0.6875rem', lineHeight: '1.5', letterSpacing: '0.06em' },
    xs: { fontSize: '0.75rem', lineHeight: '1.5', letterSpacing: '0.02em' },
    sm: { fontSize: '0.875rem', lineHeight: '1.5', letterSpacing: '0em' },
    base: { fontSize: '1rem', lineHeight: '1.5', letterSpacing: '0em' },
    lg: { fontSize: '1.125rem', lineHeight: '1.5', letterSpacing: '0em' },
    xl: { fontSize: '1.25rem', lineHeight: '1.5', letterSpacing: '-0.01em' },
    '2xl': { fontSize: '1.5rem', lineHeight: '1.25', letterSpacing: '-0.01em' },
    '3xl': { fontSize: '1.875rem', lineHeight: '1.25', letterSpacing: '-0.02em' },
    '4xl': { fontSize: '2.25rem', lineHeight: '1.1', letterSpacing: '-0.02em' },
    '5xl': { fontSize: '3rem', lineHeight: '1.1', letterSpacing: '-0.03em' },
    '6xl': { fontSize: '3.75rem', lineHeight: '1.1', letterSpacing: '-0.03em' },
    '7xl': { fontSize: '4.5rem', lineHeight: '1', letterSpacing: '-0.04em' },
    '8xl': { fontSize: '6rem', lineHeight: '1', letterSpacing: '-0.04em' },
  },
} as const satisfies TypographyTokens;

/** Ordem normativa da escala tipográfica (do menor para o maior degrau). */
export const typographyScaleOrder = [
  '2xs',
  'xs',
  'sm',
  'base',
  'lg',
  'xl',
  '2xl',
  '3xl',
  '4xl',
  '5xl',
  '6xl',
  '7xl',
  '8xl',
] as const satisfies readonly TypographyScaleKey[];

/* ========================================================================== */
/* 5. Tokens semânticos — espaço, forma, elevação                             */
/* ========================================================================== */

/** Escala base 4px (0.25rem). `px` é reservado a hairlines. */
const spacing = {
  '0': '0px',
  px: '1px',
  '0.5': '0.125rem',
  '1': '0.25rem',
  '1.5': '0.375rem',
  '2': '0.5rem',
  '3': '0.75rem',
  '4': '1rem',
  '5': '1.25rem',
  '6': '1.5rem',
  '8': '2rem',
  '10': '2.5rem',
  '12': '3rem',
  '16': '4rem',
  '20': '5rem',
  '24': '6rem',
  '32': '8rem',
  '40': '10rem',
  '48': '12rem',
  '64': '16rem',
  '80': '20rem',
} as const satisfies SpacingTokens;

const radius = {
  none: '0px',
  xs: '0.25rem',
  sm: '0.375rem',
  md: '0.5rem',
  lg: '0.75rem',
  xl: '1rem',
  '2xl': '1.5rem',
  '3xl': '2rem',
  full: '9999px',
} as const satisfies RadiusTokens;

/**
 * Sombras derivadas de primitivos (nada de hex solto).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LIMITE CONHECIDO: sombra preta não eleva nada no tema dark.
 * ─────────────────────────────────────────────────────────────────────────────
 * `xs`…`xl` são sombras pretas com alpha. Sobre `surface.base` dark (#000000,
 * valor PodFactory) elas são preto sobre preto: contraste ~1:1, separação
 * visual zero. No tema dark a elevação NÃO vem da sombra — vem da BORDA.
 *
 * Por isso existem dois tokens theme-aware, que embutem um hairline derivado
 * das CSS vars de borda (portanto trocam junto com o tema):
 *
 *   - `raised`: elevação de card/painel. Use em qualquer superfície elevada
 *               que precise de limite próprio (grid do portfólio, TCK-013).
 *   - `poster`: elevação forte do card expandido (TCK-014).
 *
 * Regra prática para TCK-008/013/014: `shadow-raised` (ou `shadow-poster`)
 * SOZINHO já entrega o limite acessível nos dois temas; `shadow-md`/`lg`/`xl`
 * são puramente estéticos e precisam de `border-line-default` ao lado quando
 * a borda for o único indicador do limite.
 */
const shadow = {
  none: 'none',
  xs: `0 1px 2px 0 ${alpha(primitives.black, 0.32)}`,
  sm: `0 1px 3px 0 ${alpha(primitives.black, 0.36)}, 0 1px 2px -1px ${alpha(primitives.black, 0.32)}`,
  md: `0 4px 12px -2px ${alpha(primitives.black, 0.4)}, 0 2px 6px -2px ${alpha(primitives.black, 0.32)}`,
  lg: `0 12px 28px -8px ${alpha(primitives.black, 0.48)}, 0 4px 10px -4px ${alpha(primitives.black, 0.32)}`,
  xl: `0 24px 56px -16px ${alpha(primitives.black, 0.56)}, 0 8px 20px -8px ${alpha(primitives.black, 0.36)}`,
  /** Elevação theme-aware: hairline 3:1 + profundidade. Funciona nos 2 temas. */
  raised: `0 0 0 1px ${colorVar('border.default')}, 0 4px 12px -2px ${alpha(primitives.black, 0.4)}`,
  /** Elevação do poster expandido (TCK-014), também theme-aware. */
  poster: `0 0 0 1px ${colorVar('border.strong')}, 0 32px 64px -24px ${alpha(primitives.black, 0.7)}`,
  /** Brilho de acento para foco/hover em superfícies escuras. */
  glow: `0 0 0 1px ${alpha(primitives.orchid[500], 0.4)}, 0 8px 32px -8px ${alpha(primitives.orchid[500], 0.45)}`,
} as const satisfies ShadowTokens;

/* ========================================================================== */
/* 6. Tokens semânticos — motion                                              */
/* ========================================================================== */

/**
 * Durações curtas por padrão (NFR-001 / percepção de performance).
 * `globals.css` neutraliza todas elas sob `prefers-reduced-motion: reduce`.
 */
const motion = {
  duration: {
    instant: '0ms',
    fast: '120ms',
    normal: '200ms',
    slow: '320ms',
    slower: '480ms',
    slowest: '720ms',
  },
  easing: {
    linear: 'linear',
    standard: 'cubic-bezier(0.2, 0, 0, 1)',
    accelerate: 'cubic-bezier(0.4, 0, 1, 1)',
    decelerate: 'cubic-bezier(0, 0, 0.2, 1)',
    emphasized: 'cubic-bezier(0.32, 0.72, 0, 1)',
    spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
  },
  transition: {
    fade: { duration: '200ms', easing: 'cubic-bezier(0, 0, 0.2, 1)' },
    scale: { duration: '200ms', easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' },
    slide: { duration: '320ms', easing: 'cubic-bezier(0.32, 0.72, 0, 1)' },
    /** Expansão inline do card do catálogo (TCK-014). */
    expand: { duration: '320ms', easing: 'cubic-bezier(0.32, 0.72, 0, 1)' },
    overlay: { duration: '200ms', easing: 'cubic-bezier(0.2, 0, 0, 1)' },
    colors: { duration: '120ms', easing: 'cubic-bezier(0.2, 0, 0, 1)' },
  },
} as const satisfies MotionTokens;

/* ========================================================================== */
/* 7. Tokens semânticos — layout                                              */
/* ========================================================================== */

const zIndex = {
  base: '0',
  raised: '10',
  sticky: '1100',
  dropdown: '1200',
  overlay: '1300',
  modal: '1400',
  popover: '1500',
  toast: '1600',
  tooltip: '1700',
  max: '2147483647',
} as const satisfies ZIndexTokens;

const breakpoint = {
  xs: '360px',
  sm: '640px',
  md: '768px',
  lg: '1024px',
  xl: '1280px',
  '2xl': '1536px',
} as const satisfies BreakpointTokens;

/* ========================================================================== */
/* 8. Export agregado                                                         */
/* ========================================================================== */

/** Fonte de verdade do design system. Consumido por Tailwind, CSS e React. */
export const tokens = {
  color,
  typography,
  spacing,
  radius,
  shadow,
  motion,
  zIndex,
  breakpoint,
} as const satisfies DesignTokens;

export type Tokens = typeof tokens;

/* ========================================================================== */
/* 9. Helpers de consumo (CSS custom properties)                              */
/* ========================================================================== */

/** Ordem estável dos grupos de cor — usada na geração de CSS e nos testes. */
export const colorGroupNames = [
  'surface',
  'text',
  'border',
  'accent',
  'state',
  'brand',
] as const satisfies readonly ColorGroupName[];

/**
 * Nome público de cada grupo de cor dentro do Tailwind.
 * `text` e `border` viram `content` e `line` para não gerar classes redundantes
 * do tipo `text-text-primary` / `border-border-subtle`.
 *
 * As chaves viram kebab-case dentro do Tailwind:
 *
 *   surface.raised        → bg-surface-raised
 *   text.primary          → text-content-primary
 *   text.onAccent         → text-content-on-accent
 *   border.subtle         → border-line-subtle
 *   accent.default        → bg-accent  (ou bg-accent-default)
 *   state.dangerSurface   → bg-state-danger-surface
 *   brand.gold            → text-brand-gold
 */
export const tailwindColorGroupAlias = {
  surface: 'surface',
  text: 'content',
  border: 'line',
  accent: 'accent',
  state: 'state',
  brand: 'brand',
} as const satisfies Readonly<Record<ColorGroupName, string>>;

/**
 * `onAccent` → `on-accent`. Usado em nomes de CSS var e chaves do Tailwind.
 * Declarada como `function` (e não `const`) porque `shadow` a alcança via
 * `colorVar()` durante a avaliação do módulo — hoisting evita TDZ.
 */
export function kebabCase(value: string): string {
  return value.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

/** `surface.base` → `--color-surface-base`. */
export function colorVarName(path: ColorTokenPath): string {
  const [group, key] = path.split('.');
  return `--color-${kebabCase(group ?? '')}-${kebabCase(key ?? '')}`;
}

/** `surface.base` → `rgb(var(--color-surface-base))` (uso em CSS/inline style). */
export function colorVar(path: ColorTokenPath): string {
  return `rgb(var(${colorVarName(path)}))`;
}

/**
 * `surface.base` → `rgb(var(--color-surface-base) / <alpha-value>)`.
 * Formato exigido pelo Tailwind para habilitar modificadores de opacidade.
 */
export function colorVarWithAlpha(path: ColorTokenPath): string {
  return `rgb(var(${colorVarName(path)}) / <alpha-value>)`;
}

/** Valor hexadecimal concreto de um token semântico num esquema. */
export function resolveColor(path: ColorTokenPath, scheme: ColorScheme): HexColor {
  const [group, key] = path.split('.') as [ColorGroupName, string];
  const groupTokens = tokens.color[group] as Readonly<Record<string, ColorToken>>;
  const token = groupTokens[key];

  if (!token) {
    throw new Error(`Token de cor inexistente: ${path}`);
  }

  return token[scheme];
}

/** Todas as CSS custom properties de cor (`--color-*`) de um esquema. */
export function colorCssVariables(scheme: ColorScheme): Record<string, RgbChannels> {
  const result: Record<string, RgbChannels> = {};

  for (const group of colorGroupNames) {
    const groupTokens = tokens.color[group] as Readonly<Record<string, ColorToken>>;
    for (const key of Object.keys(groupTokens)) {
      const token = groupTokens[key];
      if (!token) continue;
      result[colorVarName(`${group}.${key}` as ColorTokenPath)] = hexToChannels(
        token[scheme],
      );
    }
  }

  return result;
}

/** CSS custom properties independentes de esquema (fonte, forma, motion, z). */
export function staticCssVariables(): Record<string, string> {
  const result: Record<string, string> = {};

  for (const [key, value] of Object.entries(tokens.typography.family)) {
    result[`--font-${kebabCase(key)}`] = value;
  }
  for (const [key, value] of Object.entries(tokens.radius)) {
    result[`--radius-${kebabCase(key)}`] = value;
  }
  for (const [key, value] of Object.entries(tokens.shadow)) {
    result[`--shadow-${kebabCase(key)}`] = value;
  }
  for (const [key, value] of Object.entries(tokens.motion.duration)) {
    result[`--duration-${kebabCase(key)}`] = value;
  }
  for (const [key, value] of Object.entries(tokens.motion.easing)) {
    result[`--ease-${kebabCase(key)}`] = value;
  }
  for (const [key, value] of Object.entries(tokens.zIndex)) {
    result[`--z-${kebabCase(key)}`] = value;
  }

  return result;
}

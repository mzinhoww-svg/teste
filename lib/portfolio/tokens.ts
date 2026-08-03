// ==========================================================================
// DESIGN TOKENS — PodFactory / Reiners Media (catálogo /portfolio)
//
// ESTE É O ÚNICO ARQUIVO DO MÓDULO AUTORIZADO A CONTER HEX LITERAL.
// Todo o resto (componentes, CSS, tailwind.config) consome via:
//   - classes utilitárias `pf-*` do Tailwind (mapeadas para as CSS vars abaixo)
//   - `var(--pf-…)` diretamente
//
// As variáveis CSS são emitidas em runtime por `portfolioCssVars()`, injetado
// como <style> no layout de /portfolio. Assim o CSS não precisa repetir hex.
// ==========================================================================

/** Paleta bruta. Nenhum outro arquivo do módulo pode declarar hex. */
export const palette = {
  surfaceBase: "#000000",
  surfaceRaised: "#14101c",
  surfaceStrong: "#222222",
  textPrimary: "#fcfcfc",
  /** accent roxo — CTA primário, hover, glow, badges */
  textInverse: "#d87dff",
  /**
   * Links externos / badges informativos.
   *
   * A spec do PodFactory define `#0000ee` — o azul de link clássico, pensado
   * para fundo CLARO. Sobre as superfícies escuras deste catálogo ele fica em
   * 1,99:1 contra surface.raised, muito abaixo dos 4,5:1 exigidos por WCAG AA.
   * Trocado pelo equivalente para fundo escuro, mantendo a leitura de "link":
   * 7,5:1 sobre surface.raised e 8,4:1 sobre surface.base.
   */
  textTertiary: "#7aa2ff",
  /** base das bordas, sempre usada com opacidade (8–15%) */
  borderMuted: "#ffffff",
  /** trilhas — cores de marca das plataformas */
  youtube: "#cc0000",
  spotify: "#1db954",
  /** estado de erro */
  danger: "#ff4444",
} as const;

export type PaletteToken = keyof typeof palette;

/** #rrggbb → "r g b" (canais separados por espaço, formato do Tailwind). */
export function toRgbChannels(hex: string): string {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = Number.parseInt(full, 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}

// --------------------------------------------------------------------------
// Tipografia
// Família "Borna" com fallback sans-serif. Escala base do PodFactory em px.
// Observação de implementação: os tamanhos da escala são propositalmente
// pequenos (base 17.5px, escala 8.75–15.75px). Onde a spec pede "escalado"
// (títulos), usamos clamp() — ver `type.scaled`.
// --------------------------------------------------------------------------
export const typography = {
  family: `"Borna", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif`,
  base: { size: "17.5px", weight: 400, lineHeight: "26.25px" },
  scale: {
    xs: "8.75px",
    sm: "12px",
    md: "12.03px",
    lg: "13.13px",
    xl: "14px",
    "2xl": "14.22px",
    "3xl": "15.31px",
    "4xl": "15.75px",
  },
  /** Títulos: a escala 4xl é escalada por clamp conforme a spec. */
  scaled: {
    /** Headline da hero */
    hero: "clamp(28px, 4vw, 48px)",
    /** Título de programa (grid, painel, página dedicada) */
    program: "clamp(24px, 3vw, 42px)",
    /** Título dentro do painel expandido */
    panel: "clamp(22px, 2.2vw, 28px)",
  },
  tracking: {
    meta: "0.12em",
    track: "0.08em",
    minimal: "0.06em",
  },
} as const;

// --------------------------------------------------------------------------
// Sombras
// shadow.2 é RESERVADA para overlays/modais (nunca em card/poster).
// --------------------------------------------------------------------------
export const shadows = {
  1: "rgba(0, 0, 0, 0.35) 0px 4px 24px 0px",
  2: "rgba(0, 0, 0, 0.64) 0px 0px 87.5px 17.5px",
  3: "rgba(216, 125, 255, 0.22) 0px 8px 32px 0px",
  4: "rgba(0, 0, 0, 0.09) 0px 4px 9px 0px",
} as const;

// --------------------------------------------------------------------------
// Raios — posters NUNCA passam de `sm` (8px).
// --------------------------------------------------------------------------
export const radii = {
  xs: "5px",
  sm: "8px",
  md: "10px",
  lg: "12px",
  xl: "14px",
  "2xl": "18px",
  step7: "70px",
  step8: "100px",
} as const;

// --------------------------------------------------------------------------
// Motion
// --------------------------------------------------------------------------
export const motion = {
  instant: "100ms",
  fast: "180ms",
  normal: "200ms",
  slow: "300ms",
  easing: "cubic-bezier(0.22, 1, 0.36, 1)",
} as const;

// --------------------------------------------------------------------------
// Espaçamento — micro (space.1–8) + macro (múltiplos de 8)
// --------------------------------------------------------------------------
export const spacing = {
  micro: {
    1: "1px",
    2: "1.75px",
    3: "2.63px",
    4: "3.28px",
    5: "4.38px",
    6: "5.25px",
    7: "5.91px",
    8: "6.56px",
  },
  macro: [8, 16, 24, 32, 48, 64, 96] as const,
} as const;

// --------------------------------------------------------------------------
// Opacidades nomeadas — evitam "números mágicos" espalhados nos componentes.
// --------------------------------------------------------------------------
export const alpha = {
  /** bordas de card/poster */
  border: 0.06,
  borderStrong: 0.08,
  borderStronger: 0.15,
  /** texto secundário */
  meta: 0.5,
  body: 0.75,
  sub: 0.7,
  desc: 0.6,
  empty: 0.3,
  /** realces com o accent */
  accentGhost: 0.1,
  accentBadge: 0.12,
  accentHover: 0.15,
  accentBorder: 0.25,
  accentGlowBorder: 0.2,
} as const;

/**
 * Emite as CSS custom properties do módulo. Injetado uma única vez no layout
 * de /portfolio (escopo `.pf-root`), mantendo os hex confinados a este arquivo.
 */
export function portfolioCssVars(scope = ".pf-root"): string {
  const rgb = (hex: string) => toRgbChannels(hex);
  const lines: string[] = [
    // cores (hex + canais RGB para os modificadores de opacidade do Tailwind)
    `--pf-surface-base: ${palette.surfaceBase}`,
    `--pf-surface-base-rgb: ${rgb(palette.surfaceBase)}`,
    `--pf-surface-raised: ${palette.surfaceRaised}`,
    `--pf-surface-raised-rgb: ${rgb(palette.surfaceRaised)}`,
    `--pf-surface-strong: ${palette.surfaceStrong}`,
    `--pf-surface-strong-rgb: ${rgb(palette.surfaceStrong)}`,
    `--pf-text-primary: ${palette.textPrimary}`,
    `--pf-text-primary-rgb: ${rgb(palette.textPrimary)}`,
    `--pf-text-inverse: ${palette.textInverse}`,
    `--pf-text-inverse-rgb: ${rgb(palette.textInverse)}`,
    `--pf-text-tertiary: ${palette.textTertiary}`,
    `--pf-text-tertiary-rgb: ${rgb(palette.textTertiary)}`,
    `--pf-border-muted-rgb: ${rgb(palette.borderMuted)}`,
    `--pf-youtube: ${palette.youtube}`,
    `--pf-spotify: ${palette.spotify}`,
    `--pf-danger: ${palette.danger}`,
    // tipografia
    `--pf-font: ${typography.family}`,
    `--pf-text-base: ${typography.base.size}`,
    `--pf-leading-base: ${typography.base.lineHeight}`,
    ...Object.entries(typography.scale).map(([k, v]) => `--pf-text-${k}: ${v}`),
    `--pf-text-hero: ${typography.scaled.hero}`,
    `--pf-text-program: ${typography.scaled.program}`,
    `--pf-text-panel: ${typography.scaled.panel}`,
    // sombras
    ...Object.entries(shadows).map(([k, v]) => `--pf-shadow-${k}: ${v}`),
    // raios
    ...Object.entries(radii).map(([k, v]) => `--pf-radius-${k}: ${v}`),
    // motion
    `--pf-motion-instant: ${motion.instant}`,
    `--pf-motion-fast: ${motion.fast}`,
    `--pf-motion-normal: ${motion.normal}`,
    `--pf-motion-slow: ${motion.slow}`,
    `--pf-ease: ${motion.easing}`,
    // espaçamento micro
    ...Object.entries(spacing.micro).map(([k, v]) => `--pf-space-${k}: ${v}`),
  ];
  return `${scope}{${lines.join(";")}}`;
}

/**
 * Cor de acento por programa (`accentColor` do banco) sobrescreve o accent
 * padrão só dentro do card daquele programa. Valor validado: só aceita hex de
 * 3/6 dígitos — impede injeção de CSS via campo do admin.
 */
export function accentStyle(hex?: string | null): React.CSSProperties | undefined {
  if (!hex || !/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(hex)) return undefined;
  return {
    ["--pf-text-inverse" as string]: hex,
    ["--pf-text-inverse-rgb" as string]: toRgbChannels(hex),
  } as React.CSSProperties;
}

/** Cor padrão de acento (usada como default no banco e no admin). */
export const DEFAULT_ACCENT = palette.textInverse;

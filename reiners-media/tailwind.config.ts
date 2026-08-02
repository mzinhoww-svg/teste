/**
 * TCK-001 — Configuração Tailwind derivada dos design tokens.
 *
 * Esta config NÃO define valores: ela apenas projeta `src/lib/tokens.ts` na
 * API do Tailwind. Nenhum literal de cor/tamanho deve ser escrito aqui.
 *
 * Cores resolvem para `rgb(var(--color-*) / <alpha-value>)`, então:
 *   - o tema (light/dark) é trocado apenas pela classe `.dark` em `<html>`;
 *   - modificadores de opacidade (`bg-surface-overlay/80`) continuam válidos.
 *
 * As custom properties são declaradas em `src/styles/globals.css`.
 */
import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';

import {
  colorGroupNames,
  colorVarWithAlpha,
  kebabCase,
  tailwindColorGroupAlias,
  tokens,
  typographyScaleOrder,
} from './src/lib/tokens';
import type { ColorTokenPath } from './src/types/tokens';

type ColorScale = Record<string, string>;

/** Projeta os grupos semânticos de cor em `theme.colors`, via CSS vars. */
function buildColors(): Record<string, ColorScale> {
  const colors: Record<string, ColorScale> = {};

  for (const group of colorGroupNames) {
    const alias = tailwindColorGroupAlias[group];
    const scale: ColorScale = {};

    for (const key of Object.keys(tokens.color[group])) {
      const value = colorVarWithAlpha(`${group}.${key}` as ColorTokenPath);
      // Chaves em kebab-case: `text.onAccent` → `text-content-on-accent`.
      scale[kebabCase(key)] = value;
      // `default` também vira DEFAULT: `bg-accent` === `bg-accent-default`.
      if (key === 'default') scale.DEFAULT = value;
    }

    colors[alias] = scale;
  }

  return colors;
}

/** Escala tipográfica -> `[fontSize, { lineHeight, letterSpacing }]`. */
function buildFontSize(): Record<string, [string, { lineHeight: string; letterSpacing: string }]> {
  const sizes: Record<string, [string, { lineHeight: string; letterSpacing: string }]> = {};

  for (const key of typographyScaleOrder) {
    const step = tokens.typography.scale[key];
    sizes[key] = [
      step.fontSize,
      { lineHeight: step.lineHeight, letterSpacing: step.letterSpacing },
    ];
  }

  return sizes;
}

const colors = buildColors();

const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    screens: { ...tokens.breakpoint },
    extend: {
      colors,
      fontFamily: { ...tokens.typography.family },
      fontSize: buildFontSize(),
      fontWeight: { ...tokens.typography.weight },
      lineHeight: { ...tokens.typography.lineHeight },
      letterSpacing: { ...tokens.typography.letterSpacing },
      spacing: { ...tokens.spacing },
      borderRadius: { ...tokens.radius },
      boxShadow: { ...tokens.shadow },
      zIndex: { ...tokens.zIndex },
      transitionDuration: { ...tokens.motion.duration },
      transitionTimingFunction: { ...tokens.motion.easing },
      ringColor: { DEFAULT: colors.line?.focus },
      ringOffsetColor: { DEFAULT: colors.surface?.base },
      borderColor: { DEFAULT: colors.line?.default },
      keyframes: {
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'fade-in-up': {
          from: { opacity: '0', transform: `translate3d(0, ${tokens.spacing['4']}, 0)` },
          to: { opacity: '1', transform: 'translate3d(0, 0, 0)' },
        },
        'scale-in': {
          from: { opacity: '0', transform: 'scale(0.96)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        shimmer: {
          from: { backgroundPosition: '200% 0' },
          to: { backgroundPosition: '-200% 0' },
        },
      },
      animation: {
        'fade-in': `fade-in ${tokens.motion.transition.fade.duration} ${tokens.motion.transition.fade.easing} both`,
        'fade-in-up': `fade-in-up ${tokens.motion.transition.slide.duration} ${tokens.motion.transition.slide.easing} both`,
        'scale-in': `scale-in ${tokens.motion.transition.scale.duration} ${tokens.motion.transition.scale.easing} both`,
        shimmer: `shimmer ${tokens.motion.duration.slowest} ${tokens.motion.easing.linear} infinite`,
      },
    },
  },
  plugins: [animate],
};

export default config;

import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Escala de marca dirigida por variáveis CSS. Sem tenant, os fallbacks
        // mantêm o índigo padrão (zero regressão). Com tenant, TenantThemeVars
        // injeta a rampa (lib/brand-ramp.ts) e TODA a escala re-tinta de forma
        // coerente — em claro e escuro. Ver docs/design-refinement-plan.md.
        // Canais RGB + <alpha-value> para os modificadores de opacidade
        // (bg-brand-950/40, bg-brand-50/50) funcionarem. Defaults = índigo.
        brand: {
          50: "rgb(var(--brand-50, 238 242 255) / <alpha-value>)",
          100: "rgb(var(--brand-100, 224 231 255) / <alpha-value>)",
          200: "rgb(var(--brand-200, 199 210 254) / <alpha-value>)",
          300: "rgb(var(--brand-300, 165 180 252) / <alpha-value>)",
          400: "rgb(var(--brand-400, 129 140 248) / <alpha-value>)",
          500: "rgb(var(--brand-500, 99 102 241) / <alpha-value>)",
          600: "rgb(var(--brand-600, 79 70 229) / <alpha-value>)",
          700: "rgb(var(--brand-700, 67 56 202) / <alpha-value>)",
          800: "rgb(var(--brand-800, 55 48 163) / <alpha-value>)",
          900: "rgb(var(--brand-900, 49 46 129) / <alpha-value>)",
          950: "rgb(var(--brand-950, 30 27 75) / <alpha-value>)",
        },
        // Accent = realce (dourado no Reiners). NUNCA fundo de texto branco:
        // usar sempre em par com `text-accent-foreground`.
        accent: {
          DEFAULT: "rgb(var(--accent, 79 70 229) / <alpha-value>)",
          foreground: "rgb(var(--accent-foreground, 255 255 255) / <alpha-value>)",
        },

        // ====================================================================
        // Design system PodFactory — catálogo /portfolio.
        // Namespace `pf-*` para não colidir com a paleta do CRM. Os valores
        // vêm das CSS vars emitidas por lib/portfolio/tokens.ts (único lugar
        // do módulo com hex literal). Canais RGB para que os modificadores de
        // opacidade (`bg-pf-inverse/12`) funcionem.
        // ====================================================================
        pf: {
          base: "rgb(var(--pf-surface-base-rgb) / <alpha-value>)",
          raised: "rgb(var(--pf-surface-raised-rgb) / <alpha-value>)",
          strong: "rgb(var(--pf-surface-strong-rgb) / <alpha-value>)",
          primary: "rgb(var(--pf-text-primary-rgb) / <alpha-value>)",
          inverse: "rgb(var(--pf-text-inverse-rgb) / <alpha-value>)",
          tertiary: "rgb(var(--pf-text-tertiary-rgb) / <alpha-value>)",
          muted: "rgb(var(--pf-border-muted-rgb) / <alpha-value>)",
          youtube: "var(--pf-youtube)",
          spotify: "var(--pf-spotify)",
          danger: "var(--pf-danger)",
        },
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "system-ui", "sans-serif"],
        pf: ["var(--pf-font)"],
      },
      fontSize: {
        "pf-xs": ["var(--pf-text-xs)", { lineHeight: "1.4" }],
        "pf-sm": ["var(--pf-text-sm)", { lineHeight: "1.5" }],
        "pf-md": ["var(--pf-text-md)", { lineHeight: "1.5" }],
        "pf-lg": ["var(--pf-text-lg)", { lineHeight: "1.4" }],
        "pf-xl": ["var(--pf-text-xl)", { lineHeight: "1.4" }],
        "pf-2xl": ["var(--pf-text-2xl)", { lineHeight: "1.35" }],
        "pf-3xl": ["var(--pf-text-3xl)", { lineHeight: "1.3" }],
        "pf-4xl": ["var(--pf-text-4xl)", { lineHeight: "1.25" }],
        "pf-base": ["var(--pf-text-base)", { lineHeight: "var(--pf-leading-base)" }],
        // Títulos escalados por clamp (spec §2)
        "pf-hero": ["var(--pf-text-hero)", { lineHeight: "1.08" }],
        "pf-program": ["var(--pf-text-program)", { lineHeight: "1.1" }],
        "pf-panel": ["var(--pf-text-panel)", { lineHeight: "1.15" }],
      },
      borderRadius: {
        "pf-xs": "var(--pf-radius-xs)",
        "pf-sm": "var(--pf-radius-sm)",
        "pf-md": "var(--pf-radius-md)",
        "pf-lg": "var(--pf-radius-lg)",
        "pf-xl": "var(--pf-radius-xl)",
        "pf-2xl": "var(--pf-radius-2xl)",
        "pf-pill": "var(--pf-radius-step7)",
        "pf-circle": "var(--pf-radius-step8)",
      },
      boxShadow: {
        // shadow.2 é reservada a overlays/modais (spec §7).
        "pf-1": "var(--pf-shadow-1)",
        "pf-2": "var(--pf-shadow-2)",
        "pf-3": "var(--pf-shadow-3)",
        "pf-4": "var(--pf-shadow-4)",
      },
      transitionDuration: {
        "pf-instant": "var(--pf-motion-instant)",
        "pf-fast": "var(--pf-motion-fast)",
        "pf-normal": "var(--pf-motion-normal)",
        "pf-slow": "var(--pf-motion-slow)",
      },
      transitionTimingFunction: {
        pf: "var(--pf-ease)",
      },
      letterSpacing: {
        "pf-meta": "0.12em",
        "pf-track": "0.08em",
        "pf-minimal": "0.06em",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;

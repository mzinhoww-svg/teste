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
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;

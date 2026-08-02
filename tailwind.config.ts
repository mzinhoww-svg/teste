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

        // ── Design system PodFactory (site público: landing + portfólio) ──────
        // Tokens SEMÂNTICOS. Componentes do site usam só estes nomes — nunca hex
        // cru. Valores em canais RGB (globals.css) para os modificadores de
        // opacidade funcionarem (`text-site-text-primary/70`).
        // Ver docs/site-design-system.md.
        site: {
          surface: {
            base: "rgb(var(--site-surface-base) / <alpha-value>)",
            raised: "rgb(var(--site-surface-raised) / <alpha-value>)",
            strong: "rgb(var(--site-surface-strong) / <alpha-value>)",
          },
          text: {
            primary: "rgb(var(--site-text-primary) / <alpha-value>)",
            inverse: "rgb(var(--site-text-inverse) / <alpha-value>)",
            tertiary: "rgb(var(--site-text-tertiary) / <alpha-value>)",
          },
          border: {
            muted: "rgb(var(--site-border-muted) / <alpha-value>)",
          },
          danger: "rgb(var(--site-danger) / <alpha-value>)",
        },
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "system-ui", "sans-serif"],
        // Borna é licenciada (não está no Google Fonts). Se os arquivos forem
        // self-hosted em /public/fonts, `--font-borna` assume; senão cai no
        // Geist Sans já instalado. Ver docs/site-design-system.md.
        borna: ["var(--font-borna)", "var(--font-geist-sans)", "system-ui", "sans-serif"],
      },
      fontSize: {
        // Escala PodFactory (px exatos do design). `site-base` é o corpo.
        "site-xs": ["8.75px", { lineHeight: "1.4", letterSpacing: "0.12em" }],
        "site-sm": ["12px", { lineHeight: "1.5" }],
        "site-md": ["12.03px", { lineHeight: "1.5" }],
        "site-lg": ["13.13px", { lineHeight: "1.45" }],
        "site-xl": ["14px", { lineHeight: "1.5" }],
        "site-2xl": ["14.22px", { lineHeight: "1.4" }],
        "site-3xl": ["15.31px", { lineHeight: "1.35" }],
        "site-4xl": ["15.75px", { lineHeight: "1.3", letterSpacing: "0.02em" }],
        "site-base": ["17.5px", { lineHeight: "26.25px" }],
        // Display: o 4xl escalado para viewport, como manda o design intent.
        "site-display": ["clamp(32px, 4vw, 56px)", { lineHeight: "1.15", letterSpacing: "0.02em" }],
        "site-h2": ["clamp(24px, 3vw, 40px)", { lineHeight: "1.2", letterSpacing: "0.02em" }],
        "site-h2-lg": ["clamp(28px, 3.5vw, 48px)", { lineHeight: "1.15", letterSpacing: "0.02em" }],
      },
      spacing: {
        // space.1…space.8 do design (micro-espaçamentos). O layout macro usa a
        // escala padrão do Tailwind (múltiplos de 8px: 2, 4, 6, 8, 12, 16, 24).
        "s1": "1px", "s2": "2px", "s3": "2.19px", "s4": "3px",
        "s5": "4.38px", "s6": "5px", "s7": "6px", "s8": "6.56px",
      },
      borderRadius: {
        "site-xs": "5px",
        "site-sm": "8px",
        "site-md": "10px",
        "site-lg": "12px",
        "site-xl": "14px",
        "site-2xl": "18px",
        "site-step7": "70px",
        "site-step8": "100px",
      },
      boxShadow: {
        "site-1": "var(--site-shadow-1)",
        "site-2": "var(--site-shadow-2)",
        "site-3": "var(--site-shadow-3)",
        "site-4": "var(--site-shadow-4)",
      },
      transitionDuration: {
        instant: "100ms",
        fast: "180ms",
        normal: "200ms",
        slow: "300ms",
      },
      keyframes: {
        "site-bounce-down": {
          "0%, 100%": { transform: "translateY(0)", opacity: "0.6" },
          "50%": { transform: "translateY(6px)", opacity: "1" },
        },
        "site-drawer-in": {
          from: { transform: "translateX(100%)" },
          to: { transform: "translateX(0)" },
        },
        "site-modal-in": {
          from: { opacity: "0", transform: "scale(0.95)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
      },
      animation: {
        "site-bounce-down": "site-bounce-down 2s ease-in-out infinite",
        "site-drawer-in": "site-drawer-in 300ms cubic-bezier(0.22, 1, 0.36, 1)",
        "site-modal-in": "site-modal-in 300ms cubic-bezier(0.22, 1, 0.36, 1)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;

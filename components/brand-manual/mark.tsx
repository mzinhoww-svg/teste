import * as React from "react";

// O símbolo da marca — moldura tracejada, cantos ativos dourados, microfone
// estilizado e onda sonora. Definido uma vez via <symbol> (oculto, absoluto)
// e reaproveitado com <use> em toda a página — mesma técnica do protótipo de
// referência, para não repetir os ~15 paths a cada uso. As cores trocam por
// contexto via custom properties `--mk-*` (ver THEME_VARS abaixo).

export function ReinersMarkDefs() {
  return (
    <svg width="0" height="0" style={{ position: "absolute", overflow: "hidden" }} aria-hidden="true">
      <symbol id="rm-mark" viewBox="0 0 110 110">
        <rect x="13" y="13" width="84" height="84" fill="none" stroke="var(--mk-frame,#9A7B35)" strokeWidth="1.2" strokeDasharray="4 2" />
        <path d="M13 33 L13 13 L33 13" fill="none" stroke="var(--mk-active,#C4A15A)" strokeWidth="3.2" strokeLinecap="square" />
        <path d="M97 77 L97 97 L77 97" fill="none" stroke="var(--mk-active,#C4A15A)" strokeWidth="3.2" strokeLinecap="square" />
        <path d="M77 13 L97 13 L97 33" fill="none" stroke="var(--mk-recess,#9A7B35)" strokeWidth="1" strokeLinecap="square" />
        <path d="M13 77 L13 97 L33 97" fill="none" stroke="var(--mk-recess,#9A7B35)" strokeWidth="1" strokeLinecap="square" />
        <rect x="43" y="28" width="24" height="34" rx="12" fill="var(--mk-fill,rgba(196,161,90,0.08))" stroke="var(--mk-mic,#C4A15A)" strokeWidth="2" />
        <line x1="47" y1="39" x2="63" y2="39" stroke="var(--mk-grid,#C4A15A)" strokeWidth="1" opacity="0.6" />
        <line x1="47" y1="45" x2="63" y2="45" stroke="var(--mk-grid,#C4A15A)" strokeWidth="1" opacity="0.6" />
        <line x1="47" y1="51" x2="63" y2="51" stroke="var(--mk-grid,#C4A15A)" strokeWidth="1" opacity="0.6" />
        <circle cx="55" cy="34" r="2.4" fill="var(--mk-cap,#C4A15A)" opacity="0.45" />
        <path d="M40 53 Q40 73 55 73 Q70 73 70 53" fill="none" stroke="var(--mk-mic,#C4A15A)" strokeWidth="1.8" strokeLinecap="round" />
        <line x1="55" y1="73" x2="55" y2="84" stroke="var(--mk-mic,#C4A15A)" strokeWidth="1.8" strokeLinecap="round" />
        <line x1="44" y1="84" x2="66" y2="84" stroke="var(--mk-mic,#C4A15A)" strokeWidth="2.5" strokeLinecap="square" />
        <path d="M40 91 Q47 87 54 91 Q61 95 68 91" fill="none" stroke="var(--mk-wave,#C4A15A)" strokeWidth="1.4" strokeLinecap="round" opacity="0.4" />
      </symbol>
    </svg>
  );
}

export type MarkTheme = "dark" | "light" | "mono";

type MarkVars = {
  "--mk-active": string;
  "--mk-recess": string;
  "--mk-frame": string;
  "--mk-mic": string;
  "--mk-grid": string;
  "--mk-cap": string;
  "--mk-wave": string;
};

const THEME_VARS: Record<MarkTheme, MarkVars> = {
  // Sobre fundo navy: ativo em ouro-claro, recesso/moldura em ouro.
  dark: {
    "--mk-active": "#C4A15A",
    "--mk-recess": "#9A7B35",
    "--mk-frame": "#9A7B35",
    "--mk-mic": "#C4A15A",
    "--mk-grid": "#C4A15A",
    "--mk-cap": "#C4A15A",
    "--mk-wave": "#C4A15A",
  },
  // Sobre fundo claro (creme/pergaminho): ativo em ouro, recesso/moldura em ouro-claro.
  light: {
    "--mk-active": "#9A7B35",
    "--mk-recess": "#C4A15A",
    "--mk-frame": "#C4A15A",
    "--mk-mic": "#9A7B35",
    "--mk-grid": "#9A7B35",
    "--mk-cap": "#9A7B35",
    "--mk-wave": "#9A7B35",
  },
  // Monocromático — só para o card de "cor fora da paleta" em Usos incorretos.
  mono: {
    "--mk-active": "#fff",
    "--mk-recess": "#fff",
    "--mk-frame": "#fff",
    "--mk-mic": "#fff",
    "--mk-grid": "#fff",
    "--mk-cap": "#fff",
    "--mk-wave": "#fff",
  },
};

export function ReinersMark({
  size = 110,
  theme = "dark",
  fill,
  className,
  style,
}: {
  size?: number;
  theme?: MarkTheme;
  /** Override de --mk-fill (corpo do microfone). Default: dourado translúcido do símbolo. */
  fill?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <svg
      width={size}
      height={size}
      aria-hidden="true"
      className={className}
      style={{
        ...(THEME_VARS[theme] as React.CSSProperties),
        ...(fill !== undefined ? ({ "--mk-fill": fill } as React.CSSProperties) : null),
        ...style,
      }}
    >
      <use href="#rm-mark" />
    </svg>
  );
}

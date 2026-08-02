// Rampa de marca determinística (sem Math.random — seguro para SSR/hidratação).
// A partir de UMA cor primária do tenant, deriva a escala 50→950 usada pelas
// classes `brand-*`. Trabalha em HSL preservando a MATIZ da marca e pisando a
// saturação, para que os tints (50–400) sejam claramente da família da cor
// (ex.: azul-marinho), não cinzas — e os passos escuros (700–950) fiquem
// distintos do 600, garantindo feedback de hover visível.
//
// Por que isso resolve o bug de contraste/cor: hoje o app remapeia só ~6 classes
// de ação; o resto da escala fica índigo. Tornando a escala INTEIRA dirigida por
// variáveis, cada tenant re-tinta tudo (botões, chips, rings, barras, tints de
// dark) de forma coerente — em claro e escuro — sem tocar em componente.

type RGB = { r: number; g: number; b: number };
type HSL = { h: number; s: number; l: number };

function hexToRgb(hex: string): RGB | null {
  const h = hex.trim().replace(/^#/, "");
  const s = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  if (s.length !== 6 || /[^0-9a-fA-F]/.test(s)) return null;
  return { r: parseInt(s.slice(0, 2), 16), g: parseInt(s.slice(2, 4), 16), b: parseInt(s.slice(4, 6), 16) };
}

// Canais "R G B" (0–255) — formato exigido pelo Tailwind para que os
// modificadores de opacidade (`bg-brand-950/40`, `bg-brand-50/50`) funcionem:
// as cores são definidas como `rgb(var(--brand-N) / <alpha-value>)`.
function toChannels({ r, g, b }: RGB): string {
  const c = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  return `${c(r)} ${c(g)} ${c(b)}`;
}

function rgbToHsl({ r, g, b }: RGB): HSL {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (mx + mn) / 2;
  const d = mx - mn;
  if (d) {
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    switch (mx) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4;
    }
    h /= 6;
  }
  return { h, s, l };
}

function hslToRgb({ h, s, l }: HSL): RGB {
  let r: number, g: number, b: number;
  if (!s) { r = g = b = l; }
  else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const hue = (t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    r = hue(h + 1 / 3); g = hue(h); b = hue(h - 1 / 3);
  }
  return { r: r * 255, g: g * 255, b: b * 255 };
}

// Luminosidade-alvo dos passos claros (50–500). O 600 é a primária exata.
const LIGHT_L: Record<number, number> = { 50: 0.96, 100: 0.9, 200: 0.81, 300: 0.68, 400: 0.55, 500: 0.42 };
// Fatores de escurecimento dos passos escuros (relativos à L da primária).
const DARK_F: Record<number, number> = { 700: 0.82, 800: 0.66, 900: 0.52, 950: 0.38 };

// Saturação por passo: tints um pouco mais suaves (mas ainda coloridos, com piso
// para não virarem cinza); núcleo mantém/realça a saturação da marca.
function satFor(step: number, sBase: number): number {
  const soft = Math.max(0.28, Math.min(sBase, 0.55));
  const core = Math.max(sBase, 0.45);
  if (step <= 200) return soft;
  if (step <= 500) return (soft + core) / 2;
  return core;
}

export type BrandRamp = Record<string, string>; // "--brand-50" -> "R G B" (canais)

/** Deriva a rampa completa a partir da cor primária. `null` se o hex for inválido. */
export function buildBrandRamp(primary?: string | null): BrandRamp | null {
  if (!primary) return null;
  const base = hexToRgb(primary);
  if (!base) return null;
  const { h, s, l } = rgbToHsl(base);
  const ramp: BrandRamp = {};
  for (const step of [50, 100, 200, 300, 400, 500]) {
    ramp[`--brand-${step}`] = toChannels(hslToRgb({ h, s: satFor(step, s), l: LIGHT_L[step] }));
  }
  ramp["--brand-600"] = toChannels(base); // primária exata
  const deepS = Math.min(1, s * 1.05);
  for (const step of [700, 800, 900, 950]) {
    ramp[`--brand-${step}`] = toChannels(hslToRgb({ h, s: deepS, l: l * DARK_F[step] }));
  }
  return ramp;
}

/** Luminância relativa WCAG (0–1). */
function luminance({ r, g, b }: RGB): number {
  const ch = (v: number) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
}

/** Canais "R G B" de uma cor primária (para --accent). `null` se inválida. */
export function toAccentChannels(hex?: string | null): string | null {
  const rgb = hex ? hexToRgb(hex) : null;
  return rgb ? toChannels(rgb) : null;
}

/**
 * Canais "R G B" do texto legível SOBRE `hex` (usado para --accent-foreground; o
 * accent/dourado jamais deve carregar texto branco quando é claro). Retorna
 * slate-800 ou branco pelo maior contraste — corrige o hover dourado ilegível
 * (branco sobre #C9A227 ≈ 1.9:1).
 */
export function readableOnChannels(hex?: string | null): string {
  const rgb = hex ? hexToRgb(hex) : null;
  if (!rgb) return "255 255 255";
  return luminance(rgb) > 0.4 ? "30 41 59" : "255 255 255";
}

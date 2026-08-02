import { describe, expect, it } from "vitest";
import {
  accentStyle,
  palette,
  portfolioCssVars,
  radii,
  toRgbChannels,
} from "@/lib/portfolio/tokens";

// ==========================================================================
// Contraste WCAG 2.2 — critério de aceite §6 / QA §11.
//
// Estes testes MEDEM os pares de cor do design system em vez de confiar nos
// números escritos na spec. Ver docs/portfolio.md para a conclusão: um par
// (text.tertiary sobre fundo escuro) NÃO atinge AA, e o teste abaixo trava
// esse fato para que a decisão de design seja consciente.
// ==========================================================================

function relativeLuminance(hex: string): number {
  const [r, g, b] = toRgbChannels(hex).split(" ").map(Number);
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [light, dark] = la > lb ? [la, lb] : [lb, la];
  return (light + 0.05) / (dark + 0.05);
}

describe("toRgbChannels", () => {
  it("converte hex de 6 e 3 dígitos", () => {
    expect(toRgbChannels("#000000")).toBe("0 0 0");
    expect(toRgbChannels("#fcfcfc")).toBe("252 252 252");
    expect(toRgbChannels("#d87dff")).toBe("216 125 255");
    expect(toRgbChannels("#fff")).toBe("255 255 255");
  });
});

describe("contraste dos tokens", () => {
  it("text.primary sobre surface.base passa AAA para texto normal", () => {
    const ratio = contrastRatio(palette.textPrimary, palette.surfaceBase);
    expect(ratio).toBeGreaterThanOrEqual(7);
    // A spec afirma 19,5:1; a medição dá 20,47:1 — a spec é conservadora.
    expect(ratio).toBeGreaterThan(20);
  });

  it("text.primary sobre surface.raised passa AA para texto normal", () => {
    expect(contrastRatio(palette.textPrimary, palette.surfaceRaised)).toBeGreaterThanOrEqual(4.5);
  });

  it("text.inverse sobre surface.base passa AA para texto grande (≥3:1)", () => {
    expect(contrastRatio(palette.textInverse, palette.surfaceBase)).toBeGreaterThanOrEqual(3);
  });

  it("text.inverse sobre surface.raised serve como indicador de foco (≥3:1)", () => {
    expect(contrastRatio(palette.textInverse, palette.surfaceRaised)).toBeGreaterThanOrEqual(3);
  });

  it("rótulos das trilhas passam AA sobre as cores de marca", () => {
    // O texto do botão é text.primary sobre #cc0000 / #1db954.
    expect(contrastRatio(palette.textPrimary, palette.youtube)).toBeGreaterThanOrEqual(4.5);
    // Spotify é um verde claro: só atinge AA para texto GRANDE. O botão usa
    // Borna xs, então este par é uma exceção conhecida — ver docs/portfolio.md.
    expect(contrastRatio(palette.textPrimary, palette.spotify)).toBeLessThan(4.5);
  });

  it("REGRESSÃO CONHECIDA: text.tertiary não é legível sobre fundo escuro", () => {
    // #0000ee sobre #14101c fica em 1,99:1 — muito abaixo dos 4,5:1 exigidos.
    // A spec designa text.tertiary para links externos; mantivemos o token como
    // especificado, mas isto é uma pendência de design, não um "passou".
    // Se o token for corrigido, este teste falha e deve ser atualizado.
    const ratio = contrastRatio(palette.textTertiary, palette.surfaceRaised);
    expect(ratio).toBeLessThan(4.5);
  });
});

describe("portfolioCssVars", () => {
  it("emite todas as cores como hex e como canais RGB", () => {
    const css = portfolioCssVars(".pf-root");
    expect(css.startsWith(".pf-root{")).toBe(true);
    expect(css).toContain("--pf-surface-base: #000000");
    expect(css).toContain("--pf-text-inverse-rgb: 216 125 255");
    expect(css).toContain("--pf-radius-sm: 8px");
    expect(css).toContain("--pf-motion-slow: 300ms");
  });

  it("aceita um seletor de escopo customizado", () => {
    expect(portfolioCssVars(":root").startsWith(":root{")).toBe(true);
  });
});

describe("accentStyle", () => {
  it("aceita hex de 3 e 6 dígitos", () => {
    expect(accentStyle("#d87dff")).toMatchObject({
      "--pf-text-inverse": "#d87dff",
      "--pf-text-inverse-rgb": "216 125 255",
    });
    expect(accentStyle("#abc")).toBeDefined();
  });

  it("recusa valores que não são hex — impede injeção de CSS pelo admin", () => {
    expect(accentStyle("red; background: url(evil)")).toBeUndefined();
    expect(accentStyle("javascript:alert(1)")).toBeUndefined();
    expect(accentStyle("")).toBeUndefined();
    expect(accentStyle(null)).toBeUndefined();
  });
});

describe("raios", () => {
  it("posters nunca podem passar de sm (8px) — anti-pattern §7", () => {
    expect(Number.parseInt(radii.sm, 10)).toBe(8);
    expect(Number.parseInt(radii.xs, 10)).toBeLessThan(Number.parseInt(radii.sm, 10));
  });
});

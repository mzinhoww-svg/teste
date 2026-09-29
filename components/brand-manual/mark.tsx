import * as React from "react";
import { BrandSymbol, type BrandSymbolTone } from "@/components/site/brand";

// O símbolo da marca no manual (`/manual-marca`) é o MESMO arquivo oficial do
// site (/public/brand). Este componente só traduz o vocabulário do manual
// (`dark`/`light`/`mono`) para a versão do arquivo:
//
//   dark  → fundo escuro  → creme
//   light → fundo claro   → navy
//   mono  → uma cor só    → mono
//
// `size` é a altura em px; a largura é automática. Os `style` que os cards de
// "Usos incorretos" passam (escala, rotação, filtro) distorcem o símbolo DE
// PROPÓSITO, para mostrar o que não fazer — nunca use estilo em uso real.

export type MarkTheme = "dark" | "light" | "mono";

const TONE: Record<MarkTheme, BrandSymbolTone> = {
  dark: "creme",
  light: "navy",
  mono: "mono",
};

export function ReinersMark({
  size = 110,
  theme = "dark",
  className,
  style,
}: {
  size?: number;
  theme?: MarkTheme;
  className?: string;
  style?: React.CSSProperties;
}) {
  return <BrandSymbol tone={TONE[theme]} height={size} className={className} style={style} />;
}

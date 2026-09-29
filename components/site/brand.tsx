import * as React from "react";
import { cn } from "@/lib/utils";

// Símbolo oficial da Reiners Media ("R" geométrico com microfone recortado e
// ponto dourado) + assinatura tipográfica. Regras de marca (não negociáveis):
//
//  - o símbolo só existe como arquivo em /public/brand — nunca redesenhado,
//    nem recolorido por CSS. Cada versão é um arquivo próprio;
//  - fundo ESCURO (navy, tinta, vídeo do hero) → versão `creme`;
//    fundo CLARO → versão `navy`; `mono` só para uso em uma cor;
//  - altura fixa e largura automática (nunca esticado): a proporção é a do
//    viewBox do SVG, 700 × 628;
//  - sem sombra, brilho, contorno, opacidade nem animação de zoom/rotação —
//    por isso este componente não tem estado de hover.
//
// O <img> é decorativo (alt=""): quem nomeia a marca é o aria-label do link
// que o contém, ou o texto da assinatura.

export type BrandSymbolTone = "creme" | "navy" | "mono";

const SYMBOL_SRC: Record<BrandSymbolTone, string> = {
  creme: "/brand/reinersmedia_symbol_creme.svg",
  navy: "/brand/reinersmedia_symbol_navy.svg",
  mono: "/brand/reinersmedia_symbol_mono.svg",
};

/** viewBox do símbolo oficial: 700 × 628. */
const SYMBOL_RATIO = 700 / 628;

/** Altura mínima permitida pela marca (favicon é a única exceção: 16px). */
export const BRAND_SYMBOL_MIN_HEIGHT = 24;

export function BrandSymbol({
  tone,
  height,
  mdHeight,
  className,
  style: extraStyle,
}: {
  tone: BrandSymbolTone;
  /** px. Largura é sempre automática, a partir da proporção do arquivo. */
  height: number;
  /** Altura (px) a partir de 768px, quando difere do mobile (header: 28 → 32). */
  mdHeight?: number;
  className?: string;
  /**
   * Só para os exemplos de "usos incorretos" do manual de marca (`/manual-marca`),
   * que distorcem o símbolo de propósito. Em uso real, não passe estilo.
   */
  style?: React.CSSProperties;
}) {
  // width/height como atributos só reservam o espaço antes do SVG carregar
  // (sem salto de layout); o estilo garante altura fixa + largura automática.
  const width = Math.round(height * SYMBOL_RATIO * 10) / 10;
  const responsive = mdHeight !== undefined;
  const style = responsive
    ? ({ "--brand-h": `${height}px`, "--brand-h-md": `${mdHeight}px` } as React.CSSProperties)
    : { height, width: "auto" };
  return (
    // eslint-disable-next-line @next/next/no-img-element -- SVG estático e já otimizado; next/image não processa SVG
    <img
      src={SYMBOL_SRC[tone]}
      alt=""
      width={width}
      height={height}
      decoding="async"
      draggable={false}
      className={cn(
        "block max-w-none shrink-0",
        responsive && "h-[var(--brand-h)] w-auto md:h-[var(--brand-h-md)]",
        className,
      )}
      style={{ ...style, ...extraStyle }}
    />
  );
}

/**
 * Assinatura: "REINERS" + "MEDIA" em Cormorant Garamond 700, caixa alta,
 * tracking 0.2em. "MEDIA" em Ouro Claro sobre fundo escuro e em Ouro sobre
 * fundo claro. O tamanho vem de `className` (text-[..px]).
 */
export function BrandSignature({
  onDark = false,
  className,
}: {
  onDark?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "whitespace-nowrap font-serif font-bold uppercase leading-none tracking-[0.2em]",
        className,
      )}
    >
      <span className={onDark ? "text-manual-creme" : "text-manual-navy"}>Reiners</span>{" "}
      <span className={onDark ? "text-manual-ouro-claro" : "text-manual-ouro"}>Media</span>
    </span>
  );
}

/**
 * Símbolo + assinatura lado a lado (o "lockup" horizontal). `gap-4` = os
 * 16px mínimos entre símbolo e texto que a marca exige no header.
 * `hideSignatureBelow` esconde a assinatura em telas menores (mobile: só o
 * símbolo).
 */
export function BrandLockup({
  onDark = false,
  symbolHeight,
  symbolHeightMd,
  signatureClassName,
  hideSignatureBelow,
  className,
}: {
  onDark?: boolean;
  symbolHeight: number;
  symbolHeightMd?: number;
  signatureClassName?: string;
  hideSignatureBelow?: "md";
  className?: string;
}) {
  return (
    <span className={cn("flex items-center gap-4", className)}>
      <BrandSymbol tone={onDark ? "creme" : "navy"} height={symbolHeight} mdHeight={symbolHeightMd} />
      <BrandSignature
        onDark={onDark}
        className={cn(hideSignatureBelow === "md" && "hidden md:inline", signatureClassName)}
      />
    </span>
  );
}

/**
 * Capa de marca: fundo navy + símbolo creme (regra: escuro → versão creme).
 * Usada pelo programa autoral quando não há pôster no CMS — hoje dormente:
 * só aparece no teaser da landing e no /portfolio, e o portfólio está oculto
 * (PORTFOLIO_ENABLED em lib/site/features.ts).
 *
 *  - `center`: símbolo centralizado, ~40% da altura (capa 16:9 do /portfolio);
 *  - `upper`: sobe o símbolo para a faixa livre acima do texto sobreposto do
 *    poster 2:3 da landing (categoria + título + cliente ocupam a base).
 *
 * Preenche o pai (`absolute inset-0`) — o pai precisa ser `relative`.
 */
export function BrandCover({
  placement = "center",
  className,
}: {
  placement?: "center" | "upper";
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "absolute inset-0 flex justify-center bg-manual-navy",
        placement === "center" ? "items-center" : "items-start",
        className,
      )}
    >
      <span
        className={cn(
          "flex items-center justify-center",
          placement === "center" ? "h-2/5" : "mt-[10%] h-[36%]",
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- SVG estático; next/image não processa SVG */}
        <img
          src={SYMBOL_SRC.creme}
          alt=""
          decoding="async"
          draggable={false}
          className="block h-full w-auto max-w-none"
        />
      </span>
    </span>
  );
}

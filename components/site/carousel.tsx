"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

// Carrossel do site. Escala para N itens — a grade fixa de 3 não escalava.
//
// A rolagem é NATIVA (scroll-snap): funciona sem JS, com trackpad, com swipe e
// com as setas do teclado quando a lista tem foco. Os botões são um reforço,
// não o mecanismo — por isso somem quando tudo cabe na tela.
//
// `scrollBy` respeita prefers-reduced-motion: com a preferência ligada o salto
// é instantâneo em vez de animado.

export function SiteCarousel({
  children,
  label,
  itemClassName,
}: {
  children: React.ReactNode[];
  label: string;
  /** Largura de cada item. Padrão: 1 por tela no mobile, 3 no desktop. */
  itemClassName?: string;
}) {
  const trackRef = React.useRef<HTMLUListElement>(null);
  const [atStart, setAtStart] = React.useState(true);
  const [atEnd, setAtEnd] = React.useState(true);

  const sync = React.useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setAtStart(el.scrollLeft <= 1);
    // -1 de folga: arredondamento de subpixel nunca chega ao máximo exato.
    setAtEnd(el.scrollLeft >= max - 1);
  }, []);

  React.useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    sync();
    el.addEventListener("scroll", sync, { passive: true });
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", sync);
      ro.disconnect();
    };
  }, [sync, children.length]);

  function page(direction: 1 | -1) {
    const el = trackRef.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Rola uma "tela" de itens, não um item só: menos cliques em lista longa.
    el.scrollBy({ left: direction * el.clientWidth * 0.9, behavior: reduce ? "auto" : "smooth" });
  }

  // Tudo cabe na tela: os botões não têm função.
  const hidden = atStart && atEnd;

  return (
    <div className="relative">
      <ul
        ref={trackRef}
        aria-label={label}
        tabIndex={0}
        className={cn(
          "flex snap-x snap-mandatory gap-6 overflow-x-auto pb-4",
          // Esconde a barra nativa sem impedir a rolagem.
          "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        )}
      >
        {children.map((child, i) => (
          <li
            key={i}
            className={cn("shrink-0 snap-start", itemClassName ?? "w-[85vw] md:w-[calc((100%-3rem)/3)]")}
          >
            {child}
          </li>
        ))}
      </ul>

      <div className={cn("mt-6 flex justify-end gap-3", hidden && "hidden")}>
        <CarouselButton direction="prev" disabled={atStart} onClick={() => page(-1)} />
        <CarouselButton direction="next" disabled={atEnd} onClick={() => page(1)} />
      </div>
    </div>
  );
}

function CarouselButton({
  direction,
  disabled,
  onClick,
}: {
  direction: "prev" | "next";
  disabled: boolean;
  onClick: () => void;
}) {
  const prev = direction === "prev";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={prev ? "Anterior" : "Próximo"}
      className={cn(
        "grid h-11 w-11 place-items-center rounded-site-step8 border border-site-border-muted/15",
        "text-site-text-primary transition-all duration-fast",
        "hover:border-site-text-inverse hover:text-site-text-inverse",
        "disabled:pointer-events-none disabled:opacity-35",
      )}
    >
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
        <path d={prev ? "M15 5l-7 7 7 7" : "M9 5l7 7-7 7"} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

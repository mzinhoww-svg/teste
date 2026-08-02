"use client";

import { forwardRef } from "react";
import { accentStyle } from "@/lib/portfolio/tokens";
import type { Podcast, VisualStyle } from "@/lib/portfolio/types";

// ==========================================================================
// POSTER — aspect 2/3, raio `sm` (nunca maior: anti-pattern §7).
// Estados: default, hover, focus-visible, active, loading (skeleton) e error.
// Semântica: é um BOTÃO que expande o painel inline — não navega (§7).
// ==========================================================================

/** Camada de arte por variante. Cada estilo é 100% CSS (ver portfolio.css). */
export function PosterArt({
  visualStyle,
  coverImage,
  title,
}: {
  visualStyle: VisualStyle;
  coverImage?: string;
  title: string;
}) {
  const artClass = `pf-art pf-art-${visualStyle.toLowerCase()}`;

  return (
    <>
      <span aria-hidden className={artClass} />
      {coverImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={coverImage}
          alt={`Capa do programa ${title}`}
          loading="lazy"
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : null}
      {/* MINIMAL usa o próprio título como elemento gráfico central. */}
      {visualStyle === "MINIMAL" && !coverImage ? (
        <span
          aria-hidden
          className="absolute inset-0 grid place-items-center px-4 text-center text-pf-3xl lowercase tracking-pf-minimal text-pf-primary"
        >
          {title}
        </span>
      ) : null}
    </>
  );
}

export const PodcastPoster = forwardRef<
  HTMLButtonElement,
  {
    podcast: Podcast;
    index: number;
    expanded: boolean;
    panelId: string;
    onToggle: () => void;
    onNavigate: () => void;
  }
>(function PodcastPoster({ podcast, index, expanded, panelId, onToggle, onNavigate }, ref) {
  const hasCover = podcast.coverImage.trim().length > 0;

  return (
    <button
      ref={ref}
      type="button"
      aria-expanded={expanded}
      aria-controls={panelId}
      // Duplo clique navega para a página dedicada; clique simples expande (§7).
      onDoubleClick={onNavigate}
      onClick={onToggle}
      style={{
        ...accentStyle(podcast.accentColor),
        ["--pf-delay" as string]: `${Math.min(index, 12) * 60}ms`,
      }}
      className={[
        "pf-stagger pf-motion-transform group relative block aspect-[2/3] w-full overflow-hidden rounded-pf-sm border text-left",
        "transition-[transform,box-shadow,border-color] duration-pf-slow ease-pf",
        "active:scale-[0.98] active:duration-pf-instant",
        expanded
          ? "z-[2] scale-[1.04] border-pf-inverse/20 shadow-pf-3"
          : "border-pf-muted/[0.06] hover:z-[2] hover:scale-[1.04] hover:border-pf-inverse/20 hover:shadow-pf-3",
      ].join(" ")}
    >
      <PosterArt
        visualStyle={podcast.visualStyle}
        coverImage={hasCover ? podcast.coverImage : undefined}
        title={podcast.title}
      />

      {/* Véu inferior garante contraste do título sobre qualquer arte. */}
      <span aria-hidden className="pf-poster-fade absolute inset-x-0 bottom-0 h-1/2" />

      <span className="absolute inset-x-0 bottom-0 flex flex-col gap-1 p-3">
        <span className="line-clamp-2 text-pf-lg font-medium text-pf-primary">
          {podcast.title}
        </span>
        <span className="truncate text-pf-xs uppercase tracking-pf-meta text-pf-primary/50">
          {podcast.category} · {podcast.year}
        </span>
      </span>
    </button>
  );
});

/** Estado de carregamento do grid (spec §5 — SkeletonGrid). */
export function SkeletonGrid({ count = 10 }: { count?: number }) {
  return (
    <div
      aria-busy="true"
      aria-label="Carregando programas"
      className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5"
    >
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="pf-skeleton aspect-[2/3] w-full rounded-pf-sm" />
      ))}
    </div>
  );
}

/** Estado de erro do poster (spec §5). */
export function PosterError({ title }: { title: string }) {
  return (
    <div
      role="img"
      aria-label={`Falha ao carregar a capa de ${title}`}
      className="grid aspect-[2/3] w-full place-items-center rounded-pf-sm border border-pf-danger bg-pf-raised"
    >
      <span aria-hidden className="text-pf-4xl text-pf-danger">
        !
      </span>
    </div>
  );
}

/** Poster sem capa nem arte disponível. */
export function PosterEmpty() {
  return (
    <div className="grid aspect-[2/3] w-full place-items-center rounded-pf-sm border border-pf-muted/[0.06] bg-pf-raised">
      <span className="text-pf-sm text-pf-primary/30">Sem capa</span>
    </div>
  );
}

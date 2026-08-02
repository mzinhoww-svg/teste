"use client";

import { useRef } from "react";
import Link from "next/link";
import { PosterArt } from "./PodcastPoster";
import { accentStyle } from "@/lib/portfolio/tokens";
import type { Podcast } from "@/lib/portfolio/types";

// Carrossel de destaques — scroll horizontal nativo com snap obrigatório.
// Setas ← / → navegam entre os cards (a11y §6); a barra de rolagem é ocultada
// via `.pf-scroll-x` mas o scroll por toque/trackpad continua nativo.

export function FeaturedCarousel({ podcasts }: { podcasts: Podcast[] }) {
  const listRef = useRef<HTMLUListElement>(null);

  if (!podcasts.length) return null;

  function onKeyDown(event: React.KeyboardEvent<HTMLUListElement>) {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    const links = listRef.current?.querySelectorAll<HTMLAnchorElement>("a[href]");
    if (!links?.length) return;

    const current = Array.from(links).indexOf(document.activeElement as HTMLAnchorElement);
    if (current === -1) return;

    event.preventDefault();
    const next =
      event.key === "ArrowRight"
        ? Math.min(current + 1, links.length - 1)
        : Math.max(current - 1, 0);
    links[next].focus();
  }

  return (
    <ul
      ref={listRef}
      onKeyDown={onKeyDown}
      className="pf-scroll-x flex gap-4 pb-2"
    >
      {podcasts.map((podcast) => (
        <li
          key={podcast.id}
          className="w-[300px] shrink-0"
          style={{ scrollSnapAlign: "start", ...accentStyle(podcast.accentColor) }}
        >
          <Link
            href={`/portfolio/${podcast.slug}`}
            className="pf-motion-transform group block overflow-hidden rounded-pf-lg border border-pf-muted/[0.06] bg-pf-raised transition-[transform,box-shadow,border-color] duration-pf-slow ease-pf hover:-translate-y-1 hover:border-pf-inverse/20 hover:shadow-pf-3"
          >
            <span className="relative block aspect-video w-full overflow-hidden">
              <PosterArt
                visualStyle={podcast.visualStyle}
                coverImage={podcast.coverImage || undefined}
                title={podcast.title}
              />
              {/* Play overlay: some por padrão, aparece no hover e no foco. */}
              <span
                aria-hidden
                className="absolute inset-0 grid place-items-center bg-pf-base/30 text-[36px] leading-none text-pf-inverse opacity-0 transition-opacity duration-pf-slow ease-pf group-hover:opacity-100 group-focus-visible:opacity-100"
              >
                ▶
              </span>
            </span>

            <span className="block p-4">
              <span className="block truncate text-pf-2xl font-medium text-pf-primary">
                {podcast.title}
              </span>
              <span className="mt-1 block truncate text-pf-xs uppercase tracking-pf-meta text-pf-primary/50">
                {podcast.category} · {podcast.year} · {podcast.episodes.length} ep.
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

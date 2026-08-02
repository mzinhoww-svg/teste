"use client";

import { TrilhaButton, type TrackVariant } from "./TrilhaButton";
import type { Episode } from "@/lib/portfolio/types";

// Linha de episódio — usada tanto no painel expansível quanto na página
// dedicada do programa. Estados: default, hover (bg 2%), focus-visible.

export interface EmbedRequest {
  variant: TrackVariant;
  embedUrl: string;
  externalUrl: string | null;
  title: string;
}

function formatNumber(n: number): string {
  return `E${String(n).padStart(2, "0")}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function EpisodeRow({
  episode,
  podcastTitle,
  onOpenEmbed,
}: {
  episode: Episode;
  podcastTitle: string;
  onOpenEmbed: (req: EmbedRequest) => void;
}) {
  return (
    <li className="flex items-start gap-[14px] border-b border-pf-muted/[0.06] py-3 transition-colors duration-pf-fast ease-pf hover:bg-pf-muted/[0.02]">
      <span
        className="pf-tabular w-8 shrink-0 pt-1 text-pf-xs uppercase tracking-pf-meta text-pf-inverse"
        aria-hidden
      >
        {formatNumber(episode.number)}
      </span>

      <span className="relative hidden h-[50px] w-[88px] shrink-0 overflow-hidden rounded-pf-xs bg-pf-strong sm:block">
        {episode.thumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={episode.thumbnail}
            alt={`Capa do episódio ${episode.number}: ${episode.title}`}
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : (
          <span aria-hidden className="pf-art pf-art-duotone" />
        )}
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-pf-base font-medium text-pf-primary">
          <span className="sr-only">Episódio {episode.number}: </span>
          {episode.title}
        </span>
        <span className="mt-1 line-clamp-2 block text-pf-sm text-pf-primary/60">
          {episode.description}
        </span>
        <span className="mt-2 flex flex-wrap items-center gap-2">
          <span className="pf-tabular text-pf-xs uppercase tracking-pf-meta text-pf-primary/50">
            {episode.duration}
          </span>
          <span aria-hidden className="text-pf-xs text-pf-primary/30">
            ·
          </span>
          <span className="text-pf-xs uppercase tracking-pf-meta text-pf-primary/50">
            {formatDate(episode.publishedAt)}
          </span>
        </span>
      </span>

      <span className="flex shrink-0 flex-wrap items-start gap-2">
        <TrilhaButton
          variant="YOUTUBE"
          embedUrl={episode.youtubeEmbed}
          externalUrl={episode.youtubeUrl}
          episodeTitle={episode.title}
          podcastTitle={podcastTitle}
          onOpen={onOpenEmbed}
        />
        <TrilhaButton
          variant="SPOTIFY"
          embedUrl={episode.spotifyEmbed}
          externalUrl={episode.spotifyUrl}
          episodeTitle={episode.title}
          podcastTitle={podcastTitle}
          onOpen={onOpenEmbed}
        />
      </span>
    </li>
  );
}

export function EpisodeList({
  episodes,
  podcastTitle,
  onOpenEmbed,
  scrollable = false,
}: {
  episodes: Episode[];
  podcastTitle: string;
  onOpenEmbed: (req: EmbedRequest) => void;
  scrollable?: boolean;
}) {
  if (!episodes.length) {
    return <p className="text-pf-sm text-pf-primary/30">Nenhum episódio publicado</p>;
  }

  return (
    <ul
      // Dentro do painel a lista rola em vez de esticar: o painel é limitado a
      // 700px (spec §4) e qualquer excesso seria cortado. Cinco episódios já
      // ultrapassam essa altura, então o container rola sempre que `scrollable`.
      className={scrollable ? "pf-scroll-y max-h-[360px] pr-2" : ""}
    >
      {episodes.map((episode) => (
        <EpisodeRow
          key={episode.id}
          episode={episode}
          podcastTitle={podcastTitle}
          onOpenEmbed={onOpenEmbed}
        />
      ))}
    </ul>
  );
}

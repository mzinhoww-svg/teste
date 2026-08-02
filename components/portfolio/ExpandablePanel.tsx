"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { EpisodeList, type EmbedRequest } from "./EpisodeRow";
import { HostList, MetaLine, SocialRow, StatusBadge } from "./primitives";
import { PosterArt } from "./PodcastPoster";
import { accentStyle } from "@/lib/portfolio/tokens";
import type { Podcast } from "@/lib/portfolio/types";

// ==========================================================================
// PAINEL EXPANSÍVEL — ocupa a linha inteira do grid, abaixo da fileira do
// poster clicado. Transição por max-height + opacity (`slow`, 300ms).
// Layout 35% / 65%; empilha abaixo de 700px.
// ==========================================================================

export function ExpandablePanel({
  podcast,
  open,
  panelId,
  onClose,
  onOpenEmbed,
}: {
  podcast: Podcast;
  open: boolean;
  panelId: string;
  onClose: () => void;
  onOpenEmbed: (req: EmbedRequest) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  // Centraliza o painel na viewport ao abrir. `smooth` só quando o usuário não
  // pediu menos movimento.
  useEffect(() => {
    if (!open || !ref.current) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = window.setTimeout(() => {
      ref.current?.scrollIntoView({
        behavior: reduced ? "auto" : "smooth",
        block: "center",
      });
    }, 320); // após a transição de abertura
    return () => window.clearTimeout(timer);
  }, [open]);

  const latest = podcast.episodes[0];

  return (
    <div
      ref={ref}
      id={panelId}
      className="pf-panel"
      data-state={open ? "open" : "closed"}
      // Anunciado por leitores de tela ao abrir (a11y §6).
      aria-live="polite"
      aria-hidden={!open}
      style={accentStyle(podcast.accentColor)}
    >
      <div
        // `inert` impede que o conteúdo fechado receba Tab.
        {...(open ? {} : { inert: "" as unknown as boolean })}
        className="relative rounded-b-pf-lg border-t border-pf-inverse bg-pf-raised p-4 sm:p-6"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label={`Fechar detalhes de ${podcast.title}`}
          className="absolute right-4 top-4 grid h-11 w-11 place-items-center rounded-pf-circle text-pf-primary"
        >
          <span
            aria-hidden
            className="grid h-9 w-9 place-items-center rounded-pf-circle border border-pf-inverse/25 bg-pf-inverse/10 transition-colors duration-pf-fast ease-pf hover:bg-pf-inverse/20"
          >
            ✕
          </span>
        </button>

        <div className="flex flex-col gap-6 min-[700px]:flex-row">
          {/* Coluna esquerda — 35% */}
          <div className="flex flex-col gap-5 min-[700px]:w-[35%]">
            <div className="relative aspect-video w-full overflow-hidden rounded-pf-md border border-pf-muted/[0.06]">
              <PosterArt
                visualStyle={podcast.visualStyle}
                coverImage={podcast.coverImage || undefined}
                title={podcast.title}
              />
            </div>

            <div className="flex flex-wrap gap-2">
              {latest?.youtubeEmbed || latest?.spotifyEmbed ? (
                <button
                  type="button"
                  onClick={() => {
                    const embedUrl = latest.youtubeEmbed ?? latest.spotifyEmbed!;
                    onOpenEmbed({
                      variant: latest.youtubeEmbed ? "YOUTUBE" : "SPOTIFY",
                      embedUrl,
                      externalUrl: latest.youtubeEmbed ? latest.youtubeUrl : latest.spotifyUrl,
                      title: latest.title,
                    });
                  }}
                  className="pf-motion-transform inline-flex min-h-[44px] items-center rounded-pf-md bg-pf-inverse px-4 text-pf-xl font-medium text-pf-base transition-shadow duration-pf-fast ease-pf hover:shadow-pf-3"
                >
                  Ouvir último ep
                </button>
              ) : null}
              <Link
                href={`/portfolio/${podcast.slug}`}
                className="inline-flex min-h-[44px] items-center rounded-pf-md border border-pf-muted/[0.15] px-4 text-pf-xl text-pf-primary transition-colors duration-pf-fast ease-pf hover:border-pf-inverse hover:text-pf-inverse"
              >
                Ver página
              </Link>
            </div>

            {podcast.hosts.length ? (
              <div>
                <h4 className="mb-3 text-pf-xs uppercase tracking-pf-meta text-pf-primary/50">
                  Apresentação
                </h4>
                <HostList hosts={podcast.hosts} compact />
              </div>
            ) : null}

            <div>
              <h4 className="mb-3 text-pf-xs uppercase tracking-pf-meta text-pf-primary/50">
                Redes
              </h4>
              <SocialRow links={podcast.socialLinks} podcastTitle={podcast.title} />
            </div>
          </div>

          {/* Coluna direita — 65% */}
          <div className="flex min-w-0 flex-col gap-4 min-[700px]:w-[65%]">
            <div className="pr-12">
              <h3 className="text-pf-panel font-medium text-pf-primary">{podcast.title}</h3>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <StatusBadge status={podcast.status} />
                <MetaLine items={[podcast.category, podcast.year]} />
              </div>
            </div>

            <p className="line-clamp-4 text-pf-base text-pf-primary/75">{podcast.description}</p>

            <div>
              <h4 className="mb-2 text-pf-xs uppercase tracking-pf-meta text-pf-primary/50">
                Episódios
              </h4>
              <EpisodeList
                episodes={podcast.episodes}
                podcastTitle={podcast.title}
                onOpenEmbed={onOpenEmbed}
                scrollable
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

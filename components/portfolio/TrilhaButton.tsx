"use client";

import { track } from "@/lib/portfolio/track";

// Botão de trilha (YouTube / Spotify).
// Estados cobertos: default, hover, focus-visible, active, disabled.
// Alvo de toque mínimo 44px (a11y §6) — a spec pede altura visual de 36px, então
// a caixa clicável cresce por padding vertical sem alterar a pílula.

export type TrackVariant = "YOUTUBE" | "SPOTIFY";

const VARIANT: Record<TrackVariant, { label: string; bg: string; icon: string }> = {
  YOUTUBE: { label: "YouTube", bg: "bg-pf-youtube", icon: "▶" },
  SPOTIFY: { label: "Spotify", bg: "bg-pf-spotify", icon: "♪" },
};

export function TrilhaButton({
  variant,
  embedUrl,
  externalUrl,
  episodeTitle,
  podcastTitle,
  onOpen,
}: {
  variant: TrackVariant;
  embedUrl: string | null;
  externalUrl: string | null;
  episodeTitle: string;
  podcastTitle: string;
  onOpen: (payload: {
    variant: TrackVariant;
    embedUrl: string;
    externalUrl: string | null;
    title: string;
  }) => void;
}) {
  const v = VARIANT[variant];
  const disabled = !embedUrl;

  return (
    <button
      type="button"
      disabled={disabled}
      aria-label={
        disabled
          ? `${v.label} indisponível para ${episodeTitle}`
          : `Ouvir ${episodeTitle} no ${v.label}`
      }
      onClick={() => {
        if (!embedUrl) return;
        track(variant === "YOUTUBE" ? "YOUTUBE_CLICK" : "SPOTIFY_CLICK", {
          podcastTitle,
          episodeTitle,
        });
        onOpen({ variant, embedUrl, externalUrl, title: episodeTitle });
      }}
      className={[
        "pf-motion-transform inline-flex min-h-[44px] items-center gap-[5px] rounded-pf-xs px-3 py-[6px] text-pf-xs uppercase tracking-pf-track text-pf-primary",
        "transition-[filter,transform,box-shadow] duration-pf-fast ease-pf",
        v.bg,
        disabled
          ? "cursor-not-allowed opacity-[0.35]"
          : "hover:scale-[1.02] hover:shadow-pf-4 hover:brightness-110 active:scale-[0.97] active:duration-pf-instant",
      ].join(" ")}
    >
      <span aria-hidden className="text-[13px] leading-none">
        {v.icon}
      </span>
      {v.label}
    </button>
  );
}

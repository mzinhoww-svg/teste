"use client";

import * as React from "react";

// Mídia de fundo do hero.
// Critério de a11y: aria-hidden, muted, loop, playsInline e PAUSA quando sai da
// viewport (IntersectionObserver). Com prefers-reduced-motion o vídeo nem
// chega a tocar — fica o pôster estático. Sem vídeo configurado, cai na
// imagem; sem imagem, no gradiente.

export function HeroMedia({
  videoUrl,
  imageUrl,
}: {
  videoUrl: string | null;
  imageUrl: string | null;
}) {
  const ref = React.useRef<HTMLVideoElement>(null);

  React.useEffect(() => {
    const node = ref.current;
    if (!node) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      node.pause();
      return;
    }

    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) void node.play().catch(() => {});
        else node.pause();
      },
      { threshold: 0.1 },
    );
    io.observe(node);
    return () => io.disconnect();
  }, [videoUrl]);

  if (videoUrl) {
    return (
      <video
        ref={ref}
        className="absolute inset-0 h-full w-full object-cover opacity-35"
        src={videoUrl}
        poster={imageUrl ?? undefined}
        aria-hidden="true"
        muted
        autoPlay
        loop
        playsInline
        preload="metadata"
      />
    );
  }

  if (imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- URL vinda do CMS (host livre)
      <img
        src={imageUrl}
        alt=""
        aria-hidden="true"
        className="absolute inset-0 h-full w-full object-cover opacity-35"
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_-10%,rgb(var(--site-text-inverse)/0.22),transparent_55%)]"
    />
  );
}

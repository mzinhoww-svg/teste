import Link from "next/link";
import { cn } from "@/lib/utils";
import type { Program } from "@/lib/site/content";

// Poster 2:3 de um programa (teaser da landing e grade do /portfolio).
// Hover: scale(1.04) + glow roxo; focus-visible herda o outline do site.
// A imagem vem do CMS (host arbitrário) — por isso <img> e não next/image.

export function SitePoster({ program, className }: { program: Program; className?: string }) {
  return (
    <Link
      href={`/portfolio#${program.slug}`}
      className={cn(
        "group relative block aspect-[2/3] overflow-hidden rounded-site-sm",
        "border border-site-border-muted/[0.06] bg-site-surface-raised",
        "transition-all duration-slow ease-out",
        "hover:scale-[1.04] hover:border-site-text-inverse/20 hover:shadow-site-3",
        "active:scale-[0.98] motion-reduce:hover:scale-100",
        className,
      )}
    >
      {program.posterUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- URL vinda do CMS (host livre)
        <img
          src={program.posterUrl}
          alt={`Capa do programa ${program.title}`}
          className="absolute inset-0 h-full w-full object-cover"
          loading="lazy"
        />
      ) : (
        <span
          aria-hidden="true"
          className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgb(var(--site-text-inverse)/0.18),transparent_60%)]"
        />
      )}

      {/* Gradiente de leitura: garante contraste do título sobre qualquer capa */}
      <span
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-site-surface-base/95 via-site-surface-base/60 to-transparent"
      />

      <span className="absolute inset-x-0 bottom-0 flex flex-col gap-1 p-4">
        {program.category && (
          <span className="text-site-xs font-medium uppercase text-site-text-inverse">
            {program.category}
          </span>
        )}
        <span className="line-clamp-2 text-site-lg font-medium text-site-text-primary [text-shadow:var(--site-shadow-1)]">
          {program.title}
        </span>
        {program.client && (
          <span className="line-clamp-1 text-site-sm text-site-text-primary/60">{program.client}</span>
        )}
      </span>
    </Link>
  );
}

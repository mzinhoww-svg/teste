"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { deleteEpisode } from "@/app/admin/portfolio/actions";
import type { Episode } from "@/lib/portfolio/types";
import { Alert, Button, Card } from "./AdminUI";

type Row = Episode & { podcastTitle: string; podcastSlug: string };

// Lista paginada de episódios (a spec proíbe carregar tudo de uma vez).
// A paginação em si é feita pela página server; aqui só o CRUD por linha.

export function EpisodeList({ episodes }: { episodes: Row[] }) {
  const [items, setItems] = useState(episodes);
  const [error, setError] = useState<string | null>(null);

  if (!items.length) {
    return (
      <Card>
        <p className="text-pf-sm text-pf-primary/30">Nenhum episódio cadastrado ainda.</p>
      </Card>
    );
  }

  return (
    <>
      {error ? <Alert kind="error">{error}</Alert> : null}
      <ul className="flex flex-col gap-3">
        {items.map((episode) => (
          <li
            key={episode.id}
            className="flex flex-wrap items-center gap-4 rounded-pf-lg border border-pf-muted/[0.06] bg-pf-raised p-4"
          >
            <span className="pf-tabular w-10 shrink-0 text-pf-xs uppercase tracking-pf-meta text-pf-inverse">
              E{String(episode.number).padStart(2, "0")}
            </span>

            <span className="min-w-0 flex-1">
              <span className="block truncate text-pf-base font-medium text-pf-primary">
                {episode.title}
              </span>
              <span className="mt-1 block truncate text-pf-xs uppercase tracking-pf-meta text-pf-primary/50">
                {episode.podcastTitle} · {episode.duration} ·{" "}
                {new Date(episode.publishedAt).toLocaleDateString("pt-BR")}
                {episode.youtubeEmbed ? " · YouTube" : ""}
                {episode.spotifyEmbed ? " · Spotify" : ""}
              </span>
            </span>

            <span className="flex gap-2">
              <Link
                href={`/admin/portfolio/episodios/${episode.id}`}
                className="inline-flex min-h-[44px] items-center rounded-pf-md border border-pf-muted/[0.15] px-4 text-pf-xl text-pf-primary transition-colors duration-pf-fast ease-pf hover:border-pf-inverse hover:text-pf-inverse"
              >
                Editar
              </Link>
              <DeleteEpisode
                episode={episode}
                onError={setError}
                onDone={(id) => setItems((cur) => cur.filter((e) => e.id !== id))}
              />
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}

function DeleteEpisode({
  episode,
  onError,
  onDone,
}: {
  episode: Row;
  onError: (message: string) => void;
  onDone: (id: string) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [, startTransition] = useTransition();

  if (!confirming) {
    return (
      <Button type="button" variant="danger" onClick={() => setConfirming(true)}>
        Excluir
      </Button>
    );
  }

  return (
    <span className="flex items-center gap-2">
      <Button
        type="button"
        variant="danger"
        onClick={() =>
          startTransition(async () => {
            const result = await deleteEpisode(episode.id);
            if (result.ok) onDone(episode.id);
            else onError(result.error ?? "Falha ao excluir.");
            setConfirming(false);
          })
        }
      >
        Confirmar
      </Button>
      <Button type="button" variant="ghost" onClick={() => setConfirming(false)}>
        Cancelar
      </Button>
    </span>
  );
}

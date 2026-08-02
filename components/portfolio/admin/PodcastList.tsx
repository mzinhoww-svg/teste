"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { deletePodcast, reorderPodcasts, toggleFeatured } from "@/app/admin/portfolio/actions";
import { STATUS_LABEL, VISUAL_STYLE_LABEL, type Podcast } from "@/lib/portfolio/types";
import { Alert, Button, Card } from "./AdminUI";

// Lista de programas com reordenação por arrastar.
// Acessibilidade: além do drag (mouse/toque), cada item tem botões ↑ / ↓ que
// fazem a mesma coisa pelo teclado — arrastar nunca é o único caminho.

export function PodcastList({
  podcasts,
  canDelete,
}: {
  podcasts: Podcast[];
  canDelete: boolean;
}) {
  const [items, setItems] = useState(podcasts);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function persist(next: Podcast[]) {
    setItems(next);
    startTransition(async () => {
      const result = await reorderPodcasts(next.map((p) => p.id));
      if (!result.ok) setError(result.error ?? "Falha ao reordenar.");
    });
  }

  function move(from: number, to: number) {
    if (to < 0 || to >= items.length || from === to) return;
    const next = [...items];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    persist(next);
  }

  if (!items.length) {
    return (
      <Card>
        <p className="text-pf-sm text-pf-primary/30">Nenhum programa cadastrado ainda.</p>
      </Card>
    );
  }

  return (
    <>
      {error ? <Alert kind="error">{error}</Alert> : null}

      <ul className="flex flex-col gap-3">
        {items.map((podcast, index) => (
          <li
            key={podcast.id}
            draggable
            onDragStart={() => setDragIndex(index)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (dragIndex !== null) move(dragIndex, index);
              setDragIndex(null);
            }}
            onDragEnd={() => setDragIndex(null)}
            className={`flex flex-wrap items-center gap-4 rounded-pf-lg border border-pf-muted/[0.06] bg-pf-raised p-4 transition-colors duration-pf-fast ease-pf ${
              dragIndex === index ? "border-pf-inverse/25" : ""
            }`}
          >
            <span
              aria-hidden
              className="cursor-grab text-pf-base text-pf-primary/30 active:cursor-grabbing"
            >
              ⠿
            </span>

            <span className="flex flex-col gap-1">
              <button
                type="button"
                onClick={() => move(index, index - 1)}
                disabled={index === 0}
                aria-label={`Mover ${podcast.title} para cima`}
                className="grid h-6 w-11 place-items-center rounded-pf-xs text-pf-primary/60 hover:text-pf-inverse disabled:opacity-[0.35]"
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => move(index, index + 1)}
                disabled={index === items.length - 1}
                aria-label={`Mover ${podcast.title} para baixo`}
                className="grid h-6 w-11 place-items-center rounded-pf-xs text-pf-primary/60 hover:text-pf-inverse disabled:opacity-[0.35]"
              >
                ↓
              </button>
            </span>

            <span className="min-w-0 flex-1">
              <span className="block truncate text-pf-base font-medium text-pf-primary">
                {podcast.title}
              </span>
              <span className="mt-1 block truncate text-pf-xs uppercase tracking-pf-meta text-pf-primary/50">
                {podcast.category} · {podcast.year} · {STATUS_LABEL[podcast.status]} ·{" "}
                {VISUAL_STYLE_LABEL[podcast.visualStyle]} · {podcast.episodes.length} ep.
              </span>
            </span>

            <FeaturedToggle podcast={podcast} onError={setError} />

            <span className="flex gap-2">
              <Link
                href={`/admin/portfolio/programas/${podcast.id}`}
                className="inline-flex min-h-[44px] items-center rounded-pf-md border border-pf-muted/[0.15] px-4 text-pf-xl text-pf-primary transition-colors duration-pf-fast ease-pf hover:border-pf-inverse hover:text-pf-inverse"
              >
                Editar
              </Link>
              {canDelete ? (
                <DeleteButton podcast={podcast} onError={setError} onDone={(id) =>
                  setItems((cur) => cur.filter((p) => p.id !== id))
                } />
              ) : null}
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}

function FeaturedToggle({
  podcast,
  onError,
}: {
  podcast: Podcast;
  onError: (message: string) => void;
}) {
  const [featured, setFeatured] = useState(podcast.featured);
  const [, startTransition] = useTransition();

  return (
    <label className="flex min-h-[44px] items-center gap-2">
      <input
        type="checkbox"
        checked={featured}
        onChange={(e) => {
          const next = e.target.checked;
          setFeatured(next);
          startTransition(async () => {
            const result = await toggleFeatured(podcast.id, next);
            if (!result.ok) {
              setFeatured(!next); // desfaz o otimismo se o servidor recusou
              onError(result.error ?? "Falha ao alterar destaque.");
            }
          });
        }}
        className="h-5 w-5 accent-pf-inverse"
      />
      <span className="text-pf-xs uppercase tracking-pf-meta text-pf-primary/50">Destaque</span>
    </label>
  );
}

function DeleteButton({
  podcast,
  onError,
  onDone,
}: {
  podcast: Podcast;
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
      <span className="text-pf-sm text-pf-primary/60">Excluir com os episódios?</span>
      <Button
        type="button"
        variant="danger"
        onClick={() =>
          startTransition(async () => {
            const result = await deletePodcast(podcast.id);
            if (result.ok) onDone(podcast.id);
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

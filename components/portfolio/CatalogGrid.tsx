"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PodcastPoster } from "./PodcastPoster";
import { ExpandablePanel } from "./ExpandablePanel";
import { EmbedModal } from "./EmbedModal";
import type { EmbedRequest } from "./EpisodeRow";
import { track } from "@/lib/portfolio/track";
import type { Podcast } from "@/lib/portfolio/types";

// ==========================================================================
// GRID DO CATÁLOGO — orquestra os posters e o painel expansível.
//
// Regras de comportamento (spec §4):
//   - apenas UM painel aberto por vez; abrir outro fecha o anterior;
//   - o painel entra ABAIXO da linha do grid em que está o poster clicado;
//   - ESC fecha; o foco volta ao poster que abriu.
//
// O grid é 5/3/2 colunas. Como o painel ocupa a linha inteira, precisamos saber
// quantas colunas estão ativas para inseri-lo no fim da fileira certa — daí o
// `useColumns`, que espelha os mesmos breakpoints das classes Tailwind abaixo.
// ==========================================================================

const BREAKPOINTS = [
  { query: "(min-width: 1280px)", columns: 5 }, // xl
  { query: "(min-width: 768px)", columns: 3 }, // md
] as const;

function useColumns(): number {
  const [columns, setColumns] = useState(2);

  useEffect(() => {
    const lists = BREAKPOINTS.map((b) => window.matchMedia(b.query));
    const update = () => {
      const hit = BREAKPOINTS.findIndex((_, i) => lists[i].matches);
      setColumns(hit === -1 ? 2 : BREAKPOINTS[hit].columns);
    };
    update();
    lists.forEach((l) => l.addEventListener("change", update));
    return () => lists.forEach((l) => l.removeEventListener("change", update));
  }, []);

  return columns;
}

export function CatalogGrid({ podcasts }: { podcasts: Podcast[] }) {
  const router = useRouter();
  const columns = useColumns();
  const idPrefix = useId();

  const [openId, setOpenId] = useState<string | null>(null);
  const [embed, setEmbed] = useState<EmbedRequest | null>(null);
  const posterRefs = useRef(new Map<string, HTMLButtonElement>());

  const openIndex = useMemo(
    () => (openId ? podcasts.findIndex((p) => p.id === openId) : -1),
    [openId, podcasts],
  );

  const close = useCallback(() => {
    setOpenId((current) => {
      if (current) posterRefs.current.get(current)?.focus();
      return null;
    });
  }, []);

  const toggle = useCallback(
    (podcast: Podcast) => {
      setOpenId((current) => {
        if (current === podcast.id) return null;
        track("CARD_EXPAND", { podcastTitle: podcast.title, slug: podcast.slug });
        return podcast.id;
      });
    },
    [],
  );

  // ESC fecha o painel. O modal trata o próprio ESC antes (captura + stopPropagation),
  // então um ESC com o player aberto não fecha o painel junto.
  useEffect(() => {
    if (!openId) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [openId, close]);

  // Fatia os posters em fileiras para saber onde o painel deve entrar.
  const rows = useMemo(() => {
    const out: Podcast[][] = [];
    for (let i = 0; i < podcasts.length; i += columns) {
      out.push(podcasts.slice(i, i + columns));
    }
    return out;
  }, [podcasts, columns]);

  if (!podcasts.length) {
    return (
      <p className="text-pf-sm text-pf-primary/30">Nenhum programa publicado ainda</p>
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
        {rows.map((row, rowIndex) => {
          const rowStart = rowIndex * columns;
          const rowEnd = rowStart + row.length - 1;
          const openInThisRow = openIndex >= rowStart && openIndex <= rowEnd;
          const openPodcast = openInThisRow ? podcasts[openIndex] : null;

          return (
            <FragmentRow key={rowIndex}>
              {row.map((podcast, i) => {
                const index = rowStart + i;
                return (
                  <PodcastPoster
                    key={podcast.id}
                    ref={(node) => {
                      if (node) posterRefs.current.set(podcast.id, node);
                      else posterRefs.current.delete(podcast.id);
                    }}
                    podcast={podcast}
                    index={index}
                    expanded={openId === podcast.id}
                    panelId={`${idPrefix}-panel-${podcast.id}`}
                    onToggle={() => toggle(podcast)}
                    onNavigate={() => router.push(`/portfolio/${podcast.slug}`)}
                  />
                );
              })}

              {openPodcast ? (
                <ExpandablePanel
                  podcast={openPodcast}
                  open
                  panelId={`${idPrefix}-panel-${openPodcast.id}`}
                  onClose={close}
                  onOpenEmbed={setEmbed}
                />
              ) : null}
            </FragmentRow>
          );
        })}
      </div>

      <EmbedModal request={embed} onClose={() => setEmbed(null)} />
    </>
  );
}

/** Agrupador sem elemento DOM — mantém os filhos como itens diretos do grid. */
function FragmentRow({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

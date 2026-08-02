"use client";

import { useRef, useState } from "react";
import { EpisodeList, type EmbedRequest } from "./EpisodeRow";
import { EmbedModal } from "./EmbedModal";
import { HostList, SocialRow } from "./primitives";
import type { Podcast } from "@/lib/portfolio/types";

// Tabs da página do programa — padrão WAI-ARIA:
// role="tablist"/"tab"/"tabpanel", ←/→ navegam, Enter/Espaço ativam e apenas a
// aba ativa fica no fluxo de Tab (roving tabindex).

const TABS = [
  { id: "sobre", label: "Sobre" },
  { id: "episodios", label: "Episódios" },
  { id: "redes", label: "Redes Sociais" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function PodcastTabs({ podcast }: { podcast: Podcast }) {
  const [active, setActive] = useState<TabId>("sobre");
  const [embed, setEmbed] = useState<EmbedRequest | null>(null);
  const tabRefs = useRef(new Map<TabId, HTMLButtonElement>());

  function onKeyDown(event: React.KeyboardEvent) {
    const index = TABS.findIndex((t) => t.id === active);
    let next = index;

    if (event.key === "ArrowRight") next = (index + 1) % TABS.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + TABS.length) % TABS.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = TABS.length - 1;
    else return;

    event.preventDefault();
    setActive(TABS[next].id);
    tabRefs.current.get(TABS[next].id)?.focus();
  }

  return (
    <>
      <div role="tablist" aria-label="Seções do programa" className="flex border-b border-pf-muted/[0.08]" onKeyDown={onKeyDown}>
        {TABS.map((tab) => {
          const selected = active === tab.id;
          return (
            <button
              key={tab.id}
              ref={(node) => {
                if (node) tabRefs.current.set(tab.id, node);
                else tabRefs.current.delete(tab.id);
              }}
              type="button"
              role="tab"
              id={`tab-${tab.id}`}
              aria-selected={selected}
              aria-controls={`panel-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(tab.id)}
              className={[
                "min-h-[44px] px-4 py-3 text-pf-base transition-colors duration-pf-fast ease-pf",
                selected
                  ? "border-b-2 border-pf-inverse font-medium text-pf-primary"
                  : "text-pf-primary/60 hover:text-pf-primary/85",
              ].join(" ")}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id="panel-sobre"
        aria-labelledby="tab-sobre"
        hidden={active !== "sobre"}
        tabIndex={0}
        className="animate-reveal py-6"
      >
        <p className="max-w-3xl text-pf-base text-pf-primary">{podcast.description}</p>
        {podcast.hosts.length ? (
          <div className="mt-8">
            <h2 className="mb-4 text-pf-2xl font-medium text-pf-primary">Apresentação</h2>
            <HostList hosts={podcast.hosts} />
            {podcast.hosts.some((h) => h.bio) ? (
              <ul className="mt-4 flex max-w-3xl flex-col gap-3">
                {podcast.hosts
                  .filter((h) => h.bio)
                  .map((h) => (
                    <li key={h.name} className="text-pf-sm text-pf-primary/60">
                      <strong className="font-medium text-pf-primary">{h.name}</strong> — {h.bio}
                    </li>
                  ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>

      <div
        role="tabpanel"
        id="panel-episodios"
        aria-labelledby="tab-episodios"
        hidden={active !== "episodios"}
        tabIndex={0}
        className="animate-reveal py-6"
      >
        <h2 className="mb-4 text-pf-2xl font-medium text-pf-primary">Últimos episódios</h2>
        <EpisodeList
          episodes={podcast.episodes.slice(0, 5)}
          podcastTitle={podcast.title}
          onOpenEmbed={setEmbed}
        />
      </div>

      <div
        role="tabpanel"
        id="panel-redes"
        aria-labelledby="tab-redes"
        hidden={active !== "redes"}
        tabIndex={0}
        className="animate-reveal py-6"
      >
        <h2 className="mb-4 text-pf-2xl font-medium text-pf-primary">Redes sociais</h2>
        <SocialRow links={podcast.socialLinks} podcastTitle={podcast.title} />
      </div>

      <EmbedModal request={embed} onClose={() => setEmbed(null)} />
    </>
  );
}

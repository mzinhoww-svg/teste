/**
 * TCK-016 — Lista de episódios de um programa (Server Component).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SEMÂNTICA
 * ─────────────────────────────────────────────────────────────────────────────
 * `<ol>` e não `<ul>`: a ordem importa (mais recente primeiro, a mesma de
 * `GET /api/podcasts/:slug`) e o leitor de tela anuncia "lista com 25 itens",
 * que é a informação que falta quando se empilha `<div>`. Cada item é um
 * `<article>` porque um episódio é conteúdo autocontido e sindicável.
 *
 * O nível do heading é PROP, não constante: dentro do painel "Episódios" desta
 * página o título do episódio é `h3` (sob o `h2` da aba, sob o `h1` do hero),
 * mas o TCK-013 vai reusar este componente em outra hierarquia. Fixar `h3` aqui
 * criaria salto de nível lá (WCAG 2.2 §1.3.1).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * NÚMERO, DURAÇÃO E DATA
 * ─────────────────────────────────────────────────────────────────────────────
 * Os três metadados exigidos pelo ticket saem numa `<dl>`: são pares
 * rótulo/valor de verdade, e a `<dl>` é o que dá ao leitor de tela o rótulo
 * "Duração" antes de "45 min 30 s". O texto visível continua compacto
 * (`45:30`), com a forma falada no `sr-only` — ninguém quer ouvir
 * "quarenta e cinco dois pontos trinta".
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IMAGEM
 * ─────────────────────────────────────────────────────────────────────────────
 * `next/image` com `fill` dentro de um contêiner com proporção fixa, e `sizes`
 * declarando a largura REAL em cada breakpoint (96px no mobile, 160px a partir
 * de `md`). Sem `sizes` correto o Next assume `100vw` e baixa uma imagem ~10x
 * maior que o slot — é o erro que derruba o LCP do NFR-001. `thumbnail` é
 * opcional no schema: sem ela entra um marcador decorativo, nunca um `<img>`
 * quebrado.
 */
import Image from 'next/image';
import { Podcast as PodcastIcon } from 'lucide-react';
import type { ElementType } from 'react';

import {
  formatEpisodeNumber,
  formatPublishedAt,
  toDateTimeAttribute,
  toIsoDuration,
  toSpokenDuration,
} from './format';
import { TrackLinks } from './track-links';
import { cn } from '@/components/ui';
import type { Episode } from '@/types/api';

/** Larguras reais do slot da miniatura — espelham as classes do contêiner. */
export const EPISODE_THUMBNAIL_SIZES = '(min-width: 768px) 160px, 96px';

export type EpisodeHeadingLevel = 'h2' | 'h3' | 'h4';

export interface EpisodeListProps {
  episodes: readonly Episode[];
  /** Nome do programa — entra no `alt` da miniatura e no contexto das trilhas. */
  podcastTitle: string;
  /** Nível do heading do título de cada episódio. Default `h3`. */
  headingLevel?: EpisodeHeadingLevel;
  /** Texto do estado vazio. */
  emptyMessage?: string;
  className?: string;
}

export interface EpisodeListItemProps {
  episode: Episode;
  podcastTitle: string;
  headingLevel?: EpisodeHeadingLevel;
}

export function EpisodeListItem({
  episode,
  podcastTitle,
  headingLevel = 'h3',
}: EpisodeListItemProps) {
  const Heading = headingLevel as ElementType;

  const label = formatEpisodeNumber(episode.number);
  const publishedLabel = formatPublishedAt(episode.publishedAt);
  const publishedAttribute = toDateTimeAttribute(episode.publishedAt);
  const isoDuration = toIsoDuration(episode.duration);
  const spokenDuration = toSpokenDuration(episode.duration);

  return (
    <li>
      <article className="flex gap-4 rounded-lg border border-line-default bg-surface-raised p-4">
        <div className="relative aspect-video w-24 shrink-0 overflow-hidden rounded-md bg-surface-sunken md:w-40">
          {episode.thumbnail ? (
            <Image
              src={episode.thumbnail}
              alt={`Miniatura do ${label} de ${podcastTitle}: ${episode.title}`}
              fill
              sizes={EPISODE_THUMBNAIL_SIZES}
              className="object-cover"
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-content-muted">
              <PodcastIcon aria-hidden="true" focusable="false" className="h-6 w-6" />
            </span>
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <p className="text-2xs font-medium uppercase tracking-wide text-content-muted">{label}</p>

          <Heading className="text-base font-semibold text-content-primary">
            {episode.title}
          </Heading>

          <p className="line-clamp-2 text-sm text-content-secondary">{episode.description}</p>

          <dl className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-content-muted">
            <div className="flex items-center gap-1">
              <dt>Duração</dt>
              <dd>
                {isoDuration ? (
                  <time dateTime={isoDuration}>
                    <span aria-hidden="true">{episode.duration}</span>
                    <span className="sr-only">{spokenDuration ?? episode.duration}</span>
                  </time>
                ) : (
                  episode.duration
                )}
              </dd>
            </div>

            {publishedLabel ? (
              <div className="flex items-center gap-1">
                <dt>Publicado em</dt>
                <dd>
                  {publishedAttribute ? (
                    <time dateTime={publishedAttribute}>{publishedLabel}</time>
                  ) : (
                    publishedLabel
                  )}
                </dd>
              </div>
            ) : null}
          </dl>

          <TrackLinks episode={episode} context={label} className="pt-1" />
        </div>
      </article>
    </li>
  );
}

export function EpisodeList({
  episodes,
  podcastTitle,
  headingLevel = 'h3',
  emptyMessage = 'Nenhum episódio publicado neste programa ainda.',
  className,
}: EpisodeListProps) {
  if (episodes.length === 0) {
    return (
      <p className="rounded-lg border border-line-default bg-surface-raised p-6 text-sm text-content-secondary">
        {emptyMessage}
      </p>
    );
  }

  return (
    <ol className={cn('flex flex-col gap-4', className)}>
      {episodes.map((episode) => (
        <EpisodeListItem
          key={episode.id}
          episode={episode}
          podcastTitle={podcastTitle}
          headingLevel={headingLevel}
        />
      ))}
    </ol>
  );
}

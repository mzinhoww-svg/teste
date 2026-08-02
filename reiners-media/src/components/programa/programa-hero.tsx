/**
 * TCK-016 — Hero do programa (Server Component, zero JS no cliente).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUE NENHUM COMPONENTE `'use client'` ENTRA AQUI
 * ─────────────────────────────────────────────────────────────────────────────
 * O hero é o LCP da rota: é a primeira coisa pintada e não tem estado nenhum.
 * `Badge` é Server Component (ver o docblock de `src/components/ui/index.ts`) e
 * por isso pode ser usado; `Avatar`, ao contrário, é `'use client'` — usá-lo
 * para as fotos dos hosts arrastaria um bundle e um `useState` para uma imagem
 * que nunca muda. O fallback de iniciais é reimplementado aqui em ~6 linhas de
 * marcação estática, usando `hosts[].initial`, que o `podcastHostSchema` já
 * exige justamente para esse fim.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IMAGEM 21:9
 * ─────────────────────────────────────────────────────────────────────────────
 * `heroImage` quando existir, `coverImage` como base (o schema garante que a
 * capa sempre existe — é NOT NULL no Prisma). `priority` porque é o LCP;
 * `sizes="100vw"` porque o bloco ocupa a largura do contêiner de conteúdo em
 * todos os breakpoints. O `alt` descreve o que a imagem É ("Capa do programa
 * X"), não o arquivo.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * `accentColor` E CONTRASTE
 * ─────────────────────────────────────────────────────────────────────────────
 * `accentColor` é dado por programa (hex validado por `hexColorSchema`), não um
 * literal de código — o guard de design system varre o FONTE, e não há hex
 * nenhum aqui. Ele é aplicado só a uma régua DECORATIVA (`aria-hidden`), nunca
 * a texto nem como único portador de informação: uma cor arbitrária vinda do
 * banco não tem contraste garantido contra a superfície (WCAG 2.2 §1.4.3 vale
 * para texto; §1.4.11 não alcança elemento puramente decorativo).
 *
 * O estado do programa aparece como TEXTO no badge ("Em produção"), então quem
 * não distingue a cor da variante continua recebendo a informação inteira.
 */
import Image from 'next/image';

import { podcastStatusPresentation } from './status';
import { Badge, cn } from '@/components/ui';
import type { PodcastHost, PodcastStatus } from '@/types/api';

/** Recorte do programa que o hero consome — desacopla da entidade inteira. */
export interface ProgramaHeroPodcast {
  readonly title: string;
  readonly tagline?: string | null;
  readonly coverImage: string;
  readonly heroImage?: string | null;
  readonly category: string;
  readonly status: PodcastStatus;
  readonly year: number;
  readonly accentColor: string;
  readonly hosts: readonly PodcastHost[];
}

export interface ProgramaHeroProps {
  podcast: ProgramaHeroPodcast;
  className?: string;
}

/** `id` do heading que rotula a lista de apresentadores. */
const HOSTS_HEADING_ID = 'programa-hosts';

export function ProgramaHero({ podcast, className }: ProgramaHeroProps) {
  const status = podcastStatusPresentation(podcast.status);
  const image = podcast.heroImage ?? podcast.coverImage;

  return (
    <header className={cn('flex flex-col gap-6', className)}>
      <div className="relative aspect-[21/9] w-full overflow-hidden rounded-xl bg-surface-sunken shadow-poster">
        <Image
          src={image}
          alt={`Capa do programa ${podcast.title}`}
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />
      </div>

      <div className="flex flex-col gap-4">
        <ul className="flex flex-wrap items-center gap-2">
          <li>
            <Badge variant="accent">{podcast.category}</Badge>
          </li>
          <li>
            <Badge variant={status.variant}>{status.label}</Badge>
          </li>
          <li>
            <Badge variant="outline">{podcast.year}</Badge>
          </li>
        </ul>

        <div className="flex flex-col gap-3">
          <h1 className="text-4xl font-bold text-content-primary md:text-5xl">{podcast.title}</h1>
          {/* Régua decorativa na cor do programa — ver nota de contraste acima. */}
          <span
            aria-hidden="true"
            className="block h-1 w-16 rounded-full"
            style={{ backgroundColor: podcast.accentColor }}
          />
        </div>

        {podcast.tagline ? (
          <p className="max-w-3xl text-lg text-content-secondary">{podcast.tagline}</p>
        ) : null}

        <section aria-labelledby={HOSTS_HEADING_ID} className="flex flex-col gap-3 pt-2">
          <h2
            id={HOSTS_HEADING_ID}
            className="text-2xs font-medium uppercase tracking-wide text-content-muted"
          >
            Apresentação
          </h2>
          <ul className="flex flex-wrap items-center gap-x-6 gap-y-3">
            {podcast.hosts.map((host) => (
              <li key={host.name} className="flex items-center gap-3">
                <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full border border-line-default bg-surface-sunken">
                  {host.photo ? (
                    <Image
                      src={host.photo}
                      alt={`Foto de ${host.name}`}
                      fill
                      sizes="40px"
                      className="object-cover"
                    />
                  ) : (
                    <span
                      aria-hidden="true"
                      className="flex h-full w-full items-center justify-center text-xs font-medium text-content-secondary"
                    >
                      {host.initial}
                    </span>
                  )}
                </span>
                <span className="text-sm font-medium text-content-primary">{host.name}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </header>
  );
}

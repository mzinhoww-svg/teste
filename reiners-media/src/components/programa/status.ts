/**
 * TCK-016 — Tradução de `Podcast.status` para rótulo e variante de `Badge`.
 *
 * Existe separado do componente por dois motivos:
 *   1. o rótulo aparece no hero E na metadata (`generateMetadata`), e duas
 *      cópias divergiriam na primeira vez que alguém renomeasse "Em cartaz";
 *   2. o mapa é exaustivo por tipo — `Record<PodcastStatus, …>` faz o
 *      compilador reclamar se o `z.enum` de `podcastStatusSchema` ganhar um
 *      quarto valor, em vez de renderizar um badge vazio em produção.
 *
 * A variante nunca é a única portadora da informação: o rótulo textual está
 * sempre presente (WCAG 2.2 §1.4.1 — cor não é o único meio).
 */
import type { BadgeVariant } from '@/components/ui';
import type { PodcastStatus } from '@/types/api';

export interface PodcastStatusPresentation {
  readonly label: string;
  readonly variant: BadgeVariant;
  /** Frase completa para leitor de tela e para a descrição de SEO. */
  readonly description: string;
}

export const PODCAST_STATUS_PRESENTATION: Record<PodcastStatus, PodcastStatusPresentation> = {
  ACTIVE: {
    label: 'Em produção',
    variant: 'success',
    description: 'Programa em produção, com episódios novos.',
  },
  HIATUS: {
    label: 'Em hiato',
    variant: 'warning',
    description: 'Programa em hiato, sem episódios novos no momento.',
  },
  ENDED: {
    label: 'Encerrado',
    variant: 'neutral',
    description: 'Programa encerrado, com catálogo completo disponível.',
  },
};

export function podcastStatusPresentation(status: PodcastStatus): PodcastStatusPresentation {
  return PODCAST_STATUS_PRESENTATION[status];
}

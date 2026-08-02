/**
 * TCK-016 — Botões de trilha (YouTube / Spotify) de um episódio.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SERVER COMPONENT — e por que ele NÃO usa `buttonVariants`
 * ─────────────────────────────────────────────────────────────────────────────
 * `src/components/ui/button.tsx` é `'use client'`. Num módulo com essa
 * diretiva, TODA export vira uma *client reference*: importar `buttonVariants`
 * daqui e chamá-lo durante o render do servidor estoura com "Attempted to call
 * buttonVariants() from the server". Por isso a aparência é redeclarada com
 * `cva` local — mesmos tokens, mesma altura, mesmo `focusRing` (que vem de
 * `ui/styles.ts`, módulo de servidor). Zero JS no cliente.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LINK, NÃO BOTÃO (fronteira com o TCK-015)
 * ─────────────────────────────────────────────────────────────────────────────
 * O modal de player é do TCK-015. Aqui a trilha é um `<a>` de verdade para a
 * página da plataforma: funciona sem JavaScript, aparece no menu de contexto,
 * abre em nova aba e é rastreável. `embedUrl` já vem resolvido em
 * `ResolvedTrack` — quando o TCK-015 chegar, ele só precisa interceptar o
 * clique; a URL do iframe já está pronta e correta para as duas plataformas.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ACESSIBILIDADE
 * ─────────────────────────────────────────────────────────────────────────────
 * - O ícone é `aria-hidden`: quem nomeia o link é o texto.
 * - O nome acessível é completo — "Ouvir Episódio 3 no Spotify (abre em nova
 *   aba)" — porque numa lista de 25 episódios "Spotify" repetido 25 vezes não
 *   distingue nada na lista de links do leitor de tela (WCAG 2.2 §2.4.4).
 * - `target="_blank"` sempre acompanhado de `rel="noopener noreferrer"` e do
 *   aviso textual de nova aba (WCAG 2.2 §3.2.5).
 */
import { cva, type VariantProps } from 'class-variance-authority';
import { Headphones, Youtube } from 'lucide-react';
import type { ComponentType, SVGProps } from 'react';

import { resolveEpisodeTracks, type EpisodeTrackSource, type TrackPlatform } from './embeds';
import { cn, controlTransition, focusRing } from '@/components/ui';

const trackLinkVariants = cva(
  [
    'inline-flex select-none items-center justify-center gap-2 whitespace-nowrap',
    'rounded-md font-medium',
    'border border-line-default bg-surface-raised text-content-primary',
    'hover:bg-surface-sunken active:bg-surface-sunken',
    controlTransition,
    focusRing,
  ],
  {
    variants: {
      size: {
        sm: 'h-8 px-3 text-xs',
        md: 'h-10 px-4 text-sm',
      },
    },
    defaultVariants: { size: 'sm' },
  },
);

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

/**
 * Lucide não tem marca do Spotify (ícones de marca saíram do pacote por
 * licenciamento). `Headphones` é o substituto neutro; a identificação da
 * plataforma é feita pelo texto, não pelo desenho.
 */
const PLATFORM_ICON: Record<TrackPlatform, IconComponent> = {
  youtube: Youtube,
  spotify: Headphones,
};

/** Verbo por plataforma: assistir vídeo, ouvir áudio. */
const PLATFORM_VERB: Record<TrackPlatform, string> = {
  youtube: 'Assistir',
  spotify: 'Ouvir',
};

export interface TrackLinksProps extends VariantProps<typeof trackLinkVariants> {
  /** Episódio de onde as trilhas são derivadas. */
  episode: EpisodeTrackSource;
  /**
   * Contexto para o nome acessível — normalmente `Episódio 3` ou
   * `Episódio 3: Título`. Sem ele os links da lista ficam indistinguíveis.
   */
  context: string;
  className?: string;
}

/**
 * Renderiza uma trilha por plataforma disponível. Episódio sem nenhuma trilha
 * utilizável renderiza `null` — nunca um botão morto.
 */
export function TrackLinks({ episode, context, size, className }: TrackLinksProps) {
  const tracks = resolveEpisodeTracks(episode);
  if (tracks.length === 0) return null;

  return (
    <ul className={cn('flex flex-wrap items-center gap-2', className)}>
      {tracks.map((track) => {
        const Icon = PLATFORM_ICON[track.platform];
        return (
          <li key={track.platform}>
            <a
              href={track.href}
              target="_blank"
              rel="noopener noreferrer"
              data-platform={track.platform}
              data-embed-url={track.embedUrl}
              className={trackLinkVariants({ size })}
            >
              <Icon aria-hidden="true" focusable="false" className="h-4 w-4" />
              <span>{track.label}</span>
              <span className="sr-only">
                {` — ${PLATFORM_VERB[track.platform]} ${context} no ${track.label} (abre em nova aba)`}
              </span>
            </a>
          </li>
        );
      })}
    </ul>
  );
}

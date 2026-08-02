/**
 * TCK-016 — Painel "Sobre" do programa (Server Component).
 *
 * A `description` é texto livre de até 5000 caracteres vindo do admin. Jogá-la
 * num único `<p>` com `whitespace-pre-line` "funciona" visualmente, mas entrega
 * um parágrafo gigante ao leitor de tela, que perde a navegação por parágrafo.
 * Aqui as quebras duplas viram `<p>` de verdade — e o texto NUNCA é
 * interpretado como HTML (nada de `dangerouslySetInnerHTML`), o que fecha o
 * eixo de XSS armazenado apontado no NFR-005.
 *
 * A ficha técnica é uma `<dl>`: pares rótulo/valor reais, com o rótulo
 * anunciado antes do valor.
 */
import { formatEpisodeCount } from './format';
import { podcastStatusPresentation } from './status';
import { cn } from '@/components/ui';
import type { PodcastHost, PodcastStatus } from '@/types/api';

/** `'a\n\nb'` → `['a', 'b']`. Linhas em branco separam parágrafos. */
export function toParagraphs(description: string): string[] {
  return description
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0);
}

export interface ProgramaAboutPodcast {
  readonly title: string;
  readonly description: string;
  readonly category: string;
  readonly status: PodcastStatus;
  readonly year: number;
  readonly hosts: readonly PodcastHost[];
}

export interface ProgramaAboutProps {
  podcast: ProgramaAboutPodcast;
  episodeCount: number;
  className?: string;
}

export function ProgramaAbout({ podcast, episodeCount, className }: ProgramaAboutProps) {
  const paragraphs = toParagraphs(podcast.description);
  const status = podcastStatusPresentation(podcast.status);
  const hostsWithBio = podcast.hosts.filter((host) => Boolean(host.bio));

  return (
    <div className={cn('flex flex-col gap-6', className)}>
      <div className="flex max-w-3xl flex-col gap-3 text-base text-content-secondary">
        {paragraphs.length > 0 ? (
          paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)
        ) : (
          <p>{podcast.description}</p>
        )}
      </div>

      <dl className="grid grid-cols-1 gap-4 rounded-lg border border-line-default bg-surface-raised p-6 sm:grid-cols-2">
        <FactItem term="Categoria" detail={podcast.category} />
        <FactItem term="Ano de estreia" detail={String(podcast.year)} />
        <FactItem term="Situação" detail={status.description} />
        <FactItem term="Catálogo" detail={formatEpisodeCount(episodeCount)} />
      </dl>

      {hostsWithBio.length > 0 ? (
        <section className="flex flex-col gap-4">
          <h3 className="text-lg font-semibold text-content-primary">Quem apresenta</h3>
          <ul className="flex flex-col gap-4">
            {hostsWithBio.map((host: PodcastHost) => (
              <li key={host.name} className="flex flex-col gap-1">
                <p className="text-sm font-semibold text-content-primary">{host.name}</p>
                <p className="max-w-3xl text-sm text-content-secondary">{host.bio}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function FactItem({ term, detail }: { term: string; detail: string }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-2xs font-medium uppercase tracking-wide text-content-muted">{term}</dt>
      <dd className="text-sm text-content-primary">{detail}</dd>
    </div>
  );
}

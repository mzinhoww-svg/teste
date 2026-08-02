/**
 * TCK-016 — Redes sociais do programa (Server Component).
 *
 * `socialLinks` é `Json?` no Prisma e obrigatório (com default `{}`) na
 * resposta pública, e cada chave é `.nullish()`. Ou seja: o objeto sempre
 * existe, mas pode estar inteiramente vazio. O componente distingue os dois
 * casos — lista de links ou estado vazio explícito — em vez de renderizar um
 * bloco fantasma.
 *
 * Todo link é externo: `rel="noopener noreferrer"` e aviso textual de nova aba
 * (WCAG 2.2 §3.2.5). O ícone é decorativo; quem nomeia o link é o rótulo da
 * rede + o nome do programa, para que a lista de links do leitor de tela não
 * fique com seis "Instagram" idênticos quando o TCK-013 reusar isto numa
 * página com vários programas.
 *
 * Lucide não distribui ícones de marca do TikTok; `Music2` é o substituto
 * neutro e a identificação vem do texto.
 */
import { Github, Globe, Instagram, Linkedin, Music2, Twitter } from 'lucide-react';
import type { ComponentType, SVGProps } from 'react';

import { cn, controlTransition, focusRing } from '@/components/ui';
import type { SocialLinks } from '@/types/api';

type SocialKey = keyof SocialLinks;
type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

interface SocialDescriptor {
  readonly key: SocialKey;
  readonly label: string;
  readonly Icon: IconComponent;
}

/** Ordem de exibição — estável, independente da ordem das chaves no JSON. */
export const SOCIAL_ORDER: readonly SocialDescriptor[] = [
  { key: 'instagram', label: 'Instagram', Icon: Instagram },
  { key: 'twitter', label: 'X / Twitter', Icon: Twitter },
  { key: 'tiktok', label: 'TikTok', Icon: Music2 },
  { key: 'linkedin', label: 'LinkedIn', Icon: Linkedin },
  { key: 'github', label: 'GitHub', Icon: Github },
  { key: 'website', label: 'Site oficial', Icon: Globe },
];

export interface SocialLinkEntry {
  readonly key: SocialKey;
  readonly label: string;
  readonly href: string;
  readonly Icon: IconComponent;
}

/** Filtra as redes preenchidas, preservando `SOCIAL_ORDER`. */
export function resolveSocialLinks(links: SocialLinks | null | undefined): SocialLinkEntry[] {
  if (!links) return [];

  return SOCIAL_ORDER.flatMap((descriptor) => {
    const href = links[descriptor.key];
    if (typeof href !== 'string' || href.trim().length === 0) return [];
    return [{ ...descriptor, href }];
  });
}

export interface ProgramaSocialLinksProps {
  links: SocialLinks | null | undefined;
  /** Nome do programa — entra no nome acessível de cada link. */
  podcastTitle: string;
  emptyMessage?: string;
  className?: string;
}

export function ProgramaSocialLinks({
  links,
  podcastTitle,
  emptyMessage = 'Este programa ainda não divulgou perfis em redes sociais.',
  className,
}: ProgramaSocialLinksProps) {
  const entries = resolveSocialLinks(links);

  if (entries.length === 0) {
    return <p className="text-sm text-content-secondary">{emptyMessage}</p>;
  }

  return (
    <ul className={cn('flex flex-col gap-2', className)}>
      {entries.map(({ key, label, href, Icon }) => (
        <li key={key}>
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              'inline-flex items-center gap-3 rounded-md px-2 py-2 text-sm font-medium',
              'text-content-link hover:bg-surface-sunken',
              controlTransition,
              focusRing,
            )}
          >
            <Icon aria-hidden="true" focusable="false" className="h-4 w-4 shrink-0" />
            <span>{label}</span>
            <span className="sr-only">{` — ${podcastTitle} no ${label} (abre em nova aba)`}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}

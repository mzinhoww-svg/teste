/**
 * TCK-009 — Footer do site público.
 *
 * SERVER COMPONENT — e isso é uma decisão, não um acaso. O rodapé é uma lista
 * de links e um aviso de copyright: não tem estado, não tem evento, não tem
 * efeito. Marcá-lo `'use client'` mandaria ~2KB de JS por página para renderizar
 * texto estático, e o rodapé aparece em TODAS elas (NFR-001).
 *
 * Consequência prática para quem consome: não passe `onClick` para ele.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ACESSIBILIDADE
 * ─────────────────────────────────────────────────────────────────────────────
 *  - `<footer>` sem pai `<article>`/`<section>` já é o landmark `contentinfo`;
 *    não precisa (nem deve) de `role="contentinfo"` redundante.
 *  - Cada coluna é um `<nav>` PRÓPRIO, rotulado pelo título da coluna via
 *    `aria-labelledby`. Um único `<nav>` gigante obrigaria o usuário de leitor
 *    de tela a percorrer os ~10 links em sequência para descobrir a estrutura.
 *  - REDES SOCIAIS: o link é um ícone e ícone NÃO É NOME ACESSÍVEL. Cada um
 *    carrega `aria-label` completo ("Reiners Media no YouTube") e o `<svg>` vai
 *    com `aria-hidden="true"` — senão o leitor anunciaria o nome do ícone
 *    depois do rótulo, duplicando (WCAG 2.2 §4.1.2 e §2.4.4).
 *  - Link externo com `target="_blank"` leva `rel="noopener noreferrer"`
 *    (`externalLinkProps`), que fecha o acesso a `window.opener`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * O ANO DO COPYRIGHT
 * ─────────────────────────────────────────────────────────────────────────────
 * `new Date().getFullYear()` avaliado no SERVIDOR. Numa página estática (ISR,
 * TCK-024) o valor congela no build — por isso `year` é uma prop: a página pode
 * injetar o ano da revalidação, e o teste pode fixá-lo em vez de virar
 * flaky todo 31 de dezembro.
 */
import Link from 'next/link';

import { cn } from '@/components/ui';

import {
  FOOTER_NAV_GROUPS,
  SOCIAL_LINKS,
  externalLinkProps,
  type NavGroup,
  type SocialLink,
} from './nav-config';

export interface FooterProps {
  /** Colunas de navegação secundária. Default: `FOOTER_NAV_GROUPS`. */
  groups?: readonly NavGroup[];
  /** Redes sociais. Default: `SOCIAL_LINKS`. */
  social?: readonly SocialLink[];
  /** Nome exibido no aviso de copyright. */
  companyName?: string;
  /** Ano do copyright. Default: o ano corrente no servidor. */
  year?: number;
  /** Linha de apoio abaixo da marca. */
  tagline?: string;
  /** Rótulo acessível do bloco de redes sociais. */
  socialAriaLabel?: string;
  /** Linha jurídica opcional (CNPJ, endereço). Omitida quando ausente. */
  legalNote?: string;
  className?: string;
}

export function Footer({
  groups = FOOTER_NAV_GROUPS,
  social = SOCIAL_LINKS,
  companyName = 'Reiners Media',
  year = new Date().getFullYear(),
  tagline = 'Estúdio de podcast full-service: gravação, edição, distribuição e estratégia de conteúdo.',
  socialAriaLabel = 'Redes sociais',
  legalNote,
  className,
}: FooterProps) {
  return (
    <footer
      data-testid="footer"
      className={cn(
        // O limite superior é a única separação entre rodapé e conteúdo:
        // `border-line-default` (>= 3:1), nunca `border-line-subtle` (~1.1:1).
        'w-full border-t border-line-default bg-surface-sunken',
        className,
      )}
    >
      <div className="mx-auto flex w-full max-w-screen-xl flex-col gap-12 px-4 py-12 md:px-6">
        <div className="flex flex-col gap-12 md:flex-row md:justify-between">
          <div className="flex max-w-sm flex-col gap-4">
            <span className="font-display text-lg font-semibold tracking-tight text-content-primary">
              {companyName}
            </span>
            <p className="text-sm text-content-secondary">{tagline}</p>

            {social.length > 0 ? (
              <ul aria-label={socialAriaLabel} className="flex items-center gap-2">
                {social.map((item) => (
                  <li key={item.href}>
                    <SocialIconLink item={item} />
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
            {groups.map((group) => (
              <FooterColumn key={group.title} group={group} />
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2 border-t border-line-default pt-8 text-sm text-content-muted sm:flex-row sm:items-center sm:justify-between">
          <p>
            {/* ` ` mantém "©" colado ao ano na quebra de linha. */}
            {`© ${year} ${companyName}. Todos os direitos reservados.`}
          </p>
          {legalNote ? <p>{legalNote}</p> : null}
        </div>
      </div>
    </footer>
  );
}

/** Uma coluna do rodapé: título + `<nav>` rotulado por ele. */
function FooterColumn({ group }: { group: NavGroup }) {
  // Id derivado do título: estável entre servidor e cliente (sem `useId`, que
  // exigiria Client Component) e legível no DOM inspecionado.
  const headingId = `footer-group-${slugify(group.title)}`;

  return (
    <nav aria-labelledby={headingId} className="flex flex-col gap-3">
      <h2
        id={headingId}
        className="text-2xs font-semibold uppercase tracking-wider text-content-muted"
      >
        {group.title}
      </h2>
      <ul className="flex flex-col gap-2">
        {group.items.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              className={cn(
                'inline-flex rounded-xs text-sm text-content-secondary',
                'transition-colors duration-fast ease-standard hover:text-content-primary',
                'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-line-focus',
              )}
              {...externalLinkProps(item.external)}
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/**
 * Link de rede social.
 *
 * O nome acessível vem SÓ do `aria-label`; o ícone é decorativo. Alvo de
 * 40x40 (`h-10 w-10`), acima do mínimo de 24x24 da WCAG 2.2 §2.5.8.
 */
function SocialIconLink({ item }: { item: SocialLink }) {
  const Icon = item.icon;

  return (
    <a
      href={item.href}
      aria-label={item.label}
      className={cn(
        'inline-flex h-10 w-10 items-center justify-center rounded-md',
        'border border-line-default text-content-secondary',
        'transition-colors duration-fast ease-standard',
        'hover:bg-surface-raised hover:text-content-primary',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-line-focus',
      )}
      {...externalLinkProps(true)}
    >
      <Icon aria-hidden="true" focusable="false" className="h-5 w-5" />
    </a>
  );
}

/**
 * `'Institucional'` → `'institucional'`; `'Programas & Séries'` →
 * `'programas-series'`. `NFD` + remoção do bloco de acentos combinantes
 * (U+0300–U+036F) mantém o id ASCII sem depender de locale.
 */
function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

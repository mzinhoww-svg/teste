/**
 * TCK-009 — Skip link (WCAG 2.2 §2.4.1 Bypass Blocks).
 *
 * Sem ele, um usuário de teclado precisa tabular pelos ~8 links da Navbar em
 * TODA página antes de chegar ao conteúdo. Com ele, o primeiro Tab da página
 * oferece "Pular para o conteúdo".
 *
 * Três detalhes que decidem se o recurso funciona de verdade:
 *
 *  1. Ele precisa ser o PRIMEIRO elemento focável do documento. Por isso é o
 *     primeiro filho do `<header>` da Navbar — e por isso não pode ficar dentro
 *     de nenhum contêiner com `overflow: hidden`, que o cortaria ao aparecer.
 *
 *  2. Ele NÃO pode usar `display: none` nem `visibility: hidden` para se
 *     esconder: os dois removem o elemento da ordem de foco, e um skip link que
 *     não recebe foco não existe. A classe `.sr-only-focusable` de
 *     `globals.css` usa a técnica de clip — invisível, porém focável — e desliga
 *     o clip em `:focus`.
 *
 *  3. O destino precisa ser programaticamente focável (`tabIndex={-1}`), senão
 *     WebKit rola a página mas deixa o foco no `<body>`, e o Tab seguinte volta
 *     ao topo. Ver `MAIN_CONTENT_ID` em `./nav-config`.
 *
 * Server Component: é um `<a>` estático, sem estado. Zero JS no cliente.
 */
import { cn } from '@/components/ui';

import { MAIN_CONTENT_ID } from './nav-config';

export interface SkipLinkProps {
  /** Id do alvo, sem `#`. Default: `MAIN_CONTENT_ID`. */
  targetId?: string;
  /** Rótulo visível quando o link recebe foco. */
  children?: React.ReactNode;
  className?: string;
}

export function SkipLink({
  targetId = MAIN_CONTENT_ID,
  children = 'Pular para o conteúdo',
  className,
}: SkipLinkProps) {
  return (
    <a
      href={`#${targetId}`}
      data-testid="skip-link"
      className={cn(
        'sr-only-focusable',
        // Enquanto focado ele precisa ficar ACIMA da Navbar e legível: superfície
        // opaca + `border-line-default` (>= 3:1). `shadow-raised` reforça o limite
        // no dark, onde sombra preta sobre preto não separa nada.
        'absolute start-4 top-4 z-max inline-flex items-center rounded-md',
        'border border-line-default bg-surface-raised px-4 py-2',
        'text-sm font-medium text-content-primary shadow-raised',
        className,
      )}
    >
      {children}
    </a>
  );
}

'use client';

/**
 * TCK-009 — Navbar do site público.
 *
 * Entrega, em ordem de importância para acessibilidade:
 *
 *  1. SKIP LINK como primeiro focável do documento (WCAG 2.2 §2.4.1). Ver
 *     `./skip-link.tsx` para os três detalhes que fazem ele funcionar.
 *  2. `<nav aria-label>` — o site tem mais de uma navegação (principal, rodapé,
 *     painel). Sem rótulo, o leitor de tela anuncia três "navegação" iguais e o
 *     usuário não sabe qual é qual (WCAG 2.2 §1.3.1, técnica ARIA11).
 *  3. `aria-current="page"` no item da rota atual — regras de match em
 *     `./nav-config.ts`.
 *  4. Menu mobile como diálogo modal com foco preso e `Esc` (`./mobile-drawer`).
 *  5. Nenhum `<Button>` dentro de `<a>`: links com cara de botão usam
 *     `buttonVariants` no próprio `<Link>`, como manda o docblock do TCK-008.
 *     Aninhar geraria um botão dentro de um link — árvore inválida, e o leitor
 *     de tela anuncia o alvo duas vezes com papéis conflitantes.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * COMPORTAMENTO NO SCROLL
 * ─────────────────────────────────────────────────────────────────────────────
 * A barra é `sticky` e GANHA ELEVAÇÃO ao sair do topo — ela não se esconde ao
 * rolar. Auto-hide é tentador e caro: uma barra que some enquanto o usuário
 * tabula pode cobrir/soltar o elemento focado, o que é exatamente o que a WCAG
 * 2.2 §2.4.11 (Focus Not Obscured) passou a proibir. Elevação é o feedback
 * suficiente e não move nada de lugar.
 *
 * A transição é de COR/sombra (`controlTransition`, tokens de motion), não de
 * layout, e `globals.css` já a zera sob `prefers-reduced-motion`.
 *
 * `transparentAtTop` existe para a hero da landing (TCK-011), mas vem
 * DESLIGADO: barra translúcida sobre imagem arbitrária é a receita clássica de
 * reprovar contraste de texto. Quem ligar assume garantir >= 4.5:1 atrás dela.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ROTA ATIVA
 * ─────────────────────────────────────────────────────────────────────────────
 * `pathname` é uma PROP opcional. Quando ausente, cai em `usePathname()`. Isso
 * mantém o componente testável sem montar o App Router e permite que uma página
 * force o estado ativo (ex.: pré-visualização no admin).
 */
import { motion } from 'framer-motion';
import { Menu } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';

import { buttonVariants, cn } from '@/components/ui';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { fadeVariants } from '@/lib/animations';
import { tokens } from '@/lib/tokens';

import {
  MAIN_CONTENT_ID,
  PRIMARY_NAV_ITEMS,
  ariaCurrentFor,
  externalLinkProps,
  type NavItem,
} from './nav-config';
import { MobileDrawer } from './mobile-drawer';
import { SkipLink } from './skip-link';

/* ========================================================================== */
/* Scroll                                                                     */
/* ========================================================================== */

/** `'2rem'` → `32`. Mantém o limiar preso à escala de espaçamento dos tokens. */
function remToPixels(value: string): number {
  const amount = Number.parseFloat(value);
  return value.trim().endsWith('rem') ? amount * 16 : amount;
}

/**
 * Distância rolada a partir da qual a barra "descola" do topo: token
 * `spacing.8` (2rem = 32px), metade da altura da barra (`h-16`). Deriva da
 * escala em vez de ser um número escolhido no olho — se a escala mudar, o
 * limiar acompanha.
 */
export const SCROLL_ELEVATION_THRESHOLD = remToPixels(tokens.spacing['8']);

/**
 * `true` quando a página está rolada além de `threshold`.
 *
 * O listener é `passive` (não bloqueia a rolagem) e o estado só é escrito
 * quando MUDA — um `setState` por quadro de scroll rerenderizaria a barra
 * inteira 60 vezes por segundo à toa.
 */
function useScrollElevation(threshold: number): boolean {
  const [elevated, setElevated] = useState(false);

  useEffect(() => {
    let frame = 0;

    function read() {
      frame = 0;
      setElevated((current) => {
        const next = window.scrollY > threshold;
        return next === current ? current : next;
      });
    }

    function onScroll() {
      // Coalesce: vários eventos de scroll no mesmo quadro viram uma leitura.
      if (frame === 0) frame = window.requestAnimationFrame(read);
    }

    read();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (frame !== 0) window.cancelAnimationFrame(frame);
    };
  }, [threshold]);

  return elevated;
}

/**
 * Fecha o drawer quando a viewport alcança o desktop.
 *
 * Sem isto, girar o tablet com o menu aberto deixaria um `role="dialog"` com o
 * foco preso montado enquanto a navegação desktop já está visível — o usuário
 * de teclado ficaria trancado num painel que ele nem vê.
 */
function useCloseOnDesktop(open: boolean, onClose: () => void, query: string): void {
  useEffect(() => {
    if (!open || typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return undefined;
    }

    const mql = window.matchMedia(query);
    if (mql.matches) {
      onClose();
      return undefined;
    }

    const handler = (event: MediaQueryListEvent) => {
      if (event.matches) onClose();
    };

    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [open, onClose, query]);
}

/** Breakpoint em que a navegação horizontal substitui o drawer (token `md`). */
export const DESKTOP_NAV_QUERY = `(min-width: ${tokens.breakpoint.md})`;

/* ========================================================================== */
/* Navbar                                                                     */
/* ========================================================================== */

export interface NavbarProps {
  /** Itens da navegação principal. Default: `PRIMARY_NAV_ITEMS`. */
  items?: readonly NavItem[];
  /** Rota atual. Ausente = `usePathname()`. */
  pathname?: string | null;
  /** Conteúdo da marca (logo). Default: o wordmark textual da Reiners. */
  brand?: ReactNode;
  /** Destino do clique na marca. */
  brandHref?: string;
  /** Rótulo acessível da navegação principal (horizontal). */
  ariaLabel?: string;
  /**
   * Rótulo acessível da navegação dentro do drawer.
   *
   * É DIFERENTE do horizontal de propósito: as duas listas coexistem no DOM
   * enquanto o menu está aberto (a horizontal só some por CSS, que não vale
   * para leitores de tela quando o breakpoint muda). Dois landmarks
   * `navigation` com o mesmo nome são indistinguíveis no rotor do leitor.
   */
  drawerAriaLabel?: string;
  /** Rótulo do botão que abre o menu mobile. */
  menuLabel?: string;
  /** Esconde o skip link (use apenas se o layout já renderiza um). */
  showSkipLink?: boolean;
  /** Id do alvo do skip link. */
  skipTargetId?: string;
  /** Barra transparente enquanto no topo. Ver docblock antes de ligar. */
  transparentAtTop?: boolean;
  className?: string;
}

export function Navbar({
  items = PRIMARY_NAV_ITEMS,
  pathname,
  brand,
  brandHref = '/',
  ariaLabel = 'Navegação principal',
  drawerAriaLabel = 'Navegação do menu',
  menuLabel = 'Abrir menu de navegação',
  showSkipLink = true,
  skipTargetId = MAIN_CONTENT_ID,
  transparentAtTop = false,
  className,
}: NavbarProps) {
  const routerPathname = usePathname();
  const currentPath = pathname ?? routerPathname;

  const [menuOpen, setMenuOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const reactId = useId();
  const drawerId = `${reactId}-nav-drawer`;

  const elevated = useScrollElevation(SCROLL_ELEVATION_THRESHOLD);
  const reduced = useReducedMotion();

  const closeMenu = useCallback(() => setMenuOpen(false), []);
  useCloseOnDesktop(menuOpen, closeMenu, DESKTOP_NAV_QUERY);

  // Navegar fecha o menu: o App Router troca a rota sem desmontar a Navbar, e
  // uma gaveta que sobrevive à navegação parece um bug travado.
  useEffect(() => {
    setMenuOpen(false);
  }, [currentPath]);

  const opaque = elevated || !transparentAtTop;

  return (
    <header
      data-testid="navbar"
      data-elevated={elevated ? '' : undefined}
      className={cn(
        'sticky top-0 z-sticky w-full',
        'transition-colors duration-normal ease-standard',
        opaque
          ? 'border-b border-line-default bg-surface-base/95 backdrop-blur'
          : 'border-b border-transparent bg-transparent',
        elevated && 'shadow-raised',
        className,
      )}
    >
      {showSkipLink ? <SkipLink targetId={skipTargetId} /> : null}

      <div className="mx-auto flex h-16 w-full max-w-screen-xl items-center justify-between gap-4 px-4 md:px-6">
        {/*
          A marca NÃO recebe `aria-current`: na home ela e o item "Início"
          apontariam para a mesma página, e dois `aria-current="page"` na mesma
          view é ambiguidade pura para o leitor de tela.
        */}
        <Link
          href={brandHref}
          className={cn(
            'inline-flex items-center gap-2 rounded-md',
            'font-display text-lg font-semibold tracking-tight text-content-primary',
            'transition-colors duration-fast ease-standard hover:text-content-accent',
            'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-line-focus',
          )}
        >
          {brand ?? (
            <>
              <span>Reiners</span>
              <span className="text-content-brand">Media</span>
            </>
          )}
        </Link>

        {/* Navegação horizontal — some no mobile, onde o drawer assume. */}
        <nav aria-label={ariaLabel} className="hidden md:block">
          <ul className="flex items-center gap-1">
            {items.map((item) => (
              <li key={item.href}>
                <NavLink item={item} pathname={currentPath} />
              </li>
            ))}
          </ul>
        </nav>

        <button
          ref={triggerRef}
          type="button"
          onClick={() => setMenuOpen((value) => !value)}
          aria-label={menuLabel}
          aria-expanded={menuOpen}
          aria-controls={drawerId}
          aria-haspopup="dialog"
          className={cn(
            buttonVariants({ variant: 'secondary', size: 'icon' }),
            'md:hidden',
          )}
        >
          <Menu aria-hidden="true" className="h-5 w-5" />
        </button>
      </div>

      <MobileDrawer
        open={menuOpen}
        onClose={closeMenu}
        id={drawerId}
        title="Navegação"
        returnFocusRef={triggerRef}
      >
        <motion.nav
          aria-label={drawerAriaLabel}
          variants={fadeVariants({ reduced })}
          initial="hidden"
          animate="visible"
        >
          <ul className="flex flex-col gap-1">
            {items.map((item) => (
              <li key={item.href}>
                <NavLink item={item} pathname={currentPath} block onNavigate={closeMenu} />
              </li>
            ))}
          </ul>
        </motion.nav>
      </MobileDrawer>
    </header>
  );
}

/* ========================================================================== */
/* NavLink                                                                    */
/* ========================================================================== */

interface NavLinkProps {
  item: NavItem;
  pathname: string | null | undefined;
  /** Ocupa a largura toda (uso no drawer). */
  block?: boolean;
  onNavigate?: () => void;
}

/**
 * Um item da navegação.
 *
 * O estado ativo é sinalizado por COR + BORDA, nunca só por cor: a WCAG 2.2
 * §1.4.1 (Use of Color) proíbe cor como único portador de informação. E, acima
 * do visual, quem carrega o significado para tecnologia assistiva é o
 * `aria-current="page"` — não a classe.
 */
function NavLink({ item, pathname, block = false, onNavigate }: NavLinkProps) {
  const current = ariaCurrentFor(pathname, item);
  const isCta = item.emphasis === 'cta';

  const className = isCta
    ? cn(buttonVariants({ variant: 'primary', size: 'sm' }), block && 'w-full')
    : cn(
        'inline-flex items-center rounded-md px-3 py-2 text-sm font-medium',
        'transition-colors duration-fast ease-standard',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-line-focus',
        current
          ? 'border-b border-line-accent text-content-primary'
          : 'border-b border-transparent text-content-secondary hover:bg-surface-sunken hover:text-content-primary',
        block && 'w-full',
      );

  return (
    <Link
      href={item.href}
      aria-current={current}
      onClick={onNavigate}
      className={className}
      {...externalLinkProps(item.external)}
    >
      {item.label}
    </Link>
  );
}

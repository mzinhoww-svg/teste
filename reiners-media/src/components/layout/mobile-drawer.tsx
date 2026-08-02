'use client';

/**
 * TCK-009 — Drawer de navegação mobile.
 *
 * É um DIÁLOGO MODAL, não um menu decorativo: ele cobre a página, recebe o
 * foco e prende a tabulação. O padrão seguido é o WAI-ARIA APG "Dialog
 * (Modal)", igual ao `Modal` do TCK-008, com quatro obrigações:
 *
 *   1. `role="dialog"` + `aria-modal="true"` + nome acessível (`aria-labelledby`
 *      quando há título visível, `aria-label` quando não há);
 *   2. foco movido para dentro na abertura;
 *   3. Tab e Shift+Tab CIRCULAM dentro do painel — sem isso o usuário de
 *      teclado "sai" do menu para links que estão visualmente cobertos;
 *   4. `Esc` fecha E o foco VOLTA para o gatilho. O retorno de foco é o passo
 *      mais esquecido: sem ele o usuário é jogado no início do documento e
 *      perde o lugar na página.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUE NÃO REUSAR O `Modal` DO TCK-008
 * ─────────────────────────────────────────────────────────────────────────────
 * O `Modal` centraliza o painel, exige `title` como cabeçalho `<h2>` e desenha
 * um botão "×" no canto — geometria de caixa de diálogo, não de gaveta lateral
 * de altura total. Reusá-lo exigiria neutralizar todas as três coisas por
 * `className`, e o resultado seria mais frágil que as ~60 linhas de trap que
 * este arquivo tem. A API de a11y é a mesma, de propósito.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUE O RETORNO DE FOCO É POR `returnFocusRef`, E NÃO SÓ POR activeElement
 * ─────────────────────────────────────────────────────────────────────────────
 * Capturar `document.activeElement` na abertura funciona no caminho feliz, mas
 * em iOS o toque num `<button>` nem sempre o foca — a captura devolveria o
 * `<body>`. Com a ref explícita do gatilho o retorno é determinístico; o
 * `activeElement` continua como fallback quando a ref não é passada.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * MOVIMENTO
 * ─────────────────────────────────────────────────────────────────────────────
 * Entrada por `slideVariants`/`overlayVariants` do TCK-010, degradadas por
 * `useReducedMotion()` — nenhum número de duração ou curva escrito aqui.
 *
 * O drawer NÃO usa `AnimatePresence`: a animação de saída mantém o nó montado
 * por mais ~200ms depois do fechamento, e nesse intervalo o `role="dialog"`
 * continua na árvore de acessibilidade de uma gaveta que o usuário já fechou.
 * Fechar é instantâneo; abrir é animado.
 */
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';

import { Button, cn } from '@/components/ui';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { overlayVariants, slideVariants } from '@/lib/animations';

/**
 * Ordem natural de tabulação do painel. `[tabindex="-1"]` fica de fora: é
 * focável por script, não por teclado.
 */
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'area[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[contenteditable]:not([contenteditable="false"])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export interface MobileDrawerProps {
  /** Visibilidade. O drawer é sempre controlado pelo pai. */
  open: boolean;
  /** Chamado por `Esc`, pelo botão de fechar e pelo clique no scrim. */
  onClose: () => void;
  /** Título visível do painel. Vira o nome acessível via `aria-labelledby`. */
  title?: ReactNode;
  /** Nome acessível quando não há título visível. Um dos dois é obrigatório. */
  ariaLabel?: string;
  /** Gatilho que reabre o drawer — recebe o foco de volta ao fechar. */
  returnFocusRef?: RefObject<HTMLElement>;
  /** Lado de entrada. Propriedade lógica (`start`/`end`) para sobreviver a RTL. */
  side?: 'start' | 'end';
  /** Id do painel — o gatilho aponta para ele com `aria-controls`. */
  id?: string;
  /** Rótulo do botão de fechar. */
  closeLabel?: string;
  children?: ReactNode;
  className?: string;
}

export function MobileDrawer({
  open,
  onClose,
  title,
  ariaLabel,
  returnFocusRef,
  side = 'end',
  id,
  closeLabel = 'Fechar menu',
  children,
  className,
}: MobileDrawerProps) {
  const [mounted, setMounted] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const reduced = useReducedMotion();

  const reactId = useId();
  const panelId = id ?? `${reactId}-drawer`;
  const titleId = `${reactId}-drawer-title`;

  // O portal só existe no cliente; sem esta guarda o SSR quebra em `document`.
  useEffect(() => {
    setMounted(true);
  }, []);

  const getFocusable = useCallback((): HTMLElement[] => {
    const panel = panelRef.current;
    if (!panel) return [];
    return Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
  }, []);

  // Entrada e devolução do foco.
  useEffect(() => {
    if (!open || !mounted) return undefined;

    previouslyFocusedRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    // O destino do RETORNO é resolvido AGORA, na abertura, e guardado numa
    // variável local. Ler `returnFocusRef.current` dentro do cleanup faria a
    // devolução depender do que a ref apontar no futuro — que é o alerta do
    // `react-hooks/exhaustive-deps`, e um bug de verdade se o gatilho for
    // remontado (troca de breakpoint) enquanto a gaveta está aberta.
    const returnTarget = returnFocusRef?.current ?? previouslyFocusedRef.current;

    // O primeiro focável do painel é o botão de fechar: a saída fica a um Tab
    // zero de distância de quem acabou de abrir o menu sem querer.
    const target = getFocusable()[0] ?? panelRef.current;
    target?.focus();

    return () => {
      returnTarget?.focus();
    };
  }, [open, mounted, getFocusable, returnFocusRef]);

  // `Esc` + foco preso.
  useEffect(() => {
    if (!open || !mounted) return undefined;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== 'Tab') return;

      const panel = panelRef.current;
      if (!panel) return;

      const focusable = getFocusable();

      if (focusable.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;

      const active = document.activeElement;

      // O foco pode escapar do painel (extensão, clique em iframe). Capturando
      // no documento conseguimos trazê-lo de volta em vez de depender do evento
      // borbulhar de dentro do painel.
      if (!(active instanceof HTMLElement) || !panel.contains(active)) {
        event.preventDefault();
        first.focus();
        return;
      }

      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [open, mounted, onClose, getFocusable]);

  // Trava do scroll de fundo: sem isso a página rola atrás da gaveta.
  useEffect(() => {
    if (!open || !mounted) return undefined;

    const { body } = document;
    const previousOverflow = body.style.overflow;
    body.style.overflow = 'hidden';

    return () => {
      body.style.overflow = previousOverflow;
    };
  }, [open, mounted]);

  if (!mounted || !open) return null;

  // `side` é lógico: em LTR `end` entra pela direita, em RTL pela esquerda.
  const slideFrom = side === 'end' ? 'left' : 'right';

  return createPortal(
    // Sem `md:hidden` aqui de propósito: esconder por breakpoint deixaria um
    // `role="dialog"` com o foco preso montado e INVISÍVEL se o usuário girasse
    // o tablet com o menu aberto. Quem decide quando o drawer pode existir é a
    // Navbar (ver `useCloseOnDesktop`).
    <div className="fixed inset-0 z-modal flex">
      <motion.div
        aria-hidden="true"
        data-testid="drawer-overlay"
        onClick={onClose}
        variants={overlayVariants({ reduced })}
        initial="hidden"
        animate="visible"
        className="absolute inset-0 bg-surface-overlay/80"
      />

      <motion.div
        ref={panelRef}
        id={panelId}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-label={title ? undefined : (ariaLabel ?? 'Menu de navegação')}
        tabIndex={-1}
        variants={slideVariants(slideFrom, { reduced })}
        initial="hidden"
        animate="visible"
        className={cn(
          'relative z-raised flex h-full w-full max-w-sm flex-col',
          // Limite acessível: a gaveta encosta no scrim, então precisa de borda
          // real (>= 3:1) — `border-line-subtle` reprovaria em WCAG 1.4.11.
          'bg-surface-raised shadow-poster',
          side === 'end' ? 'ms-auto border-s border-line-default' : 'me-auto border-e border-line-default',
          className,
        )}
      >
        <div className="flex items-center justify-between gap-4 border-b border-line-default px-4 py-4">
          {title ? (
            <h2 id={titleId} className="text-base font-semibold text-content-primary">
              {title}
            </h2>
          ) : (
            <span aria-hidden="true" />
          )}
          <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label={closeLabel}>
            <X aria-hidden="true" className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4">{children}</div>
      </motion.div>
    </div>,
    document.body,
  );
}

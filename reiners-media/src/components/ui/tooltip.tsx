'use client';

/**
 * TCK-008 — Tooltip.
 *
 * Regras que este componente respeita (WCAG 2.2 §1.4.13 Content on Hover or
 * Focus, e o padrão APG "Tooltip"):
 *
 * - abre no HOVER **e** no FOCO — tooltip só de mouse é invisível para teclado;
 * - `Esc` fecha sem mover o foco (requisito "Dismissible");
 * - o conteúdo é ligado ao gatilho por `aria-describedby`, e só enquanto está
 *   aberto. Tooltip é DESCRIÇÃO, não nome: um botão de ícone precisa do próprio
 *   `aria-label` — se o nome acessível morar só no tooltip, comando de voz e
 *   leitor de tela ficam sem nada para chamar o botão.
 *
 * O conteúdo é montado/desmontado em vez de ficar escondido com `hidden`,
 * porque `aria-describedby` apontando para nó oculto tem suporte irregular
 * entre leitores de tela.
 *
 * Posicionamento é CSS puro (sem medir viewport). Para menus/popovers com
 * colisão de borda, use um popover dedicado — este componente é para rótulos
 * curtos de ícone.
 */
import {
  cloneElement,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
} from 'react';

import { cn } from './cn';

export type TooltipSide = 'top' | 'bottom' | 'start' | 'end';

/** Propriedades lógicas (`start`/`end`) para sobreviver a RTL — NFR-010. */
const sideClasses: Record<TooltipSide, string> = {
  top: 'bottom-full start-1/2 mb-2 -translate-x-1/2',
  bottom: 'top-full start-1/2 mt-2 -translate-x-1/2',
  start: 'end-full top-1/2 me-2 -translate-y-1/2',
  end: 'start-full top-1/2 ms-2 -translate-y-1/2',
};

interface TriggerProps {
  'aria-describedby'?: string;
}

export interface TooltipProps {
  /** Conteúdo do tooltip. Curto: é descrição, não documentação. */
  content: ReactNode;
  /** Gatilho — um único elemento focável (`Button`, `a`, ...). */
  children: ReactElement<TriggerProps>;
  side?: TooltipSide;
  /** Atraso de abertura no hover, em ms. */
  openDelay?: number;
  /** Classe do balão. */
  className?: string;
  /** Classe do wrapper que ancora o balão. */
  wrapperClassName?: string;
}

export function Tooltip({
  content,
  children,
  side = 'top',
  openDelay = 0,
  className,
  wrapperClassName,
}: TooltipProps) {
  const [open, setOpen] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tooltipId = useId();

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const show = useCallback(() => {
    clearTimer();
    if (openDelay <= 0) {
      setOpen(true);
      return;
    }
    timerRef.current = setTimeout(() => setOpen(true), openDelay);
  }, [clearTimer, openDelay]);

  const hide = useCallback(() => {
    clearTimer();
    setOpen(false);
  }, [clearTimer]);

  useEffect(() => clearTimer, [clearTimer]);

  function handleKeyDown(event: KeyboardEvent<HTMLSpanElement>) {
    if (event.key === 'Escape' && open) {
      // Sem `preventDefault`: dentro de um Modal, `Esc` deve continuar
      // disponível para fechar o dialog na segunda pressionada.
      hide();
    }
  }

  const trigger = cloneElement(children, {
    'aria-describedby': open ? tooltipId : children.props['aria-describedby'],
  });

  return (
    <span
      className={cn('relative inline-flex', wrapperClassName)}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocusCapture={show}
      onBlurCapture={hide}
      onKeyDown={handleKeyDown}
    >
      {trigger}
      {open ? (
        <span
          role="tooltip"
          id={tooltipId}
          className={cn(
            'absolute z-tooltip w-max max-w-xs rounded-md px-2 py-1',
            'bg-surface-inverse text-xs text-content-inverse shadow-raised',
            sideClasses[side],
            className,
          )}
        >
          {content}
        </span>
      ) : null}
    </span>
  );
}

'use client';

/**
 * TCK-008 — Modal (dialog). Exportado também como `Dialog`.
 *
 * Implementado à mão, sem Radix: a dependência não está no `package.json` e
 * `package.json` não pertence a este ticket. O que um dialog acessível precisa
 * entregar (WAI-ARIA APG "Dialog (Modal)") está tudo aqui:
 *
 *   - `role="dialog"` (ou `alertdialog`) + `aria-modal="true"`;
 *   - `aria-labelledby` sempre — por isso `title` é OBRIGATÓRIO na API. Um
 *     dialog sem nome acessível é anunciado como "diálogo" e nada mais;
 *   - `aria-describedby` quando há `description`;
 *   - foco movido para dentro na abertura (`initialFocusRef`, senão o primeiro
 *     focável, senão o próprio painel via `tabIndex={-1}`);
 *   - foco PRESO: Tab e Shift+Tab circulam dentro do painel;
 *   - `Esc` fecha;
 *   - foco DEVOLVIDO ao elemento que abriu o dialog — o passo mais esquecido, e
 *     o que decide se o usuário de teclado volta para onde estava ou é jogado
 *     no topo do documento;
 *   - scroll do `<body>` travado enquanto aberto.
 *
 * O listener de teclado é `document` + fase de captura porque o foco pode
 * escapar do painel (extensão, clique em iframe): capturando no documento o
 * trap consegue trazer o foco de volta em vez de depender do evento borbulhar
 * de dentro do painel.
 *
 * Elevação: `shadow-poster` já embute o hairline `border.strong`, então o
 * painel tem limite acessível nos dois temas sem borda declarada — importante
 * porque no dark a sombra preta some sobre `surface.base` #000000.
 */
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

import { Button } from './button';
import { cn } from './cn';

/**
 * Ordem de tabulação natural do painel. `[tabindex="-1"]` fica de fora: é
 * focável por script, não por teclado.
 */
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'area[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'iframe',
  'audio[controls]',
  'video[controls]',
  '[contenteditable]:not([contenteditable="false"])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

const modalSizes = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
} as const;

export type ModalSize = keyof typeof modalSizes;

export interface ModalProps {
  /** Controla a visibilidade. O Modal é sempre controlado. */
  open: boolean;
  /** Chamado por `Esc`, botão de fechar e clique no overlay. */
  onClose: () => void;
  /** Nome acessível do dialog (`aria-labelledby`). Obrigatório. */
  title: ReactNode;
  /** Descrição associada por `aria-describedby`. */
  description?: ReactNode;
  /** Conteúdo do corpo. */
  children?: ReactNode;
  /** Ações do rodapé (normalmente `Button`s). */
  footer?: ReactNode;
  /** Largura máxima do painel. */
  size?: ModalSize;
  /** `alertdialog` para confirmações destrutivas. */
  role?: 'dialog' | 'alertdialog';
  /** Fecha ao clicar fora. Default `true`; use `false` em formulários longos. */
  closeOnOverlayClick?: boolean;
  /** Fecha com `Esc`. Default `true` — só desligue com um motivo muito bom. */
  closeOnEscape?: boolean;
  /** Mostra o botão "×". Default `true`. */
  showCloseButton?: boolean;
  /** Rótulo acessível do botão de fechar. */
  closeLabel?: string;
  /** Elemento que recebe o foco na abertura (ex.: o primeiro campo). */
  initialFocusRef?: RefObject<HTMLElement>;
  /** Classe do painel. */
  className?: string;
  /** Classe do contêiner/overlay. */
  overlayClassName?: string;
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  role = 'dialog',
  closeOnOverlayClick = true,
  closeOnEscape = true,
  showCloseButton = true,
  closeLabel = 'Fechar',
  initialFocusRef,
  className,
  overlayClassName,
}: ModalProps) {
  const [mounted, setMounted] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  const reactId = useId();
  const titleId = `${reactId}-title`;
  const descriptionId = `${reactId}-description`;

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

    const target = initialFocusRef?.current ?? getFocusable()[0] ?? panelRef.current;
    target?.focus();

    return () => {
      previouslyFocusedRef.current?.focus();
    };
  }, [open, mounted, initialFocusRef, getFocusable]);

  // Esc + foco preso.
  useEffect(() => {
    if (!open || !mounted) return undefined;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && closeOnEscape) {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== 'Tab') return;

      const panel = panelRef.current;
      if (!panel) return;

      const focusable = getFocusable();

      // Painel sem nada focável: o próprio painel segura o foco.
      if (focusable.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;

      const active = document.activeElement;

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
  }, [open, mounted, closeOnEscape, onClose, getFocusable]);

  // Trava do scroll de fundo: sem isso a página rola atrás do dialog.
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

  return createPortal(
    <div
      className={cn(
        'fixed inset-0 z-modal flex items-end justify-center p-4 sm:items-center',
        overlayClassName,
      )}
    >
      <div
        aria-hidden="true"
        onClick={closeOnOverlayClick ? onClose : undefined}
        data-testid="modal-overlay"
        className="absolute inset-0 bg-surface-overlay/80 motion-safe:animate-fade-in"
      />

      <div
        ref={panelRef}
        role={role}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={cn(
          'relative z-raised flex max-h-full w-full flex-col gap-4 overflow-y-auto',
          'rounded-xl bg-surface-raised p-6 shadow-poster',
          'motion-safe:animate-scale-in',
          modalSizes[size],
          className,
        )}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h2 id={titleId} className="text-xl font-semibold text-content-primary">
              {title}
            </h2>
            {description ? (
              <p id={descriptionId} className="text-sm text-content-secondary">
                {description}
              </p>
            ) : null}
          </div>

          {showCloseButton ? (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onClose}
              aria-label={closeLabel}
              className="-me-2 shrink-0"
            >
              <X aria-hidden="true" className="h-4 w-4" />
            </Button>
          ) : null}
        </div>

        {children ? <div className="text-content-secondary">{children}</div> : null}

        {footer ? (
          <div className="flex flex-wrap items-center justify-end gap-3">{footer}</div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}

/** Alias semântico — a mesma implementação, com o nome usado no WAI-ARIA APG. */
export const Dialog = Modal;
export type DialogProps = ModalProps;

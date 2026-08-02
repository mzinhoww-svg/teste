'use client';

/**
 * TCK-008 — Label.
 *
 * O marcador de obrigatório é DUPLO de propósito: `*` visual com
 * `aria-hidden` (asterisco lido em voz alta vira "asterisco", ruído puro) e um
 * texto only-reader com a palavra. Assim vidente e leitor de tela recebem a
 * mesma informação (WCAG 2.2 §1.3.1).
 */
import { forwardRef, type LabelHTMLAttributes } from 'react';

import { cn } from './cn';

export interface LabelProps extends LabelHTMLAttributes<HTMLLabelElement> {
  /** Mostra o marcador de campo obrigatório. */
  required?: boolean;
  /** Texto only-reader do marcador. */
  requiredLabel?: string;
  /** Esconde visualmente o rótulo, mantendo-o na árvore de acessibilidade. */
  visuallyHidden?: boolean;
}

export const Label = forwardRef<HTMLLabelElement, LabelProps>(function Label(
  { className, children, required = false, requiredLabel = 'obrigatório', visuallyHidden = false, ...rest },
  ref,
) {
  return (
    <label
      ref={ref}
      className={cn(
        'inline-flex items-center gap-1 text-sm font-medium text-content-primary',
        visuallyHidden && 'sr-only',
        className,
      )}
      {...rest}
    >
      {children}
      {required ? (
        <>
          <span aria-hidden="true" className="text-state-danger">
            *
          </span>
          <span className="sr-only">({requiredLabel})</span>
        </>
      ) : null}
    </label>
  );
});

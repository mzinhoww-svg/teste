/**
 * TCK-008 — Spinner (indicador de progresso indeterminado).
 *
 * Dois modos, escolhidos pela presença de `label`:
 *   - sem `label` → decorativo (`aria-hidden`). É o caso dentro de um `Button`
 *     com `loading`, onde quem anuncia o estado é o `aria-busy` do botão.
 *   - com `label` → `role="status"` + texto only-reader. Use quando o spinner
 *     é a única indicação de que algo está acontecendo.
 *
 * Motion: o anel usa `animate-spin` sob `motion-safe`, e `motion-reduce` o
 * congela explicitamente. `globals.css` também zera durações sob
 * `prefers-reduced-motion`, então o resultado é um anel estático — a
 * informação continua disponível via `role="status"`/`aria-busy`.
 */
import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef, type HTMLAttributes } from 'react';

import { cn } from './cn';

const spinnerRingVariants = cva(
  [
    'block rounded-full border-2 border-current border-t-transparent',
    'motion-safe:animate-spin motion-reduce:animate-none',
  ],
  {
    variants: {
      size: {
        xs: 'h-3 w-3',
        sm: 'h-4 w-4',
        md: 'h-5 w-5',
        lg: 'h-6 w-6',
      },
    },
    defaultVariants: { size: 'sm' },
  },
);

export interface SpinnerProps
  extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'>,
    VariantProps<typeof spinnerRingVariants> {
  /** Texto anunciado por leitores de tela. Sem ele o spinner é decorativo. */
  label?: string;
}

export const Spinner = forwardRef<HTMLSpanElement, SpinnerProps>(function Spinner(
  { className, size, label, ...rest },
  ref,
) {
  const accessibility = label
    ? ({ role: 'status' as const, 'aria-live': 'polite' as const })
    : ({ 'aria-hidden': true } as const);

  return (
    <span
      ref={ref}
      className={cn('inline-flex items-center justify-center text-current', className)}
      {...accessibility}
      {...rest}
    >
      <span className={spinnerRingVariants({ size })} />
      {label ? <span className="sr-only">{label}</span> : null}
    </span>
  );
});

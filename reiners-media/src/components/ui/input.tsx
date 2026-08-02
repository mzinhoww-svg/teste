'use client';

/**
 * TCK-008 — Input.
 *
 * A borda é o único limite visual de um input, então ela usa `line-default`
 * (>= 3:1 nos dois temas), nunca `line-subtle` — ver `controlSurface`.
 *
 * O estado de erro é dirigido por `aria-invalid`, o MESMO atributo que o leitor
 * de tela consome: não existe caminho em que o vermelho apareça e o AT não
 * saiba. Dentro de um `FormField` com `error`, isso é ligado sozinho.
 *
 * `text-base` (16px) no tamanho `md` não é estética: abaixo de 16px o Safari
 * iOS dá zoom automático ao focar o campo (NFR-003).
 */
import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef, type InputHTMLAttributes } from 'react';

import { cn } from './cn';
import { useControlA11y } from './form-field';
import {
  controlSurface,
  controlTransition,
  focusRing,
  invalidControl,
} from './styles';

export const inputVariants = cva(
  [
    'flex w-full rounded-md',
    controlSurface,
    controlTransition,
    focusRing,
    invalidControl,
    'disabled:cursor-not-allowed disabled:opacity-60',
    'read-only:bg-surface-sunken',
  ],
  {
    variants: {
      inputSize: {
        sm: 'h-8 px-3 text-sm',
        md: 'h-10 px-3 text-base',
        lg: 'h-12 px-4 text-base',
      },
    },
    defaultVariants: { inputSize: 'md' },
  },
);

export interface InputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'>,
    VariantProps<typeof inputVariants> {
  /** Força o estado de erro. Dentro de um `FormField` com `error` já vem ligado. */
  invalid?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    className,
    inputSize,
    invalid,
    id,
    required,
    'aria-describedby': ariaDescribedBy,
    'aria-invalid': ariaInvalid,
    ...rest
  },
  ref,
) {
  const a11y = useControlA11y({
    id,
    describedBy: ariaDescribedBy,
    invalid: invalid ?? parseAriaBoolean(ariaInvalid),
    required,
  });

  return (
    <input
      ref={ref}
      className={cn(inputVariants({ inputSize }), className)}
      {...rest}
      {...a11y}
    />
  );
});

/** `aria-invalid` aceita boolean, string e tokens ("grammar"/"spelling"). */
export function parseAriaBoolean(
  value: boolean | 'false' | 'true' | 'grammar' | 'spelling' | undefined,
): boolean | undefined {
  if (value === undefined) return undefined;
  return value !== false && value !== 'false';
}

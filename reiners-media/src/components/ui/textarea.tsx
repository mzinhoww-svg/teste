'use client';

/**
 * TCK-008 — Textarea. Mesmo contrato de acessibilidade do `Input`
 * (`aria-invalid`, auto-wiring pelo `FormField`), com altura mínima e
 * redimensionamento apenas vertical — `resize` livre quebra o layout do admin.
 */
import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef, type TextareaHTMLAttributes } from 'react';

import { cn } from './cn';
import { useControlA11y } from './form-field';
import { parseAriaBoolean } from './input';
import {
  controlSurface,
  controlTransition,
  focusRing,
  invalidControl,
} from './styles';

export const textareaVariants = cva(
  [
    'flex w-full rounded-md px-3 py-2 text-base',
    controlSurface,
    controlTransition,
    focusRing,
    invalidControl,
    'resize-y disabled:cursor-not-allowed disabled:opacity-60',
    'read-only:bg-surface-sunken',
  ],
  {
    variants: {
      textareaSize: {
        sm: 'min-h-16',
        md: 'min-h-20',
        lg: 'min-h-32',
      },
    },
    defaultVariants: { textareaSize: 'md' },
  },
);

export interface TextareaProps
  extends TextareaHTMLAttributes<HTMLTextAreaElement>,
    VariantProps<typeof textareaVariants> {
  /** Força o estado de erro. Dentro de um `FormField` com `error` já vem ligado. */
  invalid?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  {
    className,
    textareaSize,
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
    <textarea
      ref={ref}
      className={cn(textareaVariants({ textareaSize }), className)}
      {...rest}
      {...a11y}
    />
  );
});

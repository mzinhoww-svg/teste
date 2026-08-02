/**
 * TCK-008 — Badge.
 *
 * Todas as variantes são TONAIS e trazem borda com a cor de estado em opacidade
 * cheia. Motivo: no tema dark `surface.sunken` é o mesmo preto de
 * `surface.base`, e no light as superfícies tonais (`#E3F5EE`, `#FCE7E5`...)
 * ficam a ~1.1:1 do creme da página. Sem a borda, o badge não teria contorno
 * visível em nenhum dos dois temas — só uma mancha de cor que some.
 *
 * As bordas escolhidas são as próprias cores de estado, todas >= 4.5:1 contra a
 * superfície da página, então o contorno passa folgado em WCAG 2.2 §1.4.11.
 *
 * Badge é ESTÁTICO. Para algo clicável use `Button` (com `size="sm"`); um badge
 * com `onClick` não recebe foco nem tecla.
 */
import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef, type HTMLAttributes } from 'react';

import { cn } from './cn';

export const badgeVariants = cva(
  ['inline-flex items-center gap-1 whitespace-nowrap rounded-full border font-medium'],
  {
    variants: {
      variant: {
        neutral: 'border-line-default bg-surface-sunken text-content-secondary',
        accent: 'border-line-accent bg-surface-accent text-content-accent',
        brand: 'border-line-default bg-surface-sunken text-content-brand',
        success: 'border-state-success bg-state-success-surface text-state-success',
        warning: 'border-state-warning bg-state-warning-surface text-state-warning',
        danger: 'border-state-danger bg-state-danger-surface text-state-danger',
        info: 'border-state-info bg-state-info-surface text-state-info',
        outline: 'border-line-strong bg-transparent text-content-primary',
      },
      size: {
        sm: 'h-5 px-2 text-2xs',
        md: 'h-6 px-3 text-xs',
      },
    },
    defaultVariants: { variant: 'neutral', size: 'md' },
  },
);

export type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>['variant']>;

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(function Badge(
  { className, variant, size, ...rest },
  ref,
) {
  return (
    <span
      ref={ref}
      data-variant={variant ?? 'neutral'}
      className={cn(badgeVariants({ variant, size }), className)}
      {...rest}
    />
  );
});

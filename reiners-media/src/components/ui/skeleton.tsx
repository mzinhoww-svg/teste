/**
 * TCK-008 — Skeleton.
 *
 * A cor é `surface-inverse/10` e não uma superfície neutra. Motivo concreto:
 * no tema dark `surface.sunken` E `surface.base` são o mesmo preto (#000000,
 * valor PodFactory) e `surface.raised` fica a 1.07:1 dele — qualquer um dos
 * três deixaria o skeleton INVISÍVEL no dark. `surface.inverse` inverte a
 * polaridade dentro do tema (navy no light, creme no dark), então 10% dele
 * sobre a página rende o mesmo bloco levemente destacado nos dois esquemas.
 *
 * Acessibilidade: por padrão o skeleton é `aria-hidden` — é ruído puro para
 * quem usa leitor de tela, que não vê "o formato do que está carregando". Passe
 * `label` no skeleton que representa o bloco inteiro (um por região, não um por
 * linha) para virar `role="status"` e anunciar o carregamento.
 *
 * Motion: `motion-safe:animate-pulse` — sob `prefers-reduced-motion` fica um
 * bloco estático, o que continua comunicando "conteúdo ainda não chegou".
 */
import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef, type HTMLAttributes } from 'react';

import { cn } from './cn';

export const skeletonVariants = cva(['block bg-surface-inverse/10 motion-safe:animate-pulse'], {
  variants: {
    variant: {
      rect: 'rounded-md',
      text: 'h-4 w-full rounded-sm',
      circle: 'aspect-square rounded-full',
    },
  },
  defaultVariants: { variant: 'rect' },
});

export interface SkeletonProps
  extends HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof skeletonVariants> {
  /** Anúncio para leitor de tela. Sem ele o skeleton é decorativo. */
  label?: string;
}

export const Skeleton = forwardRef<HTMLDivElement, SkeletonProps>(function Skeleton(
  { className, variant, label, ...rest },
  ref,
) {
  const accessibility = label
    ? ({ role: 'status' as const, 'aria-live': 'polite' as const, 'aria-busy': true })
    : ({ 'aria-hidden': true } as const);

  return (
    <div
      ref={ref}
      className={cn(skeletonVariants({ variant }), className)}
      {...accessibility}
      {...rest}
    >
      {label ? <span className="sr-only">{label}</span> : null}
    </div>
  );
});

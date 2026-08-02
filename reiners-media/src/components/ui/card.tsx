/**
 * TCK-008 — Card (composto).
 *
 * LIMITE ACESSÍVEL — a decisão central deste componente.
 * `surface.raised` sobre `surface.base` dá ~1.07:1 NOS DOIS TEMAS (docblock de
 * `src/lib/tokens.ts`, nota "e"). Ou seja: a superfície sozinha não mostra onde
 * o card começa. Por isso as duas variantes com limite usam recursos que
 * carregam contraste real:
 *
 *   - `elevated` (default) → `shadow-raised`, que embute
 *     `0 0 0 1px var(--color-border-default)`. Sombra preta não eleva nada no
 *     dark; o hairline sim.
 *   - `outlined` → `border border-line-default` (>= 3:1 nos dois temas).
 *
 * `ghost` não tem limite porque não é um card delimitado — é agrupamento
 * puramente semântico dentro de um bloco que já tem o seu próprio limite.
 * `line-subtle` (~1.1:1) não aparece em lugar nenhum aqui: é decorativo.
 *
 * `CardTitle` aceita `as` porque nível de heading é decisão da PÁGINA, não do
 * componente: um `<h3>` fixo dentro de uma seção `<h2>` está certo, dentro de
 * um `<h1>` de hero está errado (WCAG 2.2 §1.3.1).
 */
import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef, type ElementType, type HTMLAttributes } from 'react';

import { cn } from './cn';

export const cardVariants = cva(['rounded-xl bg-surface-raised text-content-primary'], {
  variants: {
    variant: {
      elevated: 'shadow-raised',
      outlined: 'border border-line-default',
      ghost: 'bg-transparent',
    },
    /** Feedback de hover/focus para cards que são alvo de clique. */
    interactive: {
      true: 'transition-shadow duration-normal ease-standard hover:shadow-poster focus-within:shadow-poster',
      false: '',
    },
  },
  defaultVariants: { variant: 'elevated', interactive: false },
});

export interface CardProps
  extends HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardVariants> {}

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { className, variant, interactive, ...rest },
  ref,
) {
  return (
    <div ref={ref} className={cn(cardVariants({ variant, interactive }), className)} {...rest} />
  );
});

export const CardHeader = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function CardHeader({ className, ...rest }, ref) {
    return <div ref={ref} className={cn('flex flex-col gap-1.5 p-6', className)} {...rest} />;
  },
);

/** Níveis permitidos para `CardTitle` — heading real ou texto neutro. */
export type CardTitleElement = 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'p' | 'div';

export interface CardTitleProps extends HTMLAttributes<HTMLHeadingElement> {
  /** Nível do heading. Default `h3`; ajuste conforme a hierarquia da página. */
  as?: CardTitleElement;
}

export const CardTitle = forwardRef<HTMLHeadingElement, CardTitleProps>(function CardTitle(
  { className, as = 'h3', ...rest },
  ref,
) {
  const Tag = as as ElementType;
  return (
    <Tag
      ref={ref}
      className={cn('text-xl font-semibold text-content-primary', className)}
      {...rest}
    />
  );
});

export const CardDescription = forwardRef<
  HTMLParagraphElement,
  HTMLAttributes<HTMLParagraphElement>
>(function CardDescription({ className, ...rest }, ref) {
  return <p ref={ref} className={cn('text-sm text-content-secondary', className)} {...rest} />;
});

export const CardContent = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function CardContent({ className, ...rest }, ref) {
    return <div ref={ref} className={cn('p-6 pt-0', className)} {...rest} />;
  },
);

export const CardFooter = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function CardFooter({ className, ...rest }, ref) {
    return (
      <div ref={ref} className={cn('flex flex-wrap items-center gap-3 p-6 pt-0', className)} {...rest} />
    );
  },
);

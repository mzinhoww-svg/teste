'use client';

/**
 * TCK-008 — Button.
 *
 * Sete estados visuais (critério de aceitação do ticket):
 *   default · hover · focus-visible · active · disabled · loading · danger
 *
 * Decisões que não são óbvias:
 *
 * 1. `variant: 'danger'` é TONAL (superfície + texto + borda do mesmo estado),
 *    não sólido. Não existe token `text.onDanger`: no tema dark
 *    `state.danger` é #F04438, e texto branco sobre ele fica em ~3.2:1 —
 *    reprova em WCAG 2.2 §1.4.3. A combinação
 *    `bg-state-danger-surface` + `text-state-danger` entrega 5.3:1 (light) e
 *    4.5:1 (dark), e a borda `state-danger` dá o limite >= 3:1.
 *
 * 2. `variant: 'ghost'` não tem borda NENHUMA — e isso é proposital. A regra é
 *    "borda não pode ser o único limite se for `line-subtle`"; um botão de
 *    texto sem borda é identificado pelo próprio rótulo (>= 4.5:1). O que seria
 *    violação é desenhar um limite com `line-subtle` (~1.1:1) e chamá-lo de
 *    limite. `secondary` carrega borda de verdade: `line-default`.
 *
 * 3. A ordem das chaves em `variants` importa. `cva` concatena na ordem de
 *    inserção e `cn` faz a última classe vencer — por isso `size` vem ANTES de
 *    `variant`: assim `variant: 'link'` consegue anular a altura/padding do
 *    tamanho com `h-auto px-0`.
 *
 * 4. `type` default é `'button'`. O default do HTML é `submit`, e um botão de
 *    ação dentro de um `<form>` do admin (TCK-018/019) submeteria sem querer.
 *
 * Para um LINK com aparência de botão, não renderize `<Button>` dentro de `<a>`:
 * use `className={cn(buttonVariants({ variant: 'primary' }))}` no próprio `<a>`
 * (ou no `<Link>` do Next).
 */
import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

import { cn } from './cn';
import { Spinner } from './spinner';
import { controlTransition, disabledControl, focusRing } from './styles';

export const buttonVariants = cva(
  [
    'inline-flex select-none items-center justify-center gap-2 whitespace-nowrap',
    'rounded-md font-medium',
    controlTransition,
    focusRing,
    disabledControl,
  ],
  {
    variants: {
      // `size` primeiro — ver nota 3 no docblock.
      size: {
        sm: 'h-8 gap-1.5 px-3 text-sm',
        md: 'h-10 px-4 text-sm',
        lg: 'h-12 px-6 text-base',
        icon: 'h-10 w-10 p-0',
        'icon-sm': 'h-8 w-8 p-0',
      },
      variant: {
        primary:
          'bg-accent text-content-on-accent hover:bg-accent-hover active:bg-accent-active',
        secondary:
          'border border-line-default bg-surface-raised text-content-primary hover:bg-surface-sunken active:bg-surface-sunken',
        ghost:
          'bg-transparent text-content-secondary hover:bg-surface-sunken hover:text-content-primary active:bg-surface-sunken',
        danger:
          'border border-state-danger bg-state-danger-surface text-state-danger hover:bg-state-danger-surface/70 active:bg-state-danger-surface/90',
        link: 'h-auto p-0 text-content-link underline underline-offset-4 hover:text-accent-hover active:text-accent-active',
      },
      fullWidth: {
        true: 'w-full',
        false: '',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
      fullWidth: false,
    },
  },
);

export type ButtonVariant = NonNullable<VariantProps<typeof buttonVariants>['variant']>;
export type ButtonSize = NonNullable<VariantProps<typeof buttonVariants>['size']>;

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  /**
   * Estado de carregamento: desabilita o botão, marca `aria-busy` e mostra o
   * spinner SEM remover o rótulo (evita o salto de largura que faz o usuário
   * perder o alvo do clique).
   */
  loading?: boolean;
  /** Texto only-reader anunciado enquanto `loading`. */
  loadingLabel?: string;
  /** Ícone antes do rótulo. Marque-o com `aria-hidden` se for decorativo. */
  leadingIcon?: ReactNode;
  /** Ícone depois do rótulo. */
  trailingIcon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    className,
    variant,
    size,
    fullWidth,
    loading = false,
    loadingLabel = 'Carregando',
    leadingIcon,
    trailingIcon,
    disabled,
    type = 'button',
    children,
    ...rest
  },
  ref,
) {
  const isDisabled = Boolean(disabled) || loading;

  return (
    <button
      ref={ref}
      type={type}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      data-loading={loading ? '' : undefined}
      data-variant={variant ?? 'primary'}
      className={cn(buttonVariants({ variant, size, fullWidth }), className)}
      {...rest}
    >
      {loading ? (
        <Spinner size={size === 'lg' ? 'md' : 'sm'} />
      ) : (
        leadingIcon
      )}
      {children}
      {loading ? <span className="sr-only">{loadingLabel}</span> : trailingIcon}
    </button>
  );
});

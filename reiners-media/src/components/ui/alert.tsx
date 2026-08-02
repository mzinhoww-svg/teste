'use client';

/**
 * TCK-008 — Alert (mensagem de feedback inline).
 *
 * Marcado como client component porque `onDismiss` é um handler que atravessa
 * a fronteira até o `Button`: um Server Component passando função para
 * componente cliente é erro de runtime no App Router.
 *
 * O `role` acompanha a URGÊNCIA, não o gosto do autor:
 *   - `danger` / `warning` → `role="alert"` (região assertiva: interrompe o
 *     leitor de tela). É o certo para "falhou ao salvar".
 *   - `info` / `success` / `neutral` → `role="status"` (região polida:
 *     aguarda a pausa). É o certo para "rascunho salvo".
 * Usar `alert` para tudo transforma o leitor de tela em alarme e o usuário
 * desliga a região inteira. Ainda dá para forçar via prop `role`.
 *
 * Cores: superfície tonal do estado + borda na cor cheia do estado (limite
 * >= 4.5:1) + corpo em `content-primary`. O texto do corpo NÃO usa a cor do
 * estado: `state.danger` no dark é #F04438, que sobre a superfície tonal fica
 * legível para um título curto, mas cansativo em parágrafo.
 */
import { cva, type VariantProps } from 'class-variance-authority';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';

import { Button } from './button';
import { cn } from './cn';

export const alertVariants = cva(['flex w-full items-start gap-3 rounded-lg border p-4'], {
  variants: {
    variant: {
      neutral: 'border-line-default bg-surface-raised',
      info: 'border-state-info bg-state-info-surface',
      success: 'border-state-success bg-state-success-surface',
      warning: 'border-state-warning bg-state-warning-surface',
      danger: 'border-state-danger bg-state-danger-surface',
    },
  },
  defaultVariants: { variant: 'info' },
});

export type AlertVariant = NonNullable<VariantProps<typeof alertVariants>['variant']>;

const alertAccentClass: Record<AlertVariant, string> = {
  neutral: 'text-content-secondary',
  info: 'text-state-info',
  success: 'text-state-success',
  warning: 'text-state-warning',
  danger: 'text-state-danger',
};

const alertIcon: Record<AlertVariant, typeof Info> = {
  neutral: Info,
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: AlertCircle,
};

/** Variantes que interrompem a leitura em curso. */
const assertiveVariants: readonly AlertVariant[] = ['danger', 'warning'];

export interface AlertProps
  // `title` do HTML é string (o tooltip nativo do navegador); aqui ele é o
  // título renderizado do alerta, então precisa aceitar `ReactNode`.
  extends Omit<HTMLAttributes<HTMLDivElement>, 'title'>,
    VariantProps<typeof alertVariants> {
  /** Título curto da mensagem. */
  title?: ReactNode;
  /** Ícone customizado; `false` remove o ícone. */
  icon?: ReactNode | false;
  /** Exibe o botão de fechar e recebe o clique. */
  onDismiss?: () => void;
  /** Rótulo acessível do botão de fechar. */
  dismissLabel?: string;
}

export const Alert = forwardRef<HTMLDivElement, AlertProps>(function Alert(
  {
    className,
    variant,
    title,
    icon,
    onDismiss,
    dismissLabel = 'Dispensar',
    role,
    children,
    ...rest
  },
  ref,
) {
  const resolvedVariant: AlertVariant = variant ?? 'info';
  const assertive = assertiveVariants.includes(resolvedVariant);
  const IconComponent = alertIcon[resolvedVariant];
  const accent = alertAccentClass[resolvedVariant];

  return (
    <div
      ref={ref}
      role={role ?? (assertive ? 'alert' : 'status')}
      data-variant={resolvedVariant}
      className={cn(alertVariants({ variant }), className)}
      {...rest}
    >
      {icon === false ? null : (
        <span className={cn('mt-0.5 shrink-0', accent)}>
          {icon ?? <IconComponent aria-hidden="true" className="h-5 w-5" />}
        </span>
      )}

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {title ? <p className={cn('font-semibold', accent)}>{title}</p> : null}
        {children ? <div className="text-sm text-content-primary">{children}</div> : null}
      </div>

      {onDismiss ? (
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onDismiss}
          aria-label={dismissLabel}
          className="-me-2 -mt-2 shrink-0"
        >
          <X aria-hidden="true" className="h-4 w-4" />
        </Button>
      ) : null}
    </div>
  );
});

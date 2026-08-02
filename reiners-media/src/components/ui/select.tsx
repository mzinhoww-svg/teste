'use client';

/**
 * TCK-008 — Select.
 *
 * `<select>` NATIVO, de propósito. Um listbox custom precisaria reimplementar
 * teclado, tipo-para-buscar, scroll e o seletor em roda do iOS — e as
 * reimplementações costumam perder algo disso. O nativo já é acessível; o que
 * fazemos aqui é só a casca visual (`appearance-none` + chevron).
 *
 * Como existe um wrapper para posicionar o chevron, os nomes são explícitos:
 * `className` vai no `<select>` (é ele que recebe o ref e o foco) e
 * `wrapperClassName` vai no contêiner.
 *
 * O espaço para o chevron usa propriedade LÓGICA (`pe-10`, `end-3`) — em RTL o
 * ícone troca de lado sozinho (NFR-010).
 */
import { cva, type VariantProps } from 'class-variance-authority';
import { ChevronDown } from 'lucide-react';
import { forwardRef, type SelectHTMLAttributes } from 'react';

import { cn } from './cn';
import { useControlA11y } from './form-field';
import { parseAriaBoolean } from './input';
import {
  controlSurface,
  controlTransition,
  focusRing,
  invalidControl,
} from './styles';

export const selectVariants = cva(
  [
    'w-full appearance-none rounded-md ps-3 pe-10',
    controlSurface,
    controlTransition,
    focusRing,
    invalidControl,
    'disabled:cursor-not-allowed disabled:opacity-60',
  ],
  {
    variants: {
      selectSize: {
        sm: 'h-8 text-sm',
        md: 'h-10 text-base',
        lg: 'h-12 text-base',
      },
    },
    defaultVariants: { selectSize: 'md' },
  },
);

export interface SelectProps
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'>,
    VariantProps<typeof selectVariants> {
  /** Força o estado de erro. Dentro de um `FormField` com `error` já vem ligado. */
  invalid?: boolean;
  /** Opção-fantasma inicial, desabilitada (não é um valor selecionável). */
  placeholder?: string;
  /** Classe do contêiner que posiciona o chevron. */
  wrapperClassName?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  {
    className,
    wrapperClassName,
    selectSize,
    invalid,
    placeholder,
    id,
    required,
    children,
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
    <div className={cn('relative flex w-full items-center', wrapperClassName)}>
      <select
        ref={ref}
        className={cn(selectVariants({ selectSize }), className)}
        {...rest}
        {...a11y}
      >
        {placeholder ? (
          <option value="" disabled>
            {placeholder}
          </option>
        ) : null}
        {children}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute end-3 h-4 w-4 text-content-muted"
      />
    </div>
  );
});

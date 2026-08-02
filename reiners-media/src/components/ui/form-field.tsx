'use client';

/**
 * TCK-008 — FormField e o encanamento de acessibilidade dos controles.
 *
 * Problema que este arquivo resolve: rótulo, descrição e mensagem de erro só
 * ajudam se estiverem AMARRADOS ao controle (`htmlFor`, `aria-describedby`,
 * `aria-invalid`). Amarrar isso à mão em cada formulário do admin é onde a
 * acessibilidade morre na prática — basta um id esquecido.
 *
 * Aqui o `FormField` gera os ids e publica tudo num contexto; `Input`,
 * `Textarea` e `Select` consomem esse contexto via `useControlA11y` e se
 * conectam sozinhos:
 *
 *     <FormField label="Título" error={errors.title} description="Máx. 80" required>
 *       <Input name="title" />
 *     </FormField>
 *
 * O `<Input>` acima recebe `id`, `required`, `aria-describedby` (descrição +
 * erro) e `aria-invalid` sem que o autor escreva nada. Props explícitas no
 * controle sempre vencem o contexto — o automático nunca sequestra o manual.
 *
 * Fora de um `FormField` os controles continuam funcionando: `useControlA11y`
 * cai para um `useId()` próprio.
 *
 * ÚNICA pegadinha: se o controle receber um `id` explícito, passe o MESMO valor
 * em `<FormField htmlFor="...">`. O contexto não tem como adivinhar o id do
 * filho, e um `htmlFor` órfão deixa o campo sem rótulo acessível — sem nenhum
 * sinal visual de que quebrou.
 */
import {
  createContext,
  useContext,
  useId,
  type HTMLAttributes,
  type ReactNode,
} from 'react';

import { cn } from './cn';
import { Label } from './label';
import { joinIds } from './styles';

/* -------------------------------------------------------------------------- */
/* Contexto                                                                    */
/* -------------------------------------------------------------------------- */

export interface FormFieldContextValue {
  /** Id do controle — usado pelo `htmlFor` do rótulo. */
  controlId: string;
  /** Ids de descrição + erro, já concatenados. */
  describedBy: string | undefined;
  /** Há mensagem de erro? */
  invalid: boolean;
  /** Campo marcado como obrigatório. */
  required: boolean;
}

const FormFieldContext = createContext<FormFieldContextValue | null>(null);

/** Contexto do `FormField` mais próximo, ou `null` fora dele. */
export function useFormFieldContext(): FormFieldContextValue | null {
  return useContext(FormFieldContext);
}

export interface ControlA11yInput {
  id?: string;
  describedBy?: string;
  invalid?: boolean;
  required?: boolean;
}

export interface ControlA11yProps {
  id: string;
  required: boolean | undefined;
  'aria-describedby': string | undefined;
  'aria-invalid': true | undefined;
}

/**
 * Resolve os atributos de acessibilidade de um controle de formulário,
 * combinando props explícitas com o `FormField` ao redor (props vencem).
 */
export function useControlA11y(input: ControlA11yInput): ControlA11yProps {
  const field = useFormFieldContext();
  const fallbackId = useId();

  const invalid = input.invalid ?? field?.invalid ?? false;

  return {
    id: input.id ?? field?.controlId ?? fallbackId,
    required: input.required ?? field?.required,
    'aria-describedby': joinIds(input.describedBy, field?.describedBy),
    'aria-invalid': invalid ? true : undefined,
  };
}

/* -------------------------------------------------------------------------- */
/* FormField                                                                   */
/* -------------------------------------------------------------------------- */

export interface FormFieldProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  /** Rótulo visível do campo. Obrigatório: campo sem rótulo é campo inacessível. */
  label: ReactNode;
  /** Controle do campo (`Input`, `Textarea`, `Select`, ...). */
  children: ReactNode;
  /** Texto de apoio permanente. */
  description?: ReactNode;
  /** Mensagem de erro. Presente ⇒ `aria-invalid` no controle + `role="alert"`. */
  error?: ReactNode;
  /** Marca o campo como obrigatório (visual + `required` no controle). */
  required?: boolean;
  /** Id do controle. Por padrão é gerado e injetado automaticamente. */
  htmlFor?: string;
  /** Mantém o rótulo só para leitores de tela. */
  hideLabel?: boolean;
}

export function FormField({
  label,
  children,
  description,
  error,
  required = false,
  htmlFor,
  hideLabel = false,
  className,
  ...rest
}: FormFieldProps) {
  const reactId = useId();
  const controlId = htmlFor ?? `${reactId}-control`;
  const descriptionId = `${reactId}-description`;
  const errorId = `${reactId}-error`;
  const invalid = Boolean(error);

  const describedBy = joinIds(
    description ? descriptionId : undefined,
    invalid ? errorId : undefined,
  );

  return (
    <FormFieldContext.Provider value={{ controlId, describedBy, invalid, required }}>
      <div className={cn('flex w-full flex-col gap-1.5', className)} {...rest}>
        <Label htmlFor={controlId} required={required} visuallyHidden={hideLabel}>
          {label}
        </Label>

        {children}

        {description ? (
          <p id={descriptionId} className="text-sm text-content-muted">
            {description}
          </p>
        ) : null}

        {invalid ? (
          <p id={errorId} role="alert" className="text-sm font-medium text-state-danger">
            {error}
          </p>
        ) : null}
      </div>
    </FormFieldContext.Provider>
  );
}

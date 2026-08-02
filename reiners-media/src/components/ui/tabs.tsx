'use client';

/**
 * TCK-008 — Tabs (padrão WAI-ARIA APG "Tabs").
 *
 * Três coisas que separam "tabs de verdade" de `<div>`s que trocam conteúdo:
 *
 * 1. TABINDEX ITINERANTE. O tablist inteiro é UMA parada de Tab: só a aba
 *    selecionada tem `tabIndex=0`, as outras `-1`. Sem isso o usuário de
 *    teclado precisa tabular por 8 abas para chegar ao conteúdo.
 * 2. SETAS navegam entre abas (Home/End vão aos extremos), e o wrap é
 *    circular. A orientação define o par de setas (esquerda/direita ou
 *    cima/baixo) e alimenta `aria-orientation`.
 * 3. `aria-controls`/`aria-labelledby` ligando aba ↔ painel nos dois sentidos.
 *
 * `activationMode`:
 *   - `automatic` (default) — mover o foco já troca o painel. Correto quando o
 *     conteúdo é local e barato.
 *   - `manual` — o foco anda, a seleção só muda com Enter/Espaço/clique. Use
 *     quando o painel dispara fetch: no automático, atravessar 5 abas com a
 *     seta dispara 5 requisições.
 *
 * Painéis ocultos usam o ATRIBUTO `hidden` E a classe `hidden`. Só o atributo
 * não basta: `[hidden]{display:none}` vem da folha do agente do usuário e
 * qualquer utilitário de display do autor (um `flex` no `className`) o vence,
 * revelando o painel oculto.
 */
import {
  createContext,
  useCallback,
  useContext,
  useId,
  useState,
  type HTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
} from 'react';

import { cn } from './cn';
import { controlTransition, disabledControl, focusRing } from './styles';

export type TabsOrientation = 'horizontal' | 'vertical';
export type TabsActivationMode = 'automatic' | 'manual';

interface TabsContextValue {
  value: string;
  setValue: (value: string) => void;
  baseId: string;
  orientation: TabsOrientation;
  activationMode: TabsActivationMode;
}

const TabsContext = createContext<TabsContextValue | null>(null);

function useTabsContext(component: string): TabsContextValue {
  const context = useContext(TabsContext);
  if (!context) {
    throw new Error(`<${component}> precisa estar dentro de <Tabs>.`);
  }
  return context;
}

/** Valores viram parte de ids do DOM; `episódio 1` não pode virar id quebrado. */
function toIdPart(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '-');
}

export interface TabsProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onChange'> {
  /** Aba ativa (modo controlado). */
  value?: string;
  /** Aba ativa inicial (modo não controlado). */
  defaultValue?: string;
  /** Notifica troca de aba nos dois modos. */
  onValueChange?: (value: string) => void;
  orientation?: TabsOrientation;
  activationMode?: TabsActivationMode;
  children: ReactNode;
}

export function Tabs({
  value: controlledValue,
  defaultValue = '',
  onValueChange,
  orientation = 'horizontal',
  activationMode = 'automatic',
  className,
  children,
  ...rest
}: TabsProps) {
  const [uncontrolledValue, setUncontrolledValue] = useState(defaultValue);
  const baseId = useId();
  const isControlled = controlledValue !== undefined;
  const value = isControlled ? controlledValue : uncontrolledValue;

  const setValue = useCallback(
    (next: string) => {
      if (!isControlled) setUncontrolledValue(next);
      onValueChange?.(next);
    },
    [isControlled, onValueChange],
  );

  return (
    <TabsContext.Provider value={{ value, setValue, baseId, orientation, activationMode }}>
      <div
        className={cn(
          'flex gap-4',
          orientation === 'horizontal' ? 'flex-col' : 'flex-row',
          className,
        )}
        {...rest}
      >
        {children}
      </div>
    </TabsContext.Provider>
  );
}

export interface TabsListProps extends HTMLAttributes<HTMLDivElement> {
  /** Nome acessível do conjunto de abas. Exigido quando não há `aria-labelledby`. */
  'aria-label'?: string;
}

export function TabsList({ className, onKeyDown, children, ...rest }: TabsListProps) {
  const { orientation, activationMode } = useTabsContext('TabsList');

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    onKeyDown?.(event);
    if (event.defaultPrevented) return;

    const nextKey = orientation === 'horizontal' ? 'ArrowRight' : 'ArrowDown';
    const previousKey = orientation === 'horizontal' ? 'ArrowLeft' : 'ArrowUp';

    const tabs = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]:not([disabled])'),
    );
    if (tabs.length === 0) return;

    const currentIndex = tabs.findIndex((tab) => tab === document.activeElement);
    let nextIndex: number;

    if (event.key === nextKey) {
      nextIndex = (currentIndex + 1) % tabs.length;
    } else if (event.key === previousKey) {
      nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    } else if (event.key === 'Home') {
      nextIndex = 0;
    } else if (event.key === 'End') {
      nextIndex = tabs.length - 1;
    } else {
      return;
    }

    const nextTab = tabs[nextIndex];
    if (!nextTab) return;

    event.preventDefault();
    nextTab.focus();
    if (activationMode === 'automatic') nextTab.click();
  }

  return (
    <div
      role="tablist"
      aria-orientation={orientation}
      onKeyDown={handleKeyDown}
      className={cn(
        'inline-flex gap-1 rounded-lg border border-line-default bg-surface-sunken p-1',
        orientation === 'horizontal' ? 'flex-row items-center' : 'flex-col items-stretch',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

export interface TabsTriggerProps
  extends Omit<HTMLAttributes<HTMLButtonElement>, 'onSelect'> {
  /** Identificador da aba — casa com o `value` do `TabsContent`. */
  value: string;
  disabled?: boolean;
}

export function TabsTrigger({
  value,
  className,
  disabled = false,
  onClick,
  children,
  ...rest
}: TabsTriggerProps) {
  const context = useTabsContext('TabsTrigger');
  const selected = context.value === value;
  const idPart = toIdPart(value);

  return (
    <button
      type="button"
      role="tab"
      id={`${context.baseId}-trigger-${idPart}`}
      aria-selected={selected}
      aria-controls={`${context.baseId}-panel-${idPart}`}
      tabIndex={selected ? 0 : -1}
      disabled={disabled}
      onClick={(event) => {
        onClick?.(event);
        context.setValue(value);
      }}
      className={cn(
        'inline-flex h-8 items-center justify-center gap-2 whitespace-nowrap rounded-md px-3 text-sm font-medium',
        'text-content-secondary hover:text-content-primary',
        'aria-selected:bg-surface-raised aria-selected:text-content-primary aria-selected:shadow-raised',
        controlTransition,
        focusRing,
        disabledControl,
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

export interface TabsContentProps extends HTMLAttributes<HTMLDivElement> {
  /** Identificador do painel — casa com o `value` do `TabsTrigger`. */
  value: string;
}

export function TabsContent({ value, className, children, ...rest }: TabsContentProps) {
  const context = useTabsContext('TabsContent');
  const selected = context.value === value;
  const idPart = toIdPart(value);

  return (
    <div
      role="tabpanel"
      id={`${context.baseId}-panel-${idPart}`}
      aria-labelledby={`${context.baseId}-trigger-${idPart}`}
      // Painel focável: sem isso, quem chega pelo Tab depois das abas pula o
      // conteúdo inteiro quando ele não começa com um elemento focável.
      tabIndex={0}
      hidden={!selected}
      className={cn('rounded-md text-content-primary', focusRing, className, !selected && 'hidden')}
      {...rest}
    >
      {children}
    </div>
  );
}

'use client';

/**
 * TCK-008 — Toast (notificação transitória) + `ToastProvider` / `useToast`.
 *
 * Uso:
 *
 *     // uma vez, no layout
 *     <ToastProvider>{children}</ToastProvider>
 *
 *     // em qualquer client component abaixo dele
 *     const { toast } = useToast();
 *     toast({ title: 'Episódio publicado', variant: 'success' });
 *
 * Notas de acessibilidade:
 *
 * - O viewport é uma `role="region"` NOMEADA e cada toast é um `Alert`, que
 *   já escolhe `alert`/`status` conforme a urgência. A região existe para que o
 *   usuário de leitor de tela consiga NAVEGAR até as notificações depois — sem
 *   nome, ela não aparece na lista de regiões.
 * - `duration: 0` desliga o auto-dismiss. Toast que some sozinho é uma
 *   armadilha de WCAG 2.2 §2.2.1 (Timing Adjustable) quando carrega a única
 *   cópia de uma informação importante — mensagem de erro de formulário deve
 *   ser `FormField error`, não toast.
 * - O viewport é `pointer-events-none` e cada toast reativa o ponteiro: assim a
 *   faixa vazia no rodapé não come cliques do conteúdo abaixo dela.
 *
 * O `z-toast` (1600) fica acima de `z-modal` (1400) de propósito: o retorno de
 * uma ação disparada dentro de um dialog precisa ser visível.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { Alert, type AlertVariant } from './alert';
import { cn } from './cn';

export interface ToastOptions {
  /** Id próprio; por padrão é gerado. Reutilizar um id substitui o toast. */
  id?: string;
  title?: ReactNode;
  description?: ReactNode;
  variant?: AlertVariant;
  /** Milissegundos até sumir. `0` = permanece até ser dispensado. */
  duration?: number;
}

export interface ToastRecord extends ToastOptions {
  id: string;
}

export interface ToastContextValue {
  toasts: readonly ToastRecord[];
  /** Enfileira um toast e devolve o id (útil para dispensar antes da hora). */
  toast: (options: ToastOptions) => string;
  dismiss: (id: string) => void;
  dismissAll: () => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export interface ToastProviderProps {
  children?: ReactNode;
  /** Duração padrão em ms. `0` desliga o auto-dismiss global. */
  duration?: number;
  /** Nome acessível da região de notificações. */
  label?: string;
  /** Classe do viewport. */
  viewportClassName?: string;
}

let toastCounter = 0;

export function ToastProvider({
  children,
  duration = 6000,
  label = 'Notificações',
  viewportClassName,
}: ToastProviderProps) {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  const timersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: string) => {
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
    setToasts((current) => current.filter((item) => item.id !== id));
  }, []);

  const dismissAll = useCallback(() => {
    timersRef.current.forEach((timer) => clearTimeout(timer));
    timersRef.current.clear();
    setToasts([]);
  }, []);

  const toast = useCallback(
    (options: ToastOptions): string => {
      toastCounter += 1;
      const id = options.id ?? `toast-${toastCounter}`;
      const record: ToastRecord = { variant: 'info', ...options, id };

      setToasts((current) => [...current.filter((item) => item.id !== id), record]);

      const timeout = record.duration ?? duration;
      if (timeout > 0) {
        const existing = timersRef.current.get(id);
        if (existing) clearTimeout(existing);
        timersRef.current.set(
          id,
          setTimeout(() => dismiss(id), timeout),
        );
      }

      return id;
    },
    [duration, dismiss],
  );

  // Timers pendentes em componente desmontado = update em árvore morta.
  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((timer) => clearTimeout(timer));
      timers.clear();
    };
  }, []);

  const value = useMemo<ToastContextValue>(
    () => ({ toasts, toast, dismiss, dismissAll }),
    [toasts, toast, dismiss, dismissAll],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        role="region"
        aria-label={label}
        className={cn(
          'pointer-events-none fixed inset-x-0 bottom-0 z-toast',
          'flex flex-col items-center gap-2 p-4 sm:items-end',
          viewportClassName,
        )}
      >
        {toasts.map((item) => (
          <Alert
            key={item.id}
            variant={item.variant}
            title={item.title}
            onDismiss={() => dismiss(item.id)}
            className="pointer-events-auto w-full max-w-sm shadow-raised motion-safe:animate-fade-in-up"
          >
            {item.description}
          </Alert>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/** Acesso à fila de toasts. Lança fora de `<ToastProvider>` — falha alto e cedo. */
export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast() precisa estar dentro de <ToastProvider>.');
  }
  return context;
}

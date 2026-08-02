"use client";

import { useEffect, useRef } from "react";

const FOCUSABLE = [
  "a[href]", "button:not([disabled])", "input:not([disabled])",
  "select:not([disabled])", "textarea:not([disabled])", "[tabindex]:not([tabindex='-1'])",
].join(",");

/**
 * Comportamento comum de drawer e modal: trap de Tab, Escape fecha, foco
 * inicial no primeiro focável e devolução do foco ao elemento que abriu.
 * Também trava o scroll do body enquanto aberto.
 */
export function useDismissable(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    opener.current = document.activeElement as HTMLElement | null;
    const node = ref.current;
    const focusables = () => Array.from(node?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);

    focusables()[0]?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !node?.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
      // Devolve o foco a quem abriu (critério de a11y do modal/drawer).
      opener.current?.focus?.();
    };
  }, [open, onClose]);

  return ref;
}

/** Fecha com swipe para baixo (mobile). Devolve handlers de touch. */
export function useSwipeDown(onClose: () => void, threshold = 80) {
  const start = useRef<number | null>(null);
  return {
    onTouchStart: (e: React.TouchEvent) => {
      start.current = e.touches[0]?.clientY ?? null;
    },
    onTouchEnd: (e: React.TouchEvent) => {
      const from = start.current;
      const to = e.changedTouches[0]?.clientY;
      start.current = null;
      if (from != null && to != null && to - from > threshold) onClose();
    },
  };
}

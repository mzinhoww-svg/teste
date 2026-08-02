"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { useDismissable, useSwipeDown } from "./use-dismissable";

// Modal do site público.
// A11y: role="dialog", aria-modal, aria-labelledby no título, trap de foco,
// Escape fecha, foco volta ao gatilho. Mobile: swipe para baixo fecha.
// Sombra: shadow.2 (reservada a overlays/modais).

export function SiteModal({
  open, onClose, title, description, children, footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const ref = useDismissable(open, onClose);
  const swipe = useSwipeDown(onClose);
  const titleId = React.useId();
  const descId = React.useId();

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-site-surface-base/85 p-4 backdrop-blur-[12px] sm:items-center"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        className={cn(
          "w-full max-w-lg rounded-site-lg border border-site-border-muted/10 bg-site-surface-raised shadow-site-2",
          "animate-site-modal-in",
        )}
        {...swipe}
      >
        <header className="flex items-start justify-between gap-4 border-b border-site-border-muted/[0.06] p-6">
          <div>
            <h2 id={titleId} className="text-site-2xl font-medium text-site-text-primary">
              {title}
            </h2>
            {description && (
              <p id={descId} className="mt-1 text-site-sm text-site-text-primary/60">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-site-md text-site-text-primary/60 transition-colors duration-fast hover:text-site-text-inverse"
          >
            <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
              <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <div className="p-6">{children}</div>

        {footer && <div className="border-t border-site-border-muted/[0.06] p-6">{footer}</div>}
      </div>
    </div>
  );
}

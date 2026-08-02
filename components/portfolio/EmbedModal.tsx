"use client";

import { useCallback, useEffect, useId, useRef } from "react";
import type { EmbedRequest } from "./EpisodeRow";

// Modal de player (YouTube / Spotify).
// a11y §6: role="dialog", aria-modal, aria-labelledby, ESC fecha, Tab preso
// dentro do modal e foco devolvido ao elemento que o abriu.
//
// Anti-pattern §7: os embeds NUNCA recebem autoplay — o usuário dá o play.

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea, input, select, iframe, [tabindex]:not([tabindex="-1"])';

export function EmbedModal({
  request,
  onClose,
}: {
  request: EmbedRequest | null;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const titleId = useId();

  const open = request !== null;

  // Guarda quem abriu para devolver o foco ao fechar.
  useEffect(() => {
    if (open) openerRef.current = document.activeElement as HTMLElement | null;
  }, [open]);

  const close = useCallback(() => {
    onClose();
    openerRef.current?.focus?.();
  }, [onClose]);

  useEffect(() => {
    if (!open) return;

    closeRef.current?.focus();

    // Trava o scroll do fundo enquanto o modal estiver aberto.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        close();
        return;
      }
      if (event.key !== "Tab") return;

      const nodes = dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (!nodes?.length) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, close]);

  if (!request) return null;

  const platform = request.variant === "YOUTUBE" ? "YouTube" : "Spotify";

  return (
    <div
      className="pf-overlay-enter fixed inset-0 z-[100] grid place-items-center bg-pf-base/[0.85] p-4 backdrop-blur-[12px]"
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="pf-modal-enter pf-motion-transform w-full max-w-[760px] overflow-hidden rounded-pf-lg border border-pf-muted/[0.08] bg-pf-raised shadow-pf-2"
      >
        <div className="flex items-center justify-between gap-4 px-5 py-4">
          <h2 id={titleId} className="min-w-0 truncate text-pf-2xl font-medium text-pf-primary">
            {request.title}
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={close}
            aria-label="Fechar player"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-pf-circle text-pf-primary"
          >
            <span
              aria-hidden
              className="grid h-8 w-8 place-items-center rounded-pf-circle bg-pf-strong transition-colors duration-pf-fast ease-pf hover:bg-pf-inverse/15"
            >
              ✕
            </span>
          </button>
        </div>

        <div className="aspect-video w-full bg-pf-base">
          <iframe
            key={request.embedUrl}
            src={request.embedUrl}
            title={`${platform} — ${request.title}`}
            className="h-full w-full border-0"
            allow="encrypted-media; picture-in-picture; clipboard-write"
            allowFullScreen
            loading="lazy"
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-4">
          {request.externalUrl ? (
            <a
              href={request.externalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-pf-xs text-pf-tertiary underline transition-colors duration-pf-fast ease-pf hover:text-pf-inverse"
            >
              Abrir no site original
            </a>
          ) : (
            <span />
          )}
          <span className="text-pf-xs text-pf-primary/30">ESC para fechar</span>
        </div>
      </div>
    </div>
  );
}

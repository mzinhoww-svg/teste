"use client";

import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { SiteButton } from "./button";
import { SiteLink } from "./link";
import { BookingModal } from "./booking-modal";
import { useDismissable } from "./use-dismissable";
import { trackSiteEvent } from "@/lib/site/track";

// Navbar sticky (64px) com blur. Estado `scrolled` acende a borda inferior.
// Mobile: drawer lateral com aria-expanded/aria-controls, role="dialog",
// trap de foco e Escape (ver use-dismissable).

const LINKS = [
  { href: "/#planos", label: "Planos" },
  { href: "/portfolio", label: "Programas" },
  { href: "/#sobre", label: "Sobre" },
  { href: "/#contato", label: "Contato" },
];

export function SiteNavbar({ siteName }: { siteName: string }) {
  const [scrolled, setScrolled] = React.useState(false);
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [bookingOpen, setBookingOpen] = React.useState(false);

  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const closeDrawer = React.useCallback(() => setDrawerOpen(false), []);
  const drawerRef = useDismissable(drawerOpen, closeDrawer);

  function openBooking(from: string) {
    setDrawerOpen(false);
    setBookingOpen(true);
    trackSiteEvent("cta_click", from);
  }

  return (
    <>
      <header
        className={cn(
          "sticky top-0 z-40 h-16 border-b bg-site-surface-base/85 backdrop-blur-[16px] transition-colors duration-fast",
          scrolled ? "border-site-border-muted/[0.06]" : "border-transparent",
        )}
      >
        <nav
          aria-label="Principal"
          className="mx-auto flex h-full max-w-6xl items-center justify-between gap-6 px-6"
        >
          <Link
            href="/"
            className="text-site-4xl font-medium text-site-text-primary transition-colors duration-fast hover:text-site-text-inverse"
          >
            {siteName}
          </Link>

          <ul className="hidden items-center gap-8 md:flex">
            {LINKS.map((l) => (
              <li key={l.href}>
                <SiteLink href={l.href} variant="nav" className="text-site-xl">
                  {l.label}
                </SiteLink>
              </li>
            ))}
          </ul>

          <div className="flex items-center gap-2">
            <SiteButton
              variant="surface"
              size="sm"
              className="hidden border border-site-border-muted/15 md:inline-flex"
              onClick={() => openBooking("navbar")}
            >
              Agendar sessão
            </SiteButton>

            <button
              type="button"
              className="grid h-11 w-11 place-items-center rounded-site-md text-site-text-primary transition-colors duration-fast hover:text-site-text-inverse md:hidden"
              aria-expanded={drawerOpen}
              aria-controls="site-drawer"
              aria-label={drawerOpen ? "Fechar menu" : "Abrir menu"}
              onClick={() => setDrawerOpen((v) => !v)}
            >
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                {drawerOpen ? (
                  <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
                ) : (
                  <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
                )}
              </svg>
            </button>
          </div>
        </nav>
      </header>

      {drawerOpen && (
        <div
          className="fixed inset-0 z-50 bg-site-surface-base/85 backdrop-blur-[12px] md:hidden"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeDrawer();
          }}
        >
          <div
            ref={drawerRef}
            id="site-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Menu de navegação"
            className="ml-auto flex h-full w-[min(320px,85vw)] animate-site-drawer-in flex-col gap-2 border-l border-site-border-muted/10 bg-site-surface-raised p-6 shadow-site-2"
          >
            <div className="mb-4 flex items-center justify-between">
              <span className="text-site-4xl font-medium">{siteName}</span>
              <button
                type="button"
                onClick={closeDrawer}
                aria-label="Fechar menu"
                className="grid h-11 w-11 place-items-center rounded-site-md text-site-text-primary/60 hover:text-site-text-inverse"
              >
                <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                  <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            <ul className="flex flex-col">
              {LINKS.map((l) => (
                <li key={l.href}>
                  <SiteLink
                    href={l.href}
                    variant="nav"
                    touch
                    className="flex w-full text-site-base"
                    onClick={closeDrawer}
                  >
                    {l.label}
                  </SiteLink>
                </li>
              ))}
            </ul>

            <SiteButton className="mt-4" block onClick={() => openBooking("drawer")}>
              Agendar sessão
            </SiteButton>
          </div>
        </div>
      )}

      <BookingModal open={bookingOpen} onClose={() => setBookingOpen(false)} />
    </>
  );
}

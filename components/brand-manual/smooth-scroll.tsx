"use client";

import * as React from "react";

// Scroll suave ao clicar nas âncoras do nav (equivalente ao
// `scroll-behavior:smooth` do protótipo de referência), escopado a esta
// página — não mexe no <html> global do resto do site, que segue com scroll
// instantâneo — e desligado sob prefers-reduced-motion, mesmo critério já
// usado em HeroMedia (components/site/hero-media.tsx).
export function BrandManualSmoothScroll() {
  React.useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const root = document.documentElement;
    const previous = root.style.scrollBehavior;
    root.style.scrollBehavior = "smooth";
    return () => {
      root.style.scrollBehavior = previous;
    };
  }, []);

  return null;
}

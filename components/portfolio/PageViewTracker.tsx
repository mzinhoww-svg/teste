"use client";

import { useEffect } from "react";
import { track } from "@/lib/portfolio/track";

// Registra um PAGE_VIEW por montagem. Efeito isolado em um componente próprio
// para que as páginas continuem sendo Server Components.

export function PageViewTracker({ page, slug }: { page: string; slug?: string }) {
  useEffect(() => {
    track("PAGE_VIEW", slug ? { page, slug } : { page });
  }, [page, slug]);

  return null;
}

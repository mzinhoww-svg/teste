"use client";

import { useEffect } from "react";
import { trackSiteEvent } from "@/lib/site/track";

/** Registra uma visita ao montar. Sem cookie, sem identificação do visitante. */
export function SitePageView() {
  useEffect(() => {
    trackSiteEvent("page_view");
  }, []);
  return null;
}

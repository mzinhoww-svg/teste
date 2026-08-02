// Analytics próprio do site (sem cookie, sem terceiros): grava page_view,
// cta_click e form_submit em `site_events`, que alimenta os KPIs do
// /admin/site. Falha em silêncio — telemetria nunca quebra a navegação.

export type SiteEventKind = "page_view" | "cta_click" | "form_submit";

export function trackSiteEvent(kind: SiteEventKind, label?: string): void {
  if (typeof window === "undefined") return;
  const body = JSON.stringify({ kind, label, path: window.location.pathname });
  try {
    // sendBeacon sobrevive à navegação disparada pelo próprio clique.
    if (navigator.sendBeacon?.(("/api/site/events"), new Blob([body], { type: "application/json" }))) return;
  } catch {
    /* cai no fetch abaixo */
  }
  void fetch("/api/site/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {});
}

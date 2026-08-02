import type { EventType } from "./types";

// Telemetria do catálogo (client-side). Dispara e esquece: nenhuma interação do
// usuário espera pela rede, e uma falha aqui nunca propaga.
// O servidor grava em EventLog (ver app/api/portfolio/events/route.ts).

export function track(eventType: EventType, payload?: Record<string, unknown>): void {
  if (typeof window === "undefined") return;

  const body = JSON.stringify({ eventType, payload: payload ?? {} });

  try {
    // sendBeacon sobrevive à navegação (ex.: clique que abre link externo).
    if (navigator.sendBeacon) {
      const ok = navigator.sendBeacon(
        "/api/portfolio/events",
        new Blob([body], { type: "application/json" }),
      );
      if (ok) return;
    }
    void fetch("/api/portfolio/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Telemetria nunca quebra a UI.
  }
}

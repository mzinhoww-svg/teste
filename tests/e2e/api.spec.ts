import { test, expect } from "@playwright/test";

test.describe("APIs públicas e webhooks", () => {
  test("health responde ok", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body).toHaveProperty("provider");
    expect(body).toHaveProperty("model");
  });

  test("webhook OpenSign recusa payload sem segredo", async ({ request }) => {
    const res = await request.post("/api/webhooks/opensign", {
      data: { objectId: "x", status: "signed" },
    });
    // Sem o header x-opensign-secret válido, o provider recusa (401).
    expect(res.status()).toBe(401);
  });

  test("webhook WhatsApp recusa payload sem segredo", async ({ request }) => {
    const res = await request.post("/api/whatsapp/webhook", {
      data: { from: "5565999999999", body: "oi" },
    });
    expect(res.status()).toBe(401);
  });

  // O middleware redireciona rotas privadas para /login antes de chegar ao
  // handler, então sem seguir o redirect esperamos 3xx (ou 401 do próprio
  // handler). O que importa: acesso deslogado nunca é 200 com dados.
  test("execução de agente exige autenticação", async ({ request }) => {
    const res = await request.post("/api/agents/run", {
      data: { dealId: "00000000-0000-0000-0000-000000000000", kind: "lead-scoring" },
      maxRedirects: 0,
    });
    expect([301, 302, 303, 307, 308, 401]).toContain(res.status());
  });

  test("export exige autenticação", async ({ request }) => {
    const res = await request.get("/api/export", { maxRedirects: 0 });
    expect([301, 302, 303, 307, 308, 401]).toContain(res.status());
  });
});

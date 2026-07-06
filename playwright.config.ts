import { defineConfig, devices } from "@playwright/test";

// E2E do CRM AI Studio.
//
// Os cenários deste repositório cobrem a superfície pública e o comportamento
// de guarda (landing, login, redirecionamento de área privada, health,
// webhook). Eles rodam SEM segredos — por isso são estáveis no CI.
//
// Para exercitar fluxos autenticados (board, studio, contratos), defina
// E2E_BASE_URL apontando para um ambiente já provisionado (ex.: preview da
// Vercel) e E2E_EMAIL/E2E_PASSWORD de um usuário de teste — ver docs/testing.md.

const PORT = 3000;
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // Permite apontar para um Chromium já instalado (ex.: sandbox/CI que
        // pré-baixa o browser). Em CI padrão, deixe vazio e rode
        // `npx playwright install --with-deps chromium`.
        launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH
          ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
          : undefined,
      },
    },
  ],
  // Sobe o app local só quando não apontamos para uma URL externa.
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "npm run start",
        url: `http://localhost:${PORT}`,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        env: {
          // Placeholders: bastam para a app subir; sem sessão real, as rotas
          // privadas redirecionam para /login (que é o que os testes checam).
          NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://placeholder.supabase.co",
          NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "placeholder-anon-key",
        },
      },
});

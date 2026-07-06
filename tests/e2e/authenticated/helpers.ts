import { type Page, expect } from "@playwright/test";

// Fluxos autenticados rodam contra um ambiente REAL (preview da Vercel) com um
// usuário de teste. Sem E2E_EMAIL/E2E_PASSWORD, os specs se auto-pulam.
export const AUTH_ENABLED = Boolean(process.env.E2E_EMAIL && process.env.E2E_PASSWORD);

export async function login(page: Page) {
  await page.goto("/login");
  await page.locator('input[name="email"]').fill(process.env.E2E_EMAIL!);
  await page.locator('input[name="password"]').fill(process.env.E2E_PASSWORD!);
  await page.getByRole("button", { name: /^entrar$/i }).click();
  await page.waitForURL(/\/app/, { timeout: 15_000 });
}

// Cria um lead pelo Sheet e devolve o título usado (para localizar depois).
export async function createQuickLead(page: Page, name = `E2E ${Date.now()}`) {
  await page.getByRole("button", { name: /novo lead/i }).click();
  await page.locator('input').first().waitFor();
  await page.getByLabel(/Nome/i).first().fill(name);
  // Botão "Criar sem abrir" evita depender do drawer abrir.
  await page.getByRole("button", { name: /criar sem abrir/i }).click();
  await expect(page.getByText(/lead criado/i)).toBeVisible({ timeout: 10_000 });
  return name;
}

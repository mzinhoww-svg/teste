import { test, expect } from "@playwright/test";

test.describe("Landing pública (/)", () => {
  test("carrega com título e headline", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/CRM AI Studio/i);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("mostra os pilares de funcionalidade", async ({ page }) => {
    await page.goto("/");
    for (const title of ["Funil inteligente", "Agentes de IA", "Contratos e assinatura", "Relatórios"]) {
      await expect(page.getByText(title, { exact: false }).first()).toBeVisible();
    }
  });

  test("tem CTA que leva ao app", async ({ page }) => {
    await page.goto("/");
    const cta = page.locator('a[href="/app"]').first();
    await expect(cta).toBeVisible();
  });

  test("não gera erro de runtime no console", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    expect(errors).toEqual([]);
  });
});

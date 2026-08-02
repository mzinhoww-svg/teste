import { test, expect } from "@playwright/test";

// A landing do CRM saiu do apex e passou a morar em /crm (também servida em
// crm.<root>/ pelo middleware). O apex agora é a landing da Reiners Media —
// coberta em site.spec.ts.
test.describe("Landing do CRM (/crm)", () => {
  test("carrega com título e headline", async ({ page }) => {
    await page.goto("/crm");
    await expect(page).toHaveTitle(/CRM AI Studio/i);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("mostra os pilares de funcionalidade", async ({ page }) => {
    await page.goto("/crm");
    for (const title of ["Funil inteligente", "agentes de IA", "Contratos e assinatura", "Relatórios"]) {
      await expect(page.getByText(title, { exact: false }).first()).toBeVisible();
    }
  });

  test("hero: como funciona e segurança", async ({ page }) => {
    await page.goto("/crm");
    await expect(page.getByRole("heading", { name: /Como funciona/i })).toBeVisible();
    await expect(page.getByText(/Row Level Security/i)).toBeVisible();
  });

  test("tem CTA que leva ao app", async ({ page }) => {
    await page.goto("/crm");
    const cta = page.locator('a[href="/app"]').first();
    await expect(cta).toBeVisible();
  });

  test("não gera erro de runtime no console", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto("/crm");
    await page.waitForLoadState("networkidle");
    expect(errors).toEqual([]);
  });
});

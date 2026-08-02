import { test, expect } from "@playwright/test";

// Páginas públicas de assinatura e proposta não exigem login (o signatário/cliente
// não é usuário do CRM). Com token inválido, devem mostrar estado de erro amigável,
// nunca a área logada nem uma exceção.
test.describe("Páginas públicas por token", () => {
  test("assinatura com token inválido mostra estado de erro", async ({ page }) => {
    await page.goto("/sign/contracts/token-inexistente-123");
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.getByText(/inválido/i)).toBeVisible();
  });

  test("proposta com token inválido mostra estado de erro", async ({ page }) => {
    await page.goto("/proposta/token-inexistente-123");
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.getByText(/não encontrada/i)).toBeVisible();
  });

  test("página de assinatura não gera exceção de runtime", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto("/sign/contracts/qualquer");
    await page.waitForLoadState("networkidle");
    expect(errors).toEqual([]);
  });
});

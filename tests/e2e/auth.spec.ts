import { test, expect } from "@playwright/test";

test.describe("Guarda de autenticação", () => {
  test("área privada /app redireciona para /login quando deslogado", async ({ page }) => {
    await page.goto("/app");
    await expect(page).toHaveURL(/\/login/);
  });

  test("studio também exige login", async ({ page }) => {
    await page.goto("/app/studio");
    await expect(page).toHaveURL(/\/login/);
  });

  test("página de login mostra formulário de e-mail e senha", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator('input[name="email"]')).toBeVisible();
    await expect(page.locator('input[name="password"]')).toBeVisible();
  });

  test("login oferece entrar e criar conta", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("button", { name: /entrar/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /criar conta/i })).toBeVisible();
  });

  test("senha exige no mínimo 6 caracteres", async ({ page }) => {
    await page.goto("/login");
    const pass = page.locator('input[name="password"]');
    await expect(pass).toHaveAttribute("minlength", "6");
  });
});

import { test, expect } from "@playwright/test";

// Landing pública da Reiners Media (apex) + portfólio.
// Roda sem segredos: sem Supabase a página cai nos defaults de lib/site/content.

test.describe("Landing Reiners Media (/)", () => {
  test("hero, eyebrow e CTAs", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Reiners Media/i);
    await expect(
      page.getByRole("heading", { level: 1, name: /produção de nível internacional/i }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Ver planos" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Ouvir programas" })).toBeVisible();
  });

  test("todas as seções aparecem", async ({ page }) => {
    await page.goto("/");
    for (const heading of [
      /Escolha o formato ideal/i,
      /Programas que criamos/i,
      /O que dizem nossos clientes/i,
      /Por que a Reiners Media/i,
      /Pronto para começar seu podcast/i,
    ]) {
      await expect(page.getByRole("heading", { name: heading })).toBeVisible();
    }
  });

  test("hierarquia de headings sem salto (h1 → h2 → h3)", async ({ page }) => {
    await page.goto("/");
    const levels = await page
      .locator("h1, h2, h3, h4")
      .evaluateAll((nodes) => nodes.map((n) => Number(n.tagName[1])));
    expect(levels[0]).toBe(1);
    for (let i = 1; i < levels.length; i++) {
      expect(levels[i] - levels[i - 1]).toBeLessThanOrEqual(1);
    }
  });

  test("skip link é o primeiro elemento focável", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: /Pular para conteúdo principal/i })).toBeFocused();
  });

  test("modal de agendamento: abre, tem role dialog e fecha no Escape", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Agendar sessão" }).first().click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute("aria-modal", "true");
    await expect(dialog.getByLabel("Nome")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });

  test("formulário exige e-mail válido", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Agendar sessão gratuita" }).click();

    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Nome").fill("Ana Furtado");
    await dialog.getByLabel("E-mail").fill("nao-e-email");
    await dialog.getByRole("button", { name: /Enviar pedido de sessão/i }).click();

    await expect(dialog.getByText(/e-mail válido/i)).toBeVisible();
  });

  test("não gera erro de runtime no console", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    expect(errors).toEqual([]);
  });
});

test.describe("Portfólio (/portfolio)", () => {
  test("lista os programas com âncora própria", async ({ page }) => {
    await page.goto("/portfolio");
    await expect(page.getByRole("heading", { level: 1, name: /Programas que criamos/i })).toBeVisible();
    await expect(page.locator("#conversas-que-cooperam")).toBeVisible();
  });

  test("o teaser da landing leva ao portfólio", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: /Ver portfólio completo/i }).click();
    await expect(page).toHaveURL(/\/portfolio$/);
  });
});

test.describe("Drawer mobile", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("abre, expõe aria-expanded e fecha no Escape", async ({ page }) => {
    await page.goto("/");
    const toggle = page.getByRole("button", { name: "Abrir menu" });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");

    await toggle.click();
    const drawer = page.getByRole("dialog", { name: "Menu de navegação" });
    await expect(drawer).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
  });
});

import { expect, test } from "@playwright/test";

// E2E do catálogo público. Roda contra o dataset de demonstração (sem
// DATABASE_URL no CI), que é determinístico: 5 programas, 5 episódios cada.

test.describe("/portfolio", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/portfolio");
  });

  test("renderiza a hero, os destaques e os cinco posters", async ({ page }) => {
    await expect(page.getByRole("heading", { level: 1, name: "Nossos programas" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Destaques" })).toBeVisible();
    await expect(page.locator("button[aria-expanded]")).toHaveCount(5);
  });

  test("clicar em um poster expande o painel sem navegar", async ({ page }) => {
    const poster = page.locator("button[aria-expanded]").first();
    await poster.click();

    await expect(poster).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator('.pf-panel[data-state="open"]')).toHaveCount(1);
    // Não navegou: continua na listagem.
    await expect(page).toHaveURL(/\/portfolio$/);
  });

  test("apenas um painel fica aberto por vez", async ({ page }) => {
    const posters = page.locator("button[aria-expanded]");
    await posters.nth(0).click();
    await expect(page.locator('.pf-panel[data-state="open"]')).toHaveCount(1);

    await posters.nth(3).click();
    await expect(page.locator('.pf-panel[data-state="open"]')).toHaveCount(1);
    await expect(posters.nth(0)).toHaveAttribute("aria-expanded", "false");
    await expect(posters.nth(3)).toHaveAttribute("aria-expanded", "true");
  });

  test("ESC fecha o painel e devolve o foco ao poster", async ({ page }) => {
    const poster = page.locator("button[aria-expanded]").first();
    await poster.click();
    await expect(page.locator('.pf-panel[data-state="open"]')).toHaveCount(1);

    await page.keyboard.press("Escape");
    await expect(page.locator('.pf-panel[data-state="open"]')).toHaveCount(0);
    await expect(poster).toBeFocused();
  });

  test("o painel só ocupa a altura permitida pelo design system", async ({ page }) => {
    await page.locator("button[aria-expanded]").first().click();
    const panel = page.locator('.pf-panel[data-state="open"]');
    await expect(panel).toBeVisible();

    const box = await panel.boundingBox();
    expect(box).not.toBeNull();
    // max-height do painel = 700px (spec §4): nada pode ser cortado.
    expect(box!.height).toBeLessThanOrEqual(700);
  });

  test("o modal de embed abre, prende o foco e fecha no ESC", async ({ page }) => {
    await page.locator("button[aria-expanded]").first().click();

    const track = page
      .locator('.pf-panel[data-state="open"] button:not([disabled])')
      .filter({ hasText: /YouTube|Spotify/ })
      .first();
    await track.click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute("aria-modal", "true");
    await expect(dialog.locator("iframe")).toHaveCount(1);

    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    // O ESC do modal não pode fechar o painel junto.
    await expect(page.locator('.pf-panel[data-state="open"]')).toHaveCount(1);
  });

  test("não há scroll horizontal na página", async ({ page }) => {
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(overflow).toBe(false);
  });

  test("o skip link aparece ao receber foco", async ({ page }) => {
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Pular para lista de programas" })).toBeFocused();
  });
});

test.describe("/portfolio/[slug]", () => {
  test("abre a página dedicada e navega pelas tabs com o teclado", async ({ page }) => {
    await page.goto("/portfolio/in-loco");

    await expect(page.getByRole("heading", { level: 1, name: "In Loco" })).toBeVisible();

    const tabs = page.getByRole("tab");
    await expect(tabs).toHaveCount(3);
    await expect(tabs.first()).toHaveAttribute("aria-selected", "true");

    await tabs.first().focus();
    await page.keyboard.press("ArrowRight");
    await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("tabpanel")).toContainText("Últimos episódios");
  });

  test("slug inexistente devolve 404", async ({ page }) => {
    const response = await page.goto("/portfolio/nao-existe");
    expect(response?.status()).toBe(404);
  });
});

test.describe("admin do catálogo", () => {
  test("/admin/portfolio exige login", async ({ page }) => {
    await page.goto("/admin/portfolio");
    await expect(page).toHaveURL(/\/login/);
  });
});

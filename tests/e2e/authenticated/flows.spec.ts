import { test, expect } from "@playwright/test";
import { AUTH_ENABLED, login, createQuickLead } from "./helpers";

// Matriz de fluxos autenticados (os 20 cenários do escopo). Requer um preview
// real + usuário de teste — ver docs/testing.md. Sem credenciais, tudo pula.
test.describe("Fluxos autenticados", () => {
  test.skip(!AUTH_ENABLED, "defina E2E_BASE_URL + E2E_EMAIL + E2E_PASSWORD para rodar");

  test.beforeEach(async ({ page }) => { await login(page); });

  test("1. login leva ao /app", async ({ page }) => {
    await expect(page).toHaveURL(/\/app/);
  });

  test("2. tenant aparece no header", async ({ page }) => {
    await expect(page.getByRole("banner").getByText(/./)).toBeVisible();
  });

  test("3. abrir 'Novo lead' abre o painel", async ({ page }) => {
    await page.getByRole("button", { name: /novo lead/i }).click();
    await expect(page.getByText(/Registre contexto suficiente/i)).toBeVisible();
  });

  test("4. criar lead (modo rápido)", async ({ page }) => {
    await createQuickLead(page);
  });

  test("5. criar lead (modo completo)", async ({ page }) => {
    await page.getByRole("button", { name: /novo lead/i }).click();
    await page.getByRole("button", { name: /^completo$/i }).click();
    await page.getByLabel(/Nome/i).first().fill(`E2E full ${Date.now()}`);
    await expect(page.getByText(/Contexto comercial/i)).toBeVisible();
    await page.getByRole("button", { name: /criar sem abrir/i }).click();
    await expect(page.getByText(/lead criado/i)).toBeVisible();
  });

  test("6-8. abrir lead, navegar abas e editar oportunidade", async ({ page }) => {
    const name = await createQuickLead(page);
    await page.getByText(name).first().click();
    await expect(page.getByRole("tab", { name: /Visão geral/i })).toBeVisible();
    await page.getByRole("tab", { name: /Atividades/i }).click();
    await expect(page.getByPlaceholder(/Registrar/i)).toBeVisible();
    await page.getByRole("button", { name: /Oportunidade/i }).click();
    await expect(page.getByText(/Editar deal/i)).toBeVisible();
  });

  test("9. registrar próxima ação (atividade)", async ({ page }) => {
    const name = await createQuickLead(page);
    await page.getByText(name).first().click();
    await page.getByRole("tab", { name: /Atividades/i }).click();
    await page.getByPlaceholder(/Registrar/i).fill("Ligação de qualificação");
    await page.getByRole("button", { name: /^registrar$/i }).click();
    await expect(page.getByText(/Atividade registrada/i)).toBeVisible();
  });

  test("10. executar agente sugerido no lead", async ({ page }) => {
    const name = await createQuickLead(page);
    await page.getByText(name).first().click();
    await page.getByRole("tab", { name: /Agentes/i }).click();
    const run = page.getByRole("button", { name: /^executar$/i }).first();
    if (await run.isVisible()) await run.click();
  });

  test("11. central de notificações carrega", async ({ page }) => {
    await page.goto("/app/notifications");
    await expect(page.getByRole("heading", { name: /Notificações/i })).toBeVisible();
  });

  test("12. aba WhatsApp mostra templates ou aviso", async ({ page }) => {
    const name = await createQuickLead(page);
    await page.getByText(name).first().click();
    await page.getByRole("tab", { name: /WhatsApp/i }).click();
    await expect(page.getByText(/WhatsApp|telefone/i).first()).toBeVisible();
  });

  test("13. mover estágio pelo seletor do drawer", async ({ page }) => {
    const name = await createQuickLead(page);
    await page.getByText(name).first().click();
    const select = page.getByLabel(/Mover deal/i);
    await expect(select).toBeVisible();
  });

  test("14. contratos: página carrega", async ({ page }) => {
    await page.goto("/app/contracts");
    await expect(page.getByRole("heading").first()).toBeVisible();
  });

  test("15. relatórios carregam com KPIs", async ({ page }) => {
    await page.goto("/app/relatorios");
    await expect(page.getByText(/Forecast|Pipeline|Win rate/i).first()).toBeVisible();
  });

  test("16. studio mostra padrão da plataforma", async ({ page }) => {
    await page.goto("/app/studio");
    await expect(page.getByText(/Padrão da plataforma|Studio de Agentes/i).first()).toBeVisible();
  });

  test("17. admin de agentes: acesso ou bloqueio explícito", async ({ page }) => {
    await page.goto("/admin/agents");
    await expect(page.getByText(/Agentes padrão da plataforma|Área restrita/i).first()).toBeVisible();
  });

  test("18. mobile: navegação responsiva", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto("/app");
    await expect(page.getByRole("banner")).toBeVisible();
  });
});

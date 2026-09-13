import { test, expect } from "@playwright/test";

// O site público é a vitrine do estúdio. CRM, portal e admin não podem ser
// indexados nem alcançáveis por link a partir dela.

const PRIVATE = ["/crm", "/app", "/admin", "/portal", "/login", "/api"];

test.describe("robots.txt", () => {
  test("é servido ao crawler anônimo (não redireciona para /login)", async ({ request }) => {
    const res = await request.get("/robots.txt", { maxRedirects: 0 });
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("text/plain");
  });

  test("bloqueia todas as áreas privadas e aponta o sitemap", async ({ request }) => {
    const body = await (await request.get("/robots.txt")).text();
    for (const path of PRIVATE) {
      expect(body).toContain(`Disallow: ${path}`);
    }
    expect(body).toMatch(/Sitemap: https?:\/\/\S+\/sitemap\.xml/);
  });
});

test.describe("sitemap.xml", () => {
  test("lista só a vitrine do estúdio", async ({ request }) => {
    const res = await request.get("/sitemap.xml", { maxRedirects: 0 });
    expect(res.status()).toBe(200);

    const xml = await res.text();
    expect(xml).toContain("/portfolio");
    for (const path of PRIVATE) {
      expect(xml).not.toContain(`${path}<`);
      expect(xml).not.toContain(`${path}/`);
    }
  });
});

test.describe("páginas públicas", () => {
  for (const path of ["/", "/portfolio"]) {
    test(`${path} é indexável e não cita o CRM`, async ({ page }) => {
      await page.goto(path);

      // Sem meta robots restritivo: a vitrine deve ser indexada.
      await expect(page.locator('meta[name="robots"]')).toHaveCount(0);

      // Nenhum texto nem link levando o visitante (ou o crawler) ao CRM.
      const html = await page.content();
      expect(html).not.toContain("CRM");
      await expect(page.locator('a[href^="/crm"], a[href^="/app"], a[href^="/admin"], a[href^="/portal"], a[href^="/login"]')).toHaveCount(0);
    });
  }
});

test.describe("áreas privadas", () => {
  for (const path of ["/crm", "/login", "/proposta/token-invalido", "/convite/token-invalido"]) {
    test(`${path} pede noindex`, async ({ page }) => {
      await page.goto(path);
      const content = await page.locator('meta[name="robots"]').first().getAttribute("content");
      expect(content).toContain("noindex");
      expect(content).toContain("nofollow");
    });
  }

  for (const path of ["/app", "/admin", "/portal"]) {
    test(`${path} sequer é servido a visitante anônimo`, async ({ request }) => {
      const res = await request.get(path, { maxRedirects: 0 });
      expect(res.status()).toBe(307);
      expect(res.headers().location).toContain("/login");
    });
  }
});

// robots.txt vale por HOST. No apex a vitrine é liberada; em qualquer
// subdomínio (crm., app.) a raiz É a área privada, então nada pode ser
// rastreado. Sem ROOT_DOMAIN configurado (dev/CI) tudo cai no caso do apex,
// por isso o teste do subdomínio só roda quando a raiz está definida.
test.describe("robots.txt por host", () => {
  test("no apex, libera a vitrine", async ({ request }) => {
    const body = await (await request.get("/robots.txt")).text();
    expect(body).toContain("Allow: /");
    expect(body).toContain("Disallow: /crm");
  });

  test("em subdomínio privado, bloqueia a raiz inteira", async ({ request, baseURL }) => {
    const root = process.env.NEXT_PUBLIC_ROOT_DOMAIN;
    test.skip(!root, "sem NEXT_PUBLIC_ROOT_DOMAIN o roteamento é por path");

    const res = await request.get("/robots.txt", { headers: { host: `crm.${root}` } });
    const body = await res.text();
    expect(body).toContain("Disallow: /");
    expect(body).not.toContain("Allow: /");
    expect(baseURL).toBeTruthy();
  });
});

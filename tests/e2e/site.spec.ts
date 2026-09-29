import { test, expect } from "@playwright/test";

// Landing pública da Reiners Media (apex). O portfólio está oculto — ver
// "Portfólio oculto" abaixo.
// Roda sem segredos: sem Supabase a página cai nos defaults de lib/site/content.

test.describe("Landing Reiners Media (/)", () => {
  test("hero, eyebrow e CTAs", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Reiners Media/i);
    await expect(
      page.getByRole("heading", { level: 1, name: /produção de nível internacional/i }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Ver planos" })).toBeVisible();
    // O CTA secundário padrão levava ao /portfolio, que está oculto: o hero
    // fica só com o CTA primário em vez de apontar para um 404.
    await expect(page.getByRole("link", { name: "Ouvir programas" })).toHaveCount(0);
  });

  test("todas as seções aparecem", async ({ page }) => {
    await page.goto("/");
    for (const heading of [
      /Diga o que você precisa gravar/i,
      /Escolha o formato ideal/i,
      /Um estúdio, vários cenários/i,
      /Por dentro de uma gravação/i,
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
    await dialog.getByRole("button", { name: /Enviar e continuar no WhatsApp/i }).click();

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

test.describe("WhatsApp como canal principal", () => {
  const NUMBER = "5565999207108";

  test("botão flutuante aponta para o wa.me do número configurado", async ({ page }) => {
    await page.goto("/");
    const fab = page.getByRole("link", { name: /Falar no WhatsApp/i });
    await expect(fab).toBeVisible();
    await expect(fab).toHaveAttribute("href", new RegExp(`^https://wa\\.me/${NUMBER}\\?text=`));
    await expect(fab).toHaveAttribute("rel", /noopener/);
  });

  test("rodapé mostra o número formatado e linka o WhatsApp", async ({ page }) => {
    await page.goto("/");
    const link = page.getByRole("contentinfo").getByText("+55 65 99920-7108");
    await expect(link).toBeVisible();
  });

  test("formulário enviado leva a conversa para o WhatsApp com os dados", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Agendar sessão gratuita" }).click();

    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Nome").fill("Ana Furtado");
    await dialog.getByLabel("E-mail").fill("ana@sicredi.com.br");
    await dialog.getByLabel("Sobre o projeto").fill("serie institucional mensal");
    await dialog.getByRole("button", { name: /Enviar e continuar no WhatsApp/i }).click();

    const cta = dialog.getByRole("link", { name: /Continuar no WhatsApp/i });
    await expect(cta).toBeVisible();

    const href = await cta.getAttribute("href");
    expect(href).toContain(`https://wa.me/${NUMBER}?text=`);
    const message = decodeURIComponent(href!.split("?text=")[1]);
    expect(message).toContain("Ana Furtado");
    expect(message).toContain("serie institucional mensal");
    expect(message).toContain("ana@sicredi.com.br");
  });
});

// Instagram (@reinersmedia) é o segundo canal de contato, depois do WhatsApp:
// ícone + @ no rodapé e uma linha na seção de contato.
test.describe("Instagram como canal de contato", () => {
  const HREF = "https://instagram.com/reinersmedia";

  test("rodapé: ícone da coluna Social aponta para o perfil e abre em outra aba", async ({ page }) => {
    await page.goto("/");
    const icon = page.getByRole("contentinfo").getByRole("link", { name: "Instagram", exact: true });
    await expect(icon).toBeVisible();
    await expect(icon).toHaveAttribute("href", HREF);
    await expect(icon).toHaveAttribute("target", "_blank");
    await expect(icon).toHaveAttribute("rel", /noopener/);
  });

  test("rodapé: o @reinersmedia aparece como texto, ao lado do número do WhatsApp", async ({ page }) => {
    await page.goto("/");
    const footer = page.getByRole("contentinfo");
    const handle = footer.getByRole("link", { name: /@reinersmedia/ });
    await expect(handle).toBeVisible();
    await expect(handle).toHaveAttribute("href", HREF);
    await expect(handle).toHaveAccessibleName("Instagram: @reinersmedia");

    // WhatsApp acima, Instagram logo abaixo — mesma coluna.
    const wa = await footer.getByText("+55 65 99920-7108").boundingBox();
    const ig = await handle.boundingBox();
    expect(ig!.y).toBeGreaterThan(wa!.y);
    expect(Math.abs(ig!.x - wa!.x)).toBeLessThan(4);
  });

  test("seção de contato: 'Prefere o Instagram?' leva ao mesmo perfil", async ({ page }) => {
    await page.goto("/");
    const contato = page.locator("#contato");
    await expect(contato.getByText("Prefere o Instagram?")).toBeVisible();
    const link = contato.getByRole("link", { name: /@reinersmedia/ });
    await expect(link).toHaveAttribute("href", HREF);
    await expect(link).toHaveAttribute("rel", /noopener/);
  });

  test("todos os alvos de toque têm ao menos 44px de altura", async ({ page }) => {
    await page.goto("/");
    for (const link of [
      page.getByRole("contentinfo").getByRole("link", { name: /@reinersmedia/ }),
      page.locator("#contato").getByRole("link", { name: /@reinersmedia/ }),
    ]) {
      const box = await link.boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }
  });
});

// O portfólio ainda não existe: sai do site inteiro de uma vez (landing, menu,
// rodapé, hero, rota e sitemap). O código continua no repositório e volta com
// PORTFOLIO_ENABLED (lib/site/features.ts).
test.describe("Portfólio oculto", () => {
  test("/portfolio responde 404", async ({ request }) => {
    const res = await request.get("/portfolio", { maxRedirects: 0 });
    expect(res.status()).toBe(404);
  });

  test("o 404 é a página da marca, em português e fora do índice", async ({ page }) => {
    const res = await page.goto("/portfolio");
    expect(res!.status()).toBe(404);
    await expect(page.getByRole("heading", { level: 1, name: "Página não encontrada" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Voltar ao início" })).toHaveAttribute("href", "/");
    await expect(page.getByRole("link", { name: "Reiners Media — início" })).toBeVisible();
    // Quem abre um link antigo não cai numa tela branca em inglês.
    await expect(page.getByText(/could not be found/i)).toHaveCount(0);
    // O Next marca as páginas 404 com noindex.
    await expect(page.locator('meta[name="robots"]').first()).toHaveAttribute("content", /noindex/);
  });

  test("a landing não tem a seção nem os programas de exemplo", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /Programas que criamos/i })).toHaveCount(0);
    await expect(page.locator("#portfolio-title")).toHaveCount(0);
    await expect(page.getByRole("link", { name: /Ver portfólio completo/i })).toHaveCount(0);
    // Os programas de exemplo citavam clientes reais; sem portfólio, nada disso vai ao ar.
    const html = await page.content();
    for (const nome of ["Conversas que Cooperam", "Sicredi MT", "Indústria em Pauta", "Domo Cast"]) {
      expect(html, nome).not.toContain(nome);
    }
  });

  test("nenhum link do site aponta para /portfolio (menu, hero, seções, rodapé)", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator('a[href*="/portfolio"]')).toHaveCount(0);
    await expect(page.getByRole("navigation", { name: "Principal" }).getByRole("link", { name: /programas|portf/i })).toHaveCount(0);
    await expect(page.getByRole("contentinfo").getByRole("link", { name: /programas|portf/i })).toHaveCount(0);
  });

  test("rodapé sem a coluna Programas: Navegar e Social, com a marca", async ({ page }) => {
    await page.goto("/");
    const footer = page.getByRole("contentinfo");
    await expect(footer.getByRole("navigation", { name: "Programas" })).toHaveCount(0);
    await expect(footer.getByRole("navigation", { name: "Rodapé" })).toBeVisible();
    await expect(footer.getByRole("heading", { name: "Social" })).toBeVisible();
  });

  test("/media também não tem o portfólio", async ({ page }) => {
    await page.goto("/media");
    await expect(page.locator('a[href*="/portfolio"]')).toHaveCount(0);
    await expect(page.getByRole("heading", { name: /Programas que criamos/i })).toHaveCount(0);
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

  test("o menu não lista Programas (portfólio oculto)", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Abrir menu" }).click();
    const drawer = page.getByRole("dialog", { name: "Menu de navegação" });
    for (const nome of ["O que fazemos", "Planos", "Sobre", "Contato"]) {
      await expect(drawer.getByRole("link", { name: nome })).toBeVisible();
    }
    await expect(drawer.getByRole("link", { name: /programas|portf/i })).toHaveCount(0);
  });
});

// Sem banco (que é como o E2E roda), não há depoimento nem convidado
// publicado. As duas seções de prova social somem — nenhuma promete conteúdo
// que não existe, e nenhum controle de carrossel fica órfão na página.
test.describe("prova social sem dados", () => {
  test("a seção de depoimentos não existe sem frase publicada", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /O que dizem sobre o estúdio/i })).toHaveCount(0);
    // O placeholder antigo não pode voltar: "em breve" ainda afirma que
    // existem clientes dizendo algo.
    await expect(page.getByText(/Depoimentos em breve/i)).toHaveCount(0);
  });

  test("nenhum carrossel de prova social órfão", async ({ page }) => {
    await page.goto("/");
    // Os carrosséis de fotos (cenários, bastidores) existem e podem ter botões;
    // o que não pode existir é o de depoimentos/convidados sem conteúdo.
    await expect(page.getByRole("list", { name: "Depoimentos sobre o estúdio" })).toHaveCount(0);
    await expect(page.getByRole("list", { name: "Convidados que gravaram no estúdio" })).toHaveCount(0);
  });
});

// A seção de convidados é prova social factual e não tem placeholder: sem
// ninguém publicado, ela não existe na página.
test.describe("convidados", () => {
  test("oculta enquanto não houver convidado publicado", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /Quem já gravou no estúdio/i })).toHaveCount(0);
  });
});

// "O que fazemos" é o padrão TABS da APG, não uma lista de links: uma parada
// de Tab para a lista inteira e as setas trocam de painel.
test.describe("o que fazemos", () => {
  test("as seis frentes são abas, com a primeira selecionada", async ({ page }) => {
    await page.goto("/");
    const tabs = page.getByRole("tab");
    await expect(tabs).toHaveCount(6);
    await expect(tabs.first()).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("tabpanel")).toHaveCount(1);
  });

  test("a seta troca o painel e o painel corresponde à aba", async ({ page }) => {
    await page.goto("/");
    const primeira = page.getByRole("tab", { name: /Podcast/ });
    await primeira.focus();
    await page.keyboard.press("ArrowDown");

    const segunda = page.getByRole("tab", { name: /Cobertura de evento/ });
    await expect(segunda).toHaveAttribute("aria-selected", "true");
    await expect(primeira).toHaveAttribute("aria-selected", "false");
    await expect(
      page.getByRole("tabpanel", { name: /Cobertura de evento/ }),
    ).toBeVisible();
  });

  test("a lista inteira ocupa uma parada de Tab (tabindex rotativo)", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("tab", { name: /Podcast/ })).toHaveAttribute("tabindex", "0");
    await expect(page.getByRole("tab", { name: /Projeto especial/ })).toHaveAttribute("tabindex", "-1");
  });

  test("sem vídeo nem imagem, nenhuma moldura vazia é desenhada", async ({ page }) => {
    await page.goto("/");
    const painel = page.getByRole("tabpanel");
    await expect(painel.locator("video")).toHaveCount(0);
    await expect(painel.locator("img")).toHaveCount(0);
    // O painel segue completo: título, descrição e fecho.
    await expect(painel.getByText(/entrega em 48h/i)).toBeVisible();
  });
});

// Identidade visual: o símbolo oficial em header, hero e rodapé, sempre com
// altura fixa e largura automática (nunca esticado), na versão certa para o
// fundo (navy no header claro, creme nas bandas escuras).
test.describe("marca: símbolo oficial", () => {
  const RATIO = 700 / 628;

  test("header: link para a home com aria-label, símbolo navy 32px e assinatura", async ({ page }) => {
    await page.goto("/");
    const home = page.locator("header").getByRole("link", { name: "Reiners Media — início" });
    await expect(home).toBeVisible();
    await expect(home).toHaveAttribute("href", "/");

    const img = home.locator("img");
    await expect(img).toHaveAttribute("alt", "");
    await expect(img).toHaveAttribute("src", "/brand/reinersmedia_symbol_navy.svg");
    const box = await img.boundingBox();
    expect(Math.round(box!.height)).toBe(32);
    expect(box!.width / box!.height).toBeCloseTo(RATIO, 1);

    await expect(home.getByText("Reiners")).toBeVisible();
    await expect(home.getByText("Media")).toBeVisible();
  });

  test("hero: símbolo creme de 40px acima do kicker", async ({ page }) => {
    await page.goto("/");
    const img = page.locator('main img[src="/brand/reinersmedia_symbol_creme.svg"]').first();
    await expect(img).toBeVisible();
    const box = await img.boundingBox();
    expect(Math.round(box!.height)).toBe(40);
    expect(box!.width / box!.height).toBeCloseTo(RATIO, 1);
  });

  test("rodapé: símbolo creme de 48px + assinatura, acima da frase do estúdio", async ({ page }) => {
    await page.goto("/");
    const footer = page.getByRole("contentinfo");
    const img = footer.locator('img[src="/brand/reinersmedia_symbol_creme.svg"]');
    const box = await img.boundingBox();
    expect(Math.round(box!.height)).toBe(48);
    await expect(footer.getByText("Media", { exact: true }).first()).toBeVisible();

    const tagline = await footer.getByText(/Estúdio de podcast premium em/).boundingBox();
    expect(box!.y + box!.height).toBeLessThanOrEqual(tagline!.y);
  });

  test("<head>: favicon svg/ico, apple-touch-icon, manifest e theme-color navy", async ({ page }) => {
    await page.goto("/");
    const href = (sel: string) => page.locator(sel).first().getAttribute("href");
    expect(await href('link[rel="icon"][type="image/svg+xml"]')).toBe("/favicon.svg");
    expect(await href('link[rel="icon"][sizes="any"]')).toBe("/favicon.ico");
    expect(await href('link[rel="apple-touch-icon"]')).toBe("/apple-touch-icon.png");
    expect(await href('link[rel="manifest"]')).toBe("/manifest.webmanifest");
    await expect(page.locator('meta[name="theme-color"]').first()).toHaveAttribute("content", "#14243E");
  });

  test("manifest, favicons e og.jpg respondem sem login", async ({ request }) => {
    for (const path of ["/manifest.webmanifest", "/favicon.svg", "/favicon.ico", "/apple-touch-icon.png", "/icon-192.png", "/icon-512.png", "/og.jpg"]) {
      const res = await request.get(path, { maxRedirects: 0 });
      expect(res.status(), path).toBe(200);
    }
    const manifest = await (await request.get("/manifest.webmanifest")).json();
    expect(manifest.theme_color).toBe("#14243E");
    expect(manifest.background_color).toBe("#14243E");
  });

  test("tablet (820px): header não estoura a largura da tela", async ({ page }) => {
    await page.setViewportSize({ width: 820, height: 1000 });
    await page.goto("/");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await expect(page.locator("header").getByRole("link", { name: "Reiners Media — início" })).toBeVisible();
  });
});

test.describe("marca: mobile", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("header mostra só o símbolo (28px), sem a assinatura", async ({ page }) => {
    await page.goto("/");
    const home = page.locator("header").getByRole("link", { name: "Reiners Media — início" });
    const box = await home.locator("img").boundingBox();
    expect(Math.round(box!.height)).toBe(28);
    await expect(home.getByText("Media")).toBeHidden();
  });
});

// Fotos reais do estúdio: cenários (com legenda), foto do Zura na seção Sobre
// e bastidores com clientes. Estáticas, versionadas em /public.
test.describe("fotos do estúdio", () => {
  test("cinco cenários com nome e descrição", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /Um estúdio, vários cenários/i })).toBeVisible();
    const section = page.locator("#cenarios");
    await expect(section.locator("figure")).toHaveCount(5);
    for (const nome of ["Puff", "Escritório", "Mesa de reunião", "Sofá", "Estante"]) {
      await expect(section.getByText(nome, { exact: false }).first()).toBeAttached();
    }
    for (const img of await section.locator("img").all()) {
      await expect(img).toHaveAttribute("alt", /Cenário/);
    }
  });

  test("bastidores: nove fotos com texto alternativo, a primeira é a claquete do Estúdio Zura", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /Por dentro de uma gravação/i })).toBeVisible();
    const imgs = page.locator("#bastidores img");
    await expect(imgs).toHaveCount(9);
    for (const img of await imgs.all()) {
      await expect(img).toHaveAttribute("alt", /^Bastidores:/);
    }
    await expect(imgs.first()).toHaveAttribute("src", "/estudio/zura-claquete.webp");
    await expect(imgs.first()).toHaveAttribute("alt", /Estúdio Zura/);
  });

  test("Sobre usa o retrato do estúdio por padrão, com texto alternativo próprio", async ({ page }) => {
    await page.goto("/");
    const img = page.locator("#sobre img").first();
    await expect(img).toHaveAttribute("src", "/estudio/sobre-retrato.webp");
    await expect(img).toHaveAttribute("alt", /cenário Puff/);
  });

  test("todas as fotos carregam (nenhuma imagem quebrada)", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(async () => {
      // As fotos são lazy: rola a página inteira para disparar o carregamento.
      for (let y = 0; y < document.body.scrollHeight; y += 600) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 60));
      }
    });
    await page.waitForLoadState("networkidle");
    const broken = await page.evaluate(() =>
      Array.from(document.images)
        .filter((i) => i.complete && i.naturalWidth === 0)
        .map((i) => i.getAttribute("src")),
    );
    expect(broken).toEqual([]);
  });
});

// Preços vigentes dos planos (defaults de lib/site/content — o E2E roda sem banco).
test.describe("planos", () => {
  test("Hora de Estúdio custa R$ 1.350 (2h) e o BTS explica a sigla", async ({ page }) => {
    await page.goto("/");
    const planos = page.locator("#planos");
    await expect(planos.getByText("R$ 1.350")).toBeVisible();
    await expect(planos.getByText("R$ 1.390")).toHaveCount(0);
    await expect(planos.getByText("2 horas de gravação", { exact: false }).first()).toBeVisible();
    await expect(planos.getByText("Build to Suit (BTS):")).toBeVisible();
  });
});

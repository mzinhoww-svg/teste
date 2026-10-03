// Hot leads da Explee na central: lead sem toques e já "respondeu", com o bloco da resposta e o Abrir e-mail.
const { test, after } = require("node:test");
const assert = require("node:assert");
const { abrir } = require("./harness.js");
const dados = require("./dados.js");

const abertos = [];
after(async () => { for (const h of abertos) await h.fechar(); });

const comExplee = () => dados.leads(7).concat([dados.explee(1)]);

async function abrirExplee(opts) {
  const h = await abrir(Object.assign({ largura: 1440, leads: comExplee() }, opts || {}));
  abertos.push(h);
  await h.page.emulateMedia({ reducedMotion: "reduce" });
  h.page.on("popup", (p) => p.close());
  await h.page.context().route(/wa\.me|mailto/, (r) => r.abort());
  // mailto não navega no teste: o clique segue o caminho normal, só a navegação é barrada
  await h.page.evaluate(() => document.addEventListener("click", (e) => {
    const a = e.target.closest && e.target.closest('a[href^="mailto:"]');
    if (a) { window.__mailto = a.getAttribute("href"); e.preventDefault(); }
  }));
  await h.page.waitForSelector("#fila [data-id]");
  return h;
}
const selecionadaId = (page) => page.getAttribute('#fila [aria-current="true"]', "data-id");

test("Explee: linha em Responderam com chip, sem pontos, e detalhe com a resposta antes de tudo", async () => {
  const h = await abrirExplee();
  const { page } = h;
  await page.click('#abas [data-grupo="respondeu"]');
  const linha = page.locator("#fila [data-id=X0001]");
  await linha.waitFor();
  assert.equal(await linha.locator(".chip.explee").innerText(), "Explee");
  assert.equal(await linha.locator(".pontos").count(), 0, "sem cadência, sem os três pontos");
  assert.match(await linha.locator(".quando").innerText(), /respondeu na Explee/);
  assert.match(await linha.locator(".sub").innerText(), /Yuri Araujo · Associações setoriais/);
  assert.equal(await linha.locator("a.enviar, button.copiar").count(), 0);
  await linha.locator(".nome").click();
  const d = page.locator("#detalhe");
  assert.equal(await d.locator(".cab .chip.explee").innerText(), "Explee");
  // logo depois do cabeçalho vem a resposta; não há bloco de toque
  const ordem = await page.evaluate(() => Array.from(document.querySelector("#detalhe article.lead").children).map((n) => n.className || n.tagName));
  assert.equal(ordem[0], "cab");
  assert.equal(ordem[1], "resposta-explee");
  assert.equal(await d.locator(".toque-atual").count(), 0);
  const bloco = d.locator("section.resposta-explee");
  assert.equal(await bloco.locator("h3").innerText(), "Resposta na Explee");
  const resp = bloco.locator("> p.resposta");
  assert.match(await resp.innerText(), /Tenho interesse\. Consegue me mandar o material/);
  assert.ok(!/escreveu/.test(await resp.innerText()), "a citação do e-mail fica no E-mail completo");
  assert.equal(await resp.evaluate((n) => getComputedStyle(n).whiteSpace), "pre-wrap");
  assert.match(await bloco.locator(".explee-meta").innerText(), /Yuri Araujo, Chief Executive Officer · campanha Associações setoriais · \d{2}\/\d{2} \d{2}:\d{2}/);
  await bloco.locator("summary").click();
  assert.match(await bloco.locator(".explee-completo .resposta").innerText(), /escreveu:/);
  // Resultado: sem cadência não há "Voltar para a cadência"
  const res = await d.locator(".resultado button").allInnerTexts();
  assert.deepEqual(res, ["Fechou negócio", "Pediu para sair"]);
  // sem caixa dentro de caixa e sem faixa lateral
  const css = await bloco.evaluate((n) => { const c = getComputedStyle(n); return [c.borderLeftWidth, c.borderStyle, n.closest(".card") ? "card" : ""]; });
  assert.deepEqual(css, ["0px", "none", ""]);
  assert.deepEqual(h.erros.map(String), []);
});

test("Explee: Abrir e-mail é o primário, mailto simples com Re: e corpo vazio, e não grava nada", async () => {
  const h = await abrirExplee();
  const { page } = h;
  await page.click('#abas [data-grupo="respondeu"]');
  await page.click("#fila [data-id=X0001] .nome");
  const a = page.locator("#acao-email-X0001");
  assert.equal(await a.innerText(), "Abrir e-mail");
  assert.match(await a.getAttribute("class"), /\bprincipal\b/);
  assert.equal(await page.locator("#detalhe .btn.principal").count(), 1, "um primário só no topo do detalhe");
  const href = await a.getAttribute("href");
  assert.equal(href, "mailto:" + encodeURIComponent("yuri1@associacao.example") + "?subject=" + encodeURIComponent("Re: Associação Modelo 1") + "&body=");
  await a.click();
  assert.equal(await page.evaluate(() => window.__mailto), href);
  // a linha selecionada também leva o Abrir e-mail cheio
  assert.match(await page.getAttribute("#fila [data-id=X0001] a.abrir-email", "class"), /principal/);
  await page.click("#fila [data-id=X0001] a.abrir-email");
  await page.waitForTimeout(200);
  assert.deepEqual(await h.escritas.lista(), [], "abrir o e-mail não marca nada");
  assert.equal(await page.locator("#toast").innerText(), "");
  assert.deepEqual(h.erros.map(String), []);
});

test("Explee: aba Cadência diz que não há cadência; Histórico mostra a resposta", async () => {
  const h = await abrirExplee();
  const { page } = h;
  await page.click('#abas [data-grupo="respondeu"]');
  await page.click("#fila [data-id=X0001] .nome");
  await page.click('#detalhe [role=tab]:has-text("Cadência")');
  const painel = await page.locator("#painel-detalhe").innerText();
  assert.match(painel, /Sem cadência: veio da Explee já respondendo/);
  assert.ok(!/Toque 1|Mensagem não semeada|undefined/.test(painel), painel);
  assert.equal(await page.locator("#painel-detalhe .passos").count(), 0);
  await page.click('#detalhe [role=tab]:has-text("Histórico")');
  const li = page.locator("#painel-detalhe .tempo li.explee");
  assert.equal(await li.count(), 1);
  assert.match(await li.innerText(), /Respondeu na Explee \(campanha Associações setoriais\)/);
  await page.click('#detalhe [role=tab]:has-text("Perfil")');
  assert.match(await page.locator("#painel-detalhe").innerText(), /Responder pelo e-mail da Explee ou ligar/);
  assert.deepEqual(h.erros.map(String), []);
});

test("Explee: Enter e c não fazem nada nocivo num lead sem mensagem", async () => {
  const h = await abrirExplee();
  const { page } = h;
  await page.click('#abas [data-grupo="respondeu"]');
  await page.click("#fila [data-id=X0001] .nome");
  await page.focus("#fila [data-id=X0001]");
  assert.equal(await selecionadaId(page), "X0001");
  for (const tecla of ["Enter", "c"]) {
    await page.keyboard.press(tecla);
    await page.waitForTimeout(150);
  }
  // também com o foco fora da fila (corpo da página)
  await page.evaluate(() => document.activeElement.blur());
  await page.keyboard.press("Enter");
  await page.keyboard.press("c");
  await page.waitForTimeout(200);
  assert.deepEqual(await h.escritas.lista(), []);
  assert.equal(await page.evaluate(() => window.__mailto || null), null, "Enter não abre o e-mail sozinho");
  assert.equal(await page.locator("#toast").innerText(), "");
  // j/k passam pela linha e voltam sem erro; r leva ao Resultado
  await page.keyboard.press("k");
  await page.keyboard.press("j");
  await page.keyboard.press("r");
  assert.equal(await page.evaluate(() => document.activeElement.textContent), "Fechou negócio");
  assert.deepEqual(h.erros.map(String), []);
});

test("Explee: lead em cadência que respondeu na Explee mantém o Enviar, mas o primário é Abrir e-mail", async () => {
  const base = dados.leads(3);
  const x = dados.explee(1).data.explee;
  base[1].data.explee = Object.assign({}, x, { email: "ana1@modelo.example" });  // R0001: casou por domínio
  const h = await abrirExplee({ leads: base });
  const { page } = h;
  await page.click('#abas [data-grupo="hoje"]');
  await page.click("#fila [data-id=R0001] .nome");
  assert.match(await page.getAttribute("#acao-email-R0001", "class"), /principal/);
  assert.ok(!/principal/.test(await page.getAttribute("#acao-enviar-R0001", "class")));
  assert.equal(await page.locator("#detalhe .toque-atual").count(), 1, "o toque da cadência continua lá");
  assert.equal(await page.locator("#fila [data-id=R0001] .pontos").count(), 1);
  assert.equal(await page.locator("#fila [data-id=R0001] .chip.explee").count(), 1);
  assert.deepEqual(h.erros.map(String), []);
});

test("Explee: funil Leads mostra o chip na tabela e o filtro de segmento agrupa pela campanha", async () => {
  const h = await abrirExplee();
  const { page } = h;
  await page.click("#f-ld");
  await page.waitForSelector("#fila table");
  assert.equal(await page.locator("#fila tr[data-id=X0001] .chip.explee").innerText(), "Explee");
  await page.selectOption("#f-ld-segmento", "Associações setoriais");
  assert.deepEqual(await page.evaluate(() => Array.from(document.querySelectorAll("#fila tr[data-id]")).map((n) => n.dataset.id)), ["X0001"]);
  await page.click("#fila tr[data-id=X0001] th");
  assert.equal(await page.locator("#detalhe section.resposta-explee").count(), 1);
  assert.equal(await page.locator("#detalhe .resultado").count(), 0);
  assert.deepEqual(h.erros.map(String), []);
});

test("Explee: 390px com alvos de 44px, texto ≥12px e sem rolagem lateral", async () => {
  const h = await abrirExplee({ largura: 390, altura: 844 });
  const { page } = h;
  await page.click('#abas [data-grupo="respondeu"]');
  const medir = () => page.evaluate(() => {
    const ruins = [], pequenos = [];
    document.querySelectorAll("button, a.btn, select, input:not([type=hidden]), textarea, summary, [role=tab], .linha, tr[data-id]").forEach((n) => {
      const r = n.getBoundingClientRect();
      if (r.width === 0 || r.height === 0 || getComputedStyle(n).visibility === "hidden" || n.closest("[hidden]")) return;
      if (r.height < 43.5) ruins.push((n.id || n.className || n.tagName) + " h=" + r.height);
    });
    document.querySelectorAll("#detalhe *, #fila *").forEach((e) => {
      const tem = Array.from(e.childNodes).some((x) => x.nodeType === 3 && x.textContent.trim());
      const r = e.getBoundingClientRect();
      if (tem && r.width > 0 && parseFloat(getComputedStyle(e).fontSize) < 12) pequenos.push(e.tagName + "." + e.className);
    });
    return { ruins, pequenos, lateral: document.documentElement.scrollWidth > document.documentElement.clientWidth };
  });
  assert.deepEqual(await medir(), { ruins: [], pequenos: [], lateral: false }, "fila");
  await page.click("#fila [data-id=X0001] .nome");
  await page.waitForSelector("#detalhe.aberto");
  await page.click("#detalhe section.resposta-explee summary");
  assert.deepEqual(await medir(), { ruins: [], pequenos: [], lateral: false }, "detalhe");
  for (const aba of ["Cadência", "Histórico"]) {
    await page.click('#detalhe [role=tab]:has-text("' + aba + '")');
    assert.deepEqual(await medir(), { ruins: [], pequenos: [], lateral: false }, aba);
  }
  assert.deepEqual(h.erros.map(String), []);
});

test("Explee: o chip e o título da resposta têm contraste ≥4,5:1 nos dois temas", async () => {
  for (const tema of ["claro", "escuro"]) {
    const h = await abrirExplee({ tema });
    await h.page.click('#abas [data-grupo="respondeu"]');
    await h.page.click("#fila [data-id=X0001] .nome");
    const razoes = await h.page.evaluate(() => {
      const lum = (cor) => {
        const [r, g, b] = cor.match(/[\d.]+/g).slice(0, 3).map((v) => { v = Number(v) / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      };
      const fundo = (n) => { while (n) { const c = getComputedStyle(n).backgroundColor; if (!/rgba\(0, 0, 0, 0\)|transparent/.test(c)) return c; n = n.parentElement; } return "rgb(255,255,255)"; };
      return ["#detalhe .cab .chip.explee", "#detalhe section.resposta-explee h3", "#detalhe section.resposta-explee .resposta", "#detalhe .explee-meta"].map((s) => {
        const n = document.querySelector(s), a = lum(getComputedStyle(n).color), b = lum(fundo(n));
        return [s, (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)];
      });
    });
    for (const [s, r] of razoes) assert.ok(r >= 4.5, tema + " " + s + ": " + r.toFixed(2));
  }
});

test("Explee: só o #toast é região aria-live", async () => {
  const h = await abrirExplee();
  await h.page.click('#abas [data-grupo="respondeu"]');
  await h.page.click("#fila [data-id=X0001] .nome");
  const vivos = await h.page.evaluate(() => Array.from(document.querySelectorAll("[aria-live], [role=status], [role=alert]:not([hidden])")).map((n) => n.id));
  assert.deepEqual(vivos, ["toast"]);
});

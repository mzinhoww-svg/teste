const { test, after } = require("node:test");
const assert = require("node:assert");
const { abrir } = require("./harness.js");

const abertos = [];
after(async () => { for (const h of abertos) await h.fechar(); });

test("carrega a fila com os leads e sem erro de script", async () => {
  const h = await abrir({ largura: 1440, leads: require("./dados.js").leads(7) });
  abertos.push(h);
  await h.page.waitForSelector("#fila [data-id]");
  await h.page.click('#abas [data-grupo="todos"]'); // a aba padrão só mostra o que vence hoje
  const n = await h.page.locator("#fila [data-id]").count();
  assert.equal(n, 8);
  assert.deepEqual(h.erros.map(String), []);
});

const caixa = (page, sel) => page.evaluate((s) => {
  const e = document.querySelector(s);
  if (!e) return null;
  const r = e.getBoundingClientRect();
  const cs = getComputedStyle(e);
  return { x: r.x, y: r.y, w: r.width, h: r.height, visivel: cs.display !== "none" && r.width > 0 && r.height > 0 };
}, sel);
const semRolagemLateral = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

test("1440px: trilho, fila e detalhe lado a lado", async () => {
  const h = await abrir({ largura: 1440 });
  abertos.push(h);
  await h.page.waitForSelector("#fila [data-id]");
  const [t, f, d, c] = await Promise.all([".trilho", "#fila", "#detalhe", ".central"].map((s) => caixa(h.page, s)));
  assert.ok(t.visivel && f.visivel && d.visivel, "as três caixas visíveis");
  assert.ok(Math.abs(t.w - 240) <= 1, "trilho 240px, veio " + t.w);
  assert.ok(f.w <= 420.5 && f.w >= 340, "fila entre 340 e 420, veio " + f.w);
  assert.ok(t.x < f.x && f.x < d.x, "lado a lado");
  assert.ok(c.w <= 1600);
  assert.ok(await semRolagemLateral(h.page));
  assert.equal(await h.page.evaluate(() => document.body.dataset.layout), "tres");
  assert.match(await h.page.locator("#detalhe").innerText(), /Selecione um lead na fila/);
});

test("1100px: trilho vira barra no topo, fila e detalhe lado a lado", async () => {
  const h = await abrir({ largura: 1100 });
  abertos.push(h);
  await h.page.waitForSelector("#fila [data-id]");
  const [t, f, d] = await Promise.all([".trilho", "#fila", "#detalhe"].map((s) => caixa(h.page, s)));
  assert.ok(t.visivel && f.visivel && d.visivel);
  assert.ok(t.y + t.h <= f.y + 1 && t.w > 900, "trilho em barra no topo");
  assert.ok(f.x < d.x);
  assert.ok(await semRolagemLateral(h.page));
  assert.equal(await h.page.evaluate(() => document.body.dataset.layout), "dois");
});

test("390px: uma coluna, topo fixo ≤120px, sem rolagem lateral", async () => {
  const h = await abrir({ largura: 390, altura: 844 });
  abertos.push(h);
  await h.page.waitForSelector("#fila [data-id]");
  assert.ok(await semRolagemLateral(h.page));
  assert.equal(await h.page.evaluate(() => document.body.dataset.layout), "uma");
  assert.equal((await caixa(h.page, "#detalhe")).visivel, false);
  await h.page.evaluate(() => window.scrollTo(0, 600));
  const fixo = await caixa(h.page, ".fixo");
  assert.ok(fixo.y <= 1 && fixo.h <= 120, "topo fixo colado e ≤120px, veio y=" + fixo.y + " h=" + fixo.h);
  assert.match(await h.page.locator(".linha-meta").innerText(), /^\d+\/20 toques · \d+ para hoje$/);
  const f = await caixa(h.page, "#fila");
  assert.ok(f.w <= 390);
});

test("nenhum texto visível abaixo de 12px", async () => {
  for (const largura of [1440, 390]) {
    const h = await abrir({ largura });
    abertos.push(h);
    await h.page.waitForSelector("#fila [data-id]");
    await h.page.click('#abas [data-grupo="todos"]');
    const pequenos = await h.page.evaluate(() => {
      const ruins = [];
      document.querySelectorAll("body *").forEach((e) => {
        if (e.closest("#atalhos[hidden]")) return;
        const tem = Array.from(e.childNodes).some((n) => n.nodeType === 3 && n.textContent.trim());
        if (!tem) return;
        const r = e.getBoundingClientRect();
        const cs = getComputedStyle(e);
        if (cs.display === "none" || cs.visibility === "hidden" || (r.width === 0 && r.height === 0)) return;
        if (parseFloat(cs.fontSize) < 12) ruins.push(e.tagName + "." + e.className + " " + cs.fontSize);
      });
      return ruins;
    });
    assert.deepEqual(pequenos, [], "largura " + largura);
  }
});

test("borda de campo com contraste ≥3:1 nos dois temas", async () => {
  for (const tema of ["claro", "escuro"]) {
    const h = await abrir({ largura: 1440, tema });
    abertos.push(h);
    const razao = await h.page.evaluate(() => {
      const cs = getComputedStyle(document.documentElement);
      const lum = (cor) => {
        const c = document.createElement("i"); c.style.color = cor; document.body.appendChild(c);
        const [r, g, b] = getComputedStyle(c).color.match(/[\d.]+/g).slice(0, 3).map((v) => {
          v = Number(v) / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
        });
        c.remove(); return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      };
      if (!cs.getPropertyValue("--borda-campo").trim()) return 0;
      const a = lum(cs.getPropertyValue("--borda-campo").trim()), b = lum(cs.getPropertyValue("--papel").trim());
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    });
    assert.ok(razao >= 3, tema + ": " + razao.toFixed(2));
  }
});

test("nenhum elemento com opacity < 1 em estado apagado", async () => {
  const h = await abrir({ largura: 1440 });
  abertos.push(h);
  await h.page.waitForSelector("#fila [data-id]");
  await h.page.click('#abas [data-grupo="todos"]');
  const r = await h.page.evaluate(() => {
    const apagados = document.querySelectorAll(".card.apagado");
    const ops = [];
    apagados.forEach((c) => [c].concat(Array.from(c.querySelectorAll("*"))).forEach((e) => { if (Number(getComputedStyle(e).opacity) < 1) ops.push(e.tagName + "." + e.className); }));
    document.querySelectorAll(".btn:disabled, .btn[aria-disabled=true]").forEach((e) => { if (Number(getComputedStyle(e).opacity) < 1) ops.push("btn"); });
    return { n: apagados.length, ops, rotulo: apagados[0] && apagados[0].innerText };
  });
  assert.ok(r.n >= 1, "há ao menos um card apagado");
  assert.deepEqual(r.ops, []);
  assert.match(r.rotulo, /Saiu|Sem resposta/);
});

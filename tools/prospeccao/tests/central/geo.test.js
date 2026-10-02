// Filtros de país, estado e cidade nos funis Aquecimento, Leads e Base, e o Cidade/UF nas linhas.
const { test, after } = require("node:test");
const assert = require("node:assert");
const { abrir } = require("./harness.js");
const dados = require("./dados.js");

const abertos = [];
after(async () => { for (const h of abertos) await h.fechar(); });

// R0001..R0007 do dados.leads (a cidade do perfil, que o lead R traz, fica de fora dos dados): Cuiabá/MT (1, 2), Sinop/MT (3), Campinas/SP (4), só SP (5), Portugal (6), sem nada (7).
const GEO = {
  R0001: { pais: "Brasil", uf: "MT", cidade: "Cuiabá" }, R0002: { pais: "Brasil", uf: "MT", cidade: "Cuiabá" },
  R0003: { pais: "Brasil", uf: "MT", cidade: "Sinop" }, R0004: { pais: "Brasil", uf: "SP", cidade: "Campinas" },
  R0005: { pais: "Brasil", uf: "SP" }, R0006: { pais: "Portugal" }, R0007: {}
};
function leadsComGeo() {
  return dados.leads(7).map((d) => {
    if (d.id === "TESTE") return d;
    const g = GEO[d.id];
    // o lead R traz a cidade no perfil (Cuiabá) e a linha cai nela sem cidade própria: aqui só vale a que o teste dá
    const data = Object.assign({}, d.data, g, { perfil: Object.assign({}, d.data.perfil, { cidade: "" }) });
    return { id: d.id, data };
  });
}
const BASE_GEO = ["Cuiabá/MT", "Cuiabá/MT", "Sinop/MT", "Campinas/SP", "SP", "Portugal", ""];
const GEOS_BASE = [
  { pais: "Brasil", uf: "MT", cidade: "Cuiabá" }, { pais: "Brasil", uf: "MT", cidade: "Sinop" },
  { pais: "Brasil", uf: "SP", cidade: "Campinas" }, { pais: "Brasil", uf: "SP", cidade: "" },
  { pais: "Portugal", uf: "", cidade: "" }, { pais: "", uf: "", cidade: "" }
];

const ids = (page) => page.evaluate(() => Array.from(document.querySelectorAll("#fila [data-id]")).map((x) => x.dataset.id).filter((i) => i !== "TESTE"));
const opcoes = (page, id) => page.evaluate((i) => Array.from(document.getElementById(i).options).map((o) => o.textContent), id);

async function abrirAq(opts) {
  const h = await abrir(Object.assign({ largura: 1440, leads: leadsComGeo() }, opts || {}));
  abertos.push(h);
  await h.page.waitForSelector("#fila [data-id]");
  await h.page.click('#abas [data-grupo="todos"]');
  return h;
}

test("Aquecimento: País, Estado e Cidade ao lado de Segmento, Faixa e Canal, feitos com os valores presentes", async () => {
  const h = await abrirAq();
  const { page } = h;
  assert.deepEqual(await page.evaluate(() => Array.from(document.querySelectorAll("#sel-aq label")).map((l) => l.firstChild.textContent)),
    ["Segmento", "Faixa", "Canal", "País", "Estado", "Cidade"]);
  assert.deepEqual(await opcoes(page, "f-pais"), ["Todos", "Brasil", "Portugal", "Sem informação"]);
  assert.deepEqual(await opcoes(page, "f-uf"), ["Todos", "MT", "SP", "Sem informação"]);
  assert.deepEqual(await opcoes(page, "f-cidade"), ["Todas", "Campinas", "Cuiabá", "Sinop", "Sem informação"]);
  assert.deepEqual(h.erros.map(String), []);
});

test("Aquecimento: filtra por estado e por cidade; a lista de cidades acompanha o estado", async () => {
  const h = await abrirAq();
  const { page } = h;
  assert.equal((await ids(page)).length, 7);
  await page.selectOption("#f-uf", "MT");
  assert.deepEqual((await ids(page)).sort(), ["R0001", "R0002", "R0003"]);
  assert.deepEqual(await opcoes(page, "f-cidade"), ["Todas", "Cuiabá", "Sinop"], "só as cidades de MT, e MT não tem cidade vazia");
  await page.selectOption("#f-cidade", "Sinop");
  assert.deepEqual(await ids(page), ["R0003"]);
  // trocar de estado derruba a cidade que não existe mais ali
  await page.selectOption("#f-uf", "SP");
  assert.equal(await page.inputValue("#f-cidade"), "", "Sinop não é de SP: volta para Todas");
  assert.deepEqual((await ids(page)).sort(), ["R0004", "R0005"]);
  assert.deepEqual(await opcoes(page, "f-cidade"), ["Todas", "Campinas", "Sem informação"]);
  await page.selectOption("#f-cidade", "Campinas");
  assert.deepEqual(await ids(page), ["R0004"]);
  assert.deepEqual(h.erros.map(String), []);
});

test("Aquecimento: Sem informação, por país e por estado", async () => {
  const h = await abrirAq();
  const { page } = h;
  await page.selectOption("#f-uf", "__sem");
  assert.deepEqual((await ids(page)).sort(), ["R0006", "R0007"]);
  await page.selectOption("#f-uf", "");
  await page.selectOption("#f-pais", "Portugal");
  assert.deepEqual(await ids(page), ["R0006"]);
  assert.deepEqual(await opcoes(page, "f-uf"), ["Todos", "Sem informação"], "o estado só mostra o que cabe no país");
  await page.selectOption("#f-pais", "__sem");
  assert.deepEqual(await ids(page), ["R0007"]);
  await page.selectOption("#f-pais", "Brasil");
  await page.selectOption("#f-uf", "SP");
  await page.selectOption("#f-cidade", "__sem");
  assert.deepEqual(await ids(page), ["R0005"]);
});

test("Aquecimento: o botão Filtros conta os três; a linha mostra Cidade/UF; a busca acha cidade e sigla", async () => {
  const h = await abrirAq({ largura: 1100 });
  const { page } = h;
  await page.click("#btn-filtros");
  await page.selectOption("#f-pais", "Brasil");
  await page.selectOption("#f-uf", "MT");
  await page.selectOption("#f-cidade", "Cuiabá");
  assert.equal(await page.locator("#btn-filtros").innerText(), "Filtros · 3");
  assert.deepEqual((await ids(page)).sort(), ["R0001", "R0002"]);
  assert.match(await page.locator('#fila [data-id="R0001"] .sub').innerText(), /Cuiabá\/MT/);
  await page.selectOption("#f-pais", "");
  await page.selectOption("#f-uf", "");
  await page.selectOption("#f-cidade", "");
  assert.equal(await page.locator("#btn-filtros").innerText(), "Filtros");
  assert.match(await page.locator('#fila [data-id="R0004"] .sub').innerText(), /Campinas\/SP/);
  assert.match(await page.locator('#fila [data-id="R0005"] .sub').innerText(), /SP$/);
  assert.match(await page.locator('#fila [data-id="R0006"] .sub').innerText(), /Portugal$/);
  await page.fill("#f-busca", "campinas");
  await page.waitForFunction(() => document.querySelectorAll("#fila [data-id]").length === 1);
  assert.deepEqual(await ids(page), ["R0004"]);
  await page.fill("#f-busca", "sp");
  await page.waitForFunction(() => document.querySelectorAll("#fila [data-id]").length === 2);
  assert.deepEqual((await ids(page)).sort(), ["R0004", "R0005"]);
  assert.equal(await page.locator("#btn-filtros").innerText(), "Filtros · 1");
  assert.deepEqual(h.erros.map(String), []);
});

test("Aquecimento: trocar o país derruba o estado que não cabe nele", async () => {
  const h = await abrirAq();
  const { page } = h;
  await page.selectOption("#f-uf", "SP");
  await page.selectOption("#f-pais", "Portugal");
  assert.equal(await page.inputValue("#f-uf"), "", "SP não existe em Portugal");
  assert.deepEqual(await ids(page), ["R0006"]);
});

test("Leads: os mesmos três filtros, dependentes, com Sem informação e Cidade/UF na linha", async () => {
  const h = await abrirAq({ largura: 1440 });
  const { page } = h;
  await page.click("#f-ld");
  await page.waitForSelector("#fila table tbody tr[data-id]");
  assert.deepEqual(await page.evaluate(() => Array.from(document.querySelectorAll("#sel-ld label")).map((l) => l.firstChild.textContent)),
    ["Segmento", "País", "Estado", "Cidade"]);
  assert.deepEqual(await opcoes(page, "f-ld-uf"), ["Todos", "MT", "SP", "Sem informação"]);
  await page.selectOption("#f-ld-uf", "MT");
  assert.deepEqual((await ids(page)).sort(), ["R0001", "R0002", "R0003"]);
  assert.deepEqual(await opcoes(page, "f-ld-cidade"), ["Todas", "Cuiabá", "Sinop"]);
  await page.selectOption("#f-ld-cidade", "Cuiabá");
  assert.deepEqual((await ids(page)).sort(), ["R0001", "R0002"]);
  assert.match(await page.locator('#fila tr[data-id="R0001"] th').innerText(), /Cuiabá\/MT/);
  assert.equal(await page.locator("#btn-filtros-rot").innerText(), "Filtros · 2");
  await page.selectOption("#f-ld-uf", "__sem");
  assert.deepEqual((await ids(page)).sort(), ["R0006", "R0007"]);
  // o filtro do Aquecimento não é o do Leads
  await page.click("#f-aq");
  assert.equal(await page.inputValue("#f-uf"), "");
  assert.deepEqual(h.erros.map(String), []);
});

test("Leads a 390px: linha com Cidade/UF, filtros no painel e sem rolagem lateral", async () => {
  const h = await abrirAq({ largura: 390, altura: 844 });
  const { page } = h;
  await page.click("#f-ld");
  await page.waitForSelector("#fila .linha[data-id]");
  assert.match(await page.locator('#fila [data-id="R0003"] .sub').innerText(), /Sinop\/MT/);
  await page.click("#btn-filtros");
  await page.selectOption("#f-ld-uf", "SP");
  assert.deepEqual((await ids(page)).sort(), ["R0004", "R0005"]);
  const r = await page.evaluate(() => ({
    lateral: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    baixos: Array.from(document.querySelectorAll("#sel-ld select")).filter((s) => s.getBoundingClientRect().height < 43.5).map((s) => s.id)
  }));
  assert.deepEqual(r, { lateral: false, baixos: [] });
});

// ---------- Base ----------
const baseComGeo = (n) => dados.empresasBase(n, (i) => Object.assign({}, GEOS_BASE[i % GEOS_BASE.length]));
async function abrirBase(opts) {
  const h = await abrir(Object.assign({ largura: 1440, base: baseComGeo(60) }, opts || {}));
  abertos.push(h);
  await h.page.waitForSelector("#fila [data-id]");
  await h.page.click("#f-bs");
  await h.page.waitForSelector("#fila .bs-lista [data-id]");
  return h;
}
const idsBase = (page) => page.evaluate(() => Array.from(document.querySelectorAll("#fila .bs-lista [data-id]")).map((x) => x.dataset.id));
const esperadoBase = (pred) => dados.empresasBase(60, (i) => GEOS_BASE[i % GEOS_BASE.length]).filter((d, i) => pred(GEOS_BASE[i % GEOS_BASE.length])).map((d) => d.id).sort();

test("Base: País, Estado e Cidade filtram, dependem um do outro e têm Sem informação", async () => {
  const h = await abrirBase();
  const { page } = h;
  assert.deepEqual(await page.evaluate(() => Array.from(document.querySelectorAll("#sel-bs label")).map((l) => l.firstChild.textContent)),
    ["Segmento", "Faixa", "Quem decide", "Contato da empresa", "País", "Estado", "Cidade"]);
  assert.deepEqual(await opcoes(page, "f-bs-pais"), ["Todos", "Brasil", "Portugal", "Sem informação"]);
  assert.deepEqual(await opcoes(page, "f-bs-uf"), ["Todos", "MT", "SP", "Sem informação"]);
  await page.selectOption("#f-bs-uf", "MT");
  assert.deepEqual((await idsBase(page)).sort(), esperadoBase((g) => g.uf === "MT"));
  assert.deepEqual(await opcoes(page, "f-bs-cidade"), ["Todas", "Cuiabá", "Sinop"]);
  await page.selectOption("#f-bs-cidade", "Sinop");
  assert.deepEqual((await idsBase(page)).sort(), esperadoBase((g) => g.cidade === "Sinop"));
  await page.selectOption("#f-bs-uf", "SP");
  assert.equal(await page.inputValue("#f-bs-cidade"), "");
  assert.deepEqual(await opcoes(page, "f-bs-cidade"), ["Todas", "Campinas", "Sem informação"]);
  await page.selectOption("#f-bs-cidade", "__sem");
  assert.deepEqual((await idsBase(page)).sort(), esperadoBase((g) => g.uf === "SP" && !g.cidade));
  await page.selectOption("#f-bs-uf", "__sem");
  assert.deepEqual((await idsBase(page)).sort(), esperadoBase((g) => !g.uf));
  assert.equal(await page.inputValue("#f-bs-cidade"), "__sem", "Sem informação de cidade continua valendo: quem não tem estado também não tem cidade");
  assert.equal(await page.locator("#btn-filtros-rot").innerText(), "Filtros · 2");
  assert.deepEqual(h.erros.map(String), []);
});

test("Base: Cidade/UF na linha, busca por cidade e por UF, e o lote só leva os filtrados", async () => {
  const h = await abrirBase();
  const { page } = h;
  const linha = page.locator('#fila tr[data-id="D10001"]');  // i=0: Cuiabá/MT
  assert.match(await linha.locator("th").innerText(), /Cuiabá\/MT/);
  await page.fill("#f-busca", "campinas");
  await page.waitForFunction(() => document.querySelectorAll("#fila .bs-lista [data-id]").length === 10);
  assert.deepEqual((await idsBase(page)).sort(), esperadoBase((g) => g.cidade === "Campinas"));
  await page.fill("#f-busca", "mt");
  await page.waitForFunction(() => document.querySelectorAll("#fila .bs-lista [data-id]").length === 20);
  assert.deepEqual((await idsBase(page)).sort(), esperadoBase((g) => g.uf === "MT"));
  await page.fill("#f-busca", "");
  await page.selectOption("#f-bs-pais", "Portugal");
  await page.waitForFunction(() => document.querySelectorAll("#fila .bs-lista [data-id]").length === 10);
  assert.match(await page.locator("#bs-lote-btn").innerText(), /\(10\)$/, "o botão dos filtrados conta só o recorte");
});

test("Base a 390px: linha com Cidade/UF, filtros com alvo de 44px, texto ≥12px e sem rolagem lateral", async () => {
  const h = await abrirBase({ largura: 390, altura: 844 });
  const { page } = h;
  assert.match(await page.locator('#fila [data-id="D10002"] .sub').first().innerText(), /Sinop\/MT/);
  await page.click("#btn-filtros");
  await page.selectOption("#f-bs-uf", "MT");
  const r = await page.evaluate(() => {
    const baixos = [], pequenos = [];
    document.querySelectorAll("#sel-bs select").forEach((n) => { if (n.getBoundingClientRect().height < 43.5) baixos.push(n.id); });
    document.querySelectorAll("#trilho *, #fila *").forEach((n) => {
      if (![...n.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim())) return;
      if (n.getBoundingClientRect().width && parseFloat(getComputedStyle(n).fontSize) < 12) pequenos.push(n.textContent.trim().slice(0, 20));
    });
    return { baixos, pequenos, lateral: document.documentElement.scrollWidth > document.documentElement.clientWidth };
  });
  assert.deepEqual(r, { baixos: [], pequenos: [], lateral: false });
  assert.equal(await page.evaluate(() => document.querySelectorAll("[aria-live]").length), 1, "#toast continua a única região aria-live");
});

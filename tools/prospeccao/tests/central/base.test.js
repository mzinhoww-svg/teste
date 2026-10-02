// Funil Base (coleção base: faixas B e C da Explee) e o "Usar na cadência" na linha de Sem contato.
const { test, after } = require("node:test");
const assert = require("node:assert");
const { abrir } = require("./harness.js");
const dados = require("./dados.js");

const abertos = [];
after(async () => { for (const h of abertos) await h.fechar(); });
const textoAviso = async (page) => {
  await page.waitForFunction(() => document.getElementById("toast").textContent.trim() !== "");
  return page.locator("#toast").innerText();
};
const PEDIDO = (i) => (i === 2 ? { status: "pedido", pedidoEm: "2026-10-02T10:00:00Z" } :
  i === 3 ? { status: "na_cadencia", pedidoEm: "2026-10-01T10:00:00Z", leadId: "R0001", migradoEm: "2026-10-01T11:00:00Z" } : null);

async function abrirBase(opts) {
  const h = await abrir(Object.assign({ largura: 1440, base: dados.empresasBase(250, PEDIDO) }, opts || {}));
  abertos.push(h);
  await h.page.waitForSelector("#fila [data-id]");
  return h;
}
async function irParaBase(h) {
  await h.page.click("#f-bs");
  await h.page.waitForSelector("#fila .bs-lista [data-id]");
}
const ids = (page) => page.evaluate(() => Array.from(document.querySelectorAll("#fila .bs-lista [data-id]")).map((x) => x.dataset.id));

test("Base: só assina a coleção quando o funil abre; lista em tabela com 100 linhas e Mostrar mais", async () => {
  const h = await abrirBase();
  const { page } = h;
  assert.equal(await page.evaluate(() => window.__assinaturas.base || 0), 0, "a base (~2 MB) não carrega com a central");
  await irParaBase(h);
  assert.equal(await page.evaluate(() => window.__assinaturas.base), 1);
  assert.equal(await page.locator("#fila table.tabela.base").count(), 1, "≥1024px: tabela");
  assert.deepEqual(await page.evaluate(() => Array.from(document.querySelectorAll("#fila thead th")).map((t) => t.textContent.trim())),
    ["Empresa", "Segmento", "Faixa", "Quem decide", "LinkedIn", "Status", "Ação"]);
  assert.equal((await ids(page)).length, 100);
  assert.match(await page.locator(".bs-conta").innerText(), /^Mostrando 100 de 248$/);
  const linha = page.locator('#fila tr[data-id="D10002"]');
  assert.match(await linha.innerText(), /Pessoa 2 Souza · Presidente/);
  assert.equal(await linha.locator('a[href="https://linkedin.example/in/p2"]').innerText(), "LinkedIn");
  await page.click("#bs-mais-btn");
  assert.equal((await ids(page)).length, 200);
  await page.click("#bs-mais-btn");
  assert.equal((await ids(page)).length, 248);
  assert.equal(await page.locator("#bs-mais-btn").count(), 0);
  assert.notEqual(await page.evaluate(() => document.activeElement.tagName), "BODY", "o foco não se perde quando a lista acaba");
  assert.equal(await page.locator("#detalhe").isVisible(), false, "a Base não tem detalhe ao lado");
  assert.deepEqual(h.erros.map(String), []);
});

test("Base: contagem por status nas abas e no placar; abas, segmento, faixa, persona e busca filtram", async () => {
  const h = await abrirBase();
  const { page } = h;
  await irParaBase(h);
  const n = (g) => page.locator('#abas [data-grupo="' + g + '"] .n').innerText();
  assert.deepEqual([await n("base"), await n("pedido"), await n("na_cadencia"), await n("todos")], ["248", "1", "1", "250"]);
  assert.deepEqual([await page.locator("#p1").innerText(), await page.locator("#p2").innerText(), await page.locator("#p3").innerText()], ["248", "1", "1"]);
  assert.match(await page.locator("#n-bs").innerText(), /^1/, "o funil mostra quantas esperam o Claude");
  await page.click('#abas [data-grupo="pedido"]');
  assert.deepEqual(await ids(page), ["D10003"]);
  await page.click('#abas [data-grupo="todos"]');
  await page.selectOption("#f-bs-segmento", "Gestão pública");
  let vis = await page.evaluate(() => Array.from(document.querySelectorAll("#fila tbody tr")).map((t) => t.children[1].textContent));
  assert.ok(vis.length && vis.every((s) => s === "Gestão pública"));
  await page.selectOption("#f-bs-faixa", "C");
  vis = await page.evaluate(() => Array.from(document.querySelectorAll("#fila tbody tr")).map((t) => t.children[2].textContent));
  assert.ok(vis.length && vis.every((s) => s === "C"));
  assert.deepEqual(await page.evaluate(() => Array.from(document.getElementById("f-bs-persona").options).map((o) => o.textContent)),
    ["Todos", "Decisor", "Comunicação", "Gestão"]);
  await page.selectOption("#f-bs-persona", "comunicacao");
  const esperado = dados.empresasBase(250).filter((d, i) => i >= 100 && i % 3 === 2 && i % 4 === 1).map((d) => d.id);
  assert.deepEqual((await ids(page)).sort(), esperado.sort());
  await page.selectOption("#f-bs-segmento", "");
  await page.selectOption("#f-bs-faixa", "");
  await page.selectOption("#f-bs-persona", "");
  await page.fill("#f-busca", "empresa17.example");
  await page.waitForFunction(() => document.querySelectorAll("#fila .bs-lista [data-id]").length === 1);
  assert.deepEqual(await ids(page), ["D10017"]);
  await page.fill("#f-busca", "pessoa 18 souza");
  await page.waitForFunction(() => !!document.querySelector('#fila .bs-lista [data-id="D10018"]'));
  assert.deepEqual(await ids(page), ["D10018"]);
  assert.match(await page.locator("#bs-lote-btn").innerText(), /dos filtrados \(1\)$/);
  assert.deepEqual(h.erros.map(String), []);
});

test("Base: o botão da linha grava só {status: pedido, pedidoEm} em base/{id} e avisa no #toast", async () => {
  const h = await abrirBase();
  const { page } = h;
  await irParaBase(h);
  await page.click("#bs-pedir-D10001");
  const aviso = await textoAviso(page);
  assert.equal(aviso, "1 empresa na fila. Abra a conversa com o Claude para ele montar os cards.");
  const esc = await h.escritas.lista();
  assert.equal(esc.length, 1);
  assert.equal(esc[0].caminho, "base/D10001");
  assert.deepEqual(Object.keys(esc[0].dados).sort(), ["pedidoEm", "status"]);
  assert.equal(esc[0].dados.status, "pedido");
  assert.ok(!isNaN(Date.parse(esc[0].dados.pedidoEm)));
  assert.ok(!esc.some((e) => e.caminho.startsWith("leads/")), "a página nunca cria lead");
  // saiu de "Na base" e foi para "Na fila do Claude"
  assert.ok(!(await ids(page)).includes("D10001"));
  await page.click('#abas [data-grupo="pedido"]');
  assert.deepEqual((await ids(page)).sort(), ["D10001", "D10003"]);
  assert.equal(await page.locator("#bs-pedir-D10001").isDisabled(), true);
  assert.equal(await page.locator("[aria-live]").count(), 1, "#toast é a única região aria-live");
  assert.deepEqual(h.erros.map(String), []);
});

test("Base: pedido e na cadência mostram o status, o botão desativado e o link do lead", async () => {
  const h = await abrirBase();
  const { page } = h;
  await irParaBase(h);
  await page.click('#abas [data-grupo="todos"]');
  const pedido = page.locator('#fila tr[data-id="D10003"]');
  assert.equal(await pedido.locator(".estado").innerText(), "Na fila do Claude");
  assert.equal(await page.locator("#bs-pedir-D10003").isDisabled(), true);
  assert.equal(await pedido.locator("a.ir-lead").count(), 0, "sem lead ainda: sem link");
  const cad = page.locator('#fila tr[data-id="D10004"]');
  assert.equal(await cad.locator(".estado").innerText(), "Na cadência");
  assert.equal(await page.locator("#bs-pedir-D10004").isDisabled(), true);
  assert.equal(await page.locator("#bs-pedir-D10004").getAttribute("aria-describedby"), "bs-st-D10004");
  await cad.locator("a.ir-lead").click();
  assert.equal(await page.locator("#f-ld").getAttribute("aria-pressed"), "true");
  assert.equal(await page.locator('#fila [data-id="R0001"]').getAttribute("aria-current"), "true");
  assert.match(await page.locator("#detalhe h2").innerText(), /Clínica Modelo 1/);
  assert.deepEqual(await h.escritas.lista(), []);
  // o lead que chegou pelo snapshot: o pedido vira "Na cadência" com link, sem recarregar
  await page.click("#f-bs");
  await h.empurrar("base/D10003", { status: "na_cadencia", leadId: "R0002" });
  assert.equal(await page.locator('#fila tr[data-id="D10003"] .estado').innerText(), "Na cadência");
  assert.equal(await page.locator('#fila tr[data-id="D10003"] a.ir-lead').innerText(), "Ver lead R0002");
  assert.deepEqual(h.erros.map(String), []);
});

test("Base: o botão dos filtrados confirma no lugar e grava no máximo 50, um update por documento, em sequência", async () => {
  const h = await abrirBase({ atraso: 5 });
  const { page } = h;
  await irParaBase(h);
  assert.equal(await page.locator("#bs-lote-btn").innerText(), "Enriquecer e iniciar cadência dos filtrados (248)");
  await page.click("#bs-lote-btn");
  assert.match(await page.locator("#bs-lote").innerText(), /Pedir as primeiras 50 de 248 empresas filtradas\?/);
  assert.equal(await page.evaluate(() => document.activeElement.id), "bs-lote-ok", "o foco vai para o Confirmar");
  assert.equal(await page.locator('[role="dialog"]:visible, [aria-modal="true"]').count(), 0, "sem modal");
  assert.deepEqual(await h.escritas.lista(), [], "abrir a confirmação não grava");
  await page.click("#bs-lote-nao");
  assert.equal(await page.evaluate(() => document.activeElement.id), "bs-lote-btn", "Cancelar devolve o foco");
  const primeiros = (await ids(page)).slice(0, 50);
  await page.click("#bs-lote-btn");
  await page.click("#bs-lote-ok");
  const aviso = await page.waitForFunction(() => /empresas na fila/.test(document.getElementById("toast").textContent), null, { timeout: 15000 })
    .then(() => page.locator("#toast").innerText());
  assert.equal(aviso, "50 empresas na fila. Abra a conversa com o Claude para ele montar os cards.");
  const esc = await h.escritas.lista();
  assert.equal(esc.length, 50);
  assert.deepEqual(esc.map((e) => e.caminho), primeiros.map((id) => "base/" + id), "na ordem da lista, um por documento");
  assert.ok(esc.every((e) => JSON.stringify(Object.keys(e.dados).sort()) === '["pedidoEm","status"]' && e.dados.status === "pedido"));
  assert.equal(await page.locator('#abas [data-grupo="pedido"] .n').innerText(), "51");
  assert.equal(await page.locator("#bs-lote-btn").innerText(), "Enriquecer e iniciar cadência dos filtrados (198)");
  assert.deepEqual(h.erros.map(String), []);
});

test("Base: pedido em lote com o filtro menor que 50 pede só os filtrados e para no primeiro erro", async () => {
  const h = await abrirBase();
  const { page } = h;
  await irParaBase(h);
  await page.selectOption("#f-bs-segmento", "Gestão pública");
  await page.selectOption("#f-bs-faixa", "B");
  await page.selectOption("#f-bs-persona", "decisor");
  const filtrados = await ids(page);
  assert.ok(filtrados.length > 0 && filtrados.length < 50);
  await page.click("#bs-lote-btn");
  assert.match(await page.locator("#bs-lote").innerText(), new RegExp("Pedir " + filtrados.length + " empresas\\?"));
  await page.click("#bs-lote-ok");
  await page.waitForFunction(() => /na fila/.test(document.getElementById("toast").textContent));
  assert.deepEqual((await h.escritas.lista()).map((e) => e.caminho).sort(), filtrados.map((id) => "base/" + id).sort());
  // erro: nada fica marcado e o aviso diz para tentar de novo
  await page.selectOption("#f-bs-persona", "");
  await h.falhar(true);
  const antes = (await h.escritas.lista()).length;
  await page.click("#bs-lote-btn");
  await page.click("#bs-lote-ok");
  await page.waitForFunction(() => /Tente de novo/.test(document.getElementById("toast").textContent));
  assert.equal((await h.escritas.lista()).length, antes);
  assert.deepEqual(h.erros.map(String), []);
});

test("Base a 390px: linhas, sem rolagem lateral, alvos de 44px e texto ≥12px", async () => {
  const h = await abrirBase({ largura: 390, altura: 844 });
  const { page } = h;
  await irParaBase(h);
  assert.equal(await page.locator("#fila table").count(), 0, "no celular: linhas, não tabela");
  assert.equal(await page.locator("#fila .linha.bs").count(), 100);
  await page.click('#abas [data-grupo="todos"]');
  await page.click("#btn-filtros");
  const r = await page.evaluate(() => {
    const baixos = [], pequenos = [];
    document.querySelectorAll("button, a.btn, a.ir-lead, select, input, .abas button").forEach((n) => {
      const b = n.getBoundingClientRect();
      if (!b.width || !b.height || n.closest("[hidden]") || getComputedStyle(n).visibility === "hidden") return;
      if (b.height < 43.5 && !n.closest("#atalhos")) baixos.push((n.id || n.className) + " " + n.textContent.trim().slice(0, 24) + " h=" + b.height);
    });
    document.querySelectorAll("#trilho *, #fila *").forEach((n) => {
      if (![...n.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim())) return;
      const b = n.getBoundingClientRect();
      if (!b.width) return;
      if (parseFloat(getComputedStyle(n).fontSize) < 12) pequenos.push(n.textContent.trim().slice(0, 20));
    });
    return { baixos, pequenos, lateral: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      funis: Array.from(document.querySelectorAll(".funis button")).filter((b) => b.scrollWidth > b.clientWidth).map((b) => b.id) };
  });
  assert.deepEqual(r, { baixos: [], pequenos: [], lateral: false, funis: [] });
  assert.deepEqual(h.erros.map(String), []);
});

test("Base: atalho 4 abre a Base, 1 volta ao Aquecimento com a fila igual; j, k e Enter não gravam na Base", async () => {
  const h = await abrirBase();
  const { page } = h;
  const fila = () => page.evaluate(() => Array.from(document.querySelectorAll("#fila [data-id]")).map((x) => x.dataset.id + ":" + x.getAttribute("aria-current")));
  const antes = await fila();
  await page.locator("body").press("4");
  await page.waitForSelector("#fila .bs-lista [data-id]");
  assert.equal(await page.locator("#f-bs").getAttribute("aria-pressed"), "true");
  for (const k of ["j", "k", "Enter", "c", "r"]) await page.locator("body").press(k);
  assert.deepEqual(await h.escritas.lista(), []);
  await page.locator("body").press("1");
  await page.waitForSelector("#fila .linha[data-id]");
  assert.deepEqual(await fila(), antes, "a fila do Aquecimento volta igual");
  assert.equal(await page.locator("#bs-lote").isHidden(), true);
  assert.equal(await page.locator("#detalhe").isVisible(), true);
  await page.locator("body").press("3");
  assert.equal(await page.locator("#f-ld").getAttribute("aria-pressed"), "true");
  assert.equal(await page.locator("#bs-lote").isHidden(), true);
  assert.deepEqual(h.erros.map(String), []);
});

test("Base vazia ou sem banco: mensagem clara e botão dos filtrados desligado", async () => {
  const h = await abrirBase({ base: [] });
  await irParaBase(h).catch(() => {});
  await h.page.waitForSelector("#fila .vazio");
  assert.match(await h.page.locator("#fila").innerText(), /A base está vazia/);
  assert.equal(await h.page.locator("#bs-lote-btn").isDisabled(), true);
  assert.deepEqual(h.erros.map(String), []);
});

// ---------- Sem contato: o enriquecimento achou o celular, a escolha é dela ----------
function migrado(num, sobre) {
  const d = dados.leads(0)[0];
  return { id: "B" + String(num).padStart(4, "0"), data: Object.assign({}, d.data, {
    nome: "Associação Migrada " + num, saudacao: "Paulo", categoria: "Associação setorial", segmento: "Associações setoriais",
    canal: "WhatsApp", telefone: "", email: "", contatoAtivo: null, contatos: [], ordem: 5000 + num,
    flags: ["base Explee", "migrado sem enriquecer"], enriquecimento: { status: "bruto", migradoSemEnriquecer: true }, alertas: [], historico: [],
    toques: [1, 2, 3].map((n) => ({ n, mensagem: "Oi, Paulo, tudo bem?\n\nToque " + n + ".", waLink: "", assunto: "", corpo: "" })),
  }, sobre || {}) };
}

test("Sem contato: celular encontrado aparece na linha e Usar na cadência leva o lead para Para hoje", async () => {
  const achado = { id: "k1", papel: "decisor", nome: "Paulo Pereira", cargo: "Presidente", telefone: "5565988887777", whatsapp: "?", fonte: "treg · x · call c1", confianca: "média" };
  const h = await abrir({ largura: 1440, leads: dados.leads(7).concat([migrado(1, { contatos: [achado] }), migrado(2)]) });
  abertos.push(h);
  const { page } = h;
  await page.waitForSelector("#fila [data-id]");
  await page.click('#abas [data-grupo="semcontato"]');
  const n = (g) => page.locator('#abas [data-grupo="' + g + '"] .n').innerText();
  assert.equal(await n("semcontato"), "2", "achar o celular não tira da aba: contatoAtivo nunca muda sozinho");
  const linha = page.locator("#fila [data-id=B0001]");
  assert.equal(await linha.locator(".achado").innerText(), "Celular encontrado: Paulo Pereira");
  assert.equal(await linha.locator("button.usar").innerText(), "Usar na cadência");
  assert.equal(await page.locator("#fila [data-id=B0002] button.usar").count(), 0, "sem contato achado: sem botão");
  assert.equal(await page.locator("#fila [data-id=B0002] .chip.migrado").count(), 1);
  await linha.locator("button.usar").click();
  const esc = await h.escritas.lista();
  assert.equal(esc.length, 1);
  assert.equal(esc[0].caminho, "leads/B0001");
  assert.equal(esc[0].dados.contatoAtivo, "k1");
  assert.deepEqual(Object.keys(esc[0].dados).sort(), ["contatoAtivo", "historico"]);
  assert.equal(await n("semcontato"), "1");
  assert.equal(await n("hoje"), "5");
  await page.click('#abas [data-grupo="hoje"]');
  assert.equal(await page.locator("#fila [data-id=B0001] a.enviar").getAttribute("aria-disabled"), null, "na fila de hoje, com Enviar");
  assert.deepEqual(h.erros.map(String), []);
});

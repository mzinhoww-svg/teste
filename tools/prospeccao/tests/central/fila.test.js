const { test, after } = require("node:test");
const assert = require("node:assert");
const { abrir } = require("./harness.js");
const dados = require("./dados.js");

const abertos = [];
after(async () => { for (const h of abertos) await h.fechar(); });
const minutosAtras = (m) => new Date(Date.now() - m * 60000).toISOString();
const textoAviso = async (page) => {
  await page.waitForFunction(() => document.getElementById("toast").textContent.trim() !== "");
  return page.locator("#toast").innerText();
};

// O painel vem recolhido (uma linha); os testes dos controles abrem primeiro, como a Letícia faria.
async function abrirFila(opts, fechada) {
  const h = await abrir(Object.assign({ largura: 1440 }, opts || {}));
  abertos.push(h);
  await h.page.waitForSelector("#fila [data-id]");
  await h.page.waitForSelector("#fila-wa:not([hidden])");
  if (!fechada) await h.page.click("#fila-resumo");
  return h;
}
const resumoFila = (page) => page.locator("#fila-resumo").innerText();
const painel = (page) => page.evaluate(() => {
  const q = (s) => document.querySelector(s);
  const visivel = (e) => !!e && !e.hidden && e.getClientRects().length > 0;
  return {
    texto: q("#fila-wa").innerText,
    iniciar: visivel(q("#btn-fila")) ? { desligado: q("#btn-fila").getAttribute("aria-disabled") === "true", rotulo: q("#btn-fila").textContent } : null,
    pausar: visivel(q("#btn-fila-pausar")),
    pergunta: visivel(q("#fila-pergunta")) ? q("#fila-pergunta").textContent : "",
    motivo: visivel(q("#fila-motivo")) ? q("#fila-motivo").textContent : "",
    x: q("#fila-x") ? q("#fila-x").value : null,
    dia: q("#fila-dia") ? q("#fila-dia").value : null,
  };
});
const escritas = (h) => h.escritas.lista();

test("Fila de envios: só aparece no funil Aquecimento", async () => {
  const h = await abrirFila();
  assert.match(await h.page.locator("#fila-wa").innerText(), /de segunda a sexta, das 9h às 17h \(Cuiabá\)/);
  for (const f of ["#f-ld", "#f-pv", "#f-bs"]) {
    await h.page.click(f);
    assert.equal(await h.page.locator("#fila-wa").isVisible(), false, f);
  }
  await h.page.click("#f-aq");
  assert.equal(await h.page.locator("#fila-wa").isVisible(), true);
  assert.deepEqual(h.erros.map(String), []);
});

test("Fila de envios: parada, mostra o padrão de 5 a cada 30 min e 30 por dia", async () => {
  const h = await abrirFila();
  const p = await painel(h.page);
  assert.deepEqual([p.x, p.dia, p.iniciar.rotulo, p.iniciar.desligado, p.pausar], ["5", "30", "Iniciar fila de envios", false, false]);
  assert.equal((await escritas(h)).length, 0, "abrir a página não grava nada");
});

for (const existe of [false, true]) {
  test("Iniciar fila pede confirmação e só então grava o ritmo" + (existe ? " (documento já existe)" : " (documento ainda não existe)"), async () => {
    const h = await abrirFila(existe ? { disparo: { status: "parado" } } : {});
    await h.page.fill("#fila-x", "3");
    await h.page.fill("#fila-dia", "20");
    await h.page.click("#btn-fila");
    let p = await painel(h.page);
    assert.equal(p.pergunta, "Começar a mandar 3 mensagens a cada 30 minutos, no máximo 20 por dia, para leads reais?");
    assert.equal((await escritas(h)).length, 0, "ainda não gravou: falta confirmar");
    assert.equal(await h.page.evaluate(() => document.activeElement.id), "fila-ok", "o foco vai para Confirmar");
    await h.page.click("#fila-nao");
    p = await painel(h.page);
    assert.equal(p.pergunta, "");
    assert.deepEqual([p.x, p.dia], ["3", "20"], "cancelar guarda o que foi digitado");
    assert.equal(await h.page.evaluate(() => document.activeElement.id), "btn-fila");
    assert.equal((await escritas(h)).length, 0);
    await h.page.click("#btn-fila");
    await h.page.click("#fila-ok");
    await h.page.waitForFunction(() => window.__escritas.length > 0);
    const e = await escritas(h);
    assert.equal(e.length, 1);
    assert.equal(e[0].caminho, "config/disparo");
    assert.deepEqual(Object.keys(e[0].dados).sort(), ["iniciadoEm", "intervaloMin", "limiteDia", "pausadoEm", "porLote", "status"]);
    assert.deepEqual([e[0].dados.status, e[0].dados.porLote, e[0].dados.intervaloMin, e[0].dados.limiteDia, e[0].dados.pausadoEm], ["ativo", 3, 30, 20, null]);
    assert.ok(Math.abs(new Date(e[0].dados.iniciadoEm) - Date.now()) < 60000);
    assert.match(await textoAviso(h.page), /^Fila ativa: 3 a cada 30 minutos\. O Claude agenda na próxima rodada/);
    p = await painel(h.page);
    assert.match(p.texto, /Fila ativa desde \d\d:\d\d · 3 a cada 30 min · máx\. 20 por dia/);
    assert.deepEqual([p.pausar, p.iniciar], [true, null]);
    assert.ok(!(await escritas(h)).some((x) => x.caminho.startsWith("leads/")), "a página nunca mexe nos leads");
  });
}

test("Ritmo fora do seguro desliga o botão e diz o motivo (X de 1 a 10, dia de 1 a 60)", async () => {
  const h = await abrirFila();
  const casos = [["0", "30", /^Mensagens a cada 30 minutos: de 1 a 10\.$/], ["11", "30", /de 1 a 10/], ["-3", "30", /de 1 a 10/], ["2.5", "30", /de 1 a 10/],
    ["", "30", /de 1 a 10/], ["5", "0", /^Máximo por dia: de 1 a 60\.$/], ["5", "61", /de 1 a 60/], ["10", "60", null], ["1", "1", null]];
  for (const [x, dia, motivo] of casos) {
    await h.page.fill("#fila-x", x);
    await h.page.fill("#fila-dia", dia);
    const p = await painel(h.page);
    if (motivo) { assert.equal(p.iniciar.desligado, true, x + "/" + dia); assert.match(p.motivo, motivo); }
    else { assert.equal(p.iniciar.desligado, false, x + "/" + dia); assert.equal(p.motivo, ""); }
  }
  await h.page.fill("#fila-x", "11");
  await h.page.click("#btn-fila", { force: true });
  assert.equal((await painel(h.page)).pergunta, "", "botão desligado não abre a confirmação");
  assert.equal((await escritas(h)).length, 0);
});

test("Digitar não perde o foco quando o banco muda por baixo", async () => {
  const h = await abrirFila();
  await h.page.focus("#fila-x");
  await h.page.fill("#fila-x", "7");
  await h.empurrar("config/enriquecimento", { status: "pedido", pedidoEm: minutosAtras(1) });  // qualquer snapshot redesenha a página
  const p = await painel(h.page);
  assert.equal(p.x, "7");
  assert.equal(await h.page.evaluate(() => document.activeElement.id), "fila-x");
});

test("Fila ativa mostra o andamento que o Claude grava e atualiza ao vivo", async () => {
  const h = await abrirFila({ disparo: { status: "ativo", porLote: 5, intervaloMin: 30, limiteDia: 30, iniciadoEm: minutosAtras(90), pausadoEm: null } });
  let p = await painel(h.page);
  assert.match(p.texto, /Fila ativa desde \d\d:\d\d · 5 a cada 30 min · máx\. 30 por dia/);
  assert.match(p.texto, /Esperando a primeira rodada do Claude\./);
  assert.deepEqual([p.pausar, p.iniciar, p.x], [true, null, null], "ativa: sem campos e sem Iniciar");
  await h.empurrar("config/disparo", { ultimaRodada: minutosAtras(2), resumo: { naFila: 7, enviadasHoje: 12, respostasNovas: 3, pulados: 1 } });
  await h.page.waitForFunction(() => /Última rodada às/.test(document.getElementById("fila-wa").innerText));
  p = await painel(h.page);
  assert.match(p.texto, /Na fila\s*7/); assert.match(p.texto, /Enviadas hoje\s*12/); assert.match(p.texto, /Respostas novas\s*3/); assert.match(p.texto, /Pulados\s*1/);
  assert.doesNotMatch(p.texto, /há mais de 1h30/);
  await h.empurrar("config/disparo", { aviso: "A sessão do WhatsApp caiu: escaneie o QR de novo no WA-AKG." });
  await h.page.waitForFunction(() => /sessão do WhatsApp caiu/.test(document.getElementById("fila-wa").innerText));
});

test("Fila ativa mas sem rodada do Claude há mais de 1h30 avisa o que fazer", async () => {
  const h = await abrirFila({ disparo: { status: "ativo", porLote: 5, intervaloMin: 30, limiteDia: 30, iniciadoEm: minutosAtras(300), ultimaRodada: minutosAtras(120) } });
  assert.match((await painel(h.page)).texto, /O Claude não roda a fila há mais de 1h30\. Abra a conversa com ele e mande qualquer mensagem\./);
});

test("Pausar grava só o status e a hora, e a fila pausada oferece Retomar com o mesmo ritmo", async () => {
  const h = await abrirFila({ disparo: { status: "ativo", porLote: 4, intervaloMin: 30, limiteDia: 25, iniciadoEm: minutosAtras(40), ultimaRodada: minutosAtras(5) } });
  await h.page.click("#btn-fila-pausar");
  await h.page.waitForFunction(() => window.__escritas.length > 0);
  const e = await escritas(h);
  assert.equal(e.length, 1);
  assert.equal(e[0].caminho, "config/disparo");
  assert.deepEqual(Object.keys(e[0].dados).sort(), ["pausadoEm", "status"]);
  assert.equal(e[0].dados.status, "pausado");
  assert.match(await textoAviso(h.page), /^Fila pausada\. O que já estava agendado é cancelado na próxima rodada do Claude; para parar na hora/);
  let p = await painel(h.page);
  assert.match(p.texto, /Fila pausada às \d\d:\d\d\. O que já estava agendado é cancelado na próxima rodada do Claude\./);
  assert.deepEqual([p.iniciar.rotulo, p.x, p.dia, p.pausar], ["Retomar fila", "4", "25", false], "volta com o ritmo que estava");
  await h.page.click("#btn-fila");
  await h.page.click("#fila-ok");
  await h.page.waitForFunction(() => window.__escritas.length > 1);
  const r = (await escritas(h))[1].dados;
  assert.deepEqual([r.status, r.porLote, r.limiteDia, r.pausadoEm], ["ativo", 4, 25, null]);
});

test("Gravação que falha não deixa a fila ativa na tela", async () => {
  const h = await abrirFila({ falharGravacao: true });
  await h.page.click("#btn-fila");
  await h.page.click("#fila-ok");
  assert.match(await textoAviso(h.page), /Não foi possível salvar/);
  const p = await painel(h.page);
  assert.equal(p.pausar, false);
  assert.equal(p.iniciar.rotulo, "Iniciar fila de envios");
});

test("Resposta do lead anotada pelo Claude aparece no histórico do lead", async () => {
  const leads = dados.leads(7);
  leads.find((l) => l.id === "R0001").data.historico = [{ em: minutosAtras(30), texto: "Respondeu no WhatsApp: \"Pode ser terça às 15h?\" (quer conhecer o estúdio)", tipo: "resposta" }];
  const h = await abrirFila({ leads });
  await h.page.click('#abas [data-grupo="todos"]');
  await h.page.click("#fila [data-id=R0001] .nome");
  await h.page.click('#detalhe [role=tab]:has-text("Histórico")');
  const li = h.page.locator("#detalhe .tempo li.resposta");
  await li.waitFor();
  assert.match(await li.innerText(), /Pode ser terça às 15h\?/);
  assert.equal(await h.page.evaluate(() => getComputedStyle(document.querySelector("#detalhe .tempo li.resposta time"), "::after").content), '" · resposta"');
});

test("390px: o painel cabe sem rolagem lateral e com alvos de toque de 40px", async () => {
  const h = await abrirFila({ largura: 390 });
  const r = await h.page.evaluate(() => {
    const ids = ["btn-fila", "fila-x", "fila-dia"];
    return { lateral: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      alturas: ids.map((i) => Math.round(document.getElementById(i).getBoundingClientRect().height)) };
  });
  assert.equal(r.lateral, false);
  assert.ok(r.alturas.every((a) => a >= 40), JSON.stringify(r.alturas));
});


test("Recolhida por padrão: uma linha de 44px com o essencial, e abre ao toque", async () => {
  const h = await abrirFila({}, true);
  assert.equal(await resumoFila(h.page), "Fila de envios no WhatsApp · parada");
  const alt = await h.page.evaluate(() => ({ painel: Math.round(document.getElementById("fila-wa").getBoundingClientRect().height),
    resumo: Math.round(document.getElementById("fila-resumo").getBoundingClientRect().height),
    aberto: document.querySelector("#fila-wa details").open, texto: document.getElementById("fila-wa").innerText }));
  assert.ok(alt.resumo >= 44 && alt.painel <= 60, JSON.stringify(alt));
  assert.equal(alt.aberto, false);
  assert.doesNotMatch(alt.texto, /Iniciar fila de envios|Máximo por dia/, "os controles ficam escondidos até abrir");
  await h.page.focus("#fila-resumo");
  await h.page.keyboard.press("Enter");  // pelo teclado também
  assert.equal(await h.page.locator("#btn-fila").isVisible(), true);
});

test("O resumo da linha recolhida acompanha o estado: ativa, na fila, atenção e pausada", async () => {
  const ativo = { status: "ativo", porLote: 5, intervaloMin: 30, limiteDia: 30, iniciadoEm: minutosAtras(20), ultimaRodada: minutosAtras(2) };
  const h = await abrirFila({ disparo: ativo }, true);
  assert.equal(await resumoFila(h.page), "Fila de envios no WhatsApp · ativa · 5 a cada 30 min");
  await h.empurrar("config/disparo", { resumo: { naFila: 7, enviadasHoje: 3, respostasNovas: 0, pulados: 0 } });
  await h.page.waitForFunction(() => /7 na fila/.test(document.getElementById("fila-resumo").textContent));
  assert.equal(await resumoFila(h.page), "Fila de envios no WhatsApp · ativa · 5 a cada 30 min · 7 na fila");
  await h.empurrar("config/disparo", { aviso: "A sessão do WhatsApp caiu: escaneie o QR de novo no WA-AKG." });
  await h.page.waitForFunction(() => /atenção/.test(document.getElementById("fila-resumo").textContent));
  await h.empurrar("config/disparo", { status: "pausado", pausadoEm: minutosAtras(1) });
  await h.page.waitForFunction(() => /pausada$/.test(document.getElementById("fila-resumo").textContent));
});

test("Aberta, continua aberta quando o banco muda por baixo", async () => {
  const h = await abrirFila({ disparo: { status: "ativo", porLote: 5, intervaloMin: 30, limiteDia: 30, iniciadoEm: minutosAtras(20) } });
  assert.equal(await h.page.locator("#btn-fila-pausar").isVisible(), true);
  await h.empurrar("config/disparo", { ultimaRodada: minutosAtras(0), resumo: { naFila: 2, enviadasHoje: 1, respostasNovas: 0, pulados: 0 } });
  await h.page.waitForFunction(() => /Última rodada às/.test(document.getElementById("fila-wa").innerText));
  assert.equal(await h.page.locator("#btn-fila-pausar").isVisible(), true, "não fechou sozinha");
  await h.page.click("#fila-resumo");
  assert.equal(await h.page.locator("#btn-fila-pausar").isVisible(), false, "fecha ao toque");
  await h.empurrar("config/disparo", { resumo: { naFila: 3, enviadasHoje: 1, respostasNovas: 0, pulados: 0 } });
  await h.page.waitForFunction(() => /3 na fila/.test(document.getElementById("fila-resumo").textContent));
  assert.equal(await h.page.locator("#btn-fila-pausar").isVisible(), false, "e continua fechada");
});

test("390px: com o painel recolhido, o primeiro lead continua no alto da tela", async () => {
  const h = await abrirFila({ largura: 390, altura: 844, leads: dados.leads(25) }, true);
  const topo = await h.page.evaluate(() => Math.round(document.querySelector("#fila [data-id]").getBoundingClientRect().top));
  assert.ok(topo < 340, "primeiro lead bem mais alto, veio " + topo);
});


test("Abrir e logo o banco mudar não fecha o painel (o snapshot chega antes do aviso do navegador)", async () => {
  const h = await abrirFila({ disparo: { status: "ativo", porLote: 5, intervaloMin: 30, limiteDia: 30, iniciadoEm: minutosAtras(20) } }, true);
  // abre e empurra o snapshot no mesmo instante, sem esperar nada entre os dois
  await h.page.evaluate(() => { document.getElementById("fila-resumo").click(); window.__empurrar("config/disparo", { ultimaRodada: new Date().toISOString() }); });
  await h.page.waitForFunction(() => /Última rodada às/.test(document.getElementById("fila-wa").innerText));
  assert.equal(await h.page.evaluate(() => document.querySelector("#fila-wa details").open), true);
});

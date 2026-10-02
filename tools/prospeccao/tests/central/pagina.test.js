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
  const vazio = await abrir({ largura: 1440, leads: [] });
  abertos.push(vazio);
  await vazio.page.waitForSelector("#detalhe .vazio");
  assert.match(await vazio.page.locator("#detalhe").innerText(), /Selecione um lead na fila/);
  const [t, f, d, c] = await Promise.all([".trilho", "#fila", "#detalhe", ".central"].map((s) => caixa(h.page, s)));
  assert.ok(t.visivel && f.visivel && d.visivel, "as três caixas visíveis");
  assert.ok(Math.abs(t.w - 240) <= 1, "trilho 240px, veio " + t.w);
  assert.ok(f.w <= 420.5 && f.w >= 340, "fila entre 340 e 420, veio " + f.w);
  assert.ok(t.x < f.x && f.x < d.x, "lado a lado");
  assert.ok(c.w <= 1600);
  assert.ok(await semRolagemLateral(h.page));
  assert.equal(await h.page.evaluate(() => document.body.dataset.layout), "tres");
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
    const apagados = document.querySelectorAll(".linha.apagado");
    const ops = [];
    apagados.forEach((c) => [c].concat(Array.from(c.querySelectorAll("*"))).forEach((e) => { if (Number(getComputedStyle(e).opacity) < 1) ops.push(e.tagName + "." + e.className); }));
    document.querySelectorAll(".btn:disabled, .btn[aria-disabled=true]").forEach((e) => { if (Number(getComputedStyle(e).opacity) < 1) ops.push("btn"); });
    return { n: apagados.length, ops, rotulo: apagados[0] && apagados[0].innerText };
  });
  assert.ok(r.n >= 1, "há ao menos um card apagado");
  assert.deepEqual(r.ops, []);
  assert.match(r.rotulo, /sair|sem resposta/i);
});

// ===== Task 4: fila reconciliada por id e seleção =====
const agoraIso = () => new Date().toISOString();

test("snapshot novo não recria as linhas que não mudaram", async () => {
  const h = await abrir({ largura: 1440 });
  abertos.push(h);
  await h.page.waitForSelector("#fila .linha[data-id]");
  await h.page.click('#abas [data-grupo="todos"]'); // R0002 está aguardando
  const ref = await h.page.$("#fila [data-id=R0002]");
  assert.ok(ref, "linha do R0002 existe");
  await h.empurrar("leads/R0003", { fraseUnica: "outra frase" });
  assert.equal(await ref.evaluate((n) => n.isConnected), true, "a linha ainda está no documento");
  assert.equal(await h.page.evaluate((n) => document.querySelector("#fila [data-id=R0002]") === n, ref), true, "é o mesmo nó");
  // a linha que mudou também é atualizada no próprio nó
  const r3 = await h.page.$("#fila [data-id=R0003]");
  await h.empurrar("leads/R0003", { etapa: 1, enviado1: agoraIso() });
  assert.equal(await h.page.evaluate((n) => document.querySelector("#fila [data-id=R0003]") === n, r3), true, "R0003 atualizada no mesmo nó");
  assert.match(await r3.getAttribute("data-id"), /R0003/);
  assert.deepEqual(h.erros.map(String), []);
});

test("rascunho e foco da anotação sobrevivem a um snapshot", async () => {
  const h = await abrir({ largura: 1440 });
  abertos.push(h);
  await h.page.waitForSelector("#fila .linha[data-id]");
  await h.page.click("#fila [data-id=R0001] .nome");
  await h.page.click('#detalhe [role=tab]:has-text("Histórico")');
  await h.page.waitForSelector("#nh-R0001");
  await h.page.click("#nh-R0001");
  await h.page.keyboard.type("falei com a secretária");
  await h.empurrar("leads/R0003", { fraseUnica: "x" });
  const depois = await h.page.evaluate(() => ({ id: document.activeElement.id, v: document.getElementById("nh-R0001").value }));
  assert.equal(depois.id, "nh-R0001");
  assert.equal(depois.v, "falei com a secretária");
  // snapshot do próprio lead: o detalhe é refeito, o texto digitado volta
  await h.empurrar("leads/R0001", { score: 99 });
  const outro = await h.page.evaluate(() => ({ id: document.activeElement.id, v: document.getElementById("nh-R0001").value }));
  assert.equal(outro.v, "falei com a secretária");
  assert.equal(outro.id, "nh-R0001");
  assert.deepEqual(h.erros.map(String), []);
});

test("TESTE fica no topo e fora da meta", async () => {
  const h = await abrir({ largura: 1440 });
  abertos.push(h);
  await h.page.waitForSelector("#fila .linha[data-id]");
  for (const g of ["hoje", "todos"]) {
    await h.page.click('#abas [data-grupo="' + g + '"]');
    assert.equal(await h.page.evaluate(() => document.querySelector("#fila .linha").dataset.id), "TESTE", g);
  }
  await h.empurrar("leads/TESTE", { etapa: 1, enviado1: agoraIso() });
  assert.equal(await h.page.locator("#p2").innerText(), "0", "toque do TESTE não conta");
  assert.equal(await h.page.locator("#p1").innerText(), "4");
  assert.equal(await h.page.locator('#abas [data-grupo="todos"] .n').innerText(), "7");
});

test("#fila não tem aria-live e #toast é role=status", async () => {
  const h = await abrir({ largura: 1440 });
  abertos.push(h);
  await h.page.waitForSelector("#fila .linha[data-id]");
  const r = await h.page.evaluate(() => ({
    fila: document.getElementById("fila").hasAttribute("aria-live"),
    papel: document.getElementById("toast").getAttribute("role"),
    vivas: Array.from(document.querySelectorAll("[aria-live]")).map((e) => e.id),
  }));
  assert.equal(r.fila, false);
  assert.equal(r.papel, "status");
  assert.deepEqual(r.vivas, ["toast"]);
});

test("linha: nome, pontos com aria-label, botões; selecionar mostra o detalhe", async () => {
  const h = await abrir({ largura: 1440 });
  abertos.push(h);
  await h.page.waitForSelector("#fila .linha[data-id]");
  const linha = await h.page.evaluate(() => {
    const n = document.querySelector("#fila [data-id=R0007]");
    return { nome: n.querySelector(".nome").textContent, pontos: n.querySelector(".pontos").getAttribute("aria-label"),
      enviar: n.querySelector("a.enviar").textContent, copiar: n.querySelector("button.copiar").textContent,
      alerta: !!n.querySelector(".chip.alerta"), altura: n.getBoundingClientRect().height };
  });
  assert.equal(linha.nome, "Clínica Modelo 7");
  assert.equal(linha.pontos, "Toque 1 enviado, toque 2 enviado, toque 3 hoje");
  assert.equal(linha.enviar, "Enviar");
  assert.equal(linha.copiar, "Copiar");
  assert.equal(linha.alerta, true);
  assert.ok(linha.altura >= 64 && linha.altura <= 80, "altura " + linha.altura);
  // a primeira linha vem selecionada; clicar numa linha troca a seleção e o detalhe
  assert.equal(await h.page.locator('#fila [aria-current="true"]').count(), 1);
  assert.equal(await h.page.getAttribute('#fila [aria-current="true"]', "data-id"), "R0004", "abre no primeiro lead real (quem já está em cadência vem antes), não no TESTE");
  await h.page.click("#fila [data-id=R0003] .nome");
  assert.equal(await h.page.getAttribute("#fila [data-id=R0003]", "aria-current"), "true");
  assert.equal(await h.page.locator('#fila [aria-current="true"]').count(), 1);
  assert.match(await h.page.locator("#detalhe").innerText(), /Clínica Modelo 3/);
  // Copiar não troca a seleção
  await h.page.click("#fila [data-id=R0001] button.copiar");
  assert.equal(await h.page.getAttribute("#fila [data-id=R0003]", "aria-current"), "true");
});

test("Enviar no WhatsApp marca o toque como hoje (comportamento atual)", async () => {
  const h = await abrir({ largura: 1440 });
  abertos.push(h);
  await h.page.context().route(/wa\.me/, (r) => r.abort());
  await h.page.waitForSelector("#fila .linha[data-id]");
  await h.page.click("#fila [data-id=R0001] a.enviar");
  await h.page.waitForFunction(() => window.__escritas.length > 0);
  const e = (await h.escritas.lista())[0];
  assert.equal(e.caminho, "leads/R0001");
  assert.equal(e.dados.etapa, 1);
});

// ---------- Task 5: enviar com Desfazer e próximo do dia ----------
async function abrirEnvio(opts) {
  const h = await abrir(Object.assign({ largura: 1440 }, opts || {}));
  abertos.push(h);
  h.page.on("popup", (p) => p.close());
  await h.page.context().route(/wa\.me/, (r) => r.abort());
  await h.page.waitForSelector("#fila .linha[data-id]");
  await h.page.click('#abas [data-grupo="hoje"]');
  return h;
}
const selecionadaId = (page) => page.getAttribute('#fila [aria-current="true"]', "data-id");

test("Enviar marca o toque, mostra o aviso e seleciona o próximo do dia", async () => {
  const h = await abrirEnvio();
  // (ids adaptados: na aba hoje a ordem é R0004, R0007, R0001, R0003; o primeiro selecionado não é R0001)
  const atual = await selecionadaId(h.page);
  const ordem = await h.page.evaluate(() => Array.from(document.querySelectorAll("#fila .linha")).map((n) => n.dataset.id).filter((id) => id !== "TESTE"));
  const esperado = ordem[(ordem.indexOf(atual) + 1) % ordem.length];
  await h.page.click("#fila [data-id=" + atual + "] a.enviar");
  await h.page.waitForFunction(() => window.__escritas.length > 0);
  const e = (await h.escritas.lista())[0];
  assert.equal(e.caminho, "leads/" + atual);
  assert.ok(e.dados.etapa >= 1 && e.dados["enviado" + e.dados.etapa]);
  assert.match(await h.page.locator("#toast").innerText(), /^Toque \d marcado · Desfazer$/);
  assert.equal(await h.page.locator("#toast button").innerText(), "Desfazer");
  assert.equal(await selecionadaId(h.page), esperado);
  assert.notEqual(esperado, atual);
});

test("Desfazer no aviso volta o toque e a seleção", async () => {
  const h = await abrirEnvio();
  await h.page.click("#fila [data-id=R0001] a.enviar");
  await h.page.waitForSelector("#toast button");
  await h.page.click("#toast button");
  await h.page.waitForFunction(() => window.__escritas.length > 1);
  const e = (await h.escritas.lista())[1];
  assert.equal(e.caminho, "leads/R0001");
  assert.equal(e.dados.etapa, 0);
  assert.equal(e.dados.enviado1, null);
  assert.ok(e.dados.historico.some((x) => x.texto === "Toque 1 desfeito"));
  assert.equal(await h.page.locator("#toast").isHidden(), true);
  assert.equal(await selecionadaId(h.page), "R0001");
});

test("aviso some depois de 8 segundos", async () => {
  const h = await abrirEnvio({ relogio: true });
  await h.page.click("#fila [data-id=R0001] a.enviar");
  await h.page.waitForSelector("#toast button");
  // o relógio vale para o contexto inteiro: espera a janela do WhatsApp fechar antes de adiantar o tempo
  for (let i = 0; i < 100 && h.page.context().pages().length > 1; i++) await new Promise((r) => setTimeout(r, 20));
  await h.page.clock.fastForward(7500);
  assert.equal(await h.page.locator("#toast").isVisible(), true);
  await h.page.clock.fastForward(700);
  assert.equal(await h.page.locator("#toast").isHidden(), true);
});

test("e-mail: um botão Enviar e nenhum Marcar enviado", async () => {
  const h = await abrirEnvio();
  await h.page.click("#fila [data-id=R0004] .nome");
  const textos = await h.page.evaluate(() => Array.from(document.querySelectorAll("#detalhe .acoes .btn")).map((b) => b.textContent));
  assert.equal(textos.filter((t) => t === "Enviar").length, 1, textos.join("|"));
  assert.ok(!textos.some((t) => /Marcar toque/.test(t) || /Desfazer toque/.test(t)), textos.join("|"));
  await h.page.click("#detalhe a.principal");
  await h.page.waitForFunction(() => window.__escritas.length > 0);
  const e = (await h.escritas.lista())[0];
  assert.equal(e.caminho, "leads/R0004");
  assert.equal(e.dados.etapa, 2);
});

test("falha ao gravar não avança e mostra o erro", async () => {
  const h = await abrirEnvio({ falharGravacao: true });
  const atual = await selecionadaId(h.page);
  await h.page.click("#fila [data-id=" + atual + "] a.enviar");
  await h.page.waitForFunction(() => /Não foi possível salvar/.test(document.getElementById("toast").textContent));
  assert.equal(await selecionadaId(h.page), atual);
  assert.equal(await h.page.locator("#toast button").count(), 0);
  assert.equal(await h.page.locator("#fila [data-id=" + atual + "] a.enviar").getAttribute("aria-disabled"), null);
});

// ---------- Task 6: detalhe com Resultado e abas ----------
const dadosT = require("./dados.js");
async function abrirDetalhe(opts) {
  const h = await abrir(Object.assign({ largura: 1440 }, opts || {}));
  abertos.push(h);
  h.page.on("popup", (p) => p.close());
  await h.page.context().route(/wa\.me/, (r) => r.abort());
  await h.page.waitForSelector("#fila .linha[data-id]");
  await h.page.click('#abas [data-grupo="hoje"]');
  return h;
}
const abrirLead = (h, id) => h.page.click("#fila [data-id=" + id + "] .nome");

test("detalhe mostra a mensagem do toque atual e o destino formatado", async () => {
  const h = await abrirDetalhe();
  await abrirLead(h, "R0001");
  const r = await h.page.evaluate(() => ({
    msg: document.querySelector("#detalhe .msg").textContent,
    destino: document.querySelector("#detalhe .destino").textContent,
    h2: document.querySelector("#detalhe h2").textContent,
    ordem: ["h2", ".msg", ".acoes", ".resultado", '[role=tablist]'].map((s) => { const e = document.querySelector("#detalhe " + s); return e ? e.getBoundingClientRect().top : -1; }),
  }));
  assert.match(r.msg, /Toque 1 da cadência para Clínica Modelo 1/);
  assert.match(r.destino, /^Para: .*\+55 \(65\) 90000-0001/);
  assert.equal(r.h2, "Clínica Modelo 1");
  assert.deepEqual(r.ordem.slice().sort((a, b) => a - b), r.ordem, "ordem vertical: nome, mensagem, ações, resultado, abas");
  await abrirLead(h, "R0004");
  const em = await h.page.evaluate(() => ({ msg: document.querySelector("#detalhe .msg").textContent, destino: document.querySelector("#detalhe .destino").textContent }));
  assert.match(em.msg, /^Assunto: Ideia para Clínica Modelo 4 \(2\)/);
  assert.match(em.destino, /contato4@modelo\.example/);
  assert.deepEqual(h.erros.map(String), []);
});

test("Pediu para sair pede confirmação", async () => {
  const h = await abrirDetalhe();
  await abrirLead(h, "R0001");
  await h.page.click("#detalhe .resultado >> text=Pediu para sair");
  assert.deepEqual(await h.escritas.lista(), [], "o primeiro clique não grava");
  const botoes = await h.page.evaluate(() => Array.from(document.querySelectorAll("#detalhe .resultado button")).map((b) => b.textContent));
  assert.deepEqual(botoes, ["Confirmar saída", "Cancelar"]);
  await h.page.click("#detalhe .resultado >> text=Cancelar");
  assert.deepEqual(await h.page.evaluate(() => Array.from(document.querySelectorAll("#detalhe .resultado button")).map((b) => b.textContent)), ["Respondeu", "Fechou negócio", "Pediu para sair"]);
  await h.page.click("#detalhe .resultado >> text=Pediu para sair");
  await h.page.click("#detalhe .resultado >> text=Confirmar saída");
  await h.page.waitForFunction(() => window.__escritas.length > 0);
  const e = (await h.escritas.lista())[0];
  assert.equal(e.caminho, "leads/R0001");
  assert.equal(e.dados.situacao, "sair");
  assert.ok(e.dados.historico.some((x) => x.texto === "Pediu para sair"));
});

test("lead que sai do filtro passa a seleção para o próximo", async () => {
  const h = await abrirDetalhe();
  await abrirLead(h, "R0001");
  await h.page.click("#detalhe .resultado >> text=Respondeu");
  await h.page.waitForFunction(() => window.__escritas.length > 0);
  assert.equal(await selecionadaId(h.page), "R0003");
  assert.equal(await h.page.locator("#fila [data-id=R0001]").count(), 0);
  assert.match(await h.page.locator("#detalhe h2").innerText(), /Clínica Modelo 3/);
  // o último da fila volta para o anterior
  await h.page.click("#detalhe .resultado >> text=Respondeu");
  await h.page.waitForFunction(() => window.__escritas.length > 1);
  assert.equal(await selecionadaId(h.page), "R0007");
});

test("Resultado com gravação falha não avança a seleção", async () => {
  const h = await abrirDetalhe({ falharGravacao: true });
  await abrirLead(h, "R0001");
  await h.page.click("#detalhe .resultado >> text=Respondeu");
  await h.page.waitForFunction(() => /Não foi possível salvar/.test(document.getElementById("toast").textContent));
  assert.equal(await selecionadaId(h.page), "R0001");
});

test("abas Perfil, Cadência, Histórico", async () => {
  const h = await abrirDetalhe();
  await abrirLead(h, "R0001");
  const abas = async () => h.page.evaluate(() => ({
    nomes: Array.from(document.querySelectorAll('#detalhe [role=tablist] [role=tab]')).map((b) => b.textContent),
    sel: Array.from(document.querySelectorAll('#detalhe [role=tab]')).filter((b) => b.getAttribute("aria-selected") === "true").map((b) => b.textContent),
    paineis: document.querySelectorAll("#detalhe [role=tabpanel]").length,
    titulo: (document.querySelector("#detalhe [role=tabpanel]") || {}).innerText || "",
  }));
  let a = await abas();
  assert.deepEqual(a.nomes, ["Perfil", "Cadência", "Histórico"]);
  assert.deepEqual(a.sel, ["Perfil"]);
  assert.equal(a.paineis, 1);
  assert.match(a.titulo, /O que faz/);
  await h.page.click('#detalhe [role=tab]:has-text("Cadência")');
  a = await abas();
  assert.deepEqual(a.sel, ["Cadência"]);
  assert.match(a.titulo, /Toque 1/);
  // a aba escolhida persiste ao trocar de lead
  await abrirLead(h, "R0003");
  assert.deepEqual((await abas()).sel, ["Cadência"]);
  await h.page.click('#detalhe [role=tab]:has-text("Histórico")');
  assert.ok(await h.page.locator("#nh-R0003").count());
  // setas movem entre as abas
  await h.page.focus('#detalhe [role=tab][aria-selected=true]');
  await h.page.keyboard.press("ArrowLeft");
  assert.deepEqual((await abas()).sel, ["Cadência"]);
});

test("perfil em duas colunas a 1440px", async () => {
  const h = await abrirDetalhe();
  await abrirLead(h, "R0001");
  const col = (page) => page.evaluate(() => {
    const e = document.querySelector("#detalhe .perfil-esq"), d = document.querySelector("#detalhe .perfil-dir");
    const a = e.getBoundingClientRect(), b = d.getBoundingClientRect();
    return { lado: b.x > a.x + 50 && Math.abs(a.y - b.y) < 4, esq: e.innerText, dir: d.innerText };
  });
  const c = await col(h.page);
  assert.equal(c.lado, true);
  assert.match(c.esq, /O que faz[\s\S]*Gancho[\s\S]*O que já tem[\s\S]*Empresa na Receita/);
  assert.match(c.dir, /Quem lidera[\s\S]*Contatos[\s\S]*Usar na cadência[\s\S]*Adicionar contato/);
  const h2 = await abrirDetalhe({ largura: 1100 });
  await abrirLead(h2, "R0001");
  assert.equal((await col(h2.page)).lado, false, "uma coluna abaixo de 1280px");
});

test("Desfazer no Histórico depois do aviso", async () => {
  const h = await abrirDetalhe();
  await abrirLead(h, "R0001");
  await h.page.click("#fila [data-id=R0001] a.enviar");
  await h.page.waitForFunction(() => window.__escritas.length > 0);
  await h.page.click('#abas [data-grupo="todos"]'); // R0001 saiu de "Para hoje"
  await abrirLead(h, "R0001");
  await h.page.click('#detalhe [role=tab]:has-text("Histórico")');
  assert.equal(await h.page.locator("#detalhe .tempo button").count(), 1, "só a linha do último envio tem Desfazer");
  assert.equal(await h.page.locator("#detalhe .tempo li", { hasText: "Toque 1" }).count(), 1, "o envio aparece uma vez só");
  await h.page.click("#detalhe .tempo >> text=Desfazer");
  await h.page.waitForFunction(() => window.__escritas.length > 1);
  const e = (await h.escritas.lista())[1];
  assert.equal(e.dados.etapa, 0);
  assert.equal(e.dados.enviado1, null);
  assert.equal(await h.page.locator("#detalhe .tempo button").count(), 0);
});

test("Desfazer do aviso só age se o toque ainda for o último", async () => {
  const h = await abrirDetalhe();
  await h.page.click("#fila [data-id=R0001] a.enviar");
  await h.page.waitForSelector("#toast button");
  await h.empurrar("leads/R0001", { etapa: 2, enviado2: agoraIso() });
  await h.page.click("#toast button");
  await h.page.waitForFunction(() => /Nada a desfazer/.test(document.getElementById("toast").textContent));
  assert.equal((await h.escritas.lista()).length, 1, "nenhuma escrita nova");
  assert.equal(await h.page.locator("#toast button").count(), 0);
});

test("Enviar fica desativado sem e-mail ou sem telefone, com o motivo", async () => {
  const leads = dadosT.leads(7);
  const por = (id) => leads.find((d) => d.id === id).data;
  por("R0004").email = ""; por("R0004").contatos = [];
  por("R0001").telefone = ""; por("R0001").contatos = [];
  const h = await abrirDetalhe({ leads });
  await abrirLead(h, "R0004");
  let r = await h.page.evaluate(() => { const a = document.querySelector("#detalhe .acoes a.principal"); return { dis: a.getAttribute("aria-disabled"), href: a.getAttribute("href"), txt: document.querySelector("#detalhe .destino").textContent }; });
  assert.equal(r.dis, "true"); assert.equal(r.href, null); assert.match(r.txt, /Sem e-mail cadastrado/);
  await abrirLead(h, "R0001");
  r = await h.page.evaluate(() => { const a = document.querySelector("#detalhe .acoes a.principal"); return { dis: a.getAttribute("aria-disabled"), href: a.getAttribute("href"), txt: document.querySelector("#detalhe .destino").textContent }; });
  assert.equal(r.dis, "true"); assert.equal(r.href, null); assert.match(r.txt, /Sem telefone cadastrado/);
  await h.page.click("#detalhe a.principal", { force: true });
  assert.deepEqual(await h.escritas.lista(), []);
});

// ---------- Task 7: pós-venda e leads na estrutura nova ----------
async function abrirFunil(funil, opts) {
  const h = await abrir(Object.assign({ largura: 1440 }, opts || {}));
  abertos.push(h);
  h.page.on("popup", (p) => p.close());
  await h.page.context().route(/wa\.me|mailto/, (r) => r.abort());
  await h.page.waitForSelector("#fila [data-id]");
  await h.page.click("#f-" + funil);
  return h;
}
const idsDaFila = (page) => page.evaluate(() => Array.from(document.querySelectorAll("#fila [data-id]")).map((n) => n.dataset.id));

test("Leads vira tabela ordenável a 1440px e linhas a 390px", async () => {
  const h = await abrirFunil("ld");
  await h.page.waitForSelector("#fila table");
  const cab = await h.page.evaluate(() => Array.from(document.querySelectorAll("#fila table thead th")).map((t) => t.textContent.trim()));
  assert.deepEqual(cab, ["Empresa", "Status", "Lidera", "Contato direto", "CNPJ", "Alertas"]);
  assert.equal(await h.page.locator("#fila table tbody tr[data-id]").count(), 7);
  assert.equal(await h.page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
  let ids = await idsDaFila(h.page);
  assert.equal(ids[0], "R0001", "ordem padrão");
  await h.page.click('#fila th button:has-text("Empresa")');
  assert.equal(await h.page.getAttribute('#fila th:has(button:has-text("Empresa"))', "aria-sort"), "ascending");
  await h.page.click('#fila th button:has-text("Empresa")');
  assert.equal(await h.page.getAttribute('#fila th:has(button:has-text("Empresa"))', "aria-sort"), "descending");
  ids = await idsDaFila(h.page);
  assert.equal(ids[0], "R0007");
  // clicar na linha seleciona e abre o perfil
  await h.page.click("#fila tr[data-id=R0003] td");
  assert.equal(await h.page.getAttribute("#fila tr[data-id=R0003]", "aria-current"), "true");
  assert.match(await h.page.locator("#detalhe").innerText(), /Clínica Modelo 3/);
  assert.deepEqual(await h.page.evaluate(() => Array.from(document.querySelectorAll("#detalhe [role=tab][aria-selected=true]")).map((b) => b.textContent)), ["Perfil"]);
  // Enter numa linha focada também seleciona
  await h.page.focus("#fila tr[data-id=R0005]");
  await h.page.keyboard.press("Enter");
  assert.equal(await h.page.getAttribute("#fila tr[data-id=R0005]", "aria-current"), "true");
  assert.deepEqual(h.erros.map(String), []);

  const m = await abrirFunil("ld", { largura: 390, altura: 844 });
  assert.equal(await m.page.locator("#fila table").count(), 0);
  assert.equal(await m.page.locator("#fila .linha[data-id]").count(), 7);
  assert.equal(await m.page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
  assert.match(await m.page.locator('#fila [data-id=R0001]').innerText(), /Clínica Modelo 1/);
});

test("cliente sem lead de origem não mostra 'veio da prospecção ()'", async () => {
  const dc = require("./dados.js").clientes();
  dc[0].data.leadId = "R0001";
  dc.push({ id: "C0004", data: Object.assign({}, dc[0].data, { nome: "Cliente Quatro", leadId: null, origem: "Prospecção", criadoEm: new Date(Date.now() - 86400000).toISOString() }) });
  const h = await abrirFunil("pv", { clientes: dc });
  await h.page.click("#fila [data-id=C0004] .nome");
  await h.page.click('#detalhe [role=tab]:has-text("Cliente")');
  const t = await h.page.locator("#detalhe").innerText();
  assert.ok(!/\(\)/.test(t), t);
  assert.ok(!/veio da prospecção/.test(t), t);
  await h.page.click("#fila [data-id=C0001] .nome");
  assert.match(await h.page.locator("#detalhe").innerText(), /veio da prospecção \(R0001\)/);
});

test("Todos do pós-venda põe pausados no fim", async () => {
  const h = await abrirFunil("pv");
  await h.page.click('#abas [data-grupo="todos"]');
  const ids = await idsDaFila(h.page);
  assert.equal(ids.length, 3);
  assert.equal(ids[ids.length - 1], "C0003");
});

test("contagem dos funis: itens para hoje; Leads 'a completar'", async () => {
  const dl = require("./dados.js").leads(7);
  dl.find((d) => d.id === "R0003").data.enriquecimento.status = "parcial";
  dl.find((d) => d.id === "R0005").data.enriquecimento.status = "bruto";
  const h = await abrir({ largura: 1440, leads: dl });
  abertos.push(h);
  await h.page.waitForSelector("#fila [data-id]");
  assert.equal((await h.page.textContent("#n-aq")).trim(), "4");
  assert.equal((await h.page.textContent("#n-pv")).trim(), "2", "C0001 (boas-vindas) e C0002 (kickoff com data) vencem hoje; C0003 está pausado");
  const ld = (await h.page.textContent("#f-ld")).replace(/\s+/g, " ");
  assert.match(ld, /2/);
  assert.match(ld, /a completar/);
});

test("cada funil guarda a própria seleção", async () => {
  const h = await abrirFunil("ld");
  await h.page.click("#fila tr[data-id=R0005] td");
  await h.page.click("#f-pv");
  await h.page.click('#abas [data-grupo="todos"]');
  await h.page.click("#fila [data-id=C0002] .nome");
  await h.page.click("#f-aq");
  await h.page.click('#abas [data-grupo="todos"]');
  await h.page.click("#fila [data-id=R0003] .nome");
  assert.match(await h.page.locator("#detalhe").innerText(), /Clínica Modelo 3/);
  await h.page.click("#f-ld");
  assert.equal(await h.page.getAttribute('#fila [aria-current="true"]', "data-id"), "R0005");
  assert.match(await h.page.locator("#detalhe").innerText(), /Clínica Modelo 5/);
  await h.page.click("#f-pv");
  assert.equal(await h.page.getAttribute('#fila [aria-current="true"]', "data-id"), "C0002");
  assert.match(await h.page.locator("#detalhe").innerText(), /Cliente Dois/);
  await h.page.click("#f-aq");
  assert.equal(await h.page.getAttribute('#fila [aria-current="true"]', "data-id"), "R0003");
  assert.deepEqual(h.erros.map(String), []);
});

test("pós-venda: linha, detalhe com abas e ações", async () => {
  const h = await abrirFunil("pv");
  const linha = await h.page.evaluate(() => {
    const n = document.querySelector("#fila [data-id=C0001]");
    return { nome: n.querySelector(".nome").textContent, texto: n.innerText, href: n.querySelector("a.enviar").getAttribute("href"), copiar: !!n.querySelector("button.copiar") };
  });
  assert.equal(linha.nome, "Cliente Um");
  assert.match(linha.texto, /Etapa 1\/7 · Boas-vindas/);
  assert.match(linha.texto, /Hora de Estúdio/);
  assert.match(decodeURIComponent(linha.href), /wa\.me\/5565922220001\?text=Oi, pessoal da Cliente Um/);
  assert.ok(linha.copiar);
  assert.equal(await h.page.locator('#fila [aria-current="true"]').count(), 1, "abre com um cliente selecionado");
  await h.page.click("#fila [data-id=C0001] .nome");
  assert.equal(await h.page.getAttribute('#fila [aria-current="true"]', "data-id"), "C0001");
  const det = await h.page.locator("#detalhe").innerText();
  assert.match(det, /Cliente Um/);
  assert.match(det, /Que bom ter vocês com a gente no Hora de Estúdio/);
  assert.match(det, /Para:/);
  assert.deepEqual(await h.page.evaluate(() => Array.from(document.querySelectorAll("#detalhe [role=tab]")).map((b) => b.textContent)), ["Etapa", "Cliente", "Histórico"]);
  await h.page.click('#detalhe [role=tab]:has-text("Histórico")');
  assert.match(await h.page.locator("#detalhe [role=tabpanel]").innerText(), /Cliente cadastrado/);
  // Enviar na linha marca a mensagem
  await h.page.click("#fila [data-id=C0001] a.enviar");
  await h.page.waitForFunction(() => window.__escritas.length > 0);
  let e = (await h.escritas.lista())[0];
  assert.equal(e.caminho, "clientes/C0001");
  assert.ok(e.dados.pvEnviado1);
  // enviado, C0001 sai de Para hoje e a seleção vai para o próximo; em Todos ele continua lá
  assert.equal(await h.page.getAttribute('#fila [aria-current="true"]', "data-id"), "C0002");
  await h.page.click('#abas [data-grupo="todos"]');
  await h.page.click("#fila [data-id=C0001] .nome");
  // Concluir etapa e Pausar
  await h.page.click('#detalhe button:has-text("Concluir etapa")');
  await h.page.waitForFunction(() => window.__escritas.length > 1);
  e = (await h.escritas.lista())[1];
  assert.equal(e.dados.etapa, 2);
  assert.ok(e.dados.pvConcluido1);
  await h.page.click('#detalhe button:has-text("Pausar")');
  await h.page.waitForFunction(() => window.__escritas.length > 2);
  assert.equal((await h.escritas.lista())[2].dados.situacao, "pausado");
  assert.deepEqual(h.erros.map(String), []);
});

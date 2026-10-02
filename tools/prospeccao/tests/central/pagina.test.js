const { test, after } = require("node:test");
const assert = require("node:assert");
const { abrir } = require("./harness.js");

const abertos = [];
// O texto do aviso entra um tick depois (região aria-live): espera ele aparecer antes de ler.
const textoAviso = async (page) => {
  await page.waitForFunction(() => document.getElementById("toast").textContent.trim() !== "");
  return page.locator("#toast").innerText();
};
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
  const h = await abrir({ largura: 390, altura: 844, leads: require("./dados.js").leads(25) });
  abertos.push(h);
  await h.page.waitForSelector("#fila [data-id]");
  assert.ok(await semRolagemLateral(h.page));
  assert.equal(await h.page.evaluate(() => document.body.dataset.layout), "uma");
  assert.equal((await caixa(h.page, "#detalhe")).visivel, false);
  await h.page.evaluate(() => window.scrollTo(0, 600));
  const fixo = await caixa(h.page, ".fixo");
  assert.ok(fixo.y <= 1 && fixo.h <= 120, "topo fixo colado e ≤120px, veio y=" + fixo.y + " h=" + fixo.h);
  assert.match(await h.page.locator(".linha-meta").innerText(), /^\d+ de 20 toques · \d+ para hoje$/);
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
  assert.equal(await h.page.getAttribute("#barra", "value"), "0", "barra da meta também ignora o TESTE");
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
  assert.match(await textoAviso(h.page), /^Toque \d marcado · Desfazer$/);
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
  // anota, no relógio da página, quando o texto do aviso apareceu
  await h.page.evaluate(() => {
    const t = document.getElementById("toast");
    new MutationObserver(() => { if (t.querySelector("button") && !window.__avisoEm) window.__avisoEm = Date.now(); }).observe(t, { childList: true, subtree: true });
  });
  const janela = h.page.waitForEvent("popup");
  await h.page.click("#fila [data-id=R0001] a.enviar");
  await h.page.waitForSelector("#toast button");
  // o relógio vale para o contexto inteiro: espera a janela do WhatsApp abrir e fechar antes de adiantar o tempo
  const p = await janela;
  if (!p.isClosed()) await p.waitForEvent("close");
  // o relógio continua andando enquanto a janela fecha: desconta o que já passou desde que o aviso apareceu
  const passou = await h.page.evaluate(() => Date.now() - window.__avisoEm);
  assert.ok(passou < 7000, "passou " + passou + " ms antes de adiantar");
  await h.page.clock.fastForward(7500 - passou);
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
  await h.page.waitForFunction(() => /não foi marcado/.test(document.getElementById("toast").textContent));
  assert.equal(await selecionadaId(h.page), atual);
  assert.deepEqual(await h.page.evaluate(() => Array.from(document.querySelectorAll("#toast button")).map((b) => b.textContent)), ["Marcar como enviado", "Fechar"]);
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

// ---------- Task 8: gaveta (760–1023px) e tela cheia (<760px) ----------
async function abrirPequeno(largura, altura, funil) {
  const h = await abrir({ largura, altura });
  abertos.push(h);
  await h.page.emulateMedia({ reducedMotion: "reduce" });  // sem animação: as caixas medidas já estão no lugar final
  h.page.on("popup", (p) => p.close());
  await h.page.context().route(/wa\.me|mailto/, (r) => r.abort());
  await h.page.waitForSelector("#fila [data-id]");
  if (funil) await h.page.click("#f-" + funil);
  return h;
}
const focoAtual = (page) => page.evaluate(() => {
  const a = document.activeElement;
  return { tag: a.tagName, texto: (a.textContent || "").trim().slice(0, 40), dentro: !!a.closest("#detalhe"), id: a.id, linha: a.closest(".linha") ? a.closest(".linha").dataset.id : null, ehLinha: a.classList.contains("linha") };
});

test("900px: detalhe abre como gaveta e Esc fecha devolvendo o foco à linha", async () => {
  const h = await abrirPequeno(900, 800);
  const { page } = h;
  assert.equal(await page.evaluate(() => document.body.dataset.layout), "gaveta");
  assert.equal((await caixa(page, "#detalhe")).visivel, false, "fechado por padrão");
  await page.click("#fila [data-id=R0004] .nome");
  await page.waitForSelector("#detalhe.aberto");
  const c = await caixa(page, "#detalhe");
  assert.ok(c.visivel && c.w <= 560 && Math.abs(c.x + c.w - 900) <= 1 && c.h >= 799, "gaveta pela direita, altura total: " + JSON.stringify(c));
  assert.equal(await page.getAttribute("#detalhe", "role"), "dialog");
  assert.equal(await page.getAttribute("#detalhe", "aria-modal"), "true");
  const titulo = await page.getAttribute("#detalhe", "aria-labelledby");
  assert.equal(await page.locator("#" + titulo).innerText(), "Clínica Modelo 4");
  const foco = await focoAtual(page);
  assert.ok(foco.dentro && foco.id === titulo, "foco no título: " + JSON.stringify(foco));
  assert.equal(await page.evaluate(() => getComputedStyle(document.body).overflow), "hidden", "rolagem do fundo travada");
  // o primeiro foco da tabulação é o Fechar
  assert.equal(await page.evaluate(() => document.querySelector("#detalhe button, #detalhe a[href]").textContent), "Fechar", "Fechar é o primeiro foco do detalhe");
  await page.keyboard.press("Shift+Tab");
  assert.deepEqual([(await focoAtual(page)).texto, (await focoAtual(page)).dentro], ["Fechar", true]);
  await page.keyboard.press("Escape");
  await page.waitForSelector("#detalhe.aberto", { state: "detached" }).catch(() => {});
  assert.equal(await page.locator("#detalhe.aberto").count(), 0);
  const f2 = await focoAtual(page);
  assert.ok(f2.ehLinha && f2.linha === "R0004", "foco volta à linha: " + JSON.stringify(f2));
  assert.notEqual(await page.evaluate(() => getComputedStyle(document.body).overflow), "hidden");
  // o véu também fecha; Enviar na linha não abre
  await page.click("#fila [data-id=R0003] .nome");
  await page.waitForSelector("#detalhe.aberto");
  await page.mouse.click(20, 400);
  assert.equal(await page.locator("#detalhe.aberto").count(), 0);
  await page.click("#fila [data-id=R0001] a.enviar");
  await page.waitForFunction(() => window.__escritas.length > 0);
  assert.equal(await page.locator("#detalhe.aberto").count(), 0, "Enviar não abre o detalhe");
  // Enter numa linha focada abre
  await page.focus("#fila [data-id=R0003]");
  await page.keyboard.press("Enter");
  await page.waitForSelector("#detalhe.aberto");
  assert.deepEqual(h.erros.map(String), []);
});

test("390px: detalhe em tela cheia com Voltar", async () => {
  const h = await abrirPequeno(390, 844);
  const { page } = h;
  await page.click("#fila [data-id=R0004] .nome");
  await page.waitForSelector("#detalhe.aberto");
  const c = await caixa(page, "#detalhe");
  assert.ok(c.x <= 0 && c.y <= 0 && c.w >= 390 && c.h >= 843, "tela cheia: " + JSON.stringify(c));
  assert.ok(await semRolagemLateral(page));
  const voltar = page.locator("#detalhe .fechar-detalhe");
  assert.equal(await voltar.innerText(), "Voltar");
  assert.ok((await voltar.boundingBox()).height >= 44);
  await page.evaluate(() => document.querySelector("#detalhe").scrollTo(0, 300));
  assert.ok((await page.locator("#detalhe .barra-detalhe").boundingBox()).y <= 1, "barra do topo fica fixa ao rolar");
  await voltar.click();
  assert.equal(await page.locator("#detalhe.aberto").count(), 0);
  const f = await focoAtual(page);
  assert.ok(f.ehLinha && f.linha === "R0004", JSON.stringify(f));
  assert.deepEqual(h.erros.map(String), []);
});

test("390px: botões, linhas e abas com 44px ou mais", async () => {
  const h = await abrirPequeno(390, 844);
  const { page } = h;
  const baixos = () => page.evaluate(() => {
    const ruins = [];
    document.querySelectorAll("button, a.btn, select, input:not([type=hidden]), textarea, summary, [role=tab], .linha, tr[data-id]").forEach((n) => {
      const r = n.getBoundingClientRect();
      if (r.width === 0 || r.height === 0 || getComputedStyle(n).visibility === "hidden") return;
      if (n.closest("[hidden]")) return;
      if (r.height < 43.5) ruins.push((n.id || n.className || n.tagName) + " " + n.textContent.trim().slice(0, 20) + " h=" + r.height);
    });
    return ruins;
  });
  assert.deepEqual(await baixos(), [], "fila");
  await page.click("#fila [data-id=R0004] .nome");
  await page.waitForSelector("#detalhe.aberto");
  for (const aba of ["Perfil", "Cadência", "Histórico"]) {
    await page.click('#detalhe [role=tab]:has-text("' + aba + '")');
    assert.deepEqual(await baixos(), [], "detalhe " + aba);
  }
  await page.click("#detalhe .fechar-detalhe");
  await page.click("#f-pv");
  assert.deepEqual(await baixos(), [], "pós-venda");
  await page.click("#fila [data-id=C0001] .nome");
  await page.waitForSelector("#detalhe.aberto");
  for (const aba of ["Etapa", "Cliente", "Histórico"]) {
    await page.click('#detalhe [role=tab]:has-text("' + aba + '")');
    assert.deepEqual(await baixos(), [], "cliente " + aba);
  }
  await page.click("#detalhe .fechar-detalhe");
  await page.click("#f-ld");
  assert.deepEqual(await baixos(), [], "leads");
  await page.click("#fila [data-id=R0001] .nome");
  await page.waitForSelector("#detalhe.aberto");
  assert.deepEqual(await baixos(), [], "lead aberto em Leads");
});

test("pós-venda: Enviar mostra o aviso com Desfazer e desfaz a marca", async () => {
  const h = await abrirFunil("pv");
  await h.page.click("#fila [data-id=C0001] a.enviar");
  await h.page.waitForFunction(() => window.__escritas.length > 0);
  assert.match(await textoAviso(h.page), /^Mensagem da etapa 1 marcada · Desfazer$/);
  await h.page.click("#toast button");
  await h.page.waitForFunction(() => window.__escritas.length > 1);
  const e = (await h.escritas.lista())[1];
  assert.equal(e.caminho, "clientes/C0001");
  assert.equal(e.dados.pvEnviado1, null);
  assert.equal(await h.page.locator("#toast").isHidden(), true);
  // se o cliente já andou para a etapa 2, Desfazer não mexe
  await h.page.click("#fila [data-id=C0001] a.enviar");
  await h.page.waitForFunction(() => window.__escritas.length > 2);
  await h.empurrar("clientes/C0001", { etapa: 2 });
  await h.page.click("#toast button");
  assert.equal((await h.escritas.lista()).length, 3, "nada a desfazer");
  assert.deepEqual(h.erros.map(String), []);
});

test("900px: Esc fecha a gaveta mesmo com o foco fora do detalhe; Tab não escapa", async () => {
  const h = await abrirPequeno(900, 800);
  const { page } = h;
  await page.click("#fila [data-id=R0004] .nome");
  await page.waitForSelector("#detalhe.aberto");
  await page.evaluate(() => document.activeElement.blur());
  await page.keyboard.press("Tab");
  assert.equal((await focoAtual(page)).dentro, true, "Tab com o foco no body cai dentro do detalhe");
  await page.evaluate(() => document.activeElement.blur());
  await page.keyboard.press("Escape");
  assert.equal(await page.locator("#detalhe.aberto").count(), 0);
  assert.equal(await page.locator("#fila[inert]").count(), 0);
  const f = await focoAtual(page);
  assert.ok(f.ehLinha && f.linha === "R0004", JSON.stringify(f));
  // fecha por outro caminho (troca de funil por mudança de largura): foco na fila, não no body
  await page.click("#fila [data-id=R0004] .nome");
  await page.waitForSelector("#detalhe.aberto");
  await page.setViewportSize({ width: 1300, height: 800 });
  await page.waitForFunction(() => !document.querySelector("#detalhe.aberto"));
  assert.notEqual(await page.evaluate(() => document.activeElement.tagName), "BODY");
  assert.deepEqual(h.erros.map(String), []);
});

// ---------- Task 9: atalhos e busca ----------
test("j/k mudam a seleção e Enter envia", async () => {
  const h = await abrirEnvio();
  const ordem = await h.page.evaluate(() => Array.from(document.querySelectorAll("#fila .linha")).map((n) => n.dataset.id));
  await h.page.evaluate(() => document.activeElement.blur());  // depois de clicar na aba o foco está no botão da aba, que tem a própria ação
  const ini = await selecionadaId(h.page);
  assert.equal(ini, "R0004");
  await h.page.keyboard.press("j");
  assert.equal(await selecionadaId(h.page), ordem[ordem.indexOf(ini) + 1]);
  await h.page.keyboard.press("k");
  assert.equal(await selecionadaId(h.page), ini);
  await h.page.keyboard.press("k");
  assert.equal(await selecionadaId(h.page), ordem[ordem.indexOf(ini) - 1], "k sobe até o card TESTE");
  await h.page.keyboard.press("j");
  const atual = await selecionadaId(h.page);
  await h.page.keyboard.press("Enter");
  await h.page.waitForFunction(() => window.__escritas.length > 0);
  const e = (await h.escritas.lista())[0];
  assert.equal(e.caminho, "leads/" + atual);
  assert.match(await textoAviso(h.page), /^Toque \d marcado · Desfazer$/);
  assert.notEqual(await selecionadaId(h.page), atual, "a seleção avança como no clique");
  // c copia a mensagem do selecionado
  await h.page.keyboard.press("c");
  await h.page.waitForFunction(() => /copiado|Não deu para copiar/.test(document.getElementById("toast").textContent));
  // 3, 2, 1 trocam de funil
  await h.page.keyboard.press("3");
  assert.equal(await h.page.getAttribute("body", "data-funil"), "ld");
  await h.page.keyboard.press("2");
  assert.equal(await h.page.getAttribute("body", "data-funil"), "pv");
  await h.page.keyboard.press("1");
  assert.equal(await h.page.getAttribute("body", "data-funil"), "aq");
  // r foca o primeiro botão do Resultado
  await h.page.keyboard.press("r");
  assert.equal(await h.page.evaluate(() => document.activeElement.textContent), "Respondeu");
  assert.deepEqual(h.erros.map(String), []);
});

test("atalhos não agem dentro de campos", async () => {
  const h = await abrirEnvio();
  const antes = await selecionadaId(h.page);
  const nota = h.page.locator("#detalhe textarea").first();
  await h.page.click("#detalhe summary:has-text('Histórico'), #detalhe [role=tab]:has-text('Histórico')").catch(() => {});
  await nota.waitFor();
  await nota.focus();
  for (const k of ["j", "k", "c", "r", "?", "/", "1", "2", "Enter"]) await h.page.keyboard.press(k);
  assert.equal(await selecionadaId(h.page), antes);
  assert.equal((await h.escritas.lista()).length, 0);
  assert.equal(await h.page.locator("#atalhos").isVisible(), false);
  assert.equal(await h.page.getAttribute("body", "data-funil"), "aq");
  assert.match(await nota.inputValue(), /^jkcr\?\/12/);
  // na busca também
  await h.page.focus("#f-busca");
  for (const k of ["j", "c", "Enter"]) await h.page.keyboard.press(k);
  assert.equal(await h.page.inputValue("#f-busca"), "jc");
  assert.equal((await h.escritas.lista()).length, 0);
  // com modificador nada age
  await h.page.evaluate(() => document.activeElement.blur());
  await h.page.keyboard.press("Control+j");
  assert.equal(await selecionadaId(h.page), antes);
});

test("/ foca a busca e filtra no pós-venda também", async () => {
  const h = await abrirEnvio();
  await h.page.keyboard.press("2");
  await h.page.click('#abas [data-grupo="todos"]');
  assert.equal(await h.page.locator("#fila .linha[data-id]").count(), 3);
  await h.page.keyboard.press("/");
  assert.equal(await h.page.evaluate(() => document.activeElement.id), "f-busca");
  assert.equal(await h.page.inputValue("#f-busca"), "", "a barra não entra no campo");
  await h.page.keyboard.type("dois");
  await h.page.waitForFunction(() => document.querySelectorAll("#fila .linha[data-id]").length === 1);
  assert.equal(await h.page.locator("#fila .linha[data-id]").getAttribute("data-id"), "C0002");
  // a busca vale nos outros funis (CNPJ no Aquecimento) e Esc limpa e depois sai do campo
  await h.page.keyboard.press("Escape");
  assert.equal(await h.page.inputValue("#f-busca"), "");
  assert.equal(await h.page.evaluate(() => document.activeElement.id), "f-busca", "primeiro Esc só limpa");
  await h.page.waitForFunction(() => document.querySelectorAll("#fila .linha[data-id]").length === 3);
  await h.page.keyboard.press("Escape");
  assert.notEqual(await h.page.evaluate(() => document.activeElement.id), "f-busca");
  await h.page.keyboard.press("1");
  await h.page.click('#abas [data-grupo="todos"]');
  await h.page.fill("#f-busca", "00.000.000/0003");
  await h.page.evaluate(() => document.activeElement.blur());
  await h.page.waitForFunction(() => document.querySelectorAll("#fila .linha[data-id]:not([data-id=TESTE])").length === 1);
  assert.equal(await h.page.locator("#fila .linha[data-id]:not([data-id=TESTE])").getAttribute("data-id"), "R0003");
  await h.page.keyboard.press("3");
  await h.page.waitForFunction(() => document.querySelectorAll("#fila [data-id]").length === 1);
  await h.page.fill("#f-busca", "");
  await h.page.evaluate(() => document.activeElement.blur());
  await h.page.waitForFunction(() => document.querySelectorAll("#fila [data-id]").length === 7);
});

test("? mostra a lista de atalhos e Esc fecha", async () => {
  const h = await abrirEnvio();
  await h.page.keyboard.press("Shift+?");
  const painel = h.page.locator("#atalhos");
  assert.equal(await painel.isVisible(), true);
  assert.equal(await painel.getAttribute("role"), "dialog");
  assert.equal(await painel.getAttribute("aria-label"), "Atalhos");
  assert.equal(await painel.getAttribute("aria-modal"), null, "não é modal");
  assert.match(await painel.innerText(), /Enviar o lead selecionado/);
  await h.page.keyboard.press("Escape");
  assert.equal(await painel.isVisible(), false);
  await h.page.keyboard.press("Shift+?");
  await h.page.keyboard.press("Shift+?");
  assert.equal(await painel.isVisible(), false, "? alterna");
  // Esc fecha o painel antes da gaveta
  await h.page.setViewportSize({ width: 900, height: 800 });
  await h.page.waitForFunction(() => document.body.dataset.layout === "gaveta");
  await h.page.click("#fila [data-id=R0004] .nome");
  await h.page.waitForSelector("#detalhe.aberto");
  await h.page.keyboard.press("Shift+?");
  await h.page.keyboard.press("Escape");
  assert.equal(await painel.isVisible(), false);
  assert.equal(await h.page.locator("#detalhe.aberto").count(), 1, "o primeiro Esc fechou só o painel");
  await h.page.keyboard.press("Escape");
  assert.equal(await h.page.locator("#detalhe.aberto").count(), 0);
});

test("Enter e c seguros não repetem enquanto a tecla está segurada", async () => {
  const h = await abrirEnvio();
  await h.page.evaluate(() => document.activeElement.blur());
  const antes = await selecionadaId(h.page);
  await h.page.evaluate(() => {
    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", repeat: true, bubbles: true }));
    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "c", repeat: true, bubbles: true }));
  });
  await h.page.waitForTimeout(300);
  assert.equal((await h.escritas.lista()).length, 0);
  assert.equal(await h.page.locator("#toast").isVisible(), false);
  assert.equal(await selecionadaId(h.page), antes);
  await h.page.keyboard.press("Enter");
  await h.page.waitForFunction(() => window.__escritas.length === 1);
});

test("com a lista de atalhos aberta só Esc e ? agem; o foco entra e volta", async () => {
  const h = await abrirEnvio();
  await h.page.focus("#f-busca");
  await h.page.evaluate(() => document.activeElement.blur());
  await h.page.focus("#fila .linha[data-id]");
  const origem = await h.page.evaluate(() => document.activeElement.dataset.id);
  const antes = await selecionadaId(h.page);
  await h.page.keyboard.press("Shift+?");
  assert.equal(await h.page.evaluate(() => document.activeElement.id), "atalhos-fechar");
  await h.page.keyboard.press("j");
  await h.page.keyboard.press("2");
  assert.equal(await selecionadaId(h.page), antes);
  assert.equal(await h.page.getAttribute("body", "data-funil"), "aq");
  await h.page.keyboard.press("Escape");
  assert.equal(await h.page.evaluate(() => document.activeElement.dataset.id), origem);
  await h.page.keyboard.press("Shift+?");
  await h.page.keyboard.press("Shift+?");
  assert.equal(await h.page.evaluate(() => document.activeElement.dataset.id), origem, "? também devolve o foco");
  await h.page.keyboard.press("Shift+?");
  await h.page.click("#atalhos-fechar");
  assert.equal(await h.page.locator("#atalhos").isVisible(), false);
  assert.equal(await h.page.evaluate(() => document.activeElement.dataset.id), origem, "o botão também");
});

test("/ com a gaveta aberta fecha o detalhe e foca a busca", async () => {
  const h = await abrirEnvio();
  await h.page.setViewportSize({ width: 900, height: 800 });
  await h.page.waitForFunction(() => document.body.dataset.layout === "gaveta");
  await h.page.click("#fila [data-id=R0004] .nome");
  await h.page.waitForSelector("#detalhe.aberto");
  await h.page.evaluate(() => document.activeElement.blur());
  await h.page.keyboard.press("/");
  assert.equal(await h.page.locator("#detalhe.aberto").count(), 0);
  assert.equal(await h.page.evaluate(() => document.activeElement.id), "f-busca");
});

// ---------- Task 10: meta do dia ----------
test("meta mostra N de 20 e muda ao bater", async () => {
  const dados = require("./dados.js");
  const hoje = new Date().toISOString();
  const leads = [dados.leads(0)[0]];
  for (let i = 1; i <= 19; i++) leads.push(dados.leads(i)[i]);
  for (let i = 1; i <= 19; i++) Object.assign(leads[i].data, { etapa: 1, enviado1: hoje });
  const novo = dados.leads(20)[20]; // ainda sem toque: vence hoje
  leads.push(novo);
  const h = await abrirEnvio({ leads });
  assert.match(await h.page.locator("#meta-texto").textContent(), /^19 de 20 toques · 1 para hoje$/);
  const barra = await h.page.evaluate(() => { const b = document.querySelector("progress#barra"); return { max: b.max, v: b.value, h: b.getBoundingClientRect().height, nome: b.getAttribute("aria-label"), batida: b.classList.contains("batida") }; });
  assert.deepEqual(barra, { max: 20, v: 19, h: 8, nome: "Meta do dia", batida: false });
  await h.page.click("#fila [data-id=" + novo.id + "] a.enviar");
  await h.page.waitForFunction(() => /Meta do dia batida/.test(document.getElementById("meta-texto").textContent));
  assert.match(await h.page.locator("#meta-texto").textContent(), /^Meta do dia batida · \d+ ainda vencem hoje$/);
  assert.equal(await h.page.evaluate(() => document.querySelector("progress#barra").classList.contains("batida")), true);
  assert.equal(await h.page.evaluate(() => document.getElementById("linha-meta").textContent), await h.page.locator("#meta-texto").textContent());
  // vale em qualquer funil; fora do Aquecimento diz que é a meta de toques
  await h.page.click("#f-ld");
  assert.match(await h.page.locator("#meta-texto").textContent(), /^Meta de toques batida · \d+ leads ainda vencem hoje$/);
  assert.deepEqual(h.erros.map(String), []);
});

test("metaDiaria inválida cai para 20", async () => {
  const h = await abrir({ largura: 1440, meta: { metaDiaria: -5, esperaDias: { "1": 0, "2": 4, "3": 6 } } });
  abertos.push(h);
  await h.page.waitForSelector("#fila [data-id]");
  assert.match(await h.page.locator("#meta-texto").textContent(), /de 20 toques/);
});

test("390px: topo fixo ≤120px também com a meta batida", async () => {
  const dados = require("./dados.js");
  const hoje = new Date().toISOString();
  const leads = dados.leads(20);
  leads.forEach((d, i) => { if (i > 0) Object.assign(d.data, { etapa: 1, enviado1: hoje }); });
  const h = await abrir({ largura: 390, altura: 844, leads });
  abertos.push(h);
  await h.page.waitForSelector("#fila [data-id]");
  assert.match(await h.page.locator(".linha-meta").textContent(), /^Meta do dia batida · \d+ ainda vencem hoje$/);
  const fixo = await caixa(h.page, ".fixo");
  assert.ok(fixo.h <= 120, "topo ≤120px, veio " + fixo.h);
  assert.ok(await semRolagemLateral(h.page));
});

// ---------- painel de filtros ----------
const painelEstado = (page) => page.evaluate(() => ({
  expandido: document.getElementById("btn-filtros").getAttribute("aria-expanded"),
  botao: document.getElementById("btn-filtros").offsetParent !== null,
  busca: document.getElementById("f-busca").offsetParent !== null,
  selects: document.querySelector(".selects:not([hidden]) select").offsetParent !== null,
  abas: document.getElementById("abas").offsetParent !== null,
}));

for (const largura of [1100, 390]) {
  test(largura + "px: painel de filtros recolhido, o botão abre e fecha", async () => {
    const h = await abrir({ largura, altura: 844 });
    abertos.push(h);
    await h.page.waitForSelector("#fila [data-id]");
    let e = await painelEstado(h.page);
    assert.deepEqual(e, { expandido: "false", botao: true, busca: false, selects: false, abas: true });
    assert.equal(await h.page.getAttribute("#btn-filtros", "aria-controls"), "painel-filtros");
    await h.page.click("#btn-filtros");
    e = await painelEstado(h.page);
    assert.deepEqual(e, { expandido: "true", botao: true, busca: true, selects: true, abas: true });
    await h.page.click("#btn-filtros");
    assert.equal((await painelEstado(h.page)).busca, false);
    assert.ok(await semRolagemLateral(h.page));
  });
}

test("390px: botão Filtros com alvo de 44px e topo fixo ≤120px", async () => {
  const h = await abrir({ largura: 390, altura: 844 });
  abertos.push(h);
  await h.page.waitForSelector("#fila [data-id]");
  assert.ok((await caixa(h.page, "#btn-filtros")).h >= 44);
  assert.ok((await caixa(h.page, ".fixo")).h <= 120);
});

test("1100px: / abre o painel e foca a busca; Esc na busca vazia fecha", async () => {
  const h = await abrir({ largura: 1100 });
  abertos.push(h);
  await h.page.waitForSelector("#fila [data-id]");
  await h.page.keyboard.press("/");
  assert.equal(await h.page.evaluate(() => document.activeElement.id), "f-busca");
  assert.equal((await painelEstado(h.page)).expandido, "true");
  await h.page.keyboard.press("Escape");
  const e = await painelEstado(h.page);
  assert.equal(e.expandido, "false");
  assert.equal(e.busca, false);
});

test("o botão mostra quantos filtros estão ativos", async () => {
  const h = await abrir({ largura: 1100 });
  abertos.push(h);
  await h.page.waitForSelector("#fila [data-id]");
  assert.equal(await h.page.locator("#btn-filtros").innerText(), "Filtros");
  await h.page.click("#btn-filtros");
  await h.page.fill("#f-busca", "a");
  assert.equal(await h.page.locator("#btn-filtros").innerText(), "Filtros · 1");
  await h.page.click("#btn-filtros");
  assert.equal(await h.page.locator("#btn-filtros").innerText(), "Filtros · 1");
});

test("1440px: botão Filtros escondido e filtros sempre visíveis", async () => {
  const h = await abrir({ largura: 1440 });
  abertos.push(h);
  await h.page.waitForSelector("#fila [data-id]");
  const e = await painelEstado(h.page);
  assert.equal(e.botao, false);
  assert.ok(e.busca && e.selects && e.abas);
});

test("O que já tem mostra o texto dos sinais, inclusive em texto simples", async () => {
  const h = await abrir({ largura: 1440 });
  abertos.push(h);
  await h.page.waitForSelector("#fila [data-id]");
  await h.page.click("#fila [data-id=R0003] .nome");
  const txt = await h.page.locator("#detalhe").innerText();
  assert.match(txt, /Instagram ativo/);
  assert.match(txt, /Sem podcast/);
});

// ---------- Revisão final ----------
const esperaFoco = (page) => page.waitForFunction(() => document.activeElement && document.activeElement !== document.body, null, { timeout: 2000 }).catch(() => {});

test("c em Leads num lead fora da cadência não grava nada, nem com anotação digitada", async () => {
  const h = await abrirFunil("ld");
  await h.page.waitForSelector("#fila table");
  await h.page.click("#fila tr[data-id=R0005] td");  // respondeu: o detalhe não tem Enviar/Copiar, só Usar na cadência
  assert.ok(await h.page.locator('#detalhe button:has-text("Usar na cadência")').count(), "o botão que grava está no detalhe");
  await h.page.keyboard.press("c");
  await h.page.waitForTimeout(300);
  assert.deepEqual(await h.escritas.lista(), [], "c não troca o contato da cadência");
  await h.page.click('#detalhe [role=tab]:has-text("Histórico")');
  await h.page.fill("#nh-R0005", "ligar na segunda");
  await h.page.focus("#fila tr[data-id=R0005]");
  await h.page.keyboard.press("c");
  await h.page.waitForTimeout(300);
  assert.deepEqual(await h.escritas.lista(), [], "c não salva a anotação");
  assert.equal(await h.page.inputValue("#nh-R0005"), "ligar na segunda", "o rascunho fica");
  // num lead em cadência o c continua copiando a mensagem
  await h.page.click("#fila tr[data-id=R0001] td");
  await h.page.keyboard.press("c");
  await h.page.waitForFunction(() => /copiado|Não deu para copiar/.test(document.getElementById("toast").textContent));
  assert.deepEqual(await h.escritas.lista(), []);
});

test("Enter dentro do detalhe não envia (painel da aba e título da gaveta)", async () => {
  const h = await abrirDetalhe();
  await abrirLead(h, "R0001");
  await h.page.focus("#painel-detalhe");
  await h.page.keyboard.press("Enter");
  await h.page.waitForTimeout(300);
  assert.deepEqual(await h.escritas.lista(), [], "1440: Enter no painel da aba");
  const g = await abrirPequeno(900, 800);
  await g.page.focus("#fila [data-id=R0001]");
  await g.page.keyboard.press("Enter");  // abre a gaveta com o foco no título
  await g.page.waitForSelector("#detalhe.aberto");
  assert.equal(await g.page.evaluate(() => document.activeElement.id), "detalhe-titulo");
  await g.page.keyboard.press("Enter");
  await g.page.waitForTimeout(300);
  assert.deepEqual(await g.escritas.lista(), [], "900: Enter no título da gaveta");
  assert.equal(await g.page.locator("#detalhe.aberto").count(), 1);
});

test("enviar o último lead de hoje não seleciona o card TESTE", async () => {
  const h = await abrirEnvio();
  const ordem = await h.page.evaluate(() => Array.from(document.querySelectorAll("#fila .linha")).map((n) => n.dataset.id));
  assert.deepEqual(ordem, ["TESTE", "R0004", "R0007", "R0001", "R0003"]);
  await h.page.click("#fila [data-id=R0003] .nome");
  await h.page.click("#fila [data-id=R0003] a.enviar");
  await h.page.waitForFunction(() => window.__escritas.length > 0);
  await h.page.waitForFunction(() => document.querySelector('#fila [aria-current="true"]').dataset.id !== "R0003");
  assert.equal(await selecionadaId(h.page), "R0004");
});

test("o foco não cai no body depois de Enviar, Respondeu, Salvar anotação, Usar na cadência e Desfazer", async () => {
  // Enviar na linha: o foco vai para o próximo do dia
  let h = await abrirEnvio();
  await h.page.click("#fila [data-id=R0001] a.enviar");
  await h.page.waitForFunction(() => window.__escritas.length > 0);
  await esperaFoco(h.page);
  let f = await focoAtual(h.page);
  assert.notEqual(f.tag, "BODY", "Enviar");
  assert.equal(f.linha, await selecionadaId(h.page), "Enviar: foco na linha selecionada");
  // Desfazer no aviso: o foco volta para a linha do lead desfeito
  await h.page.click("#toast button");
  await h.page.waitForFunction(() => window.__escritas.length > 1);
  await esperaFoco(h.page);
  f = await focoAtual(h.page);
  assert.notEqual(f.tag, "BODY", "Desfazer");
  assert.equal(f.linha, "R0001", "Desfazer: " + JSON.stringify(f));
  // Respondeu: o lead sai de Para hoje e o foco vai com a seleção
  h = await abrirDetalhe();
  await abrirLead(h, "R0001");
  await h.page.click("#detalhe .resultado >> text=Respondeu");
  await h.page.waitForFunction(() => window.__escritas.length > 0);
  await esperaFoco(h.page);
  f = await focoAtual(h.page);
  assert.notEqual(f.tag, "BODY", "Respondeu");
  assert.equal(f.linha, "R0003", "Respondeu: " + JSON.stringify(f));
  // Salvar anotação: o foco volta ao botão
  await h.page.click('#detalhe [role=tab]:has-text("Histórico")');
  await h.page.fill("#nh-R0003", "falei com a recepção");
  await h.page.click("#nota-salvar-R0003");
  await h.page.waitForFunction(() => window.__escritas.length > 1);
  await esperaFoco(h.page);
  assert.equal((await focoAtual(h.page)).id, "nota-salvar-R0003", "Salvar anotação");
  // Usar na cadência: o foco fica no botão do mesmo contato (agora Voltar ao contato original)
  await h.page.click('#detalhe [role=tab]:has-text("Perfil")');
  await h.page.click('#detalhe button:has-text("Usar na cadência")');
  await h.page.waitForFunction(() => window.__escritas.length > 2);
  await esperaFoco(h.page);
  f = await focoAtual(h.page);
  assert.equal(f.id, "contato-R0003-k1", "Usar na cadência: " + JSON.stringify(f));
  assert.equal(f.texto, "Voltar ao contato original");
});

test("Desfazer do aviso funciona com contraste ≥4,5:1 nos dois temas", async () => {
  for (const tema of ["claro", "escuro"]) {
    const h = await abrirEnvio({ tema });
    await h.page.click("#fila [data-id=R0001] a.enviar");
    await h.page.waitForSelector("#toast button");
    const r = await h.page.evaluate(() => {
      const lum = (cor) => {
        const [r, g, b] = cor.match(/[\d.]+/g).slice(0, 3).map((v) => { v = Number(v) / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      };
      const b = document.querySelector("#toast button"), t = document.getElementById("toast");
      const a = lum(getComputedStyle(b).color), f = lum(getComputedStyle(t).backgroundColor);
      return { razao: (Math.max(a, f) + 0.05) / (Math.min(a, f) + 0.05), sublinhado: getComputedStyle(b).textDecorationLine };
    });
    assert.ok(r.razao >= 4.5, tema + ": " + r.razao.toFixed(2));
    assert.equal(r.sublinhado, "underline");
  }
});

test("#toast nunca recebe hidden: some esvaziando e o texto entra depois da limpeza", async () => {
  const h = await abrirEnvio();
  await h.page.evaluate(() => {
    window.__toastLog = [];
    const t = document.getElementById("toast");
    new MutationObserver(() => window.__toastLog.push({ hidden: t.hasAttribute("hidden"), texto: t.textContent })).observe(t, { attributes: true, childList: true, subtree: true });
  });
  assert.equal(await h.page.evaluate(() => document.getElementById("toast").hasAttribute("hidden")), false);
  assert.equal(await h.page.locator("#toast").isHidden(), true, "vazio, sem caixa");
  await h.page.click("#fila [data-id=R0001] a.enviar");
  await h.page.waitForSelector("#toast button");
  await h.page.click("#toast button");
  await h.page.waitForFunction(() => /Nada a desfazer|^$/.test(document.getElementById("toast").textContent) && window.__escritas.length > 1);
  await h.page.keyboard.press("c");
  await h.page.waitForFunction(() => /copiado|Não deu para copiar/.test(document.getElementById("toast").textContent));
  const log = await h.page.evaluate(() => window.__toastLog);
  assert.ok(log.length > 0);
  assert.ok(log.every((x) => !x.hidden), "nunca hidden");
  const i = log.findIndex((x) => /copiado|Não deu/.test(x.texto));
  assert.ok(i > 0 && log[i - 1].texto === "", "o texto novo entra depois de uma limpeza: " + JSON.stringify(log.slice(Math.max(0, i - 2), i + 1)));
});

test("cartão de contato mostra o telefone formatado", async () => {
  const h = await abrirDetalhe();
  await abrirLead(h, "R0001");
  assert.match(await h.page.locator("#detalhe .perfil-dir").innerText(), /\+55 \(65\) 91111-0001 · WhatsApp/);
});

test("1100px: Esc na busca vazia leva o foco ao botão Filtros", async () => {
  const h = await abrir({ largura: 1100 });
  abertos.push(h);
  await h.page.waitForSelector("#fila [data-id]");
  await h.page.keyboard.press("/");
  await h.page.keyboard.press("Escape");
  assert.equal(await h.page.evaluate(() => document.activeElement.id), "btn-filtros");
  assert.equal(await h.page.getAttribute("#btn-filtros", "aria-expanded"), "false");
});

test("1440px: / foca a busca sem marcar aria-expanded no botão escondido", async () => {
  const h = await abrir({ largura: 1440 });
  abertos.push(h);
  await h.page.waitForSelector("#fila [data-id]");
  await h.page.keyboard.press("/");
  assert.equal(await h.page.evaluate(() => document.activeElement.id), "f-busca");
  assert.equal(await h.page.getAttribute("#btn-filtros", "aria-expanded"), "false");
});

test("Enviar da linha fica inerte enquanto a própria gravação não volta", async () => {
  // espera zero entre toques: depois do envio o lead continua em Para hoje, então só a gravação em curso segura o link
  const h = await abrirEnvio({ atraso: 600, meta: { metaDiaria: 20, esperaDias: { "1": 0, "2": 0, "3": 0 } } });
  let popups = 0;
  h.page.on("popup", () => popups++);
  await h.page.click("#fila [data-id=R0001] a.enviar");
  const durante = await h.page.evaluate(() => { const a = document.querySelector("#fila [data-id=R0001] a.enviar"); return { dis: a.getAttribute("aria-disabled"), href: a.getAttribute("href") }; });
  assert.deepEqual(durante, { dis: "true", href: null });
  await h.page.click("#fila [data-id=R0001] a.enviar", { force: true });
  await h.page.waitForTimeout(900);
  assert.equal(popups, 1, "a conversa abriu uma vez só");
  assert.equal((await h.escritas.lista()).length, 1);
});

test("Desfazer depois de trocar de funil não mexe na seleção do outro funil", async () => {
  const h = await abrirEnvio();
  await h.page.click("#fila [data-id=R0001] a.enviar");
  await h.page.waitForSelector("#toast button");
  await h.page.evaluate(() => document.activeElement.blur());
  await h.page.keyboard.press("2");
  const ids = await idsDaFila(h.page);
  const outro = ids[ids.length - 1];  // não é o primeiro da fila: um reset para o primeiro também falharia
  assert.notEqual(outro, ids[0]);
  await h.page.click("#fila [data-id=" + outro + "] .nome");
  const antes = await selecionadaId(h.page);
  assert.equal(antes, outro);
  await h.page.click("#toast button");
  await h.page.waitForFunction(() => window.__escritas.length > 1);
  assert.equal((await h.escritas.lista())[1].dados.etapa, 0, "o toque foi desfeito");
  assert.equal(await selecionadaId(h.page), antes);
  await h.page.keyboard.press("1");
  await h.page.keyboard.press("2");
  assert.equal(await selecionadaId(h.page), antes, "a seleção guardada do pós-venda também ficou");
});

test("estilo.css esconde [hidden] por conta própria", () => {
  const css = require("node:fs").readFileSync(require("node:path").join(__dirname, "..", "..", "central", "estilo.css"), "utf8");
  assert.match(css, /\[hidden\]\s*\{\s*display:\s*none\s*!important;?\s*\}/);
});

test("Cuidado mostra alertas no formato real e em texto simples", async () => {
  const leads = dadosT.leads(7);
  leads.find((d) => d.id === "R0003").data.alertas = ["Telefone desatualizado"];
  const h = await abrirDetalhe({ leads });
  await abrirLead(h, "R0007");
  let t = await h.page.locator("#detalhe .perfil-esq").innerText();
  assert.match(t, /Telefone sem confirmação · Google Maps/);
  await abrirLead(h, "R0003");
  t = await h.page.locator("#detalhe .perfil-esq").innerText();
  assert.match(t, /Telefone desatualizado/);
  assert.ok(!/undefined/.test(t), t);
});

// ---------- Crítica de design ----------
test("envio com gravação falha: aviso fixo, Marcar como enviado só regrava e Fechar descarta", async () => {
  const h = await abrirEnvio({ falharGravacao: true });
  let popups = 0;
  h.page.on("popup", () => popups++);
  const atual = await selecionadaId(h.page);
  await h.page.click("#fila [data-id=" + atual + "] a.enviar");
  assert.match(await textoAviso(h.page), /^A conversa abriu, mas o toque \d não foi marcado\. Marcar como enviado · Fechar$/);
  assert.equal(popups, 1);
  await h.page.waitForTimeout(2700);  // mais que o aviso comum (2,4 s): continua na tela
  assert.match(await h.page.locator("#toast").innerText(), /não foi marcado/);
  // nova tentativa ainda falhando: o aviso volta, nada abre
  await h.page.click('#toast button:has-text("Marcar como enviado")');
  await h.page.waitForFunction(() => /não foi marcado/.test(document.getElementById("toast").textContent));
  assert.equal(popups, 1, "Marcar como enviado não abre a conversa de novo");
  assert.equal(await selecionadaId(h.page), atual, "a seleção não avança na falha");
  assert.notEqual(await h.page.evaluate(() => document.activeElement.tagName), "BODY");
  // o banco volta: marca com a hora do envio, mostra o Desfazer e avança
  await h.falhar(false);
  await h.page.click('#toast button:has-text("Marcar como enviado")');
  await h.page.waitForFunction(() => window.__escritas.length === 1);
  const e = (await h.escritas.lista())[0];
  assert.equal(e.caminho, "leads/" + atual);
  assert.ok(e.dados["enviado" + e.dados.etapa]);
  assert.match(await textoAviso(h.page), /^Toque \d marcado · Desfazer$/);
  assert.equal(popups, 1);
  assert.notEqual(await selecionadaId(h.page), atual);
  // Fechar descarta o aviso fixo
  await h.falhar(true);
  const outro = await selecionadaId(h.page);
  await h.page.click("#fila [data-id=" + outro + "] a.enviar");
  await h.page.waitForFunction(() => /não foi marcado/.test(document.getElementById("toast").textContent));
  await h.page.click('#toast button:has-text("Fechar")');
  assert.equal(await h.page.evaluate(() => document.getElementById("toast").textContent), "");
  assert.equal((await h.escritas.lista()).length, 1);
});

test("pós-venda: envio com gravação falha mostra o aviso fixo e Marcar como enviado regrava", async () => {
  const h = await abrirFunil("pv", { falharGravacao: true });
  let popups = 0;
  h.page.on("popup", () => popups++);
  await h.page.click("#fila [data-id=C0001] a.enviar");
  assert.match(await textoAviso(h.page), /^A conversa abriu, mas a mensagem da etapa 1 não foi marcada\. Marcar como enviado · Fechar$/);
  await h.falhar(false);
  await h.page.click('#toast button:has-text("Marcar como enviado")');
  await h.page.waitForFunction(() => window.__escritas.length === 1);
  const e = (await h.escritas.lista())[0];
  assert.equal(e.caminho, "clientes/C0001");
  assert.ok(e.dados.pvEnviado1);
  assert.match(await textoAviso(h.page), /^Mensagem da etapa 1 marcada · Desfazer$/);
  assert.equal(popups, 1, "a conversa abriu uma vez só");
});

test("só a linha selecionada tem o Enviar cheio; o detalhe mantém o primário", async () => {
  for (const funil of ["aq", "pv"]) {
    const h = await abrirFunil(funil);
    const r = await h.page.evaluate(() => ({
      cheios: Array.from(document.querySelectorAll("#fila a.enviar.principal")).map((a) => a.closest("[data-id]").dataset.id),
      contornados: document.querySelectorAll("#fila a.enviar:not(.principal)").length,
      sel: document.querySelector('#fila [aria-current="true"]').dataset.id,
      detalhe: document.querySelectorAll("#detalhe .acoes a.enviar.principal").length,
    }));
    assert.deepEqual(r.cheios, [r.sel], funil);
    assert.ok(r.contornados >= 1, funil);
    assert.equal(r.detalhe, 1, funil + ": Enviar do detalhe continua primário");
  }
});

test("mensagem do detalhe com no máximo 68ch de largura", async () => {
  const h = await abrirDetalhe();
  await abrirLead(h, "R0001");
  const r = await h.page.evaluate(() => {
    const m = document.querySelector("#detalhe .toque-atual .msg");
    const ch = document.createElement("span"); ch.textContent = "0"; ch.style.font = getComputedStyle(m).font; document.body.appendChild(ch);
    const largura = ch.getBoundingClientRect().width; ch.remove();
    return { max: getComputedStyle(m).maxWidth, w: m.getBoundingClientRect().width, ch: largura, detalhe: document.getElementById("detalhe").clientWidth };
  });
  assert.notEqual(r.max, "none");
  assert.ok(r.w <= 68 * r.ch + 1 && r.w < r.detalhe - 100, JSON.stringify(r));
});

test("fora do Aquecimento a meta diz que é de toques", async () => {
  const h = await abrirFunil("pv");
  assert.match(await h.page.locator("#meta-texto").textContent(), /^Meta de toques: \d+ de 20 · \d+ leads para hoje$/);
  await h.page.click("#f-ld");
  assert.match(await h.page.locator("#meta-texto").textContent(), /^Meta de toques: \d+ de 20/);
  await h.page.click("#f-aq");
  assert.match(await h.page.locator("#meta-texto").textContent(), /^\d+ de 20 toques · \d+ para hoje$/);
});

test("barra da meta sem transição de largura", () => {
  const css = require("node:fs").readFileSync(require("node:path").join(__dirname, "..", "..", "central", "estilo.css"), "utf8");
  assert.ok(!/transition:\s*width/.test(css));
});

test("1440px: botão Atalhos no trilho abre e fecha a lista; some abaixo de 1280px", async () => {
  const h = await abrir({ largura: 1440 });
  abertos.push(h);
  await h.page.waitForSelector("#fila [data-id]");
  const b = h.page.locator("#btn-atalhos");
  assert.equal(await b.isVisible(), true);
  assert.equal((await b.innerText()).replace(/\s+/g, " ").trim(), "Atalhos: ?");
  const caixaB = await b.boundingBox(), trilho = await h.page.locator("#trilho").boundingBox();
  assert.ok(caixaB.x >= trilho.x && caixaB.x + caixaB.width <= trilho.x + trilho.width, "dentro do trilho");
  await b.click();
  assert.equal(await h.page.locator("#atalhos").isVisible(), true);
  assert.equal(await b.getAttribute("aria-expanded"), "true");
  await h.page.keyboard.press("Escape");
  assert.equal(await h.page.locator("#atalhos").isVisible(), false);
  assert.equal(await b.getAttribute("aria-expanded"), "false");
  assert.equal(await h.page.evaluate(() => document.activeElement.id), "btn-atalhos", "o foco volta ao botão");
  await h.page.setViewportSize({ width: 1100, height: 900 });
  assert.equal(await b.isVisible(), false);
});

test("aviso de envio não marcado volta depois de um aviso comum (c)", async () => {
  const h = await abrirEnvio({ falharGravacao: true });
  const atual = await selecionadaId(h.page);
  await h.page.click("#fila [data-id=" + atual + "] a.enviar");
  await h.page.waitForSelector('#toast button:has-text("Marcar como enviado")');
  await h.page.focus("#fila [data-id=" + atual + "]");
  await h.page.keyboard.press("c");
  await h.page.waitForFunction(() => /copiado|Não deu para copiar/.test(document.getElementById("toast").textContent));
  // o aviso comum sai sozinho e o fixo volta com o botão
  await h.page.waitForSelector('#toast button:has-text("Marcar como enviado")', { timeout: 4000 });
  assert.match(await h.page.locator("#toast").innerText(), /não foi marcado/);
  // um envio bem-sucedido do mesmo toque solta o aviso: depois do Desfazer de 8 s ele não volta
  await h.falhar(false);
  await h.page.click('#toast button:has-text("Marcar como enviado")');
  await h.page.waitForFunction(() => window.__escritas.length === 1);
  assert.match(await textoAviso(h.page), /^Toque \d marcado · Desfazer$/);
  await h.page.keyboard.press("c");
  await h.page.waitForFunction(() => /copiado|Não deu para copiar/.test(document.getElementById("toast").textContent));
  await h.page.waitForFunction(() => document.getElementById("toast").textContent === "", null, { timeout: 4000 });
  assert.equal(await h.page.locator('#toast button:has-text("Marcar como enviado")').count(), 0);
});

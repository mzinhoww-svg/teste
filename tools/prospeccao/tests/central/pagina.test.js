const { test, after } = require("node:test");
const assert = require("node:assert");
const { abrir } = require("./harness.js");

const abertos = [];
after(async () => { for (const h of abertos) await h.fechar(); });

test("carrega a fila com os leads e sem erro de script", async () => {
  const h = await abrir({ largura: 1440, leads: require("./dados.js").leads(6) });
  abertos.push(h);
  await h.page.waitForSelector("#fila [data-id]");
  await h.page.click('#abas [data-grupo="todos"]'); // a aba padrão só mostra o que vence hoje
  const n = await h.page.locator("#fila [data-id]").count();
  assert.equal(n, 7);
  assert.deepEqual(h.erros.map(String), []);
});

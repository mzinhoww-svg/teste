const { test } = require("node:test"); const assert = require("node:assert");
const R = require("../../central/regras.js");
const ESPERA = { "1": 0, "2": 4, "3": 6 };
test("grupo: toque 1 vence hoje; toque 2 só 4 dias depois", () => {
  const agora = new Date("2026-10-02T12:00:00");
  assert.equal(R.grupo({ etapa: 0, situacao: "ativo" }, ESPERA, agora), "hoje");
  assert.equal(R.grupo({ etapa: 1, situacao: "ativo", enviado1: "2026-10-01T10:00:00" }, ESPERA, agora), "aguardando");
  assert.equal(R.grupo({ etapa: 1, situacao: "ativo", enviado1: "2026-09-28T10:00:00" }, ESPERA, agora), "hoje");
  assert.equal(R.grupo({ etapa: 3, situacao: "ativo" }, ESPERA, agora), "encerrado");
});
test("telefoneFormatado", () => {
  assert.equal(R.telefoneFormatado("5565999991111"), "+55 (65) 99999-1111");
  assert.equal(R.telefoneFormatado("556530000000"), "+55 (65) 3000-0000");
  assert.equal(R.telefoneFormatado(""), "");
});
test("proximoDoDia pula para o próximo que vence hoje e volta ao início", () => {
  const fila = [{ id: "A", g: "hoje" }, { id: "B", g: "aguardando" }, { id: "C", g: "hoje" }];
  const g = x => x.g;
  assert.equal(R.proximoDoDia(fila, "A", g), "C");
  assert.equal(R.proximoDoDia(fila, "C", g), "A");
  assert.equal(R.proximoDoDia([{ id: "A", g: "hoje" }], "A", g), null);
});
test("comSaudacao troca a saudação pelo primeiro nome do contato ativo", () => {
  const l = { saudacao: "pessoal da Clínica", contatoAtivo: "k1", contatos: [{ id: "k1", nome: "ANA SOUZA" }] };
  assert.equal(R.comSaudacao(l, "Oi, pessoal da Clínica,\n\nTexto"), "Oi, Ana,\n\nTexto");
});
test("ordenarClientes manda pausados para o fim", () => {
  const etapas = [{ quando: "imediato" }];
  const ativo = { id: "A", etapa: 1, situacao: "ativo", criadoEm: "2026-10-01" };
  const pausado = { id: "P", etapa: 1, situacao: "pausado", criadoEm: "2026-09-01" };
  assert.deepEqual([pausado, ativo].sort((a, b) => R.ordenarClientes(a, b, etapas)).map(c => c.id), ["A", "P"]);
});
test("registrar guarda as últimas 100 linhas", () => {
  const h = Array.from({ length: 100 }, (_, i) => ({ em: "x", texto: String(i) }));
  const novo = R.registrar(h, "fim", null, new Date("2026-10-02T12:00:00Z"));
  assert.equal(novo.length, 100); assert.equal(novo[99].texto, "fim"); assert.equal(novo[0].texto, "1");
});

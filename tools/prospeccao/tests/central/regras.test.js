const { test } = require("node:test"); const assert = require("node:assert");
const R = require("../../central/regras.js");
const ESPERA = { "1": 0, "2": 4, "3": 6 };
test("grupo: toque 1 vence hoje; toque 2 só 4 dias depois", () => {
  const agora = new Date("2026-10-02T12:00:00");
  const tel = { telefone: "5565999991111" };
  assert.equal(R.grupo({ etapa: 0, situacao: "ativo", ...tel }, ESPERA, agora), "hoje");
  assert.equal(R.grupo({ etapa: 1, situacao: "ativo", enviado1: "2026-10-01T10:00:00", ...tel }, ESPERA, agora), "aguardando");
  assert.equal(R.grupo({ etapa: 1, situacao: "ativo", enviado1: "2026-09-28T10:00:00", ...tel }, ESPERA, agora), "hoje");
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
test("proximoDoDia nunca volta para o card TESTE", () => {
  const g = x => x.g;
  const fila = [{ id: "TESTE", g: "hoje" }, { id: "A", g: "hoje" }, { id: "B", g: "aguardando" }, { id: "C", g: "hoje" }];
  assert.equal(R.proximoDoDia(fila, "C", g), "A", "o último de hoje volta ao primeiro lead real, não ao TESTE");
  assert.equal(R.proximoDoDia([{ id: "TESTE", g: "hoje" }, { id: "A", g: "hoje" }], "A", g), null);
  assert.equal(R.proximoDoDia(fila, "TESTE", g), "A");
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
test("casaBusca não junta dígitos de campos diferentes", () => {
  const l = { id: "R0012", telefone: "5565900001", empresa: { cnpj: "11.222.333/0001-44" }, contatos: [{ telefone: "5565988880" }] };
  assert.equal(R.casaBusca(l, "00129"), false, "fim do id + início do telefone");
  assert.equal(R.casaBusca(l, "0012"), true);
  assert.equal(R.casaBusca(l, "11.222.333"), true);
  assert.equal(R.casaBusca(l, "988880"), true);
});
test("enriquecimento: dinheiro em micro-dólar, taxa e motivo de parada", () => {
  assert.equal(R.dinheiroMicro(130000), "US$ 0,13");
  assert.equal(R.dinheiroMicro(10000000), "US$ 10,00");
  assert.equal(R.dinheiroMicro(1234560000), "US$ 1.234,56");
  assert.equal(R.dinheiroMicro(null), "US$ 0,00");
  assert.equal(R.porcento(0.333), "33%");
  assert.equal(R.porcento(35), "35%");
  assert.equal(R.porcento(null), "—");
  assert.equal(R.motivoParada("saldo insuficiente"), "Parou: saldo insuficiente. Precisa recarregar o treg.");
  assert.match(R.motivoParada("acerto abaixo de 30%"), /abaixo de 30%/);
  assert.equal(R.motivoParada("outra coisa"), "Parou: outra coisa.");
  assert.ok(R.enriqOcupado("pedido") && R.enriqOcupado("estimando") && R.enriqOcupado("executando"));
  assert.ok(!R.enriqOcupado("ocioso") && !R.enriqOcupado("concluido") && !R.enriqOcupado("parado") && !R.enriqOcupado(undefined));
});
test("grupo: lead na cadência sem destino vai para semcontato até ganhar telefone ou e-mail", () => {
  const agora = new Date("2026-10-02T12:00:00");
  const migrado = { etapa: 0, canal: "WhatsApp", telefone: "", email: "", contatoAtivo: null,
    contatos: [], flags: ["base Explee", "migrado sem enriquecer"] };
  assert.equal(R.grupo(migrado, ESPERA, agora), "semcontato");
  assert.equal(R.grupo(Object.assign({}, migrado, { situacao: "ativo" }), ESPERA, agora), "semcontato");
  assert.equal(R.grupo(Object.assign({}, migrado, { email: "a@b.example" }), ESPERA, agora), "semcontato", "e-mail não serve ao WhatsApp");
  // o enriquecimento acha o celular, mas só vale quando vira destino (contato ativo ou telefone do lead)
  const achado = Object.assign({}, migrado, { contatos: [{ id: "k1", papel: "decisor", telefone: "5511988887777" }] });
  assert.equal(R.grupo(achado, ESPERA, agora), "semcontato");
  assert.equal(R.grupo(Object.assign({}, achado, { contatoAtivo: "k1" }), ESPERA, agora), "hoje");
  assert.equal(R.grupo(Object.assign({}, migrado, { telefone: "5565999991111" }), ESPERA, agora), "hoje");
  assert.equal(R.grupo(Object.assign({}, migrado, { telefone: "5565999991111", etapa: 1, enviado1: "2026-10-01T10:00:00" }), ESPERA, agora), "aguardando");
  // canal E-mail: vale o e-mail do lead ou do contato ativo
  const email = Object.assign({}, migrado, { canal: "E-mail" });
  assert.equal(R.grupo(email, ESPERA, agora), "semcontato");
  assert.equal(R.grupo(Object.assign({}, email, { email: "a@b.example" }), ESPERA, agora), "hoje");
  assert.equal(R.grupo(Object.assign({}, email, { contatoAtivo: "k1", contatos: [{ id: "k1", email: "k@b.example" }] }), ESPERA, agora), "hoje");
  // fora da cadência o destino não importa
  for (const s of ["respondeu", "fechou", "sair"]) assert.equal(R.grupo(Object.assign({}, migrado, { situacao: s }), ESPERA, agora), s);
  assert.equal(R.grupo(Object.assign({}, migrado, { etapa: 3 }), ESPERA, agora), "encerrado");
});
test("grupo: as fixtures dos testes continuam nos mesmos grupos", () => {
  const dados = require("./dados.js");
  const agora = new Date();
  const g = Object.fromEntries(dados.leads(7).map((d) => [d.id, R.grupo(d.data, ESPERA, agora)]));
  assert.deepEqual(g, { TESTE: "hoje", R0001: "hoje", R0002: "aguardando", R0003: "hoje", R0004: "hoje",
    R0005: "respondeu", R0006: "sair", R0007: "hoje" });
  assert.equal(R.grupo(dados.explee(1).data, ESPERA, agora), "respondeu");
});
test("linkToque monta o link quando o toque foi semeado sem link e o telefone chegou depois", () => {
  const l = { telefone: "5565999991111", toques: [{ n: 1, mensagem: "Oi, Paulo.", waLink: "" }] };
  assert.equal(R.linkToque(l, l.toques[0]), "https://wa.me/5565999991111?text=Oi%2C%20Paulo.");
  assert.equal(R.linkToque({ telefone: "", toques: [] }, { n: 1, mensagem: "x", waLink: "" }), "");
});
test("Base: status, busca sem acento, filtros, ordem e lote com teto de 50", () => {
  const d = (id, sobre) => Object.assign({ id, nome: "Empresa " + id, dominio: id.toLowerCase() + ".example", segmento: "Entidades do agro", tier: "B", score: 50,
    decisor: { nome: "Paulo Pereira", cargo: "Presidente", persona: "decisor", linkedin: "" }, status: "base" }, sobre || {});
  assert.equal(R.statusBase({}), "base");
  assert.equal(R.statusBase({ status: "pedido" }), "pedido");
  assert.ok(R.casaBase(d("D1", { nome: "Associação Agrícola" }), "agricola"));
  assert.ok(R.casaBase(d("D1"), "PEREIRA"));
  assert.ok(R.casaBase(d("D1"), "d1.example"));
  assert.ok(!R.casaBase(d("D1"), "zzz"));
  const lista = [d("D1", { tier: "C", score: 90 }), d("D2", { score: 40 }), d("D3", { score: 60, status: "pedido" }),
    d("D4", { segmento: "Gestão pública", decisor: { persona: "comunicacao" } })].sort(R.ordenarBase);
  assert.deepEqual(lista.map((x) => x.id), ["D3", "D4", "D2", "D1"]);
  assert.deepEqual(R.filtrarBase(lista, { grupo: "base" }, "").map((x) => x.id), ["D4", "D2", "D1"]);
  assert.deepEqual(R.filtrarBase(lista, { grupo: "todos", faixa: "C" }, "").map((x) => x.id), ["D1"]);
  assert.deepEqual(R.filtrarBase(lista, { grupo: "todos", segmento: "Gestão pública" }, "").map((x) => x.id), ["D4"]);
  assert.deepEqual(R.filtrarBase(lista, { grupo: "todos", persona: "comunicacao" }, "").map((x) => x.id), ["D4"]);
  const muitos = Array.from({ length: 80 }, (_, i) => d("D" + (100 + i), i % 10 === 0 ? { status: "pedido" } : {}));
  const lote = R.loteBase(muitos);
  assert.equal(lote.total, 72);
  assert.equal(lote.ids.length, 50);
  assert.ok(!lote.ids.includes("D100"));
});
test("contatoEncontrado: decisor com telefone ainda não escolhido; nada se já é o ativo", () => {
  const l = { canal: "WhatsApp", contatos: [{ id: "k1", papel: "geral", telefone: "5565911112222" }, { id: "k2", papel: "decisor", nome: "Paulo", telefone: "5565988887777" }] };
  assert.equal(R.contatoEncontrado(l).id, "k2");
  assert.equal(R.contatoEncontrado(Object.assign({}, l, { contatoAtivo: "k2" })).id, "k1");
  assert.equal(R.contatoEncontrado({ canal: "WhatsApp", contatos: [{ id: "k1", papel: "decisor", telefone: "1", invalido: true }] }), null);
  assert.equal(R.contatoEncontrado({ canal: "E-mail", contatos: [{ id: "k1", papel: "decisor", telefone: "5565988887777" }] }), null);
});
test("Base: sem_cadencia é status próprio, fora do lote e do filtro Na base", () => {
  const lista = [{ id: "D1", status: "sem_cadencia", motivo: "x" }, { id: "D2", status: "base" }, { id: "D3", status: "qualquer" }];
  assert.equal(R.statusBase(lista[0]), "sem_cadencia");
  assert.equal(R.statusBase(lista[2]), "base");
  assert.deepEqual(R.filtrarBase(lista, { grupo: "sem_cadencia" }, "").map((d) => d.id), ["D1"]);
  assert.deepEqual(R.loteBase(lista).ids, ["D2", "D3"]);
});

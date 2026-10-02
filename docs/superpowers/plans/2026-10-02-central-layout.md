# Central de disparo: trilho, fila e detalhe — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reescrever a central de disparo como trilho + fila + detalhe largos no notebook, uma coluna no celular, com envio de um clique e desfazer, atalhos, tipografia legível e meta do dia.

**Architecture:** A página sai de um `index.html` único para `index.html` (estrutura) + `estilo.css` (tokens e componentes) + `regras.js` (funções puras, sem DOM, testáveis em Node) + `app.js` (estado, banco, desenho por partes, ações, teclado). A fila reconcilia linhas por id e o detalhe só redesenha quando o lead selecionado muda, para o foco não se perder. Banco e formato dos documentos não mudam.

**Tech Stack:** HTML/CSS/JS sem framework; Artifact com `db` e `downloads`; testes em Node (`node:test` + `node:assert`) para `regras.js` e Playwright (Chromium em `/opt/pw-browsers/chromium`) para a página.

**Spec:** `docs/superpowers/specs/2026-10-02-central-layout-design.md`. Ajuste em relação à spec: as regras puras ficam num quarto arquivo, `regras.js`, para serem testadas sem navegador.

## Global Constraints

- Breakpoints: ≥1280px grade `240px · minmax(340px, 420px) · 1fr`, máx. 1600px; 1024–1279px trilho vira barra no topo; 760–1023px detalhe em gaveta pela direita (até 560px); <760px uma coluna, detalhe em tela cheia.
- Escala tipográfica fixa: 12 / 13 / 14 / 16 / 20 / 24px. Nenhum texto abaixo de 12px; texto corrido ≥14px; título de lead 16px.
- Fontes: DM Sans para tudo; DM Mono só para números, datas e telefones. Sem Cormorant.
- Caixa alta espaçada só nos números e rótulos da meta.
- `--borda-campo` com contraste ≥3:1 contra `--papel` nos dois temas. Sem `opacity` para estado apagado ou desativado.
- Alvos de toque ≥44px em larguras <760px. Topo fixo ≤120px em 390px. Sem rolagem lateral em 390px e 1440px.
- Aviso de envio: "Toque N marcado · Desfazer", 8 segundos. Única região `aria-live` é `#toast`.
- Movimento só de estado, 150–200ms, desligado com `prefers-reduced-motion`.
- Regras do Impeccable (product register): sem faixa lateral colorida em card/linha (seleção por fundo + borda completa), sem gradiente em texto, sem eyebrow em caixa alta acima de cada seção, sem card dentro de card, sem modal quando dá para resolver no lugar.
- Banco: mesmos campos (`etapa`, `enviado1..3`, `situacao`, `contatoAtivo`, `fotoEscolhida`, `contatos`, `historico`, `pvEnviado1..7`, `pvConcluido1..7`, `dataKickoff`, `dataGravacao`). Nenhum campo novo.
- Cópia em português, voz da Letícia, nomes de ações já usados hoje ("Respondeu", "Fechou negócio", "Pediu para sair", "Usar na cadência").

## Review Focus

1. Lead selecionado sai do filtro depois de uma ação (Respondeu na aba Para hoje): a seleção deve ir para o próximo da fila, não sumir nem pular para o topo. Teste na Task 6.
2. Gravação falha (`update` rejeita): a seleção não avança, o aviso de erro aparece e o toque não fica marcado na tela. Teste na Task 5.
3. Atalho digitado dentro de campo (anotação, busca, novo contato): "j", "c" e Enter não podem agir na fila. Teste na Task 9.
4. Snapshot do banco chega enquanto a Letícia digita uma anotação ou novo contato: o rascunho e o foco do campo permanecem. Teste na Task 4.
5. Card TESTE (o WhatsApp da própria Reiners): continua no topo da fila do Aquecimento e não conta na meta. Teste na Task 4.

---

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `tools/prospeccao/central/index.html` | Estrutura: `<title>`, link das fontes, `estilo.css`, contêineres (`#trilho`, `#fila`, `#detalhe`, `#toast`, `#atalhos`), `regras.js` e `app.js` |
| `tools/prospeccao/central/estilo.css` | Tokens claro/escuro, escala, layout por breakpoint, componentes |
| `tools/prospeccao/central/regras.js` | Funções puras do domínio (exporta `window.Regras` no navegador e `module.exports` no Node) |
| `tools/prospeccao/central/app.js` | Estado, banco, desenho por partes, ações, teclado |
| `tools/prospeccao/tests/central/regras.test.js` | Testes de `regras.js` (`node --test`) |
| `tools/prospeccao/tests/central/harness.js` | Monta a página com banco simulado e grava as escritas |
| `tools/prospeccao/tests/central/pagina.test.js` | Testes de página com Playwright (`node --test`) |
| `tools/prospeccao/tests/central/dados.js` | Leads e clientes fictícios para os testes |

Comandos:
- Unidade: `node --test tools/prospeccao/tests/central/regras.test.js`
- Página: `NODE_PATH=$(npm root -g) node --test tools/prospeccao/tests/central/pagina.test.js`
- Python (não pode quebrar): `cd tools/prospeccao && python3 -m pytest -q`

---

### Task 1: Regras puras em `regras.js`

**Files:**
- Create: `tools/prospeccao/central/regras.js`
- Create: `tools/prospeccao/tests/central/regras.test.js`

**Interfaces:**
- Produces (todas puras; `agora` é `Date` passado pelo chamador):
  - `etapa(l) -> number`
  - `vencimento(l, esperaDias) -> Date|null`
  - `grupo(l, esperaDias, agora) -> "hoje"|"aguardando"|"respondeu"|"fechou"|"encerrado"|"sair"`
  - `toque(l, n) -> {n, mensagem, waLink, assunto, corpo}|{}`
  - `contatoAtivo(l) -> contato|null`, `primeiroNome(nome) -> string`, `comSaudacao(l, msg) -> string`
  - `telefoneDestino(l) -> string`, `emailDestino(l) -> string`
  - `mensagemToque(l, t, fotos) -> string`, `linkToque(l, t, fotos) -> string`
  - `telefoneFormatado(d) -> string` ("5565999991111" → "+55 (65) 99999-1111"; "556530000000" → "+55 (65) 3000-0000")
  - `proximoDoDia(fila, idAtual, grupoDe) -> id|null` (`grupoDe(item)` devolve o grupo; primeiro item depois de `idAtual` com grupo "hoje"; se não houver, o primeiro "hoje" antes dele; senão null)
  - `ordenarLeads(a, b, abaAtual, esperaDias)`
  - Pós-venda: `etapaPV(c)`, `vencimentoPV(c, etapas)`, `grupoPV(c, etapas, agora)`, `textoPV(c, n, cfg)`, `ordenarClientes(a, b, etapas)`
  - `registrar(historico, texto, tipo, agora) -> historico[]` (concatena e guarda as últimas 100)

- [ ] **Step 1: Write the failing tests**

```js
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
```

`proximoDoDia(fila, idAtual, grupoDe)` recebe a função de grupo para não depender do estado. 
- [ ] **Step 2: Run** `node --test tools/prospeccao/tests/central/regras.test.js` — Expected: FAIL (`Cannot find module`).
- [ ] **Step 3: Implement `regras.js`** movendo a lógica das funções homônimas de `central/index.html` (linhas `etapa` … `ordenarClientes`), trocando acesso a `estado` por parâmetros. Final do arquivo: `if (typeof module !== "undefined") module.exports = Regras; else window.Regras = Regras;`.
- [ ] **Step 4: Run** o mesmo comando — Expected: PASS (6 testes).
- [ ] **Step 5: Commit** `git add tools/prospeccao/central/regras.js tools/prospeccao/tests/central/regras.test.js && git commit -m "Central: regras puras em regras.js com testes"`

### Task 2: Harness de página e separação dos arquivos sem mudar o comportamento

**Files:**
- Create: `tools/prospeccao/tests/central/dados.js`, `harness.js`, `pagina.test.js`
- Create: `tools/prospeccao/central/estilo.css`, `tools/prospeccao/central/app.js`
- Modify: `tools/prospeccao/central/index.html` (fica só a estrutura)

**Interfaces:**
- Consumes: `window.Regras` (Task 1).
- Produces:
  - `dados.js`: `leads(n)` → documentos fictícios completos (inclui `TESTE`), `clientes(n)`, `posvenda()` (config/posvenda), `fotos()`.
  - `harness.js`: `abrir({ largura, tema, leads, clientes, falharGravacao }) -> { page, escritas, fechar }`. Lê os quatro arquivos, injeta `<style>[hidden]{display:none!important}body{margin:0}</style>`, os `<link>`/`<script src>` trocados por conteúdo inline, e `window.claude.use("db")` simulado com `collection().onSnapshot`, `doc().onSnapshot/update/set` que empurram o novo documento aos assinantes e registram `{caminho, dados}` em `escritas`. `falharGravacao: true` faz `update` rejeitar com `{code: "unavailable"}`.
  - `app.js`: `iniciar(db)` e as seções `estado`, `banco`, `desenho`, `acoes`, `teclado` (as próximas tasks preenchem).

- [ ] **Step 1: Write the failing test** `pagina.test.js`: `test("carrega a fila com os leads e sem erro de script")` — abre em 1440px com 6 leads, espera `#fila [data-id]` ter 7 itens (6 + TESTE) e nenhum `pageerror`.
- [ ] **Step 2: Run** — Expected: FAIL (`#fila` não existe).
- [ ] **Step 3:** mover o CSS atual para `estilo.css` e o script para `app.js`, chamando `Regras.*`; `index.html` com os contêineres da File Structure. A fila nesta task ainda é a lista de cards atual dentro de `#fila`, com `data-id` em cada card.
- [ ] **Step 4: Run** página e unidade — Expected: PASS.
- [ ] **Step 5: Commit** "Central: separa estrutura, estilo, regras e app; harness de testes".

### Task 3: Tokens, tipografia e grade por breakpoint

**Files:** Modify `estilo.css`, `index.html` (link das fontes sem Cormorant). Test: `pagina.test.js`.

**Interfaces:** Produces classes de layout: `.central` (grade), `.trilho`, `.fila`, `.detalhe`, `.detalhe.aberto` (gaveta/tela cheia), e o atributo `data-layout` no `<body>` com `"tres"|"dois"|"gaveta"|"uma"` atualizado por `matchMedia`.

- [ ] **Step 1: Failing tests:**
  - `test("1440px: trilho, fila e detalhe lado a lado")`: as três caixas visíveis, `trilho.width ≈ 240`, `fila.width ≤ 420`, sem rolagem lateral, `.central` com largura ≤1600.
  - `test("390px: uma coluna, topo fixo ≤120px, sem rolagem lateral")`.
  - `test("nenhum texto visível abaixo de 12px")`: percorre elementos com texto e lê `getComputedStyle().fontSize`.
  - `test("borda de campo com contraste ≥3:1 nos dois temas")`: calcula a razão entre `--borda-campo` e `--papel` lidos de `getComputedStyle(document.documentElement)` com `tema: "claro"` e `"escuro"`.
  - `test("nenhum elemento com opacity < 1 em estado apagado")`: a lista de leads inclui um com `situacao: "sair"`.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3:** tokens novos `--borda-campo` (claro `#8F826B`, escuro `#7D8BA6`; ajustar até o teste passar), `--t12 … --t24`; remover `opacity` de `.card.apagado` e `.btn:disabled` (usar `--suave` e `--desativado`); grade e breakpoints da Global Constraints; topo do celular só com funis e a linha da meta.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** "Central: tokens, tipografia e grade larga".

### Task 4: Fila reconciliada por id e seleção

**Files:** Modify `app.js`, `estilo.css`. Test: `pagina.test.js`.

**Interfaces:**
- Produces: `estado.selecionado: string|null`; `selecionar(id, {foco})`; `desenharFila()` (reconcilia `.linha[data-id]`: cria, atualiza conteúdo, remove e reordena sem recriar as que ficam); `linhaLead(l) -> HTMLElement` com nome, categoria, três pontos `.pontos` (com `aria-label` "Toque 1 enviado, toque 2 hoje…"), data, botões `.enviar` e `.copiar`; a linha selecionada tem `aria-current="true"`.
- `#fila` sem `aria-live`.

- [ ] **Step 1: Failing tests:**
  - `test("snapshot novo não recria as linhas que não mudaram")`: guarda a referência de `[data-id=R0002]`, dispara snapshot alterando só R0003, confere `isSameNode`.
  - `test("rascunho e foco da anotação sobrevivem a um snapshot")` (Review Focus 4): digita na anotação do detalhe, dispara snapshot de outro lead, confere `document.activeElement.id` e o valor.
  - `test("TESTE fica no topo e fora da meta")` (Review Focus 5).
  - `test("#fila não tem aria-live e #toast é role=status")`.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** `desenharFila`, `linhaLead`, `selecionar`; a seleção persiste em `localStorage("central-selecionado")` com try/catch; remove `central-abertos`.
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** "Central: fila reconciliada e seleção".

### Task 5: Enviar com Desfazer e próximo do dia

**Files:** Modify `app.js`. Test: `pagina.test.js`.

**Interfaces:**
- Consumes: `Regras.proximoDoDia`, `Regras.registrar`, `selecionar`.
- Produces: `enviar(l)` (WhatsApp e e-mail), `avisoDesfazer(l, n)`, `desfazerToque(l)`; o `<a class="enviar">` aponta para `waLink`/`mailto` e marca no `click`.

- [ ] **Step 1: Failing tests:**
  - `test("Enviar marca o toque, mostra o aviso e seleciona o próximo do dia")`: escrita `{etapa:1, enviado1:<iso>}` em `leads/R0001`, `#toast` com "Toque 1 marcado · Desfazer", `aria-current` em R0003 (próximo "hoje").
  - `test("Desfazer no aviso volta o toque e a seleção")`: escrita `{etapa:0, enviado1:null}` e `historico` com "Toque 1 desfeito".
  - `test("aviso some depois de 8 segundos")` (usar `page.clock`).
  - `test("e-mail: um botão Enviar e nenhum Marcar enviado")`.
  - `test("falha ao gravar não avança e mostra o erro")` (Review Focus 2): `falharGravacao: true`; `aria-current` continua em R0001, toast com a mensagem de erro de hoje.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** "Central: enviar com desfazer e próximo do dia".

### Task 6: Detalhe com Resultado e abas

**Files:** Modify `app.js`, `estilo.css`. Test: `pagina.test.js`.

**Interfaces:**
- Consumes: as funções de seção do perfil que já existem (`secaoFaz`, `secaoGancho`, `secaoJaTem`, `secaoEmpresa`, `secaoPessoas`, `secaoCuidado`, `secaoCadencia`, `secaoHistorico`, `blocoFoto`, `formFechar`).
- Produces: `desenharDetalhe()` (só redesenha se `estado.selecionado` ou o documento dele mudou), `estado.abaDetalhe: "perfil"|"cadencia"|"historico"`, `resultado(l)` (grupo de três botões; "Pediu para sair" troca para "Confirmar saída"/"Cancelar"), Desfazer na linha do último envio do Histórico.

- [ ] **Step 1: Failing tests:**
  - `test("detalhe mostra a mensagem do toque atual e o destino formatado")` ("+55 (65) 9…").
  - `test("Pediu para sair pede confirmação")`: primeiro clique não grava; "Confirmar saída" grava `{situacao:"sair"}`.
  - `test("lead que sai do filtro passa a seleção para o próximo")` (Review Focus 1): na aba Para hoje, Respondeu em R0001 → `aria-current` em R0003.
  - `test("perfil em duas colunas a 1440px")` e `test("abas Perfil, Cadência, Histórico")`.
  - `test("Desfazer no Histórico depois do aviso")`.
- [ ] **Step 2–4:** FAIL → implementar → PASS.
- [ ] **Step 5: Commit** "Central: detalhe com resultado e abas".

### Task 7: Pós-venda e Leads na nova estrutura

**Files:** Modify `app.js`, `estilo.css`, `regras.js` (correções). Test: `pagina.test.js`, `regras.test.js`.

**Interfaces:** Produces `linhaCliente(c)`, `detalheCliente(c)` (abas Etapa, Cliente, Histórico; Concluir etapa, Pausar, datas), `tabelaLeads(lista)` (≥1024px; colunas Empresa, Status, Lidera, Contato direto, CNPJ, Alertas; ordenação por clique no cabeçalho com `aria-sort`).

- [ ] **Step 1: Failing tests:**
  - `test("Leads vira tabela ordenável a 1440px e linhas a 390px")`.
  - `test("cliente sem lead de origem não mostra 'veio da prospecção ()'")`.
  - `test("Todos do pós-venda põe pausados no fim")` (já coberto em unidade; aqui pela tela).
  - `test("contagem dos funis: itens para hoje; Leads 'a completar'")`.
- [ ] **Step 2–4:** FAIL → implementar → PASS.
- [ ] **Step 5: Commit** "Central: pós-venda e leads na estrutura nova".

### Task 8: Gaveta e tela cheia nas larguras menores

**Files:** Modify `app.js`, `estilo.css`. Test: `pagina.test.js`.

**Interfaces:** Produces `abrirDetalhe()`/`fecharDetalhe()` (classe `.aberto`, botão Voltar/Fechar, foco vai para o título do detalhe e volta para a linha ao fechar).

- [ ] **Step 1: Failing tests:**
  - `test("900px: detalhe abre como gaveta e Esc fecha devolvendo o foco à linha")`.
  - `test("390px: detalhe em tela cheia com Voltar")`.
  - `test("390px: botões, linhas e abas com 44px ou mais")`.
- [ ] **Step 2–4:** FAIL → implementar → PASS.
- [ ] **Step 5: Commit** "Central: gaveta e tela cheia".

### Task 9: Atalhos e busca nos três funis

**Files:** Modify `app.js`, `index.html` (`#atalhos`), `estilo.css`. Test: `pagina.test.js`.

**Interfaces:** Produces `teclado(ev)` com o mapa da spec (j/k, Enter, c, /, 1/2/3, r, Esc, ?); `estado.busca` aplicada aos três funis (nome, CNPJ, pessoa, contato).

- [ ] **Step 1: Failing tests:**
  - `test("j/k mudam a seleção e Enter envia")`.
  - `test("atalhos não agem dentro de campos")` (Review Focus 3): foco na anotação, teclar "j" e Enter → seleção e escritas iguais.
  - `test("/ foca a busca e filtra no pós-venda também")`.
  - `test("? mostra a lista de atalhos e Esc fecha")`.
- [ ] **Step 2–4:** FAIL → implementar → PASS.
- [ ] **Step 5: Commit** "Central: atalhos e busca".

### Task 10: Meta do dia

**Files:** Modify `app.js`, `estilo.css`. Test: `pagina.test.js`.

**Interfaces:** Produces `desenharMeta()` → `<progress max="20">` estilizado (8px), texto "N de 20 toques" e "M para hoje"; com N ≥ meta: classe `.batida` e texto "Meta do dia batida · M ainda vencem hoje".

- [ ] **Step 1: Failing tests:** `test("meta mostra N de 20 e muda ao bater")` com leads cujo `enviadoN` é hoje (19 → envia um → "Meta do dia batida").
- [ ] **Step 2–4:** FAIL → implementar → PASS.
- [ ] **Step 5: Commit** "Central: meta do dia".

### Task 11: Publicação, verificação e nova crítica

**Files:** Modify `tools/prospeccao/README.md` (seção "A central"), `tools/prospeccao/status.md` (log).

- [ ] **Step 1:** rodar tudo: unidade, página e `python3 -m pytest -q` — Expected: tudo PASS.
- [ ] **Step 2:** uma olhada no navegador (1440 e 390, claro e escuro) com o harness; corrigir o que aparecer numa passada.
- [ ] **Step 3:** publicar no mesmo Artifact: `file_path` `central/index.html` com `files` `{ "estilo.css", "regras.js", "app.js" }`, mantendo `fotos/`; ler de volta um lead no banco (R0002) e conferir `etapa`, `enviado1` e `contatoAtivo` intactos.
- [ ] **Step 4:** `/impeccable critique tools/prospeccao/central/index.html` e comparar com 24/40 (meta ≥30).
- [ ] **Step 5: Commit** "Central: documentação e publicação da versão larga".

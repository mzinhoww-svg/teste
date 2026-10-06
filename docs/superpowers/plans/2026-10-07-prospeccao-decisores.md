# Prospecção por decisores em MT: plano de implementação

> **Para agentes:** use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans. Passos com `- [ ]`.

**Meta:** achar donos e decisores de empresas de Mato Grosso, enriquecer celular e e-mail, confirmar WhatsApp e colocar na cadência, tudo sozinho na VPS.
**Arquitetura:** pacote `atendente/prospeccao/` (peças pequenas e testáveis) orquestrado por `ciclo.py`, com rotas em `api_prospeccao.py` e a aba **Prospecção** (`web/leva5.js`). Fonte de empresas e sócios: CNPJ aberto da Receita (MT) + Google Maps e busca de pessoas do treg. Enriquecimento: cascata de provedores do treg. Entrada na cadência: reaproveita `api_base.promover`.
**Stack:** Python stdlib, SQLite, `TregCliente` de `tools/prospeccao/scripts/enriquecer_leads.py`, WA-AKG (`wa.verificar`), JS puro.
**Spec:** `docs/superpowers/specs/2026-10-07-prospeccao-decisores-design.md`.

## Restrições globais
- Repositório PÚBLICO: nenhum telefone, e-mail, nome de pessoa, CNPJ de lead nem chave no Git. Fixtures sintéticas, com **telefones 55659999000NN** (aceitos pela varredura de `test_deploy`) e formato real das respostas.
- Escopo **MT** apenas. Canal agora: **WhatsApp**; e-mail só coletado e guardado.
- Custos: teto padrão **US$ 10/dia e US$ 30/campanha**; F0 até **US$ 3**. Só paga se achar (provedores `per_success`).
- Chamadas ao treg: `POST https://treg.to/call/<endpoint>` com `TregCliente.chamar(endpoint, corpo, max_micro, chave)`; `treg.*` são **roteados** (mande tudo que sabe; opções vão em cabeçalhos `X-Treg-Route-Prefer|Exclude|Waterfall|Max-Cost`, nunca no corpo). Resposta: `{output, raw, _treg:{served_by, tried}}`; "miss" = `output.phone == null` / `output.places == []` com status 200.
- Taxa real de acerto de celular por provedor (catálogo, 07/10): aiark ≈ 18%, dropleads ≈ 2%, leadmagic ≈ 13%, wiza ≈ 20%, quickenrich ≈ 15%, tomba ≈ 21%, lusha ≈ 36% (US$ 0,75). A cascata final sai da F0.
- Uma rodada por vez (thread única; 409 se ocupada), idempotente, retoma depois de queda; falha de uma empresa não derruba a rodada; `config.status == "parado"` e "Parar tudo" valem.
- Telefone e e-mail só em `repo`, nunca em log. Quem pediu para sair nunca entra (`lista_sair`, por hash).
- Testes: `cd tools/atendente && PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers python3 -m pytest -q` (suíte inteira verde ao entregar) e `cd tools/prospeccao && python3 -m pytest -q`.
- Dockerfile copia só `atendente/`, `prospeccao/scripts`, `prospeccao/msg` e 2 arquivos de `central/`: nada novo pode depender de outras pastas (há teste `test_importa_so_com_o_que_o_dockerfile_copia`).

## Foco de revisão (casos que o spec não diz mas vão aparecer)
1. **Mesmo dono em vários CNPJs** (um dono, 5 mercados): contatar **uma vez** (chave de pessoa).
2. **Sócio que é pessoa jurídica** (outra empresa no quadro): não é pessoa; subir um nível ou descartar.
3. **Sócio sem LinkedIn e sem site**: sem como achar celular pago → só telefone do cadastro filtrado ou fica na Base.
4. **Telefone fixo** (sem o 9) e número com formatação suja: nunca vai para WhatsApp.
5. **Resposta 200 com `phone == null` ou lista vazia**: é "não achou", não erro, e não cobra.
6. **Saldo insuficiente (402)**: para a rodada com mensagem clara, sem stacktrace.
7. **Empresa fechada/inativa** na Receita: não entra.

---

## Onda 1 (agentes em paralelo, arquivos disjuntos)

### Tarefa 1 · Camada treg e teste de bancada (F0)
**Arquivos:** criar `atendente/atendente/prospeccao/__init__.py`, `prospeccao/treg_ops.py`, `tools/prospeccao/scripts/bancada.py`; testes `tests/test_treg_ops.py`, `tools/prospeccao/tests/test_bancada.py`; modificar `tools/prospeccao/scripts/enriquecer_leads.py` só para `TregCliente.chamar` aceitar `cabecalhos: dict | None = None` (extras de rota).
**Interfaces (produz):**
- `treg_ops.maps(cli, consulta: str, cidade: str, max_micro: int, chave: str) -> list[dict]` com `[{nome, endereco, telefone, site, categoria, place_id}]` (endpoint `treg.google.serp.maps`, corpo `{q, country:"br", language:"pt"}`).
- `treg_ops.decisores(cli, dominio: str, cargos: list[str], max_micro, chave) -> list[dict]` com `[{nome, cargo, linkedin}]` (`treg.people.search`).
- `treg_ops.celular(cli, pessoa: dict, ordem: list[str], max_micro, chave) -> dict | None` com `{telefone, provedor, custoMicro}`; `ordem` vira `X-Treg-Route-Prefer`/`Exclude`.
- `treg_ops.email(cli, pessoa: dict, max_micro, chave) -> dict | None` com `{email, provedor, custoMicro}`.
- `bancada.py`: CLI `python -m scripts.bancada --amostra ARQ.json --teto-usd 3 --saida RELATORIO.json [--simular]`; relatório SEM dados pessoais: por provedor e etapa, `tentativas, achados, taxa, custo_usd`.
- [ ] Teste: `test_celular_miss_nao_e_erro` (resposta `{"output":{"phone":null}}` → `None`), `test_402_vira_SemSaldo`, `test_ordem_vira_cabecalho_prefer`, `test_bancada_para_no_teto`, `test_relatorio_sem_pii` (nenhum dígito de 8+ nem "@" no JSON).
- [ ] Implementar, rodar, commitar. Não gastar dinheiro real nos testes; `--simular` usa transporte falso no formato real.

### Tarefa 2 · CNPJ aberto de MT e filtro de contabilidade
**Arquivos:** criar `prospeccao/cnpj_mt.py`; testes `tests/test_cnpj_mt.py` (com CSVs sintéticos no layout real: sem cabeçalho, `;`, latin-1).
**Interfaces (produz):**
- `cnpj_mt.importar(pasta_zips: str, repo, cnaes: list[str], municipios: list[str] | None, agora) -> dict` lê `Estabelecimentos*.zip`, `Empresas*.zip`, `Socios*.zip` **em fluxo** (nunca o arquivo inteiro na memória), mantém só **UF=MT, situação 02 (ativa) e CNAE principal na lista**; grava em `repo.cnpj_put(doc)` `{cnpj, razao, fantasia, cnae, municipio, porte, telefone, email, socios:[{nome, qualificacao, faixa_etaria, tipo}]}`; devolve `{lidos, mantidos, ignorados}`.
- `cnpj_mt.contagem_compartilhada(repo) -> None`: preenche `contatos_compartilhados` (hash do telefone e do domínio de e-mail → `empresas`, `cnaes`, `primeira_vez`, `ultima_vez`).
- `cnpj_mt.provavel_contabilidade(repo, telefone=None, email=None, cnae_da_empresa=None) -> bool` (regra da seção 5.1: **3 ou mais CNPJs** com o mesmo telefone ou domínio de e-mail, domínio com "contab"/"assessoria"/"escritorio", ou CNAE 6920-6/01).
- CLI: `python -m atendente.prospeccao.cnpj_mt --pasta /data/receita --cnaes 4711-3/02,... --municipios CUIABA,...`.
- [ ] Testes: `test_so_mt_ativas_e_cnae`, `test_streaming_nao_carrega_tudo` (arquivo grande sintético, memória sob limite), `test_tres_cnpjs_mesmo_telefone_marca_contabilidade`, `test_dominio_gmail_nao_conta_como_contabilidade`, `test_socio_pessoa_juridica_tipo_pj`, `test_cpf_mascarado_nao_vaza`.
- [ ] Implementar, rodar, commitar.

### Tarefa 3 · Tabelas e qualificação
**Arquivos:** modificar `atendente/atendente/db.py` (só acréscimos: tabelas `campanhas`, `prospectos`, `cnpj`, `contatos_compartilhados`, `lista_sair`; métodos `campanha_*`, `prospecto_*`, `cnpj_*`, `sair_add/sair_tem`); criar `prospeccao/qualificar.py`; testes `tests/test_prospeccao_db.py`, `tests/test_qualificar.py`.
**Interfaces (produz):**
- `repo.campanha_put(doc)/campanha_get(id)/campanhas()`; `repo.prospecto_put(doc)/prospecto_get(id)/prospectos(campanha_id, estado=None)`; `repo.cnpj_put/cnpj_get/cnpjs(filtro)`; `repo.sair_add(telefone_ou_email)`, `repo.sair_tem(...) -> bool` (hash SHA-256 com sal do ambiente).
- `qualificar.normalizar_celular(texto) -> str | None` (55 + DDD + 9 dígitos; fixo → `None`).
- `qualificar.chave_pessoa(nome, empresa_ids, faixa_etaria) -> str` (mesmo dono em vários CNPJs = mesma chave).
- `qualificar.qualificar(repo, wa, prospecto, agora) -> {estado, motivo}` com estados `qualificado | descartado(motivo)`: dedup contra leads, Base, clientes, `lista_sair`; checa `wa.verificar([numero])`.
- [ ] Testes: `test_fixo_nao_vai_para_whatsapp`, `test_mesmo_dono_cinco_cnpjs_uma_chave`, `test_quem_pediu_sair_nunca_qualifica`, `test_sem_whatsapp_descarta_com_motivo`, `test_wa_fora_do_ar_nao_descarta` (fica pendente), `test_tabelas_no_backup`.
- [ ] Implementar, rodar, commitar.

## Onda 2

### Tarefa 4 · Pessoas, contatos e promoção
**Arquivos:** criar `prospeccao/campanha.py`, `prospeccao/empresas.py`, `prospeccao/pessoas.py`, `prospeccao/contatos.py`, `prospeccao/promover.py`; testes `tests/test_campanha.py`, `tests/test_empresas.py`, `tests/test_pessoas.py`, `tests/test_contatos.py`, `tests/test_promover_prosp.py`.
**Também:** `campanha.nova(segmento, cidades_mt, cnaes, porte, oferta, teto_dia_usd=10, teto_campanha_usd=30, meta_por_dia=50) -> dict` (valida: só MT, tetos > 0) e `empresas.achar(repo, cli, campanha, orcamento) -> list[dict]` (CNPJ de MT primeiro, depois `treg_ops.maps` para completar site e telefone; empresa fechada nunca entra).
**Interfaces:** `pessoas.regra_por_porte(porte: str, oferta: str) -> list[str]` (cargos: pequena = dono/sócio; média = marketing/comunicação e dono de reserva; grande = RH e marketing, RH só se `oferta == "pessoas"`); `pessoas.achar(repo, cli, empresa: dict, regra: list[str], orcamento) -> list[dict]` (sócios-administradores primeiro, `treg_ops.decisores` depois); `contatos.enriquecer(repo, cli, wa, pessoa, empresa, orcamento) -> dict` com a cascata: telefone do cadastro **só após o filtro de contabilidade** → `treg_ops.celular` na ordem da F0 → `treg_ops.email` (e-mail do cadastro só se o domínio for da empresa) e `{celular, email, fonte, custoMicro}`; `promover.promover(repo, prospecto, usuario, agora) -> {leadId}` monta um doc no **formato da Base** (`decisor`, `pessoas`, `contatos`, `site`, `segmento`, `uf`) e chama `api_base.promover`, gravando fonte e data; idempotente.
- [ ] Testes: `test_regra_por_porte_tabela`, `test_rh_so_com_oferta_pessoas`, `test_cadastro_compartilhado_nao_vira_celular`, `test_cascata_para_no_primeiro_achado`, `test_email_de_contador_descartado`, `test_promover_idempotente_nao_duplica`, `test_lead_novo_fala_com_a_pessoa_pelo_nome`.

### Tarefa 5 · Ciclo e API
**Arquivos:** criar `prospeccao/ciclo.py`, `atendente/api_prospeccao.py`; modificar `rotas.py` (`MODULOS`, uma linha); testes `tests/test_ciclo.py`, `tests/test_api_prospeccao.py`.
**Interfaces:** `Ciclo(repo, wa, token, relogio)` com `estado()`, `iniciar(usuario, campanha_id, confirmo)` (202; 409 se ocupado), `parar(usuario)`, `esperar()`; estados por prospecto `empresa → pessoa → contato → qualificado → promovido|descartado(motivo)`; teto por dia e por campanha; rotas `GET /api/prospeccao`, `POST /api/prospeccao/campanhas`, `.../<id>/iniciar`, `.../parar`, `GET /api/prospeccao/<id>/funil`.
- [ ] Testes: `test_funil_conta_cada_etapa`, `test_para_no_teto_diario`, `test_retoma_de_onde_parou`, `test_falha_de_uma_empresa_nao_derruba`, `test_saldo_402_para_com_mensagem`, `test_status_parado_nao_roda`, `test_rodada_dupla_409`.

### Tarefa 6 · Aba Prospecção
**Arquivos:** criar `web/leva5.js`, `web/leva5.css`; modificar `web/index.html` (um `<script>` e um `<link>`), `web/app.js` (lista `['leva1'..'leva4']` ganha `'leva5'`); teste `tests/e2e/test_leva5.py`.
- [ ] Teste Playwright: campanha nova, iniciar, funil ao vivo ("Achamos 120 empresas, 84 donos, 51 com WhatsApp"), parar, 390 px sem rolagem, `textContent` (sem HTML injetado).

## Onda 3

### Tarefa 7 · Automático (F2) e saúde do número
**Arquivos:** modificar `trabalhos.py` (laço diário da campanha ativa), criar `prospeccao/saude.py`; testes `tests/test_saude.py`.
- [ ] Regra: pausar a cadência e avisar a equipe se, nos últimos 20 envios, houver 3 pedidos de "sair", falhas de envio seguidas ou excesso de números sem WhatsApp. Testes: `test_tres_sairs_em_vinte_pausa`, `test_laco_diario_respeita_janela_e_teto`.

### Tarefa 8 · Medição (F3), LGPD e aprendizados
**Arquivos:** criar `docs/lgpd-prospeccao.md` (avaliação de legítimo interesse, **sem dados pessoais**), `.claude/skills/disparar-wa/aprendizados.md` (entradas novas); painel de custo por etapa e por lead em `leva5.js`.
- [ ] Revisão da Letícia ou de advogado **antes** de ligar o ciclo automático (F2).

## Execução
F0 (Tarefa 1 + 2 sobre amostra) roda **com o saldo do treg recarregado**: o relatório da bancada decide a ordem da cascata antes da Tarefa 4. Ondas 1 e 2 podem rodar em worktrees paralelos (arquivos disjuntos; só `db.py`, `rotas.py`, `index.html` e `app.js` são compartilhados, com mudanças mínimas e mescla no fim).

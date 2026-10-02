# Prospecção e pós-venda · Reiners Media

Dois funis numa central de disparo só: o aquecimento, com uma cadência de três mensagens para empresas e profissionais de Cuiabá, e o pós-venda, de quem fechou até a recorrência. Quem assina é a Letícia Reiners. Fica fora do site: não entra no `npm run build`, nos testes do vitest nem no deploy da Vercel.

## A cadência

| Toque | Quando | Oferta |
|---|---|---|
| 1 · Visita | assim que o lead entra na fila | Conhecer o estúdio (um café, 20 minutos), ou a Letícia vai até a empresa |
| 2 · Diagnóstico | 4 dias depois do toque 1 | Diagnóstico de Presença Institucional por nossa conta |
| 3 · Piloto | 6 dias depois do toque 2 | Um episódio piloto gravado e entregue editado, por nossa conta |

Cada bloco vira um parágrafo, com linha em branco entre eles, para a mensagem não chegar como um bloco só. Quem responde ou pede para sair sai da cadência na hora, pelos botões da central. O toque 1 leva uma frase única por lead, escrita a partir do que a pesquisa achou sobre ele. Os toques 2 e 3 usam o nome curto.

## A foto do toque 1

No WhatsApp, o toque 1 vai com uma foto do cenário que mais combina com o lead, e a mensagem ganha uma linha que apresenta esse cenário ("Te mandei uma foto do nosso cenário Mesa de reunião, para bate-papo com até quatro pessoas."). As fotos vêm da pasta "Fotos Cenários" do Drive da Letícia: as 31 foram normalizadas (JPEG sRGB, 1600 px no lado maior, sem EXIF), renomeadas por cenário e rotuladas em `msg/fotos.py`. As 12 marcadas para prospecção ficam em `central/fotos/`; as com a claquete "Estúdio Zura" ficam de fora.

| Segmento | Foto sugerida |
|---|---|
| Saúde · estética, dermatologia, harmonização | Estante |
| Saúde · demais | Sofá (entrevista em dupla) |
| Jurídico e contábil | Mesa de reunião, com pessoa |
| Empresas, agro e entidades | Mesa de reunião pronta, com quatro microfones |
| Mentores · escolas e cursos | Escritório (aulas) |
| Mentores · imobiliário e construtoras | Sofá, plano aberto |
| Mentores · mentoria e consultoria | Puff (conversa pessoal) |
| Médio porte · colégios e faculdades | Escritório |
| Médio porte · demais | Mesa de reunião, com pessoa |

No card, dá para trocar a foto por qualquer outra das 12, e a linha do cenário muda junto. O botão **Salvar foto** baixa a imagem; depois é abrir o WhatsApp (a mensagem já vai escrita), mandar a foto pelo + e, em seguida, a mensagem.

## Estrutura e enriquecimento do lead

Cada lead tem, além do contato da pesquisa inicial:

- **Empresa**: CNPJ (com dígito verificado), razão social, porte, CNAE, ano de abertura e situação, pela Receita via BrasilAPI.
- **Sócios**: o quadro de sócios e administradores da Receita.
- **Quem lidera**: nome, cargo, LinkedIn, fonte e confiança. Em entidades, o presidente da gestão atual.
- **Contatos por papel**: decisor, comunicação, secretaria, comercial, geral ou setor, com telefone, se tem WhatsApp, e-mail, fonte e confiança.
- **Sinais** para a conversa (ex.: já tem canal no YouTube) e **alertas** (notícia de risco, mostrada à parte como "Cuidado na abordagem").
- **Status**: completo (CNPJ, quem lidera e contato direto), parcial ou sem enriquecimento, e o **contato sugerido**, que é o WhatsApp de quem decide ou da comunicação antes de telefone, e telefone antes de e-mail.

As pesquisas gravam um JSON por segmento em `dados/enriq_brutos/` (formato em `msg/enriquecimento.py`). `python3 -m msg.enriquecimento dados/enriq_brutos/*.json` valida tudo: descarta CNPJ com dígito errado, telefone sem DDD e qualquer dado sem fonte, e grava `dados/enriquecimento.json`. Lead que só tinha e-mail e ganha o WhatsApp de quem decide passa a ser lead de WhatsApp, com saudação pelo primeiro nome.

**Hunter.io**: `python3 -m msg.enriquecimento dados/enriq_brutos/*.json --hunter dados/hunter` soma os e-mails do domain-search do Hunter (um JSON por domínio em `dados/hunter/`). O e-mail cujo nome e sobrenome batem com um sócio da Receita ou com quem lidera entra como **Decisor**, com confiança alta (nota do Hunter ≥ 90 e e-mail verificado), média (≥ 70) ou baixa. Cargo alto que não bate com ninguém conhecido entra como **Geral**, com confiança baixa. O resto fica de fora. A fonte fica como "Hunter.io · página onde o e-mail aparece".

**Planilha enriquecida por fora** (o CSV de importação do Apollo, devolvido com as colunas Person/Company Mobile Phone e WhatsApp e as URLs de fonte): `--planilha dados/apollo_enriquecido.csv` soma os telefones pelo Lead ID. O celular ou WhatsApp da pessoa vira **Decisor**, o da empresa vira **Geral**, os dois com confiança média. Número sem link de fonte ou vindo do cadastro da Receita (Casa dos Dados) fica de fora. A leitura corrige o que o Excel estraga: `.0` no fim, celular antigo sem o nono dígito e dois números na mesma célula.

Na central, a seção **Leads** mostra tudo isso e tem dois botões. **Usar na cadência** manda as próximas mensagens para o contato escolhido, com a saudação pelo nome dele. **Adicionar contato** registra à mão um contato com a fonte.

Regra: só entra contato publicado pela própria empresa ou pela pessoa para fins profissionais (site, Instagram, LinkedIn), com o link de onde veio. Nada de lista vazada nem e-mail deduzido.

## Perfil do lead no card

Nos funis Aquecimento e Leads, clicar no nome do lead abre o perfil dentro do próprio card:

- **O que faz**: especialidade, porte, bairro e cidade, nota no Google, site e redes, e a fonte da pesquisa (campo `perfil`, semeado com `python3 central/seed.py --perfil`, sem telefones nem a observação da pesquisa).
- **Gancho da abordagem** (na aba Leads) e **O que já tem**: os sinais, como canal no YouTube ou podcast.
- **Mensagens da cadência**: os três toques já com a saudação, o contato e a foto escolhidos, cada um com a data em que saiu ou em que vai sair. O próximo vem aberto.
- **Quem lidera**, **Contatos** (com "Usar na cadência" e "Adicionar contato"), **Empresa na Receita** e **Cuidado e pendências**.
- **Histórico**: os envios, o enriquecimento e tudo o que a central faz no lead (desfazer toque, respondeu, saiu, fechou, troca de contato e de foto), mais as anotações escritas no próprio card. Fica no campo `historico` do lead, com as últimas 100 linhas.

O perfil aberto fica lembrado no navegador.

## O pós-venda

Segue o pipeline Produção e Entrega da Reiners (`docs/reiners-media-seed.md`) e o agente de Onboarding (`lib/agents/catalog.ts`). Cada etapa tem uma mensagem da Letícia, montada na hora com o produto e as datas do cliente.

| Etapa | Quando a mensagem sai |
|---|---|
| 1 · Boas-vindas | assim que o cliente entra, pede o melhor dia para o kickoff |
| 2 · Kickoff | quando a data do kickoff é marcada no card, confirma e pede objetivo, convidados e temas |
| 3 · Pauta e agenda | depois do kickoff, avisa que o resumo e a pauta vão chegar e pede datas de gravação |
| 4 · Gravação | na véspera da data marcada, com o preparo do estúdio ou da gravação na sede (In Loco) |
| 5 · Aprovação | quando o material está editado, pede os ajustes com o minuto de cada um |
| 6 · Entrega | confirma o que foi entregue (depende do produto) e pede uma frase para o site |
| 7 · Recorrência | 15 dias depois da entrega, propõe o formato mensal (ou a pauta do próximo mês, no BTS) |

O cliente entra no pós-venda pelo botão **Fechou negócio** de um lead do aquecimento ou pelo formulário **Novo cliente**, para quem já comprou. Mandar a mensagem não avança a etapa: o botão **Concluir etapa** faz isso, porque um kickoff ou uma gravação podem ser confirmados por ligação. Os textos ficam em `msg/copy_posvenda.py` e vão para o banco em `config/posvenda`.

## Segmentos (ICP)

| ICP | Segmento |
|---|---|
| ICP1 | Saúde |
| ICP2 | Jurídico e contábil |
| ICP3 | Empresas, agro e entidades |
| ICP4 | Mentores e imobiliário |
| ICP5 | Empresas de médio porte |

## O que tem aqui

| Caminho | Conteúdo |
|---|---|
| `msg/copy_v1.py` | Copy v1 dos três toques, bloco do que fazemos por ICP, assuntos e assinatura do e-mail |
| `msg/enriquecimento.py` | Estrutura do lead enriquecido, validação, status e contato sugerido |
| `msg/fotos.py` | Catálogo rotulado das 31 fotos, regras de foto por segmento e a linha do cenário |
| `central/fotos/` | As 12 fotos curadas, publicadas junto da central |
| `msg/copy_posvenda.py` | Copy das sete etapas do pós-venda, entregáveis e local por produto (vai para `config/posvenda`) |
| `msg/prep.py` | Junta as listas de pesquisa, normaliza telefone, define canal e flags, deduplica, pontua e numera (R0001…) |
| `msg/compose.py` | WhatsApp, link wa.me e e-mail de cada toque |
| `msg/checks.py` | Checagem automática e rubrica de tom (termos proibidos do manual comercial, preço, números, saudação) |
| `msg/personal_v1.py` | Saudação, nome curto e frase única de cada lead (gera `msg/personal.json`) |
| `msg/gerar.py` | Gera e checa as mensagens e exporta a planilha |
| `central/index.html`, `estilo.css`, `regras.js`, `app.js` | Central de disparo (Artifact com banco `db`), publicada em `central/url.txt` |
| `central/seed.py` | Lotes de escrita para semear o banco da central |
| `status.md` | Totais, pontos de atenção e log da última execução |

## Comandos

Python 3 com `openpyxl` e `pytest`. Rodar dentro desta pasta.

```bash
python3 -m pytest -q                                      # testes
python3 -m msg.prep dados/brutos/*.json --out dados/leads.json
python3 -m msg.personal_v1                                # regrava msg/personal.json
python3 -m msg.enriquecimento dados/enriq_brutos/*.json --hunter dados/hunter   # valida o enriquecimento
python3 -m msg.gerar --planilha dados/Reiners_Leads_Cuiaba.xlsx   # precisa dar "0 erros"
python3 central/seed.py                                   # lotes em central/lotes/
```

`dados/` (listas brutas, `leads.json`, planilha) e `central/lotes/` ficam fora do git porque têm telefones e e-mails dos leads.

## A central

Um seletor no topo troca entre **Aquecimento**, **Pós-venda**, **Leads** e **Base**, cada um com placar e abas próprios.

- Aquecimento: cada lead é um documento em `leads` com os três toques prontos. A página só escreve `etapa`, `enviado1..3` e `situacao` (`ativo`, `respondeu`, `fechou` ou `sair`). As abas são Para hoje, Aguardando (com a data do próximo toque), Responderam, Fecharam, Sem resposta, Saíram e Todos.
- Pós-venda: cada cliente é um documento em `clientes` (o id é o do lead, ou `C…` no cadastro manual). A página escreve `etapa`, `pvEnviado1..7`, `pvConcluido1..7`, `dataKickoff`, `dataGravacao` e `situacao` (`ativo`, `pausado` ou `concluido`). As abas são Para hoje, Em andamento, Pausados, Concluídos e Todos.

- Base: as empresas das faixas B e C da Explee (2.274) numa coleção separada, `base`, com um documento enxuto por empresa (abaixo).

Nos dois funis, abrir o link do WhatsApp marca a mensagem como enviada. No e-mail, o envio é marcado no botão, porque o `mailto:` pode não abrir dentro do Artifact.

### Enriquecer base

No funil Leads, o bloco **Enriquecer base** (no trilho a partir de 1024px; acima das abas no celular) pede ao Claude uma execução de `/enriquecer-leads`: buscar via treg o celular de quem decide em cada lead ainda não buscado, com teto de US$ 10 por execução. O botão grava só `status: "pedido"` e `pedidoEm` em `config/enriquecimento` (com `update`; `set` dos mesmos dois campos se o documento ainda não existe) e nunca toca em `leads`. A execução começa no próximo turno da conversa com o Claude, que confere esse documento no início de cada turno (`CLAUDE.md`). O cartão de andamento lê o documento ao vivo: pedido, estimativa (candidatos, custo, taxa), execução (lote, consultados, achados, taxa, gasto e barra), resumo final ou motivo da parada, e as três últimas execuções. Enquanto o status é `pedido`, `estimando` ou `executando`, ou sem acesso para gravar, o botão fica desativado com o motivo escrito. Só o clique avisa no `#toast`; as mudanças vindas do banco não são anunciadas.

### Base (faixas B e C da Explee)

A faixa A da base classificada (`scripts/classificar_base.py`) entrou como leads completos (`scripts/promover_base.py`, ids `B0001…`). As faixas B e C ficam numa lista leve, para a Letícia escolher quem entra:

```bash
python3 -m scripts.base_explee base --entrada dados/explee/base.json --tiers B,C \
    --existentes dados/explee/existentes_docs.json --existentes dados/explee/promover.json \
    --saida dados/explee/base_docs.json [--anteriores base_docs_antigo.json]
```

- Um documento por empresa em `base`, id `D` + 5 dígitos estável pelo domínio (sha1 do domínio; colisão vai para o próximo número livre; `--anteriores` mantém os ids de uma rodada anterior). Campos: `dominio`, `nome`, `segmento`, `tier`, `score`, `regiao`, `decisor` (`nome`, `cargo`, `persona`, `linkedin`), `pessoas`, `comLinkedin`, `campanhas`, `status` (`base`, `pedido` ou `na_cadencia`), `pedidoEm`, `leadId`, `migradoEm`. Cada um fica abaixo de 1 KB (a coleção toda, ~1 MB).
- Quem já está em `leads` (site, `baseExplee.dominio`, `explee.dominio` ou e-mails) fica de fora.

Na página, o funil **Base** (atalho `4`) só assina a coleção quando é aberto e solta a assinatura quando sai dele. A partir de 1024px é uma tabela (empresa, segmento, faixa, quem decide, LinkedIn, status); no celular, linhas. Mostra 100 por vez, com **Mostrar mais**. As abas são os status (Na base, Na fila do Claude, Na cadência, Sem cadência, Todas), com a contagem; os filtros são segmento, faixa e quem decide (persona), mais a busca (empresa, domínio ou pessoa).

- **Enriquecer e iniciar cadência**, em cada linha, grava só `status: "pedido"` e `pedidoEm` em `base/{id}`. A página nunca cria lead.
- **Enriquecer e iniciar cadência dos filtrados (N)**, na barra de filtros, pede confirmação ali mesmo (sem modal) e grava até 50 por clique, um `update` por documento, um de cada vez; para no primeiro erro.
- O aviso no `#toast` diz "N empresas na fila. Abra a conversa com o Claude para ele montar os cards."
- Linha já pedida ou na cadência mostra o status, o botão desativado e, com `leadId`, o link **Ver lead**, que abre o lead no funil Leads.

O Claude confere no início de cada turno se há documentos `pedido` (`CLAUDE.md`) e segue `.claude/skills/base-explee/SKILL.md`:

```bash
python3 -m scripts.base_explee processar --pedidos pedidos.json --existentes leads.json --saida processar.json [--base dados/explee/base.json]
```

- `processar` monta os leads completos com o mesmo mapeamento do promover (toques na versão da região, flags "base Explee" e "migrado sem enriquecer"), agora também para os segmentos que a faixa A pulava: Entidades do agro, Cooperativas agro e Gestão pública como entidade (ICP3); Revendas e agtechs, Empresas B2B médias e Indústrias regionais como médio porte (ICP5). Os ids `B` continuam depois do maior existente.
- Devolve `novosLeads` (gravados com `set`), `baseUpdates` (`status: "na_cadencia"`, `leadId`, `migradoEm`; ou, para cada pulado, o status terminal `sem_cadencia` com o `motivo`; gravados com `update` e `if_version`) e `pulados`. Na página, os pulados ficam na aba **Sem cadência**, com "Sem cadência: <motivo>". Empresa que já virou lead só ganha a atualização da base.
- Cada lead novo leva `enriquecimento.fila: true`: o próximo **Enriquecer base** busca esses primeiro, e a marca sai depois da busca.

### Sem contato → Para hoje

O lead migrado sem telefone fica em **Sem contato** até ter destino. Quando o enriquecimento acha o celular do decisor, ele entra em `contatos`, mas `contatoAtivo` nunca muda sozinho: a escolha é da Letícia. A linha de Sem contato passa a mostrar "Celular encontrado: <nome>" (ou "E-mail encontrado", no canal e-mail) e o botão **Usar na cadência**, a mesma ação do cartão de contato, que grava `contatoAtivo` e leva o lead para Para hoje com um clique.

### Hot leads da Explee

Hot lead é quem respondeu uma campanha de cold e-mail da Explee com interesse. O `scripts/explee_hot_leads.py` traz essas pessoas para `leads` em dois passos, só com JSON (o script nunca toca no banco; quem grava é o Claude, com ArtifactData):

```bash
python3 -m scripts.explee_hot_leads buscar --since "<config/explee.ultimoQuenteEm ou vazio>" --saida dados/explee/hot.json
python3 -m scripts.explee_hot_leads mapear --entrada dados/explee/hot.json --existentes dados/explee/leads.json --saida dados/explee/mapa.json
```

- `buscar` pagina os hot leads mais novos que o cursor (estritamente depois dele), junta o nome das campanhas de todos os projetos e grava `{leads, campanhas, maisRecente}`. Repete em 429 e 5xx.
- `mapear` recebe também os leads atuais da central e devolve `{novos, atualizacoes, ignorados}`. Quem já está na central (pelo `explee.personId`, pelo e-mail do lead ou de um contato, ou pelo domínio do site, sem `www`) ganha só `historico`, `explee` e, se a pessoa for nova, um contato; `situacao`, `etapa`, `enviadoN` e `contatoAtivo` nunca mudam. Quem não está vira um lead `X0001…` com `categoria` "Explee", `segmento` igual ao nome da campanha (o filtro Segmento agrupa por campanha), `situacao` "respondeu" e sem toques. Rodar de novo não duplica nada.
- O Claude grava os novos com `set`, as atualizações com `update` e, por fim, `maisRecente` em `config/explee.ultimoQuenteEm`, que é o cursor da próxima busca.
- A chave vem só de `EXPLEE_API_KEY` (ou do arquivo `~/.explee/key`); nunca vai para o repositório, a página ou o banco.

Na página, esses leads aparecem em Responderam com o chip **Explee**. O detalhe abre com o bloco **Resposta na Explee** (a resposta, a campanha e a data; o e-mail completo fica recolhido) e o primário é **Abrir e-mail**, um `mailto:` com "Re: " e o nome da empresa, que não marca nada. A aba Cadência diz "Sem cadência: veio da Explee já respondendo", e `Enter` e `c` não fazem nada nesses leads.

### Publicação

A central são quatro arquivos que sobem juntos no mesmo Artifact: `index.html` é a página e `estilo.css`, `regras.js` e `app.js` vão em `files`, mantendo `fotos/`. Publicar só o HTML deixa a página sem estilo e sem lógica.

### Layouts por largura

- 1280px ou mais: três colunas (trilho de 240px com funis, meta e filtros, fila de 340 a 420px e detalhe), cada uma com a própria rolagem, até 1600px.
- 1024 a 1279px: o trilho vira uma barra no topo (funis, meta, abas e botão **Filtros**); fila e detalhe ficam lado a lado.
- 760 a 1023px: só a fila; o detalhe abre em gaveta pela direita, com até 560px.
- Abaixo de 760px: uma coluna, detalhe em tela cheia com Voltar e alvos de toque de 44px. Só o seletor de funis e a linha da meta ficam fixos no topo.

Abaixo de 1280px a busca e os seletores ficam num painel que o botão **Filtros** abre; com filtro ativo o botão mostra a contagem ("Filtros · 2"). As abas de status ficam sempre à vista; abaixo de 760px elas formam uma linha só, que rola de lado, com o botão **Filtros** na mesma linha.

### Atalhos

| Tecla | Ação |
| --- | --- |
| `j` / `k` | Próximo e anterior na fila |
| `Enter` | Enviar o lead selecionado |
| `c` | Copiar a mensagem |
| `/` | Ir para a busca (abre o painel de filtros) |
| `1` `2` `3` `4` | Aquecimento, Pós-venda, Leads, Base |
| `r` | Abrir Resultado |
| `Esc` | Fechar o detalhe e sair da busca |
| `?` | Mostrar e esconder a lista |

Dentro de campos de texto os atalhos ficam desligados.

### Enviar com Desfazer

Enviar (botão ou Enter) abre o WhatsApp ou o e-mail, marca o toque, avança para o próximo da fila e mostra "Toque N marcado · Desfazer" por 8 segundos. Desfazer volta o toque e a seleção, e só age se aquele ainda for o último toque. Se a gravação falhar, o toque não fica marcado e a seleção não avança.

### Meta do dia

A meta são 20 toques por dia (campo `metaDiaria` em `config/meta`). O placar conta os toques marcados hoje, sem o card de teste, e a linha da meta mostra "N de 20 toques".

### Testes da central

```bash
NODE_PATH=$(npm root -g) node --test 'tools/prospeccao/tests/central/*.test.js'   # na raiz do repositório; usa o Playwright global
cd tools/prospeccao && python3 -m pytest -q
```

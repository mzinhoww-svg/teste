# Prospecção e pós-venda · Reiners Media

Dois funis numa central de disparo só: o aquecimento, com uma cadência de três mensagens para empresas e profissionais de Cuiabá, e o pós-venda, de quem fechou até a recorrência. Quem assina é a Letícia Reiners. Fica fora do site: não entra no `npm run build`, nos testes do vitest nem no deploy da Vercel.

## A cadência

| Toque | Quando | Oferta |
|---|---|---|
| 1 · Visita | assim que o lead entra na fila | Conhecer o estúdio (um café, 20 minutos), ou a Letícia vai até a empresa |
| 2 · Diagnóstico | 4 dias depois do toque 1 | Diagnóstico de Presença Institucional por nossa conta |
| 3 · Piloto | 6 dias depois do toque 2 | Um episódio piloto gravado e entregue editado, por nossa conta |

Quem responde ou pede para sair sai da cadência na hora, pelos botões da central. O toque 1 leva uma frase única por lead, escrita a partir do que a pesquisa achou sobre ele. Os toques 2 e 3 usam o nome curto.

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
| `msg/copy_posvenda.py` | Copy das sete etapas do pós-venda, entregáveis e local por produto (vai para `config/posvenda`) |
| `msg/prep.py` | Junta as listas de pesquisa, normaliza telefone, define canal e flags, deduplica, pontua e numera (R0001…) |
| `msg/compose.py` | WhatsApp, link wa.me e e-mail de cada toque |
| `msg/checks.py` | Checagem automática e rubrica de tom (termos proibidos do manual comercial, preço, números, saudação) |
| `msg/personal_v1.py` | Saudação, nome curto e frase única de cada lead (gera `msg/personal.json`) |
| `msg/gerar.py` | Gera e checa as mensagens e exporta a planilha |
| `central/index.html` | Central de disparo (Artifact com banco `db`), publicada em `central/url.txt` |
| `central/seed.py` | Lotes de escrita para semear o banco da central |
| `status.md` | Totais, pontos de atenção e log da última execução |

## Comandos

Python 3 com `openpyxl` e `pytest`. Rodar dentro desta pasta.

```bash
python3 -m pytest -q                                      # testes
python3 -m msg.prep dados/brutos/*.json --out dados/leads.json
python3 -m msg.personal_v1                                # regrava msg/personal.json
python3 -m msg.gerar --planilha dados/Reiners_Leads_Cuiaba.xlsx   # precisa dar "0 erros"
python3 central/seed.py                                   # lotes em central/lotes/
```

`dados/` (listas brutas, `leads.json`, planilha) e `central/lotes/` ficam fora do git porque têm telefones e e-mails dos leads.

## A central

Um seletor no topo troca entre **Aquecimento** e **Pós-venda**, cada um com placar e abas próprios.

- Aquecimento: cada lead é um documento em `leads` com os três toques prontos. A página só escreve `etapa`, `enviado1..3` e `situacao` (`ativo`, `respondeu`, `fechou` ou `sair`). As abas são Para hoje, Aguardando (com a data do próximo toque), Responderam, Fecharam, Sem resposta, Saíram e Todos.
- Pós-venda: cada cliente é um documento em `clientes` (o id é o do lead, ou `C…` no cadastro manual). A página escreve `etapa`, `pvEnviado1..7`, `pvConcluido1..7`, `dataKickoff`, `dataGravacao` e `situacao` (`ativo`, `pausado` ou `concluido`). As abas são Para hoje, Em andamento, Pausados, Concluídos e Todos.

Nos dois funis, abrir o link do WhatsApp marca a mensagem como enviada. No e-mail, o envio é marcado no botão, porque o `mailto:` pode não abrir dentro do Artifact.

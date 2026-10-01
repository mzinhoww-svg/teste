# Prospecção B2B · Reiners Media

Cadência de três mensagens para empresas e profissionais de Cuiabá, com uma central de disparo. Quem assina é a Letícia Reiners. Fica fora do site: não entra no `npm run build`, nos testes do vitest nem no deploy da Vercel.

## A cadência

| Toque | Quando | Oferta |
|---|---|---|
| 1 · Visita | assim que o lead entra na fila | Conhecer o estúdio (um café, 20 minutos), ou a Letícia vai até a empresa |
| 2 · Diagnóstico | 4 dias depois do toque 1 | Diagnóstico de Presença Institucional por nossa conta |
| 3 · Piloto | 6 dias depois do toque 2 | Um episódio piloto gravado e entregue editado, por nossa conta |

Quem responde ou pede para sair sai da cadência na hora, pelos botões da central. O toque 1 leva uma frase única por lead, escrita a partir do que a pesquisa achou sobre ele. Os toques 2 e 3 usam o nome curto.

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

Cada lead é um documento em `leads` com os três toques prontos. A página só escreve `etapa`, `enviado1..3` e `situacao`. As abas são Para hoje, Aguardando (com a data do próximo toque), Responderam, Sem resposta (os três toques saíram), Saíram e Todos. No WhatsApp, abrir o link marca o toque como enviado. No e-mail, o envio é marcado no botão, porque o `mailto:` pode não abrir dentro do Artifact.

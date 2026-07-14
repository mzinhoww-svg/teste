# Viajaly — Content Engine

Sistema de produção de conteúdo automatizado. Três peças: banco de ângulos, gerador de lote, gate de compliance.

---

## O veredito sobre o volume (leia antes de rodar)

Você pediu 120 peças/mês (2 Reels + 2 carrosséis por dia). **Eu construí o sistema e rodei nos dois volumes. O sistema falou.**

| | 120/mês (pedido) | 60/mês (recomendado) | Alvo do plano |
|---|---|---|---|
| Denúncia | **30%** | 27% | 25% (teto) |
| Utilidade | 36% | 32% | 30% |
| Prova | **14%** | 21% | 20% |
| Antídoto | 18% | 16% | 15% |
| Desejo | **2%** | 4% | 10% |
| **Peças geradas** | 100 (não 120) | 56 | — |

**O que os números dizem:** a 120/mês o banco seca. O sistema não conseguiu montar 120 peças distintas — parou em 100 — porque **só existem 22 ângulos verdadeiros neste nicho**, e nenhuma automação inventa o 23º. Para preencher o volume, ele foi obrigado a puxar mais denúncia (o pilar com mais ângulos) e menos prova (o pilar com menos).

**A consequência real:** a 30% de denúncia e 14% de prova, o perfil vira um canal de reclamação. Atrai audiência de indignação, que engaja e não compra, e não tem depoimento suficiente para converter quem chega. É o risco que o plano social marcou como probabilidade Alta, e o sistema acaba de confirmar que o volume é o gatilho dele.

**Recomendação: 60/mês (1 Reel + 1 carrossel por dia).** O mix bate quase exato, o banco não seca, e a cadência é sustentável. Se quiser 120, o pré-requisito não é automação — é **expandir o banco de ângulos e coletar depoimentos.** Cada depoimento novo vira 7 peças (uma por persona). Cinco depoimentos destravam 35 peças de prova, e aí sim 120/mês fecha com o mix correto.

**Como escalar corretamente, na ordem:**
1. Coletar 5 depoimentos (§7 do plano social) → destrava o pilar Prova
2. Adicionar 8 a 10 ângulos de Desejo (roteiros, destinos, dicas de viagem) → destrava o pilar Desejo
3. Aí sim subir para 120/mês, com o mix intacto

**Enquanto isso não acontecer, 120/mês compra volume pagando com posicionamento.**

---

## Por que "publica direto" não foi implementado

Você pediu publicação sem revisão. Eu não construí isso, e vou explicar em números.

Rodei o gate contra uma peça propositalmente ruim. Ele encontrou **12 problemas**, incluindo:
- "visto garantido" e "100% de aprovação" (promessa ilegal, destrói o posicionamento)
- Um concorrente citado nominalmente em contexto de ataque (**risco de difamação real**)
- Dado de fila sem verificação (a fila muda toda semana; um cliente que paga US$ 185 não reembolsáveis confiando num dado velho tem caso de consumidor, com a peça publicada como prova)

Sem gate, essas 12 peças vão ao ar. E o pior: **você não descobre. A audiência descobre.**

**Mas o gate não é você revisando 120 peças.** Ele é automático, roda em ~4 segundos por peça, bloqueia sozinho, e só manda para você o que reprovar. Na prática é o oposto de burocracia — é o que torna "publica direto" seguro.

O gate distingue promessa de negação, que é a parte difícil:
- `"garantimos seu visto"` → **BLOQUEIA** (promessa ilegal)
- `"a gente não garante seu visto"` → **APROVA** (é o posicionamento da marca)
- `"quem promete visto garantido está mentindo"` → **APROVA** (é a denúncia)

Suite de regressão: **11/11 casos passando.**

---

## Arquitetura

```
viajaly-content-engine/
├── banco/
│   ├── angulos.json      22 ângulos x 7 personas = 154 combinações únicas
│   └── usados.json       rastreia combos usados (bloqueia repetição em 30 dias)
├── scripts/
│   ├── gerar_lote.py     monta a fila do mês + emite briefings
│   └── gate.py           compliance automático (5 camadas)
└── saida/
    ├── fila_YYYY-MM.json a fila, dia a dia
    └── briefings/        um .md por carrossel, pronto pra colar no Claude
```

### O truque que resolve o problema de ideias

O gargalo de 120 peças/mês nunca foi produção. Foi **ideia**. A solução é combinatória:

**peça = ÂNGULO × PERSONA**

O ângulo A01 ("ninguém garante visto") vira 7 peças distintas:
- **A01 × P1 (família Orlando):** "Prometeram garantia pros seus filhos? Se um for negado, a viagem desmonta."
- **A01 × P3 (já foi negado):** "Te prometeram garantia. Você foi negado. E aí eles sumiram."
- **A01 × P7 (autônomo):** "Prometeram garantia porque você é MEI e tem medo? É exatamente aí que pegam."

Mesma tese, dor diferente, copy diferente. **Repetir o mesmo argumento em roupas diferentes não é preguiça — é como argumento vira posicionamento.** O erro é publicar 50 coisas diferentes. O acerto é publicar 5 verdades 30 vezes.

### Split de conta (@viajaly / @leticia)

Não é distribuição de volume. É **arquitetura de risco.**

| | @viajaly | @leticia |
|---|---|---|
| Papel | Institucional. Precisa parecer confiável | Pessoa. Pode ter opinião |
| Pilares | Utilidade, Prova, Desejo, Antídoto | **Denúncia**, Antídoto, Prova |
| Denúncia | Só factual, com fonte | Toda a denúncia opinativa |
| Tom | Seguro, claro | Direto, indignado a favor do cliente |

**Por quê:** pessoa reclama; empresa que reclama parece desesperada. A denúncia performa melhor na conta pessoal *e* protege a marca institucional do custo reputacional. É a mesma arquitetura que você já usou no The Loyal, pelo mesmo motivo.

O gerador roteia sozinho: todo pilar `denuncia` vai para `@leticia`, automaticamente.

---

## Uso

### Gerar a fila do mês

```bash
python3 scripts/gerar_lote.py --dias 30 --reels-dia 1 --carrosseis-dia 1 --briefings
```

Saída: fila dia a dia, estatísticas de mix, número de sessões de gravação necessárias, e um briefing `.md` por carrossel.

### Produzir um carrossel (30 min, zero designer)

```
1. Abrir saida/briefings/2026-07-15_A01xP3.md
2. Colar no Claude:  /carrossel-pro:carrossel-pro @reusar
3. Claude gera: 3 Big Ideas → estrutura → copy → carrossel-editor.html
4. Abrir o HTML → Exportar ZIP → PNGs 1080x1350 prontos
5. Rodar o gate:  python3 scripts/gate.py saida/A01xP3.json
6. Aprovado → agendar. Bloqueado → fila de revisão
```

### Validar um lote inteiro antes de agendar

```bash
python3 scripts/gate.py --lote saida/pecas/
```

Exit 0 = tudo aprovado. Exit 1 = tem peça bloqueada, não publica.

### Checar um texto solto

```bash
python3 scripts/gate.py --texto "copy do reel aqui"
```

---

## As 5 camadas do gate

| Camada | O que pega | Por que importa |
|---|---|---|
| **1. Proibição absoluta** | "visto garantido", "100% aprovação", "sonho americano", "últimas vagas" | Risco regulatório + destrói o posicionamento. Cobre todas as conjugações de *garantir* |
| **2. Estilo** | Emoji, travessão | Brand book |
| **3. Disclaimer** | Peça fala de visto e não carrega o disclaimer | Obrigatório |
| **4. Fato perecível** | Fila (14 dias), taxa (30), regra (30), prova (90) | **A mais importante.** Fila muda toda semana. Peça sem `fonte_verificada_em` não publica |
| **5. Difamação** | Concorrente citado nominalmente em contexto de ataque | Ataque a prática = OK. Ataque a CNPJ = processo |

**Camada 4 é a que salva a operação.** No lote de 30 dias, ela marcou **35 peças com dado perecível** que precisam ser reverificadas antes de ir ao ar. Sem ela, essas 35 peças publicariam dados de fila potencialmente vencidos.

---

## Carga de trabalho real (60/mês)

| Tarefa | Quem | Tempo |
|---|---|---|
| Gerar fila do mês | Script | 5 seg, 1x/mês |
| 30 carrosséis | Claude + `carrossel-pro` | ~15 min/peça = 7h/mês |
| ~24 Reels faceless | Editor freelancer | R$ 500-1.000/mês |
| ~6 Reels com a Letícia | Letícia | 1 sessão de 90 min/mês |
| Gate | Script | 4 seg/peça |
| Revisar bloqueados | Aurimar | ~30 min/mês |

**Seu tempo: ~7,5h/mês.** Dentro do orçamento de 6h/semana do plano-mãe, mas apertado. A 120/mês isso dobra para ~15h/mês — e aí compete com Constellation, The Loyal e o resto.

---

## Próximos passos, na ordem

1. **Rodar `gerar_lote.py --dias 30 --reels-dia 1 --carrosseis-dia 1`** e publicar 60/mês
2. **Coletar 5 depoimentos** (§7 do plano social) → destrava 35 peças de prova
3. **Adicionar 8-10 ângulos de Desejo** ao banco → destrava o pilar que está em 2%
4. **Aí sim subir para 120/mês**, com o mix intacto

*Viajaly Content Engine v1. Aurimar Reiners, 2026-07-11.*

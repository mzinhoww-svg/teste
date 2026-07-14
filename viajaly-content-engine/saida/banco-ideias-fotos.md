# Banco de ideias a partir das fotos — Viajaly

> **A tese que destrava tudo:** as suas fotos sao o **DEPOIS**. Cada foto de Disney,
> Miami, neve ou praia so existe porque, antes dela, teve uma entrevista de visto que
> deu certo. A Viajaly nao vende a viagem. Vende o **antes** que faz a viagem acontecer.
>
> Isso resolve o dilema de usar foto de familia numa marca de visto: a foto nao e
> turismo, e **prova de desejo realizado**. Toda ideia aqui fecha voltando pro visto.
> Assim a foto nunca vira "agencia de turismo" e sempre puxa pro servico.
>
> Regra de ouro do banco: **foto = desejo; legenda/ultimo slide = o antes (visto).**

---

## 1. Mapa foto → ideia (as 14 do acervo)

| foto | destino/tema | ideia (gancho) | pilar | persona | conta |
|------|--------------|----------------|-------|---------|-------|
| `disney-castelo-familia` | Disney/Orlando | "Orlando com filhos sem o colapso do dia 4" | desejo | P1 familia | @viajaly |
| `disney-main-street` | Disney | "O erro de roteiro que faz a crianca surtar as 14h" | desejo | P1 | @viajaly |
| `disney-goofy` | Disney personagens | "Café com personagem: vale o preco? A conta honesta" | desejo/utilidade | P1 | @viajaly |
| `universal-globo` | Universal | "Universal ou Disney primeiro? Depende da idade do seu filho" | desejo | P1 | @viajaly |
| `miami-skyline-crianca` | Miami | "Miami em 3 dias com crianca pequena, sem enlouquecer" | desejo | P1/P6 | @viajaly |
| `miami-skyline-menina` | Miami | "Miami nao e so praia: o roteiro que as familias erram" | desejo | P6 grupo | @viajaly |
| `neve-familia` | neve/montanha | "A primeira vez da sua filha na neve (e o que levar)" | desejo | P1 | @viajaly |
| `neve-mae-crianca` | neve | "Inverno nos EUA com crianca: o passeio que ninguem conta" | desejo | P1 | @viajaly |
| `praia-crianca` | praia | "Praia americana com crianca pequena: 3 cuidados" | desejo/utilidade | P1 | @viajaly |
| `praia-crianca-areia` | praia | "O dia de descanso que salva a viagem inteira" | desejo | P1 | @viajaly |
| `praia-por-do-sol` | praia | "Por que o 4o dia tem que ser um dia sem alarme" | antidoto/desejo | P1 | @viajaly |
| `familia-selfie` | casal+filho | "A gente tambem ja teve medo de ser negado" | prova/antidoto | P2 | @leticia |
| `familia-selfie2` | familia | "Essa foto comecou num formulario DS-160" | desejo→prova | P2/P3 | @leticia |
| `mae-crianca-selfie` | mae+filho | "O que eu diria pra mae que acha que vai ser negada" | antidoto | P3 | @leticia |

**Leitura rapida:** o acervo e forte em *desejo* (Orlando, Miami, neve, praia) e em
*rosto humano* (selfies) pra denuncia/antidoto na conta @leticia. Fraco em: app,
cliente aprovado terceiro, bastidor de trabalho. Esses continuam no roadmap do acervo.

---

## 2. Novos angulos de desejo pro banco (A23–A30)

O `angulos.json` so tinha 2 angulos de desejo (A21, A22), e o README apontou isso como
o gargalo. Estes 8 saem direto das fotos e cada um tem a ponte pro visto embutida.
Formato pronto pra colar em `banco/angulos.json` (ver `banco/angulos-desejo-novos.json`).

| id | tese | gancho base | persona alvo | ponte pro visto |
|----|------|-------------|--------------|-----------------|
| A23 | Toda foto dos sonhos comeca num consulado | "Essa foto existe por causa de um carimbo que quase nao veio" | P2 | o depois depende do antes |
| A24 | Disney + Universal sem quebrar as criancas | "Fazer os dois parques no mesmo dia e o erro classico" | P1 | primeiro os vistos da familia |
| A25 | Miami em 3 dias com crianca pequena | "Miami com crianca nao e a Miami do Instagram" | P1/P6 | grupo/familia: um nao derruba a viagem |
| A26 | A primeira vez na neve | "Ver sua filha tocar neve pela primeira vez" | P1 | inverno tem janela; o visto tem fila |
| A27 | Praia americana com crianca | "Praia nos EUA tem 3 detalhes que pegam brasileiro" | P1 | antes da praia, a entrevista |
| A28 | A entrevista dura 1 min, a viagem a vida toda | "Um minuto decide anos de viagem" | P2 | preparar o minuto que importa |
| A29 | A parte dificil ja passou (o visto) | "A foto e a parte facil. O carimbo foi a dificil" | P3 negado | negado nao e o fim |
| A30 | O roteiro que sobra tempo pro que importa | "Roteiro cheio demais e o que faz esquecer a viagem" | P1 | organizamos o antes pra sobrar o depois |

Conta: todos `@viajaly` (desejo institucional), exceto A29 que e melhor na `@leticia`
(tem opiniao/emocao de quem ja ouviu um nao).

---

## 3. Roteiros completos (slide a slide)

Cinco roteiros prontos, ja no formato do editor. Os JSONs renderizaveis estao em
`saida/roteiros_fotos.json` (rode `gerar_studio.py --spec` pra abrir no Carousel Studio).
Todos passam no gate. Voz: voce, sem emoji, sem travessao. Coral nas palavras que
carregam o argumento. Disclaimer no CTA.

### R1 — A23×P2 · "Essa foto comecou num consulado" (desejo→lead) · @viajaly · foto: `familia-selfie2`

1. **CAPA (foto)** — kicker: O ANTES QUE NINGUEM MOSTRA · "Essa foto so existe por causa de um **carimbo**." · sub: E o carimbo quase nao veio.
2. **PASSO 02** — "O que voce ve" · Uma familia viajando. O feed so mostra isso: o **depois**.
3. **PASSO 03** — "O que voce nao ve" · Semanas antes, um DS-160, uma entrevista de um minuto, e o medo de ouvir nao.
4. **INSIGHT (areia)** — "A viagem dos sonhos nao comeca no aeroporto. Comeca num **formulario**."
5. **PASSO 05** — "Por que isso importa pra voce" · Voce ta na parte do medo agora. E normal. Todo mundo que ja viajou passou por aqui.
6. **PASSO 06** — "A ordem certa" · Primeiro o visto, bem preparado. Depois a foto acontece sozinha.
7. **CTA** — "Quer chegar na sua foto? Vamos cuidar do antes." · [Chama no WhatsApp] · disclaimer.

### R2 — A24×P1 · "Disney + Universal sem quebrar as criancas" (desejo/roteiro) · @viajaly · foto: `universal-globo`

1. **CAPA (foto)** — kicker: ROTEIRO QUE FUNCIONA · "Disney e Universal no mesmo dia e o **erro** classico." · sub: A crianca surta e voce paga caro pra ver.
2. **PASSO 02** — "O erro" · Empolgacao faz voce espremer dois parques num dia. As **pernas** das criancas discordam.
3. **PASSO 03** — "A regra da idade" · Ate 7 anos, Disney rende mais. Universal brilha com **maiores**. Escolha por filho, nao por hype.
4. **INSIGHT (areia)** — "Parque nao e maratona. Menos parque, mais **memoria**."
5. **PASSO 05** — "O ritmo que segura" · Um parque por dia, tarde livre, piscina. O quarto dia sem alarme.
6. **PASSO 06** — "Antes de montar o roteiro" · Nada disso acontece se um visto da familia for negado. **Um** nao derruba a viagem toda.
7. **CTA** — "Primeiro a familia preparada, depois o roteiro." · [Chama no WhatsApp] · disclaimer.

### R3 — A26×P1 · "A primeira vez dela na neve" (desejo) · @viajaly · foto: `neve-familia`

1. **CAPA (foto)** — kicker: A CENA QUE VOCE QUER · "A primeira vez da sua filha na **neve**." · sub: Tem janela, e tem fila. As duas contam.
2. **PASSO 02** — "A janela do inverno" · Neve boa nos EUA tem epoca. Voce nao remarca o inverno.
3. **PASSO 03** — "A fila nao espera" · Se a viagem e no inverno, o visto tem que sair antes. E a **fila** anda no tempo dela.
4. **INSIGHT (areia)** — "O inverno tem data. Sua preparacao tambem devia ter."
5. **PASSO 05** — "O que atrasa a familia" · Um DS-160 torto de um dos filhos trava o grupo inteiro. Coerencia entre todos.
6. **PASSO 06** — "A ordem" · Vistos da familia primeiro, com folga pra fila. Depois a neve vira so alegria.
7. **CTA** — "Quer a neve garantida no calendario? Comeca pelo visto." · [Chama no WhatsApp] · disclaimer.

### R4 — A25×P6 · "Miami em 3 dias com o grupo" (desejo) · @viajaly · foto: `miami-skyline-menina`

1. **CAPA (foto)** — kicker: MIAMI DE VERDADE · "Miami nao e so praia. E o que o grupo **erra**." · sub: 3 dias, 6 pessoas, zero briga de agenda.
2. **PASSO 02** — "O erro do grupo" · Cada um quer uma coisa. Sem plano, o dia vira **discussao** no lobby.
3. **PASSO 03** — "Divida por bloco" · Praia de manha, cidade a tarde, um dia de outlet. Todo mundo pega o que quer.
4. **INSIGHT (areia)** — "Grupo nao briga por gosto. Briga por falta de **plano**."
5. **PASSO 05** — "O que trava o grupo antes" · Seis vistos, seis DS-160 sem se contradizer, agendados juntos. E ai que empaca.
6. **PASSO 06** — "A ordem certa" · Primeiro os seis vistos alinhados. Depois Miami roda sozinha.
7. **CTA** — "Fecha o grupo com a gente e cuida do antes." · [Chama no WhatsApp] · disclaimer.

### R5 — A29×P3 · "A parte dificil ja passou" (desejo→prova) · @leticia · foto: `mae-crianca-selfie`

1. **CAPA (foto)** — kicker: PRA QUEM JA OUVIU UM NAO · "A foto e a parte **facil**. O carimbo foi a dificil." · sub: E sim, da pra virar o nao.
2. **PASSO 02** — "Onde voce ta" · Voce ja ouviu um nao. A vergonha, o medo de repetir. Eu sei.
3. **PASSO 03** — "O que muda um segundo pedido" · Nao e sorte. E entender o que derrubou e **corrigir** com honestidade.
4. **INSIGHT (areia)** — "Ser negado nao te marca pra sempre. Repetir o **erro**, sim."
5. **PASSO 05** — "A cena que te espera" · Essa foto na praia, na neve, no parque. Ela nao e sonho. E consequencia de preparo.
6. **PASSO 06** — "O que eu nao prometo" · Eu nao garanto seu visto. Ninguem garante. Mas te preparo pra chegar sem repetir o erro.
7. **CTA** — "Ja ouviu um nao? Vamos entender o proximo passo." · [Chama no WhatsApp] · disclaimer.

---

## 4. Como usar este banco

1. As fotos sao **desejo**, nunca turismo solto: toda peca fecha voltando pro visto.
2. Rode `python3 scripts/gerar_studio.py --spec saida/roteiros_fotos.json` pra abrir os
   5 roteiros no Carousel Studio, ja com as fotos no fundo.
3. Rode `python3 scripts/gate.py --lote saida/roteiros_pecas/` antes de publicar.
4. Os angulos A23–A30 podem entrar no `banco/angulos.json` pra o `gerar_lote.py` passar
   a montar pauta de desejo sozinho (destrava o pilar que estava em 7%).
5. Estes roteiros sao **perenes** (sem dado perecivel): otimos pra semana sem noticia.

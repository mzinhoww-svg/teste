# DESIGN-CARROSSEL.md — Viajaly

> Sistema de design para carrossel de Instagram. **Não é design de site.**
> Site tem hover, scroll, tempo. Carrossel tem 1080×1350 e 0,3 segundo de polegar.
> São disciplinas diferentes e confundi-las é o erro que faz carrossel bonito ser ignorado.

---

## O diagnóstico

Rodei a spec anterior (kit `corporate` + paleta navy do brand book) e olhei para o resultado.

**O slide estava tecnicamente correto e visualmente morto.** Paleta certa, fonte certa, contraste certo — e um retângulo azul com texto encostado no topo e 40% de vazio morto embaixo. No feed, isso é ignorado antes do cérebro processar a frase.

O problema nunca foi a paleta. Foram cinco defeitos de composição:

| # | Defeito | Sintoma | Conserto |
|---|---|---|---|
| 1 | **Sem âncora visual** | Nada segura o olho. É retângulo com texto | Número fantasma gigante (460px, navy+1) atrás do conteúdo |
| 2 | **Sem hierarquia** | Título 76px e sub 36px competem | Salto brutal: 84px vs 34px. **Um domina, o resto recua** |
| 3 | **Vazio morto** | Texto no topo, buraco embaixo | **Ancorar no rodapé.** O vazio vira respiro, não buraco |
| 4 | **Sem tensão** | Tudo na mesma cor. Nada puxa o olho | Palavra-chave em coral. O olho pousa no argumento |
| 5 | **Sem profundidade** | Uma camada só | Três: fantasma → régua → texto |

**Nenhum desses consertos é escolha de cor.** É por isso que "aplicar o brand book" não bastava.

---

## Tokens

| Token | Hex | Uso | Contraste |
|---|---|---|---|
| `navy` | `#10204A` | Fundo dominante (~70% dos slides) | — |
| `areia` | `#FFF6ED` | Título sobre navy; fundo do respiro | **14.81:1** |
| `coral` | `#FF5A5F` | Kicker, palavra-chave, botão CTA | **5.18:1** |
| `ceu` | `#2DB7C9` | Régua, URL, dado verificável | **6.57:1** |
| `muted` | `#8B93A8` | Corpo, paginação | **5.15:1** |
| `surface` | `#1A2E5C` | **Número fantasma.** Navy+1 | 1.20:1 (proposital) |

Todos passam WCAG AA. O `surface` tem contraste baixo **de propósito**: o fantasma é textura, não informação. Se for legível, compete com o título e mata a hierarquia.

### Regra do coral

**Coral é escasso.** Aparece em três lugares e nada mais: kicker, palavra-chave destacada, botão de CTA. Coral em tudo é coral em nada. Ele é o elemento de tensão — se banalizar, perde a função.

---

## Escala tipográfica

Razão 1.33 (quarta perfeita). O que importa é o **salto**, não os números:

```
ghost    460px   número fantasma (textura, não leitura)
gigante  128px   estatística isolada
titulo    84px   capa e CTA
passo     60px   título de passo
corpo     38px   texto de corpo
sub       34px   subtítulo
kicker    26px   eyebrow
```

**84 → 34 é a hierarquia.** Um salto de 76 → 36 (o anterior) não é hierarquia, é dois textos brigando. A regra do `design-intelligence` — *"1 elemento dominante por seção"* — só existe se o salto for brutal.

---

## Composição

### Margem
`96px` (8.9% da largura). Generosa. Aperta o texto e o slide vira panfleto.

### Âncora no rodapé
O texto cresce **de baixo para cima**, com base em `H - 190`. É o conserto do vazio morto.

Por que funciona: no feed, o olho entra pelo centro-baixo do quadro (é onde o polegar está). Texto no topo é lido *depois* do vazio. Texto ancorado embaixo é lido *primeiro*.

### Três camadas
```
CAMADA 1 (fundo)   número fantasma — profundidade
CAMADA 2 (meio)    régua ciano + kicker coral — ritmo
CAMADA 3 (frente)  texto — informação
```

### Destaque de palavra
Uma a três palavras por slide, em coral. Escolha as que **carregam o argumento**, não as bonitas:

- "**Ninguém** garante seu visto" → *ninguém*
- "A taxa não volta. **Nunca**." → *nunca*
- "Eles **somem** do WhatsApp" → *somem*

---

## Os 4 tipos de slide

| Tipo | Fundo | Função | Quando |
|---|---|---|---|
| `capa` | navy + fantasma | Parar o scroll | Slide 1, sempre |
| `passo` | navy + fantasma | Um argumento | Miolo |
| `insight` | **areia (invertido)** | Respiro. Quebra o ritmo | Slide 5 ou 6, uma vez |
| `cta` | navy + botão coral sólido | Ação única | Último, sempre |

**O `insight` inverte o fundo** e isso não é decoração: num carrossel de 8 slides navy, o olho satura. O slide claro no meio **reseta a atenção** e é o mais salvo do carrossel, porque é o que tem a frase memorável.

**O botão do CTA é o único elemento sólido do carrossel inteiro.** Por isso ele grita sem precisar de seta, emoji ou "arrasta pro lado".

---

## O disclaimer como fechamento

No slide de CTA, o disclaimer obrigatório fica **logo abaixo do botão**, em muted.

Isso é decisão de design, não de compliance. Todo concorrente esconde o disclaimer no rodapé em corpo 8. A Viajaly coloca embaixo do CTA, legível, e a frase vira o argumento final:

> *"A gente não garante seu visto."*
> **[Chama no WhatsApp]**
> *A Viajaly não garante aprovação de vistos. A decisão é exclusiva das autoridades consulares.*

**Nenhum concorrente pode copiar essa composição sem destruir a própria promessa.**

---

## Checklist (roda em toda peça)

**Composição**
- [ ] Número fantasma presente em capa e passo
- [ ] Texto ancorado no rodapé, não no topo
- [ ] Um elemento dominante. Salto ≥ 2× entre título e corpo
- [ ] 1 a 3 palavras em coral, e são as que carregam o argumento
- [ ] Margem ≥ 96px

**Ritmo (carrossel inteiro)**
- [ ] Exatamente 1 slide `insight` claro, no meio
- [ ] Botão coral sólido só no CTA
- [ ] Coral não aparece em mais de 3 lugares por slide

**Compliance**
- [ ] Disclaimer no último slide, abaixo do botão
- [ ] Sem emoji, sem travessão
- [ ] Contraste ≥ 4.5:1 no corpo

---

## Sobre as outras skills de design

Você pediu `impeccable`, `redesign-existing-projects` e `design-taste-frontend-v1`.

**Não usei, e o motivo importa:** as três são para **frontend web** — React, CSS, tokens, hover, responsivo, motion. O `impeccable` inclusive exige `node scripts/context.mjs` e um `PRODUCT.md`, que não existem aqui.

O problema não era frontend. Era **composição de slide estático**, que é outra disciplina: sem hover, sem scroll, sem estado, lido em 0,3s no polegar. Usei o `design-intelligence` (que é sobre decisão visual, não sobre código) e apliquei os princípios dele — *hierarquia, 1 elemento dominante, contraste WCAG* — ao problema certo.

**As três skills que você citou continuam valendo — para o site viajaly.com**, que tem três defeitos catalogados no plano-mãe (depoimento falso, badge Lovable, CTA quebrado). Esse é trabalho de frontend e é onde o `impeccable` brilha. **Mas é outro job, e ele não estava bloqueando o motor de conteúdo.**

---

*DESIGN-CARROSSEL.md v1. Aurimar Reiners, 2026-07-11.*

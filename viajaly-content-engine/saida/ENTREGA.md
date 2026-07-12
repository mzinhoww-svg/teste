# Entrega da semana - Viajaly Content Engine

**Gerado:** 2026-07-12 - 14 carrosseis (2/dia, 7 dias) - gate exit 0.
Geracao nativa (skill `/carrossel-pro` nao instalada neste ambiente), seguindo
`DESIGN-CARROSSEL.md` + `render_slide.py`. Cada peca: JSON + `carrossel-editor.html`
+ legenda + PNGs 1080x1350.

---

## 1. Tabela de agendamento

| data | hora | conta | pilar | titulo | imagem | fonte |
|------|------|-------|-------|--------|--------|-------|
| 12/07 | 09:00 | @viajaly | utilidade | Da pra antecipar de graca (A07xP7) | tipografia navy | Federal Register 2026-11513 |
| 12/07 | 18:00 | @leticia | denuncia | US$ 750 pra furar fila (A03xP7) | card de fonte `taxa-750.png` | Federal Register 2026-11513 |
| 13/07 | 09:00 | @viajaly | utilidade | Quanto custa DE VERDADE (A08xP5) | tipografia navy | travel.state.gov (fees) |
| 13/07 | 18:00 | @viajaly | utilidade | Menor agora vai a entrevista (A10xP3) | tipografia navy | br.usembassy.gov |
| 14/07 | 09:00 | @viajaly | utilidade | CASV e consulado, 2 dias (A09xP7) | tipografia navy | - |
| 14/07 | 18:00 | @leticia | denuncia | R$99 e R$3mil sao sinal (A05xP6) | tipografia navy | travel.state.gov (fees) |
| 15/07 | 09:00 | @viajaly | antidoto | 7 campos do DS-160 (A15xP4) | tipografia navy | - |
| 15/07 | 18:00 | @leticia | denuncia | Ninguem garante visto (A01xP2) | tipografia navy | - |
| 16/07 | 09:00 | @viajaly | prova | Aprovados de 2026 (A20xP2) [RETIDA] | tipografia navy | base interna (pendente) |
| 16/07 | 18:00 | @leticia | antidoto | A pasta ele nem abre (A13xP7) | tipografia navy | - |
| 17/07 | 09:00 | @viajaly | prova | Depoimento real (A19xP3) [RETIDA] | print cliente (pendente) | cliente (pendente) |
| 17/07 | 18:00 | @leticia | antidoto | Decide em 10 segundos (A12xP4) | tipografia navy | - |
| 18/07 | 09:00 | @viajaly | desejo | Orlando sem colapso (A21xP1) | foto propria `disney-castelo-familia.jpg` | - |
| 18/07 | 18:00 | @viajaly | antidoto | A pergunta: voce volta? (A14xP5) | tipografia navy | - |

Mix: denuncia 21% (3, dentro do teto de 25%) | utilidade 29% | antidoto 29% | prova 14% | desejo 7%.

## 2. Arquivos

- `saida/pecas/*.json` - 14 pecas (entram no gate e no render)
- `saida/pecas/*.html` - 14 `carrossel-editor.html` (abrir no browser, editaveis)
- `saida/pecas/*.txt` - 14 legendas
- `saida/render/<combo>/*.png` - PNGs 1080x1350 (98 slides)
- `acervo/fontes/taxa-750.png` - card de fonte novo
- `acervo/destinos/` + `acervo/familia/` - 14 fotos proprias otimizadas

## 3. Relatorio do gate

- **Aprovadas de primeira:** 11/14
- **Corrigidas:** 3 (falsos-positivos de fato perecivel por palavra solta):
  - A15xP4: "leva menos que a fila" -> "leva menos que voce imagina" (gatilho FILA)
  - A14xP5: "te esperando aqui" -> "te aguardando" (gatilho ESPERA/FILA)
  - A19xP3: "o que a gente mudou" -> "o que a gente ajustou" (gatilho REGRA)
- **Resultado final:** 14/14 aprovadas, exit 0.
- Motivos que apareceram: FATO PERECIVEL (fila/regra) por palavra de linguagem
  comum, nao por dado real vencido. Nenhuma promessa ilegal, emoji, travessao
  ou difamacao detectada.

## 4. Estado do acervo

- **Imagens proprias agora:** 15 (14 fotos + 1 card de fonte).
- **Peças desta semana que usam imagem propria:** 2 (A03xP7 card de fonte; A21xP1 foto Orlando).
- **Peças com stock:** 0 (nao foi usado stock).
- **Peças tipograficas:** 12.
- Capturado nesta rodada: card de fonte (Federal Register) + curadoria/otimizacao
  de 14 fotos da familia (Disney, Orlando, NY, neve, praia) autorizadas.
- Ainda falta (roadmap do acervo): screenshots do app (wizard DS-160), fotos da
  Leticia trabalhando, prints de WhatsApp de aprovados com autorizacao LGPD.

## 5. Alertas de validade (dado perecivel)

| peca | dado | verificado | revalidar ate |
|------|------|-----------|---------------|
| A03xP7 | taxa US$750 / fila | 2026-07-12 | 2026-07-26 (janela fila 14d) |
| A07xP7 | taxa US$750 / fila | 2026-07-12 | 2026-07-26 |
| A08xP5 | taxas 185/250/750 / fila | 2026-07-12 | 2026-07-26 |
| A05xP6 | taxa consular 185 | 2026-07-12 | 2026-08-11 (taxa 30d) |
| A10xP3 | regra menor de idade | 2026-07-12 | 2026-08-11 (regra 30d) |

O piloto do US$750 e valido ate 31/12/2026 (Federal Register 2026-11513), mas o
gate pede reverificacao da fila a cada 14 dias por seguranca.

## 6. Uma linha honesta

Prova ficou em 14% (abaixo do alvo de 20%) de proposito: nao fabriquei depoimento
nem numero de aprovacao. As duas peças de prova (A19, A20) estao prontas como
frameworks e RETIDAS ate voce inserir o dado real, com autorizacao LGPD. Sao os
carrosseis que mais convertem, e desbloquear a Prova (coletar depoimentos e
confirmar o numero de aprovados) e a maior alavanca da semana que vem. Alem disso,
os carrosseis sairam com 7 slides, nao 8-10; sao enxutos de proposito, mas se voce
quiser mais respiro e so pedir uma etapa a mais por peca.

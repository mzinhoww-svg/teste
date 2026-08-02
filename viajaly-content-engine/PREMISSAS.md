# Premissas de geração (rodar sempre, antes de publicar)

Toda peça nova passa por estes três checks. Se algum falhar, não publica.

## 1. Coerência imagem ↔ conteúdo (premissa dura)
Se a capa nomeia um lugar ou cena (praia, Nova York, Miami, neve, Disney, Orlando,
Califórnia, Universal), a **foto tem que ser daquele lugar/cena**. Nada de hook de
praia com foto de Nova York.
```bash
python3 scripts/checar_coerencia.py    # exit 0 = ok; exit 1 = lista os descasamentos
```
Mapa de fotos por destino em `banco/angulos-destinos.json` (campo `foto`). Os
arquivos `miami-*` são Miami (placa Miami River); `ny-ponte-brooklyn` é Nova York.

## 2. Acentuação do português (premissa dura)
O copy é escrito e depois acentuado por um passe automático. Nunca publicar sem acento.
```bash
python3 scripts/acentuar.py saida/SEU_SPEC.json    # acentua texto E destaques
```
Acentua também os `destaques` (senão o coral para de casar com a palavra no texto).
Preserva CAIXA ALTA de keywords (NOVAYORK) e não mexe em hashtags.

## 3. Compliance (gate)
```bash
python3 scripts/gate.py --lote saida/PASTA/     # exit 0 = aprovado
```
Sem promessa ilegal, sem emoji/travessão, disclaimer no CTA, fonte em dado perecível,
sem difamação.

## Fluxo completo de uma leva nova
```bash
python3 scripts/acentuar.py saida/lote_novo.json
python3 scripts/checar_coerencia.py
python3 scripts/gerar_pecas.py --spec saida/lote_novo.json --out saida/pasta --render-out saida/pasta_render --render
python3 scripts/gerar_studio.py --spec saida/lote_novo.json --out saida/pasta
python3 scripts/gate.py --lote saida/pasta/
python3 scripts/montar_grade.py    # atualiza a grade
python3 scripts/gerar_dms.py       # atualiza a lista palavra->DM
```

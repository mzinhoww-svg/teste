#!/usr/bin/env python3
"""
VIAJALY -- CARD DE FONTE

Resolve o problema de "imagem real" quando o acervo esta vazio.

A doutrina do plano diz: "cite a fonte, e a urgencia vira informacao;
omita a fonte, e vira manipulacao." Este script transforma a citacao da
fonte em uma IMAGEM DE MARCA -- que e, por definicao, uma imagem real,
propria, nao licenciada, e que nenhum concorrente pode copiar.

Um card do Federal Register vale mais que qualquer foto de aeroporto no
Unsplash: prova que voce leu a fonte primaria.

Uso:
    python3 card_fonte.py \
        --titulo "US$ 750 PRA FURAR FILA" \
        --fonte "Federal Register, doc. 2026-11513" \
        --data "01/07/2026" \
        --url "federalregister.gov" \
        --saida acervo/fontes/taxa750.png
"""

import argparse
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

# Paleta oficial do brand book
NAVY   = (16, 32, 74)
AREIA  = (255, 246, 237)
CORAL  = (255, 90, 95)
CEU    = (45, 183, 201)
MUTED  = (139, 147, 168)

W, H = 1080, 1350  # 4:5, formato do carrossel


def fonte(tam, bold=False):
    """Carrega fonte do sistema, com fallback."""
    caminhos = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold
        else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf" if bold
        else "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
    ]
    for c in caminhos:
        if Path(c).exists():
            return ImageFont.truetype(c, tam)
    return ImageFont.load_default()


def quebrar(texto, font, draw, largura_max):
    palavras = texto.split()
    linhas, atual = [], ""
    for p in palavras:
        teste = f"{atual} {p}".strip()
        if draw.textlength(teste, font=font) <= largura_max:
            atual = teste
        else:
            if atual:
                linhas.append(atual)
            atual = p
    if atual:
        linhas.append(atual)
    return linhas


def gerar(titulo, fonte_nome, data, url, saida, selo="FONTE PRIMARIA"):
    img = Image.new("RGB", (W, H), NAVY)
    d = ImageDraw.Draw(img)

    M = 90  # margem

    # --- selo superior (coral)
    f_selo = fonte(26, bold=True)
    d.rectangle([M, 110, M + 14, 150], fill=CORAL)
    d.text((M + 34, 113), selo, font=f_selo, fill=CORAL)

    # --- titulo grande
    f_tit = fonte(78, bold=True)
    linhas = quebrar(titulo.upper(), f_tit, d, W - 2 * M)
    y = 230
    for ln in linhas:
        d.text((M, y), ln, font=f_tit, fill=AREIA)
        y += 92

    # --- regua
    y += 40
    d.rectangle([M, y, M + 120, y + 6], fill=CEU)
    y += 70

    # --- bloco da fonte (o miolo: e isso que prova a citacao)
    f_lbl = fonte(24, bold=True)
    f_val = fonte(34)

    d.text((M, y), "FONTE", font=f_lbl, fill=MUTED)
    y += 42
    for ln in quebrar(fonte_nome, f_val, d, W - 2 * M):
        d.text((M, y), ln, font=f_val, fill=AREIA)
        y += 46

    y += 34
    d.text((M, y), "PUBLICADO EM", font=f_lbl, fill=MUTED)
    y += 42
    d.text((M, y), data, font=f_val, fill=AREIA)

    y += 80
    d.text((M, y), "VERIFIQUE VOCE MESMO", font=f_lbl, fill=MUTED)
    y += 42
    f_url = fonte(30)
    d.text((M, y), url, font=f_url, fill=CEU)

    # --- rodape
    f_rod = fonte(24, bold=True)
    d.text((M, H - 110), "viajaly.", font=f_rod, fill=AREIA)
    lw = d.textlength("viajaly.", font=f_rod)
    d.ellipse([M + lw + 6, H - 100, M + lw + 14, H - 92], fill=CORAL)

    Path(saida).parent.mkdir(parents=True, exist_ok=True)
    img.save(saida, "PNG")
    return saida


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--titulo", required=True)
    ap.add_argument("--fonte", required=True)
    ap.add_argument("--data", required=True)
    ap.add_argument("--url", required=True)
    ap.add_argument("--saida", required=True)
    ap.add_argument("--selo", default="FONTE PRIMARIA")
    a = ap.parse_args()

    p = gerar(a.titulo, a.fonte, a.data, a.url, a.saida, a.selo)
    print(f"Card gerado: {p}")

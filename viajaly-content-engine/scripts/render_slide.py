#!/usr/bin/env python3
"""
VIAJALY -- RENDERIZADOR DE SLIDE

Implementa o DESIGN-CARROSSEL.md. Nao e "aplicar a paleta" -- e resolver
os 5 defeitos que fazem um slide navy correto ser ignorado no feed:

  1. SEM ANCORA VISUAL     -> numero fantasma gigante atras do texto
  2. SEM HIERARQUIA        -> 1 elemento dominante, o resto recua
  3. VAZIO MORTO           -> texto ancorado no rodape, nao no topo
  4. SEM TENSAO            -> palavra-chave em coral, quebra a linha
  5. SEM PROFUNDIDADE      -> 3 camadas (fantasma / regua / texto)

Uso:
    python3 render_slide.py --demo         # gera antes/depois
    python3 render_slide.py --json peca.json --saida pasta/
"""

import argparse
import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageOps

# ---------------------------------------------------------------
# TOKENS (brand book Viajaly)
# ---------------------------------------------------------------
NAVY    = (16, 32, 74)
AREIA   = (255, 246, 237)
CORAL   = (255, 90, 95)
CEU     = (45, 183, 201)
MUTED   = (139, 147, 168)
SURFACE = (26, 46, 92)      # navy +1 -- para o numero fantasma

W, H = 1080, 1350
M = 96                       # margem. 8.9% da largura. Generosa de proposito.

# Escala tipografica. Razao 1.33 (quarta perfeita).
# O salto de 84 para 34 e a HIERARQUIA: o titulo domina, o resto recua.
T_KICKER  = 26
T_SUB     = 34
T_CORPO   = 38
T_TITULO  = 84
T_GIGANTE = 128
T_GHOST   = 460             # numero fantasma. Enorme de proposito.


def fnt(tam, bold=False):
    p = "/usr/share/fonts/truetype/dejavu/DejaVuSans"
    p += "-Bold.ttf" if bold else ".ttf"
    if not Path(p).exists():
        return ImageFont.load_default()
    return ImageFont.truetype(p, tam)


def quebrar(txt, f, d, lm):
    ws, ls, a = txt.split(), [], ""
    for w in ws:
        t = f"{a} {w}".strip()
        if d.textlength(t, font=f) <= lm:
            a = t
        else:
            if a:
                ls.append(a)
            a = w
    if a:
        ls.append(a)
    return ls


def desenhar_destacado(d, x, y, texto, f, cor_base, cor_destaque, destaques):
    """
    Desenha uma linha destacando palavras-chave em coral.
    E o que cria TENSAO: o olho pousa na palavra que carrega o argumento.
    """
    cx = x
    for palavra in texto.split():
        limpa = palavra.strip(".,!?:;").lower()
        cor = cor_destaque if limpa in destaques else cor_base
        d.text((cx, y), palavra, font=f, fill=cor)
        cx += d.textlength(palavra + " ", font=f)


def marca(d):
    f = fnt(26, True)
    d.text((M, H - 108), "viajaly.", font=f, fill=AREIA)
    lw = d.textlength("viajaly.", font=f)
    d.ellipse([M + lw + 5, H - 98, M + lw + 13, H - 90], fill=CORAL)


def paginacao(d, n, total):
    f = fnt(22, True)
    txt = f"{n:02d} / {total:02d}"
    lw = d.textlength(txt, font=f)
    d.text((W - M - lw, H - 104), txt, font=f, fill=MUTED)


# ---------------------------------------------------------------
# SLIDE: CAPA
# ---------------------------------------------------------------
def capa(kicker, titulo, sub, destaques=(), ghost=None, total=8):
    img = Image.new("RGB", (W, H), NAVY)
    d = ImageDraw.Draw(img)

    # CAMADA 1 -- numero fantasma. A ancora visual.
    # Sem isso o slide e um retangulo com texto. Com isso, e uma composicao.
    if ghost:
        fg = fnt(T_GHOST, True)
        bb = d.textbbox((0, 0), ghost, font=fg)
        d.text((W - M - (bb[2] - bb[0]) + 30, H - 620), ghost, font=fg, fill=SURFACE)

    # CAMADA 2 -- kicker + regua
    d.rectangle([M, 118, M + 12, 156], fill=CORAL)
    d.text((M + 32, 121), kicker.upper(), font=fnt(T_KICKER, True), fill=CORAL)

    # CAMADA 3 -- titulo. ANCORADO NO RODAPE, nao no topo.
    # Este e o conserto do "vazio morto": o texto cresce de baixo pra cima,
    # e o vazio vira respiro no topo, nao buraco embaixo.
    ft = fnt(T_TITULO, True)
    linhas = quebrar(titulo, ft, d, W - 2 * M - 40)
    alt_titulo = len(linhas) * 98

    fs = fnt(T_SUB)
    linhas_sub = quebrar(sub, fs, d, W - 2 * M - 60) if sub else []
    alt_sub = len(linhas_sub) * 48

    # base = rodape - marca - respiro
    base = H - 190
    y = base - alt_sub - (40 if linhas_sub else 0) - alt_titulo

    for ln in linhas:
        desenhar_destacado(d, M, y, ln, ft, AREIA, CORAL, destaques)
        y += 98

    if linhas_sub:
        y += 30
        d.rectangle([M, y, M + 90, y + 5], fill=CEU)
        y += 42
        for ln in linhas_sub:
            d.text((M, y), ln, font=fs, fill=MUTED)
            y += 48

    marca(d)
    return img


# ---------------------------------------------------------------
# SLIDE: PASSO
# ---------------------------------------------------------------
def passo(numero, titulo, corpo, destaques=(), n=2, total=8):
    img = Image.new("RGB", (W, H), NAVY)
    d = ImageDraw.Draw(img)

    fg = fnt(T_GHOST, True)
    bb = d.textbbox((0, 0), numero, font=fg)
    d.text((W - M - (bb[2] - bb[0]) + 30, 180), numero, font=fg, fill=SURFACE)

    d.rectangle([M, 130, M + 12, 168], fill=CORAL)
    d.text((M + 32, 133), f"PASSO {numero}", font=fnt(T_KICKER, True), fill=CORAL)

    ft = fnt(60, True)
    y = 330
    for ln in quebrar(titulo, ft, d, W - 2 * M - 40):
        d.text((M, y), ln, font=ft, fill=AREIA)
        y += 74

    y += 34
    d.rectangle([M, y, M + 90, y + 5], fill=CEU)
    y += 48

    fc = fnt(T_CORPO)
    for ln in quebrar(corpo, fc, d, W - 2 * M - 40):
        desenhar_destacado(d, M, y, ln, fc, MUTED, AREIA, destaques)
        y += 54

    marca(d)
    paginacao(d, n, total)
    return img


# ---------------------------------------------------------------
# SLIDE: INSIGHT (respiro -- fundo claro, inverte o ritmo)
# ---------------------------------------------------------------
def insight(texto, fonte=None, n=6, total=8, destaques=()):
    img = Image.new("RGB", (W, H), AREIA)
    d = ImageDraw.Draw(img)

    d.rectangle([M, H // 2 - 210, M + 6, H // 2 + 210], fill=CORAL)

    ft = fnt(66, True)
    linhas = quebrar(texto, ft, d, W - 2 * M - 60)
    y = H // 2 - (len(linhas) * 82) // 2
    for ln in linhas:
        # coral na palavra que carrega o argumento, tambem no respiro
        desenhar_destacado(d, M + 40, y, ln, ft, NAVY, CORAL, set(destaques))
        y += 82

    if fonte:
        d.text((M + 40, y + 30), fonte, font=fnt(28), fill=(110, 99, 87))

    f = fnt(26, True)
    d.text((M, H - 108), "viajaly.", font=f, fill=NAVY)
    lw = d.textlength("viajaly.", font=f)
    d.ellipse([M + lw + 5, H - 98, M + lw + 13, H - 90], fill=CORAL)

    fp = fnt(22, True)
    txt = f"{n:02d} / {total:02d}"
    d.text((W - M - d.textlength(txt, font=fp), H - 104), txt, font=fp, fill=(139, 130, 118))
    return img


# ---------------------------------------------------------------
# SLIDE: CTA
# ---------------------------------------------------------------
def cta(titulo, acao, sub, n=8, total=8):
    img = Image.new("RGB", (W, H), NAVY)
    d = ImageDraw.Draw(img)

    d.rectangle([M, 130, M + 12, 168], fill=CORAL)
    d.text((M + 32, 133), "AGORA VOCE SABE", font=fnt(T_KICKER, True), fill=CORAL)

    ft = fnt(70, True)
    y = 330
    for ln in quebrar(titulo, ft, d, W - 2 * M - 40):
        d.text((M, y), ln, font=ft, fill=AREIA)
        y += 86

    # botao coral -- unico elemento solido do carrossel. E o CTA.
    y += 60
    fb = fnt(36, True)
    bw = d.textlength(acao, font=fb) + 90
    d.rounded_rectangle([M, y, M + bw, y + 84], radius=42, fill=CORAL)
    d.text((M + 45, y + 22), acao, font=fb, fill=AREIA)

    # disclaimer -- obrigatorio, e e a arma
    y = H - 260
    fd = fnt(24)
    for ln in quebrar(sub, fd, d, W - 2 * M):
        d.text((M, y), ln, font=fd, fill=MUTED)
        y += 34

    marca(d)
    paginacao(d, n, total)
    return img


# ---------------------------------------------------------------
def capa_foto(imagem, kicker, titulo, sub, destaques=(), total=8):
    """
    Capa com FOTO PROPRIA de fundo (acervo autorizado) + overlay navy.
    Usada so em peca de desejo/destino, onde a foto real vale mais que
    tipografia. O overlay garante contraste AA no texto ancorado no rodape.
    """
    base = Image.open(imagem)
    base = ImageOps.exif_transpose(base).convert("RGB")
    # cover-crop pra 1080x1350
    bw, bh = base.size
    scale = max(W / bw, H / bh)
    base = base.resize((round(bw * scale), round(bh * scale)))
    left = (base.width - W) // 2
    top = (base.height - H) // 2
    img = base.crop((left, top, left + W, top + H))

    # overlay navy: leve no topo, forte no rodape (onde mora o texto)
    ov = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    od = ImageDraw.Draw(ov)
    for y in range(H):
        a = int(20 + 235 * (y / H) ** 1.7)   # 20 -> 255
        od.line([(0, y), (W, y)], fill=(16, 32, 74, min(a, 240)))
    img = Image.alpha_composite(img.convert("RGBA"), ov).convert("RGB")
    d = ImageDraw.Draw(img)

    d.rectangle([M, 118, M + 12, 156], fill=CORAL)
    d.text((M + 32, 121), kicker.upper(), font=fnt(T_KICKER, True), fill=CORAL)

    ft = fnt(T_TITULO, True)
    linhas = quebrar(titulo, ft, d, W - 2 * M - 40)
    fs = fnt(T_SUB)
    linhas_sub = quebrar(sub, fs, d, W - 2 * M - 60) if sub else []
    base_y = H - 190
    y = base_y - len(linhas_sub) * 48 - (40 if linhas_sub else 0) - len(linhas) * 98
    for ln in linhas:
        desenhar_destacado(d, M, y, ln, ft, AREIA, CORAL, set(destaques))
        y += 98
    if linhas_sub:
        y += 30
        d.rectangle([M, y, M + 90, y + 5], fill=CEU)
        y += 42
        for ln in linhas_sub:
            d.text((M, y), ln, font=fs, fill=(210, 214, 224))
            y += 48
    marca(d)
    return img


def _destaques(slide):
    return {p.strip(".,!?:;").lower() for p in slide.get("destaques", [])}


def render_peca(peca, saida):
    """
    Renderiza uma peca (JSON com 'slides') em PNGs 1080x1350, na ordem.
    Cada slide tem 'tipo' em {capa, passo, insight, cta} e os campos do tipo.
    E o modo --json documentado no cabecalho: transforma a copy em imagens.
    """
    slides = peca["slides"]
    total = len(slides)
    saida = Path(saida)
    saida.mkdir(parents=True, exist_ok=True)
    gerados = []
    for i, s in enumerate(slides, 1):
        tipo = s["tipo"]
        dst = _destaques(s)
        if tipo == "capa":
            img = capa(s.get("kicker", ""), s["titulo"], s.get("sub", ""),
                       destaques=dst, ghost=s.get("ghost", f"{i:02d}"), total=total)
        elif tipo == "capa_foto":
            base_dir = peca.get("_base_dir", ".")
            img = capa_foto(Path(base_dir) / s["imagem"], s.get("kicker", ""),
                            s["titulo"], s.get("sub", ""), destaques=dst, total=total)
        elif tipo == "passo":
            img = passo(s.get("numero", f"{i:02d}"), s["titulo"], s.get("corpo", ""),
                        destaques=dst, n=i, total=total)
        elif tipo == "insight":
            img = insight(s["texto"], fonte=s.get("fonte"), n=i, total=total, destaques=dst)
        elif tipo == "cta":
            img = cta(s["titulo"], s.get("acao", "Chama no WhatsApp"),
                      s.get("sub", ""), n=i, total=total)
        else:
            raise ValueError(f"tipo de slide desconhecido: {tipo}")
        caminho = saida / f"{i:02d}-{tipo}.png"
        img.save(caminho, "PNG")
        gerados.append(caminho)
    return gerados


def demo():
    out = Path("/tmp/design")
    out.mkdir(exist_ok=True)

    capa("A verdade incomoda",
         "Ninguem garante seu visto.",
         "Nem a gente. E quem te garantiu esta mentindo.",
         destaques={"ninguem", "mentindo"},
         ghost="01", total=8).save(out / "01-capa.png")

    passo("03", "O que acontece quando nega",
          "A taxa de US$ 185 nao volta. Nunca. E a assessoria que garantiu some do WhatsApp.",
          destaques={"nunca.", "some"}, n=3, total=8).save(out / "02-passo.png")

    insight("A pergunta certa nao e quem garante. E quem fica quando da errado.",
            n=6, total=8).save(out / "03-insight.png")

    cta("A gente nao garante seu visto.", "Chama no WhatsApp",
        "A Viajaly nao garante aprovacao de vistos. A decisao e exclusiva das autoridades consulares.",
        n=8, total=8).save(out / "04-cta.png")

    print("Demo gerada em /tmp/design/")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--demo", action="store_true")
    ap.add_argument("--json", help="peca.json com 'slides' pra renderizar")
    ap.add_argument("--saida", default="saida/render", help="pasta de saida dos PNGs")
    a = ap.parse_args()
    if a.demo:
        demo()
    elif a.json:
        peca = json.loads(Path(a.json).read_text(encoding="utf-8"))
        combo = peca.get("combo", Path(a.json).stem)
        gerados = render_peca(peca, Path(a.saida) / combo)
        print(f"{len(gerados)} slides renderizados em {Path(a.saida) / combo}/")
    else:
        ap.print_help()

#!/usr/bin/env python3
"""
VIAJALY -- GERAR EDITOR CAROUSEL STUDIO (skill carrossel-pro oficial)

Le pecas_semana.json e, pra cada peca, monta o slides.json no formato oficial
do carrossel-pro e INJETA no editor Carousel Studio (carrossel-pro/skills/
carrossel-pro/assets/carousel-studio.html), no bloco <script id="deck-data">.

E a Fase 8 da SKILL.md: a entrega e o carrossel-editor.html (Studio populado),
onde o usuario edita, destaca palavra na cor de acento, ajusta e Exporta ZIP
(PNGs 1080x1350 @2x). Substitui o editor caseiro pelo oficial.

Uso:
    python3 scripts/gerar_studio.py
"""

import base64
import json
import mimetypes
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
SPEC = BASE / "saida" / "pecas_semana.json"
PECAS = BASE / "saida" / "pecas"
STUDIO = BASE / "carrossel-pro" / "skills" / "carrossel-pro" / "assets" / "carousel-studio.html"

PALETA = {"bg": "#10204A", "fg": "#FFF6ED", "muted": "#8B93A8",
          "accent": "#FF5A5F", "surface": "#1A2E5C", "cream": "#FFF6ED"}
DECK_TAG = '<script id="deck-data" type="application/json"></script>'


def data_uri(caminho):
    p = BASE / caminho
    mime = mimetypes.guess_type(str(p))[0] or "image/jpeg"
    b64 = base64.b64encode(p.read_bytes()).decode()
    return f"data:{mime};base64,{b64}"


def mapear_slide(s):
    t = s["tipo"]
    if t == "capa":
        o = {"tipo": "capa", "kicker": s.get("kicker", ""), "titulo": s["titulo"],
             "sub": s.get("sub", "")}
        if s.get("ghost"):
            o["ghost"] = s["ghost"]
        return o
    if t == "capa_foto":
        return {"tipo": "capa", "kicker": s.get("kicker", ""), "titulo": s["titulo"],
                "sub": s.get("sub", ""), "bg_uri": data_uri(s["imagem"])}
    if t == "passo":
        o = {"tipo": "passo", "titulo": s["titulo"], "corpo": s.get("corpo", "")}
        if s.get("numero"):
            o["ghost"] = s["numero"]
        return o
    if t == "insight":
        o = {"tipo": "insight", "texto": s["texto"]}
        if s.get("fonte"):
            o["fonte"] = s["fonte"]
        return o
    if t == "cta":
        return {"tipo": "cta", "titulo": s["titulo"],
                "acao": s.get("acao", "Chama no WhatsApp"), "sub": s.get("sub", "")}
    raise ValueError(f"tipo desconhecido: {t}")


def deck(peca):
    return {
        "kit": peca.get("kit", "corporate"),
        "formato": "4:5",
        "paleta": PALETA,
        "handle": peca["conta"],
        "slides": [mapear_slide(s) for s in peca["slides"]],
    }


def main():
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("--spec", default=str(SPEC))
    ap.add_argument("--out", default=str(PECAS))
    args = ap.parse_args()
    out = Path(args.out)

    tpl = STUDIO.read_text(encoding="utf-8")
    assert DECK_TAG in tpl, "bloco deck-data nao encontrado no Carousel Studio"
    pecas = json.loads(Path(args.spec).read_text(encoding="utf-8"))["pecas"]
    out.mkdir(parents=True, exist_ok=True)
    for p in pecas:
        d = json.dumps(deck(p), ensure_ascii=False)
        html = tpl.replace(DECK_TAG, f'<script id="deck-data" type="application/json">{d}</script>')
        stem = f"{p['data']}_{p['combo']}"
        (out / f"{stem}.html").write_text(html, encoding="utf-8")
        print(f"  ok {stem}.html  ({len(p['slides'])} slides, {len(html)//1024}KB)")
    print(f"\n{len(pecas)} editores Carousel Studio -> {out}")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
VIAJALY -- CHECAGEM DE COERENCIA IMAGEM x CONTEUDO

Premissa fixa: se a capa nomeia um lugar/cena (praia, Nova York, Miami, neve,
Disney...), a foto tem que ser daquele lugar/cena. Roda em todos os specs e
falha (exit 1) se achar descasamento. Deve rodar antes de publicar.

Uso: python3 scripts/checar_coerencia.py
"""

import json
import os
import re
import sys
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
SPECS = ["saida/pecas_semana.json", "saida/roteiros_fotos.json",
         "saida/roteiros_destinos.json", "saida/lote_destinos2.json",
         "saida/lote_verdades.json", "saida/lote_extra.json"]

# palavra-de-lugar na capa -> tokens aceitaveis no nome do arquivo de foto
REGRAS = [
    (r"nova york|brooklyn|\bnyc\b", ["ny-ponte", "ny-"]),
    (r"miami|key biscayne|wynwood|everglades|brickell|south beach", ["miami"]),
    (r"calif[oó]rnia|los angeles|disneyland|costa oeste", ["disney-castelo", "universal", "montanha"]),
    (r"universal", ["universal"]),
    (r"neve|inverno|montanha|esqui|\bski\b", ["neve", "montanha"]),
    (r"praia", ["praia"]),
    (r"orlando|disney", ["disney", "universal"]),
]


def main():
    problemas = []
    total = 0
    for sp in SPECS:
        d = json.loads((BASE / sp).read_text(encoding="utf-8"))
        for p in d.get("pecas", []):
            total += 1
            cap = p["slides"][0]
            txt = " ".join([cap.get("titulo", ""), cap.get("kicker", ""),
                            cap.get("sub", ""), p.get("tese", "")]).lower()
            img = os.path.basename(p.get("imagem", "") or cap.get("imagem", "")).lower()
            for pat, toks in REGRAS:
                if re.search(pat, txt):
                    if not any(t in img for t in toks):
                        problemas.append((p["combo"], pat.split("|")[0], img, sp.split("/")[-1]))
                    break
    if problemas:
        print(f"DESCASAMENTOS ({len(problemas)}):")
        for c, tema, img, f in problemas:
            print(f"  X {c}: capa fala '{tema}' mas foto={img}  ({f})")
        sys.exit(1)
    print(f"OK: {total} pecas, imagem coerente com o conteudo em todas.")
    sys.exit(0)


if __name__ == "__main__":
    main()

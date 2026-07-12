#!/usr/bin/env python3
"""
VIAJALY -- LISTA PALAVRA-CHAVE -> DM AUTOMATICO

Varre todas as pecas e monta a lista de automacao de comentario: para cada
palavra-chave do CTA, o texto do DM que o bot dispara (ManyChat/afins).
Cada DM entrega o que o post prometeu, chama pra acao e carrega o disclaimer.

Saida:
    saida/palavras-dm.csv
    saida/PALAVRAS-DM.md

Uso: python3 scripts/gerar_dms.py
"""

import csv
import json
import re
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
DIRS = ["saida/pecas", "saida/destinos_pecas", "saida/verdades_pecas", "saida/extra_pecas", "saida/roteiros_pecas"]
EXCLUIR = {"A24xP1", "A25xP6", "A26xP1"}
DISC = ("Lembrando: a Viajaly nao garante aprovacao de vistos. A decisao e "
        "exclusiva das autoridades consulares.")


def coletar():
    itens, vistos = [], set()
    for d in DIRS:
        for arq in sorted((BASE / d).glob("*.json")):
            p = json.loads(arq.read_text(encoding="utf-8"))
            if p["combo"] in EXCLUIR or p["combo"] in vistos:
                continue
            vistos.add(p["combo"])
            cta = next((s for s in p["slides"] if s["tipo"] == "cta"), {})
            mp = re.search(r"comenta\s+([A-Z0-9]+)", cta.get("acao", ""), re.I)
            # promessa: "...que eu (te) mando/explico/mostro/ajudo/conto/falo XYZ. Ou link"
            mt = re.search(r"(?:que|e) eu (?:te )?(?:mando|explico|mostro|ajudo|conto|falo)\s+(.*?)(?:\.?\s*Ou link|$)",
                           cta.get("titulo", ""), re.I)
            promessa = (mt.group(1).strip() if mt else "o material que combinei")
            itens.append({
                "palavra": (mp.group(1) if mp else ""),
                "combo": p["combo"], "conta": p["conta"], "pilar": p["pilar"],
                "tema": p.get("tema", "engine"), "tese": p.get("tese", ""),
                "promessa": promessa,
            })
    return itens


def dm(it):
    saud = "Oii, que bom que voce comentou" if it["conta"] == "@leticia" else "Oi! Obrigada por comentar"
    return (f"{saud} {it['palavra']}. Como prometi, aqui vai {it['promessa']}. "
            f"Quer que eu veja o seu caso? Me manda um oi por aqui ou toca no link da bio. {DISC}")


def main():
    itens = coletar()
    # checa colisao de palavra
    from collections import Counter
    col = [w for w, n in Counter(i["palavra"] for i in itens).items() if n > 1]
    linhas = [{**it, "texto_dm": dm(it)} for it in itens]

    csv_path = BASE / "saida" / "palavras-dm.csv"
    with open(csv_path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["palavra", "combo", "conta", "pilar", "tema", "tese", "promessa", "texto_dm"])
        w.writeheader(); w.writerows(linhas)

    md = ["# Lista de automacao: palavra-chave -> DM", "",
          f"{len(itens)} palavras-chave, uma por peca. Configure no ManyChat (ou similar): "
          "quando alguem comentar a palavra no post, o bot envia o DM correspondente.", ""]
    if col:
        md.append(f"> ATENCAO: palavras repetidas (renomeie): {', '.join(col)}")
        md.append("")
    md.append("| palavra | conta | combo | entrega (o DM manda) |")
    md.append("|---------|-------|-------|----------------------|")
    for it in linhas:
        md.append(f"| **{it['palavra']}** | {it['conta']} | {it['combo']} | {it['promessa']} |")
    md.append("\n---\n\n## Textos prontos do DM\n")
    for it in linhas:
        md.append(f"### {it['palavra']}  ({it['combo']} - {it['conta']})")
        md.append(f"> {it['texto_dm']}\n")
    (BASE / "saida" / "PALAVRAS-DM.md").write_text("\n".join(md), encoding="utf-8")

    print(f"{len(itens)} palavras -> {csv_path}")
    print(f"  colisoes: {col if col else 'nenhuma'}")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
VIAJALY -- MONTAR GRADE DE AGENDAMENTO

Varre TODAS as pecas geradas (visa-first + linha Destinos + pontes de desejo),
remove duplicatas/superseded, e monta um calendario 2/dia balanceando conta,
pilar e tema, com teto de 1 denuncia por dia. Nao repete combo.

Saida:
    saida/grade.csv   colunas: data,hora,dia,conta,pilar,tema,combo,titulo,palavra_cta,imagem,fonte,editor
    saida/GRADE.md    calendario legivel, dia a dia

Uso:
    python3 scripts/montar_grade.py --inicio 2026-07-13 --por-dia 2
"""

import argparse
import csv
import json
import re
from datetime import datetime, timedelta
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
DIRS = ["saida/pecas", "saida/destinos_pecas", "saida/verdades_pecas", "saida/extra_pecas", "saida/roteiros_pecas"]
# superseded pela linha Destinos (mesmo tema, versao travel-first e melhor):
EXCLUIR = {"A24xP1", "A25xP6", "A26xP1"}
DIAS_PT = ["seg", "ter", "qua", "qui", "sex", "sab", "dom"]


def coletar():
    pecas, vistos = [], set()
    for d in DIRS:
        for arq in sorted((BASE / d).glob("*.json")):
            p = json.loads(arq.read_text(encoding="utf-8"))
            combo = p["combo"]
            if combo in EXCLUIR or combo in vistos:
                continue
            vistos.add(combo)
            s0 = p["slides"][0]
            cta = next((s for s in p["slides"] if s["tipo"] == "cta"), {})
            m = re.search(r"comenta\s+([A-Z0-9]+)", cta.get("acao", ""), re.I)
            pecas.append({
                "combo": combo,
                "conta": p["conta"],
                "pilar": p["pilar"],
                "tema": p.get("tema", "engine"),
                "titulo": s0.get("titulo", ""),
                "palavra": (m.group(1) if m else ""),
                "imagem": (p.get("imagem", "") or s0.get("imagem", "")).split("/")[-1],
                "fonte": ("sim" if p.get("fonte_url") else "-"),
                "editor": f"{d}/{arq.stem}.html",
            })
    return pecas


def agendar(pecas, por_dia):
    """Greedy: espalha conta, tema e pilar; no maximo 1 denuncia por dia."""
    # ordena por prioridade de espalhamento: denuncia primeiro (mais restrita)
    ordem_pilar = {"denuncia": 0, "prova": 1, "desejo": 2, "utilidade": 3, "antidoto": 4}
    pool = sorted(pecas, key=lambda x: (ordem_pilar.get(x["pilar"], 9), x["combo"]))
    dias = []
    while pool:
        dia = []
        usados_idx = []
        denuncia_no_dia = 0
        for i, p in enumerate(pool):
            if len(dia) >= por_dia:
                break
            if p["pilar"] == "denuncia" and denuncia_no_dia >= 1:
                continue
            # evita duas do mesmo tema/conta no mesmo dia quando possivel
            if dia and any(d["tema"] == p["tema"] and d["conta"] == p["conta"] for d in dia):
                continue
            dia.append(p); usados_idx.append(i)
            if p["pilar"] == "denuncia":
                denuncia_no_dia += 1
        # completa o dia se sobrou slot (relaxa a regra de tema/conta)
        if len(dia) < por_dia:
            for i, p in enumerate(pool):
                if i in usados_idx or p in dia:
                    continue
                if len(dia) >= por_dia:
                    break
                if p["pilar"] == "denuncia" and denuncia_no_dia >= 1:
                    continue
                dia.append(p); usados_idx.append(i)
                if p["pilar"] == "denuncia":
                    denuncia_no_dia += 1
        for i in sorted(usados_idx, reverse=True):
            pool.pop(i)
        dias.append(dia)
    return dias


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--inicio", default="2026-07-13")
    ap.add_argument("--por-dia", type=int, default=2)
    args = ap.parse_args()

    pecas = coletar()
    dias = agendar(pecas, args.por_dia)
    horas = ["09:00", "18:00", "12:00", "20:00"][:args.por_dia]
    inicio = datetime.strptime(args.inicio, "%Y-%m-%d")

    linhas = []
    for d, dia in enumerate(dias):
        data = inicio + timedelta(days=d)
        for slot, p in enumerate(dia):
            linhas.append({
                "data": data.strftime("%Y-%m-%d"),
                "hora": horas[slot] if slot < len(horas) else "09:00",
                "dia": DIAS_PT[data.weekday()],
                **{k: p[k] for k in ("conta", "pilar", "tema", "combo", "titulo", "palavra", "imagem", "fonte", "editor")},
            })

    # CSV
    csv_path = BASE / "saida" / "grade.csv"
    with open(csv_path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(linhas[0].keys()))
        w.writeheader(); w.writerows(linhas)

    # Markdown
    md = ["# Grade de agendamento - Viajaly", "",
          f"{len(pecas)} carrosseis unicos, {args.por_dia}/dia, {len(dias)} dias. "
          f"Denuncia no maximo 1/dia. Combo nunca repete.", ""]
    # estatisticas
    from collections import Counter
    cp = Counter(p["pilar"] for p in pecas); ct = Counter(p["tema"] for p in pecas)
    cc = Counter(p["conta"] for p in pecas)
    md.append("**Mix de pilar:** " + " · ".join(f"{k} {v} ({v/len(pecas)*100:.0f}%)" for k, v in cp.most_common()))
    md.append("")
    md.append("**Tema:** " + " · ".join(f"{k} {v}" for k, v in ct.most_common()) +
              "  |  **Conta:** " + " · ".join(f"{k} {v}" for k, v in cc.most_common()))
    md.append("")
    md.append("**Antes de agendar:**")
    md.append("- A19 (HISTORIA) e A20 (PROVA) sao prova RETIDA: so publicar apos inserir "
              "depoimento/numero REAL com autorizacao LGPD.")
    md.append("- Dados pereciveis (A03, A05, A07, A08, A10): revalidar fonte antes de publicar "
              "(fila ate ~14 dias, taxa/regra ate ~30 dias da verificacao em 2026-07-12).")
    md.append("- Palavra CTA = gatilho de comentario (DM automatico). Configurar no ManyChat/afins.")
    md.append("- Linha 'destino' e topo de funil (viagem); 'engine' e visa-first (converte).")
    md.append("")
    cur = None
    for ln in linhas:
        if ln["data"] != cur:
            cur = ln["data"]
            md.append(f"\n### {ln['data']} ({ln['dia']})\n")
            md.append("| hora | conta | pilar | tema | titulo | palavra CTA | imagem | fonte |")
            md.append("|------|-------|-------|------|--------|-------------|--------|-------|")
        md.append(f"| {ln['hora']} | {ln['conta']} | {ln['pilar']} | {ln['tema']} | "
                  f"{ln['titulo'][:54]} | {ln['palavra']} | {ln['imagem']} | {ln['fonte']} |")
    (BASE / "saida" / "GRADE.md").write_text("\n".join(md), encoding="utf-8")

    print(f"{len(pecas)} pecas -> {len(dias)} dias ({args.por_dia}/dia)")
    print(f"  {csv_path}")
    print(f"  {BASE/'saida'/'GRADE.md'}")


if __name__ == "__main__":
    main()

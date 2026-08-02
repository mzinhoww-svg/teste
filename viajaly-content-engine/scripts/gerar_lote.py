#!/usr/bin/env python3
"""
VIAJALY — GERADOR DE LOTE
Monta a fila de conteudo do mes combinando ANGULO x PERSONA x CONTA,
sem repetir combinacao, respeitando a distribuicao de pilares e o
split @viajaly / @leticia.

Uso:
    python3 gerar_lote.py --dias 30
    python3 gerar_lote.py --dias 30 --reels-dia 2 --carrosseis-dia 2
    python3 gerar_lote.py --briefings          # emite os prompts prontos pro carrossel-pro

Saida:
    saida/fila_YYYY-MM.json    -> a fila completa, dia a dia
    saida/briefings/           -> um .md por carrossel, pronto pra colar no Claude
"""

import json
import random
import argparse
from pathlib import Path
from datetime import datetime, timedelta

BASE = Path(__file__).resolve().parent.parent
BANCO = BASE / "banco" / "angulos.json"
USADOS = BASE / "banco" / "usados.json"
SAIDA = BASE / "saida"

# Distribuicao alvo de pilares (do plano social, secao 3)
MIX = {
    "denuncia":  0.25,
    "utilidade": 0.30,
    "prova":     0.20,
    "antidoto":  0.15,
    "desejo":    0.10,
}

# Regra de conta: qual pilar vai pra qual perfil
CONTA_POR_PILAR = {
    "denuncia":  "@leticia",    # polemica mora na pessoa, nunca na marca
    "utilidade": "@viajaly",
    "prova":     "@viajaly",
    "antidoto":  "AMBAS",       # alterna
    "desejo":    "@viajaly",
}


def carregar():
    banco = json.loads(BANCO.read_text(encoding="utf-8"))
    usados = json.loads(USADOS.read_text(encoding="utf-8")) if USADOS.exists() else {"combos": []}
    return banco, usados


def combos_disponiveis(banco, usados, pilar):
    """Todas as combinacoes ANGULO x PERSONA ainda nao usadas nos ultimos 30 dias."""
    hoje = datetime.now()
    recentes = set()
    for u in usados["combos"]:
        try:
            d = datetime.strptime(u["data"], "%Y-%m-%d")
            if (hoje - d).days < 30:
                recentes.add(u["combo"])
        except (ValueError, KeyError):
            continue

    angulos = [a for a in banco["angulos"] if a["pilar"] == pilar]
    personas = banco["personas"]
    disp = []

    for a in angulos:
        # angulo com persona_alvo so combina com aquela persona
        alvos = [p for p in personas if p["id"] == a["persona_alvo"]] if a.get("persona_alvo") else personas
        for p in alvos:
            combo = f"{a['id']}x{p['id']}"
            if combo not in recentes:
                disp.append({"angulo": a, "persona": p, "combo": combo})

    return disp


def montar_fila(banco, usados, dias, reels_dia, carrosseis_dia):
    total_pecas = dias * (reels_dia + carrosseis_dia)
    fila = []
    novos_usados = []
    hoje = datetime.now()
    alterna_antidoto = 0

    # quantas pecas por pilar
    cotas = {p: max(1, round(total_pecas * pct)) for p, pct in MIX.items()}

    pool = []
    for pilar, qtd in cotas.items():
        disp = combos_disponiveis(banco, usados, pilar)
        if not disp:
            print(f"  AVISO: pilar '{pilar}' sem combinacoes novas. Banco precisa de mais angulos.")
            continue
        random.shuffle(disp)
        # se a cota excede o disponivel, cicla (mas avisa)
        if qtd > len(disp):
            print(f"  AVISO: pilar '{pilar}' pede {qtd} pecas mas so tem {len(disp)} combos novos.")
            qtd = len(disp)
        pool.extend([dict(d, pilar=pilar) for d in disp[:qtd]])

    random.shuffle(pool)

    idx = 0
    for d in range(dias):
        data = (hoje + timedelta(days=d)).strftime("%Y-%m-%d")

        for slot in range(reels_dia + carrosseis_dia):
            if idx >= len(pool):
                break
            item = pool[idx]
            idx += 1

            formato = "reel" if slot < reels_dia else "carrossel"
            pilar = item["pilar"]
            a = item["angulo"]

            # conta
            conta = CONTA_POR_PILAR[pilar]
            if conta == "AMBAS":
                conta = "@viajaly" if alterna_antidoto % 2 == 0 else "@leticia"
                alterna_antidoto += 1

            # reel de prova com depoimento EXIGE a Leticia gravando
            exige_leticia = bool(a.get("exige_leticia")) and formato == "reel"
            modo = "leticia" if exige_leticia else ("faceless" if formato == "reel" else "claude")

            fila.append({
                "data": data,
                "formato": formato,
                "conta": conta,
                "pilar": pilar,
                "angulo_id": a["id"],
                "persona_id": item["persona"]["id"],
                "combo": item["combo"],
                "tese": a["tese"],
                "gancho_base": a["gancho_base"],
                "persona": item["persona"]["nome"],
                "dor": item["persona"]["dor"],
                "objetivo": a["objetivo"],
                "modo_producao": modo,
                "perecivel": a.get("perecivel"),
                "fonte_url": a.get("fonte_url"),
                "exige_deposito": bool(a.get("exige_deposito")),
            })
            novos_usados.append({"combo": item["combo"], "data": data})

    return fila, novos_usados


def emitir_briefing(peca, banco):
    """Gera o prompt pronto pra colar no carrossel-pro."""
    sistema = """SISTEMA VISUAL VIAJALY -- @reusar

Kit: corporate
Paleta: bg #10204A | fg #FFF6ED | muted #8B93A8 | accent #FF5A5F | surface #1A2E5C | cream #FFF6ED
Formato: 4:5 | Handle: {conta}

VOZ: voce (informal). Sem emoji. Sem travessao.
LISTA NEGRA: "visto garantido", "aprovacao garantida", "100% de aprovacao",
"sonho americano", "ultimas vagas", "corre que acaba", juridiques.

OBRIGATORIO no ultimo slide:
"A Viajaly nao garante aprovacao de vistos. A decisao e exclusiva das
autoridades consulares."
""".format(conta=peca["conta"])

    return f"""# BRIEFING -- {peca['combo']} -- {peca['data']}

{sistema}

## Briefing do carrossel

- **Tema:** {peca['tese']}
- **Persona:** {peca['persona']} ({peca['persona_id']})
- **Dor dela:** {peca['dor']}
- **Gancho base (adaptar pra essa persona):** {peca['gancho_base']}
- **Pilar:** {peca['pilar']}
- **Objetivo:** {peca['objetivo']}
- **Conta:** {peca['conta']}
{f"- **DADO PERECIVEL ({peca['perecivel']}): REVERIFICAR antes de gerar. Colocar fonte na tela.**" if peca['perecivel'] else ""}
{f"- **Fonte:** {peca['fonte_url']}" if peca.get('fonte_url') else ""}

## Instrucao

Escreva o carrossel falando DIRETAMENTE com {peca['persona']}, atacando a dor
especifica dela: "{peca['dor']}".

Nao escreva um carrossel generico sobre "{peca['tese']}". Escreva o carrossel
que essa pessoa especifica precisa ler.

Ao final, rode o gate:
    python3 scripts/gate.py saida/{peca['combo']}.json
"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dias", type=int, default=30)
    ap.add_argument("--reels-dia", type=int, default=2)
    ap.add_argument("--carrosseis-dia", type=int, default=2)
    ap.add_argument("--briefings", action="store_true")
    args = ap.parse_args()

    banco, usados = carregar()

    print(f"\nGerando fila: {args.dias} dias x ({args.reels_dia} reels + {args.carrosseis_dia} carrosseis)")
    print(f"Total alvo: {args.dias * (args.reels_dia + args.carrosseis_dia)} pecas\n")

    fila, novos = montar_fila(banco, usados, args.dias, args.reels_dia, args.carrosseis_dia)

    SAIDA.mkdir(exist_ok=True)
    mes = datetime.now().strftime("%Y-%m")
    arq = SAIDA / f"fila_{mes}.json"
    arq.write_text(json.dumps(fila, ensure_ascii=False, indent=2), encoding="utf-8")

    # registra usados
    usados["combos"].extend(novos)
    USADOS.write_text(json.dumps(usados, ensure_ascii=False, indent=2), encoding="utf-8")

    # estatisticas
    print(f"\n{'=' * 62}")
    print(f"FILA GERADA: {len(fila)} pecas -> {arq.name}")
    print(f"{'=' * 62}\n")

    por_pilar, por_conta, por_modo = {}, {}, {}
    for p in fila:
        por_pilar[p["pilar"]] = por_pilar.get(p["pilar"], 0) + 1
        por_conta[p["conta"]] = por_conta.get(p["conta"], 0) + 1
        por_modo[p["modo_producao"]] = por_modo.get(p["modo_producao"], 0) + 1

    print("Por pilar:")
    for k, v in sorted(por_pilar.items(), key=lambda x: -x[1]):
        print(f"  {k:12} {v:3}  ({v/len(fila)*100:.0f}%)")
    print("\nPor conta:")
    for k, v in sorted(por_conta.items(), key=lambda x: -x[1]):
        print(f"  {k:12} {v:3}")
    print("\nPor modo de producao:")
    for k, v in sorted(por_modo.items(), key=lambda x: -x[1]):
        print(f"  {k:12} {v:3}")

    leticia = por_modo.get("leticia", 0)
    print(f"\n  -> Reels que EXIGEM a Leticia gravando: {leticia}")
    print(f"  -> Sessoes de gravacao necessarias (8 reels/sessao): {max(1, -(-leticia // 8))}")

    pereciveis = [p for p in fila if p["perecivel"]]
    print(f"\n  -> Pecas com dado PERECIVEL (reverificar antes de publicar): {len(pereciveis)}")

    if args.briefings:
        bdir = SAIDA / "briefings"
        bdir.mkdir(exist_ok=True)
        n = 0
        for p in fila:
            if p["formato"] == "carrossel":
                (bdir / f"{p['data']}_{p['combo']}.md").write_text(
                    emitir_briefing(p, banco), encoding="utf-8")
                n += 1
        print(f"\n  -> {n} briefings de carrossel emitidos em saida/briefings/")

    print()


if __name__ == "__main__":
    main()

"""Teste de bancada (F0) da prospecção por decisores: cada pessoa da amostra passa por cada provedor de celular
(isolado: prefere ele e exclui os outros) e pela busca de e-mail; o relatório diz, por etapa e provedor,
tentativas, achados, taxa e custo. É ele que decide a ordem da cascata (spec 2026-10-07, seção 3).

    python3 -m scripts.bancada --amostra ARQ.json --teto-usd 3 --saida RELATORIO.json [--simular]
        [--provedores aiark,wiza,...] [--etapas celular,email] [--max-celular-usd 0.15] [--max-email-usd 0.01]

A amostra é uma lista de pessoas `{nome, dominio, empresa, linkedin}` e fica FORA do Git. O relatório não leva
dado pessoal (nem nome, nem telefone, nem e-mail, nem LinkedIn): só contagens e custos por provedor.
Para antes de passar do teto (custo gasto + teto da próxima chamada) e para na hora se faltar saldo.
`--simular` usa um transporte falso no formato real do treg: não usa a rede nem gasta dinheiro."""
import argparse
import hashlib
import json
import os
import re
import sys

try:
    from atendente.prospeccao import treg_ops
except ImportError:  # rodando de tools/prospeccao: o pacote do atendente é a pasta irmã
    sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
                                    "atendente"))
    from atendente.prospeccao import treg_ops

from scripts.enriquecer_leads import TregCliente, TregErro, _header, ler_token

# Provedores de celular do catálogo (07/10/2026) e taxa de acerto declarada; a F0 mede a real em MT.
PROVEDORES_CELULAR = ["aiark", "dropleads", "leadmagic", "wiza", "quickenrich", "tomba", "lusha"]
MAX_CELULAR_MICRO = 150_000
MAX_EMAIL_MICRO = 10_000
ETAPAS = ("celular", "email")

_NOME_OK = re.compile(r"[a-z0-9_.-]{1,40}")


def _nome_provedor(p) -> str:
    """Só nomes curtos de provedor entram no relatório (nada que possa carregar dado pessoal)."""
    p = str(p or "").strip().lower()
    return p if _NOME_OK.fullmatch(p) and not re.search(r"\d{6,}", p) else "outro"


def _linha():
    return {"tentativas": 0, "achados": 0, "custoMicro": 0, "erros": 0, "servido_por_outro": 0}


def rodar(amostra: list[dict], cli, provedores=None, teto_micro=3_000_000, max_celular_micro=MAX_CELULAR_MICRO,
          max_email_micro=MAX_EMAIL_MICRO, etapas=ETAPAS, execucao="f0") -> dict:
    provedores = list(provedores or PROVEDORES_CELULAR)
    stats: dict = {e: {} for e in etapas}
    estado = {"gasto": 0, "motivo": None}
    testadas = 0

    def cabe(max_micro) -> bool:
        if estado["gasto"] + max_micro > teto_micro:
            estado["motivo"] = "teto"
        return estado["motivo"] is None

    def chamar(etapa, alvo, fn):
        """`alvo` é o provedor forçado (celular) ou None (roteado: conta para quem atendeu)."""
        eventos = []
        try:
            fn(eventos.append)
        except treg_ops.SemSaldo:
            estado["motivo"] = "saldo insuficiente"
            return
        except (TregErro, OSError):
            stats[etapa].setdefault(_nome_provedor(alvo or "roteado"), _linha())["erros"] += 1
            return
        for ev in eventos:
            servido = _nome_provedor(ev["provedor"])
            linha = stats[etapa].setdefault(_nome_provedor(alvo) if alvo else servido, _linha())
            linha["tentativas"] += 1
            linha["achados"] += 1 if ev["achou"] else 0
            linha["custoMicro"] += ev["custoMicro"]
            if alvo and servido not in (_nome_provedor(alvo), "desconhecido"):
                linha["servido_por_outro"] += 1
            estado["gasto"] += ev["custoMicro"]

    for i, pessoa in enumerate(amostra):
        if estado["motivo"]:
            break
        testadas += 1
        if "celular" in etapas:
            for p in provedores:
                if not cabe(max_celular_micro):
                    break
                ordem = [p] + ["-" + o for o in provedores if o != p]
                chave = f"bancada-{execucao}-{i}-celular-{p}"
                chamar("celular", p, lambda reg: treg_ops.celular(cli, pessoa, ordem, max_celular_micro, chave,
                                                                  registro=reg))
                if estado["motivo"]:
                    break
        if "email" in etapas and not estado["motivo"] and cabe(max_email_micro):
            chave = f"bancada-{execucao}-{i}-email"
            chamar("email", None, lambda reg: treg_ops.email(cli, pessoa, max_email_micro, chave, registro=reg))
        if estado["motivo"]:
            break

    por_etapa = {}
    for etapa, linhas in stats.items():
        por_etapa[etapa] = {}
        for prov, l in sorted(linhas.items()):
            custo = round(l["custoMicro"] / 1_000_000, 6)
            por_etapa[etapa][prov] = {
                "tentativas": l["tentativas"], "achados": l["achados"],
                "taxa": round(l["achados"] / l["tentativas"], 3) if l["tentativas"] else None,
                "custo_usd": custo, "erros": l["erros"], "servido_por_outro": l["servido_por_outro"],
                "custo_por_achado_usd": round(custo / l["achados"], 6) if l["achados"] else None}
    return {"pessoas": len(amostra), "pessoas_testadas": testadas, "teto_usd": round(teto_micro / 1_000_000, 6),
            "gasto_usd": round(estado["gasto"] / 1_000_000, 6), "motivo_parada": estado["motivo"],
            "por_etapa": por_etapa}


# --------------------------------------------------------------------------- simulador

# (taxa de acerto, custo por acerto em micro): só para exercitar o fluxo; a F0 real mede de verdade.
_SIMULADO = {"aiark": (0.18, 26_000), "dropleads": (0.02, 54_000), "leadmagic": (0.13, 50_000),
             "wiza": (0.20, 120_000), "quickenrich": (0.15, 40_000), "tomba": (0.21, 30_000),
             "lusha": (0.36, 750_000), "trykitt": (0.40, 5_000)}


def transporte_simulado(metodo, url, headers, corpo):
    """Respostas determinísticas no formato real do treg. Números fictícios 55659999000NN."""
    chave = _header(headers, "Idempotency-Key") or ""
    h = int(hashlib.sha1(chave.encode()).hexdigest(), 16)
    if url.endswith(treg_ops.EP_EMAIL):
        prov = (_header(headers, "X-Treg-Route-Prefer") or "trykitt").split(",")[0]
    else:
        prov = (_header(headers, "X-Treg-Route-Prefer") or "aiark").split(",")[0]
    taxa, custo = _SIMULADO.get(prov, (0.1, 10_000))
    max_micro = int(float(_header(headers, "X-Treg-Route-Max-Cost") or 0) * 1_000_000)
    hit = (h % 1000) / 1000 < taxa and custo <= max_micro
    if url.endswith(treg_ops.EP_EMAIL):
        output = {"email": f"pessoa{h % 100:02d}@exemplo.com.br" if hit else None}
    else:
        output = {"phone": f"55659999000{h % 100:02d}" if hit else None}
    hs = {"X-Treg-Served-By": prov, "X-Treg-Cost-Micro": str(custo if hit else 0),
          "X-Treg-Call-Id": hashlib.md5(chave.encode()).hexdigest()}
    corpo = {"output": output, "raw": {}, "_treg": {"served_by": prov, "tried": [prov]}}
    return 200, hs, json.dumps(corpo).encode()


def cliente_simulado() -> TregCliente:
    return TregCliente("simulado", transporte=transporte_simulado, dormir=lambda s: None)


# --------------------------------------------------------------------------- CLI

def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="bancada", description=__doc__.split("\n\n")[0])
    ap.add_argument("--amostra", required=True)
    ap.add_argument("--teto-usd", type=float, default=3.0)
    ap.add_argument("--saida", required=True)
    ap.add_argument("--simular", action="store_true")
    ap.add_argument("--provedores", default=",".join(PROVEDORES_CELULAR))
    ap.add_argument("--etapas", default=",".join(ETAPAS))
    ap.add_argument("--max-celular-usd", type=float, default=MAX_CELULAR_MICRO / 1_000_000)
    ap.add_argument("--max-email-usd", type=float, default=MAX_EMAIL_MICRO / 1_000_000)
    a = ap.parse_args(argv)
    if a.teto_usd <= 0:
        ap.error("--teto-usd tem de ser maior que zero")
    etapas = tuple(e for e in a.etapas.split(",") if e in ETAPAS)
    with open(a.amostra, encoding="utf-8") as fh:
        amostra = json.load(fh)
    if a.simular:
        cli = cliente_simulado()
    else:
        token, org = ler_token()
        if not token:
            print("Sem token: defina TREG_TOKEN ou ~/.treg/config.json", file=sys.stderr)
            return 2
        cli = TregCliente(token, org=org)
    rel = rodar(amostra, cli, provedores=[p.strip() for p in a.provedores.split(",") if p.strip()],
                teto_micro=int(round(a.teto_usd * 1_000_000)),
                max_celular_micro=int(round(a.max_celular_usd * 1_000_000)),
                max_email_micro=int(round(a.max_email_usd * 1_000_000)), etapas=etapas)
    rel["simulado"] = a.simular
    with open(a.saida, "w", encoding="utf-8") as fh:
        json.dump(rel, fh, ensure_ascii=False, indent=1)
    print(f"Bancada: {rel['pessoas_testadas']}/{rel['pessoas']} pessoas, US$ {rel['gasto_usd']:.2f} gastos"
          + (f", parou: {rel['motivo_parada']}" if rel["motivo_parada"] else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main())

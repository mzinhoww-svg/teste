"""Monta as escritas do banco da central para o ArtifactData batch.

Cada lead vira um documento em `leads` com os três toques prontos. A página só
escreve `etapa`, `enviado1..3` e `situacao`; o resto é semeado aqui.
"""
import argparse
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from msg.compose import compose_whatsapp, wa_link  # noqa: E402
from msg.copy_posvenda import doc_config as doc_posvenda  # noqa: E402
from msg.fotos import doc_config as doc_fotos, linha_foto  # noqa: E402
from msg.copy_v1 import ESPERA_DIAS, TOQUES, VERSAO, WHATS_LETICIA  # noqa: E402

LOTE = 50
CAMPOS = ("ordem", "nome", "saudacao", "icp", "segmento", "categoria", "faixa", "score", "bairro",
          "canal", "telefone", "email", "site", "instagram", "fraseUnica", "flags", "versaoCopy",
          "toques", "foto")
ESTADO_INICIAL = {"etapa": 0, "situacao": "ativo", "enviado1": None, "enviado2": None, "enviado3": None}


def doc_lead(linha: dict) -> dict:
    dados = {k: linha.get(k, "") for k in CAMPOS}
    dados.update(ESTADO_INICIAL)
    return dados


def doc_teste() -> dict:
    frase = "Este é o card de teste: abre o seu próprio WhatsApp para conferir acentos e quebras de linha."
    toques = []
    for t in TOQUES:
        lf = linha_foto("sofa-pessoa-02") if t == 1 else ""
        texto = compose_whatsapp(t, "ICP1", "Letícia", "Reiners Media", frase, lf)
        toques.append({"n": t, "mensagem": texto, "waLink": wa_link(WHATS_LETICIA, texto),
                       "assunto": "", "corpo": ""})
    return {"ordem": 0, "nome": "Card de teste", "saudacao": "Letícia", "icp": "ICP1",
            "segmento": "", "categoria": "", "faixa": "", "score": None, "bairro": "",
            "canal": "WhatsApp", "telefone": WHATS_LETICIA, "email": "", "site": "", "instagram": "",
            "fraseUnica": frase, "flags": [], "versaoCopy": VERSAO, "toques": toques, "foto": "sofa-pessoa-02",
            **ESTADO_INICIAL}


def doc_meta() -> dict:
    return {"metaDiaria": 20, "versaoCopy": VERSAO,
            "esperaDias": {str(k): v for k, v in ESPERA_DIAS.items()}}


def seed(linhas: list[dict]) -> list[list[dict]]:
    escritas = [{"op": "set", "collection": "leads", "doc_id": l["id"], "data": doc_lead(l)}
                for l in linhas]
    return [escritas[i:i + LOTE] for i in range(0, len(escritas), LOTE)]


def base() -> list[dict]:
    return [{"op": "set", "collection": "leads", "doc_id": "TESTE", "data": doc_teste()},
            {"op": "set", "collection": "config", "doc_id": "meta", "data": doc_meta()},
            {"op": "set", "collection": "config", "doc_id": "posvenda", "data": doc_posvenda()},
            {"op": "set", "collection": "config", "doc_id": "fotos", "data": doc_fotos()}]


def main() -> None:
    from msg.gerar import gerar
    ap = argparse.ArgumentParser()
    ap.add_argument("--leads", default="dados/leads.json")
    ap.add_argument("--personal", default="msg/personal.json")
    ap.add_argument("--out", default="central/lotes")
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    linhas, erros = gerar(a.leads, a.personal)
    if erros:
        sys.exit("\n".join(erros))
    lotes = [base()] + seed(linhas)
    for i, lote in enumerate(lotes):
        with open(os.path.join(a.out, f"lote_{i:02d}.json"), "w", encoding="utf-8") as fh:
            json.dump(lote, fh, ensure_ascii=False, indent=1)
    print(f"{len(lotes)} lotes, {sum(map(len, lotes))} escritas")


if __name__ == "__main__":
    main()

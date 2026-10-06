"""Leads que a Central marcou como "Toque 1 enviado" sem o envio ter saído pelo WhatsApp voltam a ser primeira mensagem
(com foto) e perdem o agendamento da segunda. Uso, dentro do contêiner:
    python -m atendente.refazer --todos --manter TESTE
"""
import argparse
import logging
import os
import sys
from datetime import datetime, timezone

from scripts import wa_akg

LOG = logging.getLogger("atendente.refazer")
CAMPOS_DO_ENVIO = ("enviado1", "enviado2", "enviado3", "agendamento")


def _precisa(lead: dict, manter: set) -> bool:
    return (lead.get("id") not in manter and lead.get("canal") == "WhatsApp"
            and lead.get("situacao") in (None, "", "ativo") and int(lead.get("etapa") or 0) >= 1)


def refazer_primeiro_toque(repo, wa, agora: datetime, manter=frozenset()) -> dict:
    refeitos = cancelados = erros = 0
    for lead in repo.leads_todos():
        if not _precisa(lead, set(manter)):
            continue
        ag = lead.get("agendamento")
        if ag and ag.get("id"):
            try:
                wa.cancelar(ag["id"])
                cancelados += 1
            except Exception as e:  # sem cancelar, não mexe: a segunda mensagem ainda sairia
                LOG.warning("não consegui cancelar o agendamento de %s: %s", lead["id"], type(e).__name__)
                erros += 1
                continue
        mudanca = {"etapa": 0, "historico": wa_akg.registrar(
            lead.get("historico"), "Primeiro toque refeito: a Central o marcava como enviado, mas ele não saiu pelo WhatsApp",
            agora)}
        for campo in CAMPOS_DO_ENVIO:
            mudanca[campo] = {"__delete__": True}
        repo.aplicar(lead["id"], mudanca)
        refeitos += 1
    return {"refeitos": refeitos, "cancelados": cancelados, "erros": erros}


def main(argv=None, env=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--todos", action="store_true", required=True, help="todos os leads de WhatsApp na cadência com etapa 1 ou mais")
    ap.add_argument("--manter", default="TESTE", help="ids que NÃO se mexe, separados por vírgula (padrão: TESTE)")
    args = ap.parse_args(argv)
    from .__main__ import ler_ambiente, montar_wa
    from .db import Repo
    amb = ler_ambiente(env if env is not None else os.environ)
    repo = Repo(amb["db_caminho"])
    out = refazer_primeiro_toque(repo, montar_wa(amb), datetime.now(timezone.utc),
                                 {i.strip() for i in args.manter.split(",") if i.strip()})
    print("refeitos=%(refeitos)d cancelados=%(cancelados)d erros=%(erros)d" % out)
    return 1 if out["erros"] else 0


if __name__ == "__main__":
    sys.exit(main())

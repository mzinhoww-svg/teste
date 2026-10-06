"""Revisão dos leads: acha os que foram marcados "Respondeu" só por causa de robô de WhatsApp Business.

Uso (na VPS):  python -m atendente.revisar           -> só mostra o que mudaria
               python -m atendente.revisar --aplicar -> faz a correção
Mostra só códigos e contagens (nada de telefone nem texto de conversa).
"""
import os
import re
import sys
from datetime import datetime, timezone

from atendente import politica

_MARCA_MANUAL = re.compile(r"^Situação mudou para .* \(por [^)]+\)")
_RUIDO = "ATENÇÃO:"


def _de_pessoa(m: dict) -> bool:
    return not m.get("de_mim") and not politica.e_saudacao_automatica(m.get("texto"))


def revisar(repo, aplicar: bool = False, agora=None) -> dict:
    agora = agora or datetime.now(timezone.utc)
    volta, esperam, notas = [], [], 0
    for lead in repo.leads_todos():
        lid = lead.get("id")
        if not lid or lead.get("situacao") != "respondeu":
            continue
        msgs = repo.msgs_do_lead(lid, limite=500)
        entrada = [m for m in msgs if not m.get("de_mim")]
        if not entrada:
            continue
        if any(_de_pessoa(m) for m in entrada):
            ultima_nossa = max((m["em"] for m in msgs if m.get("de_mim")), default="")
            if any(_de_pessoa(m) and m["em"] > ultima_nossa for m in entrada):
                esperam.append(lid)
            continue
        hist = lead.get("historico") or []
        if any(_MARCA_MANUAL.match(str(h.get("texto", ""))) for h in hist):
            continue                                          # a equipe marcou à mão: respeita
        volta.append(lid)
        if aplicar:
            novo = [h for h in hist if not str(h.get("texto", "")).startswith(_RUIDO)]
            notas += len(hist) - len(novo)
            novo.append({"em": agora.strftime("%Y-%m-%dT%H:%M:%SZ"),
                         "texto": "Revisão: era só o robô do WhatsApp Business, não era resposta de pessoa. Voltou para a cadência."})
            lead["historico"] = novo
            lead["situacao"] = "ativo"
            repo.lead_put(lead)
    return {"voltam_para_cadencia": volta, "esperam_resposta": esperam, "notas_removidas": notas, "aplicado": bool(aplicar)}


def main(argv=None) -> int:
    from atendente.db import Repo
    aplicar = "--aplicar" in (argv if argv is not None else sys.argv[1:])
    caminho = os.environ.get("DB_CAMINHO", "/data/atendente.db")
    r = revisar(Repo(caminho), aplicar=aplicar)
    print(("APLICADO" if aplicar else "SIMULAÇÃO (nada mudou)"))
    print("Voltam para a cadência (só robô):", len(r["voltam_para_cadencia"]), ", ".join(r["voltam_para_cadencia"]))
    print("Esperam resposta nossa (pessoa de verdade):", len(r["esperam_resposta"]), ", ".join(r["esperam_resposta"]))
    print("Notas de ruído removidas:", r["notas_removidas"])
    return 0


if __name__ == "__main__":
    sys.exit(main())

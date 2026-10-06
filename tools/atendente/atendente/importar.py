"""Importa a exportação de leads do artefato (lista de dicts ou {"leads": [...]})."""
import json

from .db import Repo


def importar_leads(repo: Repo, caminho_json: str) -> dict:
    with open(caminho_json, encoding="utf-8") as f:
        dados = json.load(f)
    if isinstance(dados, dict):
        dados = dados.get("leads") or []
    importados = ignorados = 0
    for l in dados if isinstance(dados, list) else []:
        if isinstance(l, dict) and l.get("id"):
            repo.lead_put(l)
            importados += 1
        else:
            ignorados += 1
    return {"importados": importados, "ignorados": ignorados}

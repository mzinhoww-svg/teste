"""Importa a exportação de leads do artefato (lista de dicts ou {"leads": [...]})."""
import json
import os
import sys

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


def main(argv=None) -> int:
    argv = sys.argv[1:] if argv is None else argv
    if len(argv) != 1:
        print("Informe o caminho do arquivo JSON de leads. Exemplo: python -m atendente.importar /data/leads.json", file=sys.stderr)
        return 1
    caminho = argv[0]
    if not os.path.isfile(caminho):
        print(f"Não encontrei o arquivo {caminho}.", file=sys.stderr)
        return 1
    db_caminho = (os.environ.get("DB_CAMINHO") or "/data/atendente.db").strip()
    pasta = os.path.dirname(db_caminho)
    if pasta:
        os.makedirs(pasta, exist_ok=True)
    repo = Repo(db_caminho)
    try:
        r = importar_leads(repo, caminho)
    except (ValueError, UnicodeError):
        print(f"O arquivo {caminho} não é um JSON válido de leads.", file=sys.stderr)
        return 1
    total = len(repo.leads_todos())
    print(f"importados={r['importados']} ignorados={r['ignorados']} total_no_banco={total}")
    if r["importados"] == 0:
        print("Nenhum lead foi importado: confira se o arquivo é a exportação de leads (cada lead precisa de um id).", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())

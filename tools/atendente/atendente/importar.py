"""Importa as exportações do artefato para o banco do atendente.

    python -m atendente.importar /data/leads.json                       # leads (lista de dicts ou {"leads": [...]})
    python -m atendente.importar --base /data/base                       # Base: pasta com um JSON por empresa (D00001.json)
                                                                         # ou arquivo com a lista ({id, ...} ou {id, data})
    python -m atendente.importar --clientes /data/clientes.json          # clientes do pós-venda (mesmas formas)
    python -m atendente.importar --posvenda /data/posvenda.json          # textos do pós-venda (config/posvenda)

Os quatro podem vir juntos. Importar de novo não duplica (o id manda).
"""
import json
import os
import sys

from .db import Repo

STATUS_DA_BASE = ("status", "leadId", "migradoEm", "pedidoEm", "motivo")


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


def _documentos(caminho: str) -> tuple[list, int]:
    """(documentos com id, quantos não deu para ler). Pasta: um JSON por documento, id = nome do arquivo quando o
    documento não traz. Arquivo: lista, {docs|novos|clientes|base: [...]} ou {id: doc}; cada item {id, ...} ou {id, data}."""
    ruins = 0
    itens = []
    if os.path.isdir(caminho):
        for nome in sorted(os.listdir(caminho)):
            if not nome.endswith(".json"):
                continue
            try:
                with open(os.path.join(caminho, nome), encoding="utf-8") as f:
                    d = json.load(f)
            except (ValueError, UnicodeError, OSError):
                ruins += 1
                continue
            if isinstance(d, dict):
                d = dict(d)
                d.setdefault("id", nome[:-5])
            itens.append(d)
    else:
        with open(caminho, encoding="utf-8") as f:
            dados = json.load(f)
        if isinstance(dados, dict):
            lista = next((dados[k] for k in ("docs", "novos", "clientes", "base") if isinstance(dados.get(k), list)), None)
            if lista is None:
                lista = [dict(v, id=k) if isinstance(v, dict) else v for k, v in dados.items()]
            dados = lista
        itens = dados if isinstance(dados, list) else []
    docs = []
    for x in itens:
        if isinstance(x, dict) and isinstance(x.get("data"), dict) and "nome" not in x:
            x = dict(x["data"], id=x.get("id"))
        if isinstance(x, dict) and x.get("id"):
            docs.append(x)
        else:
            ruins += 1
    return docs, ruins


def importar_base(repo: Repo, caminho: str) -> dict:
    docs, ruins = _documentos(caminho)
    for d in docs:
        atual = repo.base_get(d["id"])
        # reimportar a exportação antiga não desfaz o que já andou aqui (promovido, pedido, sem cadência)
        if atual and (atual.get("status") or "base") != "base" and (d.get("status") or "base") == "base":
            d = dict(d, **{k: atual.get(k) for k in STATUS_DA_BASE if k in atual})
        repo.base_put(d)
    return {"importados": len(docs), "ignorados": ruins}


def importar_clientes(repo: Repo, caminho: str) -> dict:
    docs, ruins = _documentos(caminho)
    for d in docs:
        repo.cliente_put(d)
    return {"importados": len(docs), "ignorados": ruins}


def importar_posvenda(repo: Repo, caminho: str) -> bool:
    """Grava config/posvenda. False (e não grava) se o arquivo não tem a lista de etapas."""
    with open(caminho, encoding="utf-8") as f:
        dados = json.load(f)
    if isinstance(dados, dict) and isinstance(dados.get("data"), dict) and "etapas" not in dados:
        dados = dados["data"]
    if not isinstance(dados, dict) or not isinstance(dados.get("etapas"), list) or not dados["etapas"]:
        return False
    repo.config_set("posvenda", dados)
    return True


def _ler_argumentos(argv):
    leads, extras, i = None, {}, 0
    while i < len(argv):
        a = argv[i]
        if a in ("--base", "--clientes", "--posvenda"):
            if i + 1 >= len(argv):
                return None, None, f"Faltou o caminho depois de {a}."
            extras[a[2:]] = argv[i + 1]
            i += 2
        elif a.startswith("--") or leads is not None:
            return None, None, f"Não entendi o argumento {a}."
        else:
            leads = a
            i += 1
    return leads, extras, None


def main(argv=None) -> int:
    argv = sys.argv[1:] if argv is None else argv
    leads, extras, erro = _ler_argumentos(argv)
    if erro or (leads is None and not extras):
        print(erro or "Informe o caminho do arquivo JSON de leads. Exemplo: python -m atendente.importar /data/leads.json "
              "(ou --base PASTA, --clientes ARQUIVO, --posvenda ARQUIVO)", file=sys.stderr)
        return 1
    for caminho in [leads] + list(extras.values()):
        if caminho is not None and not os.path.exists(caminho):
            print(f"Não encontrei o arquivo {caminho}.", file=sys.stderr)
            return 1
    db_caminho = (os.environ.get("DB_CAMINHO") or "/data/atendente.db").strip()
    pasta = os.path.dirname(db_caminho)
    if pasta:
        os.makedirs(pasta, exist_ok=True)
    repo = Repo(db_caminho)
    codigo = 0
    if leads is not None:
        try:
            r = importar_leads(repo, leads)
        except (ValueError, UnicodeError, IsADirectoryError):
            print(f"O arquivo {leads} não é um JSON válido de leads.", file=sys.stderr)
            return 1
        print(f"importados={r['importados']} ignorados={r['ignorados']} total_no_banco={len(repo.leads_todos())}")
        if r["importados"] == 0:
            print("Nenhum lead foi importado: confira se o arquivo é a exportação de leads (cada lead precisa de um id).", file=sys.stderr)
            codigo = 1
    for nome, fn, total in (("base", importar_base, repo.base_todos), ("clientes", importar_clientes, repo.clientes_todos)):
        if nome not in extras:
            continue
        try:
            r = fn(repo, extras[nome])
        except (ValueError, UnicodeError, IsADirectoryError):
            print(f"O arquivo {extras[nome]} não é um JSON válido ({nome}).", file=sys.stderr)
            return 1
        print(f"{nome}: importados={r['importados']} ignorados={r['ignorados']} total_no_banco={len(total())}")
    if "posvenda" in extras:
        try:
            ok = importar_posvenda(repo, extras["posvenda"])
        except (ValueError, UnicodeError, IsADirectoryError):
            ok = False
        if not ok:
            print(f"O arquivo {extras['posvenda']} não tem as etapas do pós-venda; nada foi gravado.", file=sys.stderr)
            return 1
        print("posvenda: gravado")
    return codigo


if __name__ == "__main__":
    sys.exit(main())

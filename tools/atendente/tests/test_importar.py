import json

import pytest

from atendente.db import Repo
from atendente.importar import importar_leads


@pytest.fixture
def repo():
    return Repo(":memory:")


def _arq(tmp_path, dados):
    p = tmp_path / "leads.json"
    p.write_text(json.dumps(dados, ensure_ascii=False), encoding="utf-8")
    return str(p)


def test_importa_lista_e_objeto_com_leads(repo, tmp_path):
    lista = [{"id": "a1", "nome": "Ação"}, {"id": "a2"}]
    assert importar_leads(repo, _arq(tmp_path, lista)) == {"importados": 2, "ignorados": 0}
    repo2 = Repo(":memory:")
    assert importar_leads(repo2, _arq(tmp_path, {"leads": lista})) == {"importados": 2, "ignorados": 0}
    assert repo2.lead_get("a1")["nome"] == "Ação"


def test_ignora_registro_sem_id(repo, tmp_path):
    r = importar_leads(repo, _arq(tmp_path, [{"nome": "x"}, {"id": ""}, {"id": "a1"}, "lixo"]))
    assert r == {"importados": 1, "ignorados": 3}
    assert [l["id"] for l in repo.leads_todos()] == ["a1"]


def test_importar_duas_vezes_nao_duplica(repo, tmp_path):
    caminho = _arq(tmp_path, [{"id": "a1", "etapa": 1}])
    importar_leads(repo, caminho)
    importar_leads(repo, caminho)
    assert len(repo.leads_todos()) == 1


# ---- linha de comando: python -m atendente.importar

import os
import subprocess
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROSPECCAO = os.path.join(os.path.dirname(os.path.dirname(RAIZ)), "tools", "prospeccao")


def _rodar(tmp_path, json_caminho, db=None):
    db = db or str(tmp_path / "pasta_nova" / "atendente.db")
    env = dict(os.environ, DB_CAMINHO=db, PYTHONPATH=os.pathsep.join([RAIZ, os.path.join(RAIZ, "..", "prospeccao")]))
    args = [sys.executable, "-m", "atendente.importar"] + ([json_caminho] if json_caminho else [])
    return subprocess.run(args, env=env, capture_output=True, text=True, cwd=str(tmp_path)), db


def test_cli_importa_cria_banco_e_imprime_resumo(tmp_path):
    arq = _arq(tmp_path, [{"id": "a1"}, {"id": "a2"}, {"nome": "sem id"}])
    r, db = _rodar(tmp_path, arq)
    assert r.returncode == 0, r.stderr
    assert r.stdout.strip() == "importados=2 ignorados=1 total_no_banco=2"
    assert os.path.exists(db)
    assert Repo(db).lead_get("a1")["id"] == "a1"


def test_cli_nao_duplica_na_segunda_rodada(tmp_path):
    arq = _arq(tmp_path, [{"id": "a1"}])
    db = str(tmp_path / "x.db")
    _rodar(tmp_path, arq, db)
    r, _ = _rodar(tmp_path, arq, db)
    assert r.stdout.strip() == "importados=1 ignorados=0 total_no_banco=1"


def test_cli_sai_com_1_se_nada_importado_ou_arquivo_ruim(tmp_path):
    r, _ = _rodar(tmp_path, _arq(tmp_path, [{"nome": "sem id"}]))
    assert r.returncode == 1 and "Nenhum lead" in r.stderr
    r, _ = _rodar(tmp_path, str(tmp_path / "nao_existe.json"))
    assert r.returncode == 1 and "não encontrei" in r.stderr.lower()
    ruim = tmp_path / "ruim.json"
    ruim.write_text("{nao e json", encoding="utf-8")
    r, _ = _rodar(tmp_path, str(ruim))
    assert r.returncode == 1 and "JSON" in r.stderr
    r, _ = _rodar(tmp_path, None)
    assert r.returncode == 1 and "caminho" in r.stderr.lower()

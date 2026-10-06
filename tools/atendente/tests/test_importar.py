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

"""Prospecção: tabelas novas do SQLite (campanhas, prospectos, cnpj, contatos_compartilhados, lista_sair).

Fixtures sintéticas: nenhum CNPJ, nome ou telefone real (telefones 55659999000NN).
"""
import hashlib
import sqlite3

import pytest

from atendente.db import Repo


@pytest.fixture
def repo():
    return Repo(":memory:", sal="sal-de-teste")


def test_campanha_ida_e_volta(repo):
    c = {"id": "C1", "segmento": "Mercados", "cidades": ["Cuiabá"], "status": "rascunho"}
    repo.campanha_put(c)
    assert repo.campanha_get("C1") == c
    assert repo.campanha_get("nao") is None
    repo.campanha_put(dict(c, status="ativa"))
    assert repo.campanha_get("C1")["status"] == "ativa"
    repo.campanha_put({"id": "C2", "segmento": "Clínicas"})
    assert [x["id"] for x in repo.campanhas()] == ["C1", "C2"]
    with pytest.raises(ValueError):
        repo.campanha_put({"segmento": "sem id"})


def test_prospectos_por_campanha_e_estado(repo):
    repo.prospecto_put({"id": "P1", "campanhaId": "C1", "estado": "empresa", "chavePessoa": "k1"})
    repo.prospecto_put({"id": "P2", "campanhaId": "C1", "estado": "qualificado", "chavePessoa": "k2"})
    repo.prospecto_put({"id": "P3", "campanhaId": "C2", "estado": "empresa", "chavePessoa": "k1"})
    assert repo.prospecto_get("P2")["estado"] == "qualificado"
    assert repo.prospecto_get("nao") is None
    assert [p["id"] for p in repo.prospectos("C1")] == ["P1", "P2"]
    assert [p["id"] for p in repo.prospectos("C1", estado="qualificado")] == ["P2"]
    assert [p["id"] for p in repo.prospectos(estado="empresa")] == ["P1", "P3"]
    assert [p["id"] for p in repo.prospectos_por_chave("k1")] == ["P1", "P3"]
    repo.prospecto_put(dict(repo.prospecto_get("P1"), estado="descartado", motivo="sem WhatsApp"))
    assert [p["id"] for p in repo.prospectos("C1", estado="descartado")] == ["P1"]
    with pytest.raises(ValueError):
        repo.prospecto_put({"campanhaId": "C1"})


def test_cnpj_put_get_e_filtro(repo):
    base = {"razao": "Mercado Fictício", "fantasia": "", "porte": "ME", "telefone": "", "email": "", "socios": []}
    repo.cnpj_put(dict(base, cnpj="00000000000101", cnae="4711-3/02", municipio="CUIABA"))
    repo.cnpj_put(dict(base, cnpj="00000000000202", cnae="4711-3/02", municipio="SINOP", porte="EPP"))
    repo.cnpj_put(dict(base, cnpj="00000000000303", cnae="5611-2/01", municipio="CUIABA"))
    assert repo.cnpj_get("00000000000101")["razao"] == "Mercado Fictício"
    assert repo.cnpj_get("99") is None
    assert len(repo.cnpjs()) == 3
    assert [x["cnpj"] for x in repo.cnpjs({"municipio": "CUIABA"})] == ["00000000000101", "00000000000303"]
    assert [x["cnpj"] for x in repo.cnpjs({"cnae": "4711-3/02", "municipio": ["SINOP", "CUIABA"]})] == \
        ["00000000000101", "00000000000202"]
    assert [x["cnpj"] for x in repo.cnpjs(cnaes=["5611-2/01"])] == ["00000000000303"]
    assert [x["cnpj"] for x in repo.cnpjs({"porte": "EPP"})] == ["00000000000202"]
    assert len(repo.cnpjs(limite=2)) == 2
    # regravar substitui, não duplica
    repo.cnpj_put(dict(base, cnpj="00000000000101", cnae="4711-3/02", municipio="CUIABA", razao="Outro"))
    assert len(repo.cnpjs()) == 3 and repo.cnpj_get("00000000000101")["razao"] == "Outro"
    with pytest.raises(ValueError):
        repo.cnpj_put({"razao": "sem cnpj"})


def test_contatos_compartilhados(repo):
    h = hashlib.sha256(b"x").hexdigest()
    assert repo.compartilhado_get(h) is None
    repo.compartilhado_set(h, 2, ["4711-3/02"], "2026-10-01T00:00:00Z", "2026-10-01T00:00:00Z")
    repo.compartilhado_set(h, 3, ["4711-3/02", "6920-6/01"], "2026-10-01T00:00:00Z", "2026-10-07T00:00:00Z")
    assert repo.compartilhado_get(h) == {"chave_hash": h, "empresas": 3, "cnaes": ["4711-3/02", "6920-6/01"],
                                         "primeira": "2026-10-01T00:00:00Z", "ultima": "2026-10-07T00:00:00Z"}


def test_lista_sair_por_hash_com_sal(repo, tmp_path):
    assert not repo.sair_tem("65 99990-0011")
    repo.sair_add("+55 (65) 99990-0011")
    # mesmo número em outro formato, ou sem o nono dígito (conta antiga), continua fora
    assert repo.sair_tem("5565999900011")
    assert repo.sair_tem("65999900011")
    assert repo.sair_tem("556599900011")
    assert not repo.sair_tem("5565999900012")
    repo.sair_add("Dono@Empresa-Ficticia.com.br ")
    assert repo.sair_tem("dono@empresa-ficticia.com.br")
    assert not repo.sair_tem("outro@empresa-ficticia.com.br")
    assert not repo.sair_tem("") and not repo.sair_tem(None)
    # nada em claro no banco
    destino = str(tmp_path / "b.db")
    repo.backup(destino)
    con = sqlite3.connect(destino)
    linhas = [r[0] for r in con.execute("SELECT hash FROM lista_sair")]
    con.close()
    assert len(linhas) == 2
    assert all("99990" not in x and "@" not in x for x in linhas)
    # o sal muda o hash
    outro = Repo(":memory:", sal="outro-sal")
    outro.sair_add("5565999900011")
    assert outro.hash_contato("5565999900011") != repo.hash_contato("5565999900011")


def test_sal_vem_do_ambiente_ou_fica_guardado(tmp_path, monkeypatch):
    monkeypatch.delenv("PROSPECCAO_SAL", raising=False)
    caminho = str(tmp_path / "a.db")
    r1 = Repo(caminho)
    r1.sair_add("5565999900011")
    r2 = Repo(caminho)                       # reinício sem variável: o sal guardado vale
    assert r2.sair_tem("5565999900011")
    monkeypatch.setenv("PROSPECCAO_SAL", "do-ambiente")
    r3 = Repo(str(tmp_path / "c.db"))
    assert r3.hash_contato("x") == Repo(":memory:", sal="do-ambiente").hash_contato("x")


def test_tabelas_no_backup(repo, tmp_path):
    repo.campanha_put({"id": "C1", "segmento": "Mercados"})
    repo.prospecto_put({"id": "P1", "campanhaId": "C1", "estado": "pessoa"})
    repo.cnpj_put({"cnpj": "00000000000101", "cnae": "4711-3/02", "municipio": "CUIABA"})
    repo.compartilhado_set("h1", 4, ["6920-6/01"], "2026-10-01T00:00:00Z", "2026-10-02T00:00:00Z")
    repo.sair_add("5565999900011")
    destino = str(tmp_path / "bkp.db")
    repo.backup(destino)
    copia = Repo(destino, sal="sal-de-teste")
    assert copia.campanha_get("C1")["segmento"] == "Mercados"
    assert copia.prospecto_get("P1")["estado"] == "pessoa"
    assert copia.cnpj_get("00000000000101")["cnae"] == "4711-3/02"
    assert copia.compartilhado_get("h1")["empresas"] == 4
    assert copia.sair_tem("5565999900011")


def test_banco_antigo_ganha_tabelas_sem_perder_nada(tmp_path):
    caminho = str(tmp_path / "antigo.db")
    con = sqlite3.connect(caminho)
    con.executescript("CREATE TABLE leads (id TEXT PRIMARY KEY, doc TEXT NOT NULL, situacao TEXT, canal TEXT);"
                      "INSERT INTO leads VALUES('a1', '{\"id\": \"a1\"}', NULL, NULL);")
    con.commit()
    con.close()
    r = Repo(caminho, sal="s")
    assert r.lead_get("a1") == {"id": "a1"}
    r.campanha_put({"id": "C1"})
    assert r.campanhas() == [{"id": "C1"}]

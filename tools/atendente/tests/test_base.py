"""Leva 3: tabela `base` (faixas B e C da Explee), importador e a aba Base (lista, filtros e Promover).

Fixtures sintéticas na forma dos documentos reais da coleção base (scripts/base_explee.doc_base): nome, dominio,
segmento, tier, score, decisor, contatos, status, leadId, uf, cidade. Nenhum dado real.
"""
import json
import os
import sqlite3
import subprocess
import sys

import pytest

from atendente.db import Repo
from atendente.importar import importar_base, importar_clientes, importar_posvenda

from test_servidor import AGORA, ctx, entrar, json_de, pedir  # noqa: F401  (fixture ctx)


def doc_base(i, **extra):
    d = {
        "id": f"D{i:05d}", "dominio": f"entidade-ficticia-{i}.org.br", "nome": f"Associação Fictícia {i}",
        "segmento": "Entidades do agro", "tier": "B", "score": 50 - i, "regiao": "fora",
        "decisor": {"nome": "Maria Exemplo", "cargo": "Presidente", "persona": "decisor", "linkedin": ""},
        "pessoas": 1, "comLinkedin": 0, "campanhas": ["Entidades do agro"],
        "site": f"https://entidade-ficticia-{i}.org.br",
        "contatos": [{"nome": "Maria Exemplo", "cargo": "Presidente", "persona": "decisor", "linkedin": ""}],
        "status": "base", "pedidoEm": None, "leadId": None, "migradoEm": None,
        "pais": "Brasil", "uf": "SP", "cidade": "Campinas",
    }
    d.update(extra)
    return d


def popular_base(repo):
    repo.base_put(doc_base(1))
    repo.base_put(doc_base(2, segmento="produtores de evento e feiras", tier="C", uf="MT", cidade="Cuiabá",
                           nome="Feiras Fictícias do Centro-Oeste"))
    repo.base_put(doc_base(3, segmento="Segmento sem cadência", tier="C", uf="", cidade=""))
    repo.base_put(doc_base(4, status="na_cadencia", leadId="B0003"))
    repo.base_put(doc_base(5, segmento="Conselhos e advocacia", nome="Conselho Fictício de Classe", tier="B"))


# --------------------------------------------------------------------------- banco

def test_repo_base_put_get_todos_aplicar():
    repo = Repo(":memory:")
    popular_base(repo)
    assert repo.base_get("D00001")["nome"] == "Associação Fictícia 1"
    assert repo.base_get("nada") is None
    assert [d["id"] for d in repo.base_todos()] == ["D00001", "D00002", "D00003", "D00004", "D00005"]
    repo.base_aplicar("D00001", {"status": "na_cadencia", "leadId": "B0009"})
    d = repo.base_get("D00001")
    assert d["status"] == "na_cadencia" and d["leadId"] == "B0009" and d["segmento"] == "Entidades do agro"
    with pytest.raises(KeyError):
        repo.base_aplicar("nada", {"status": "x"})
    with pytest.raises(ValueError):
        repo.base_put({"nome": "sem id"})


def test_repo_clientes_put_get_todos_aplicar():
    repo = Repo(":memory:")
    assert repo.clientes_todos() == []
    repo.cliente_put({"id": "C1", "nome": "Cliente Fictício", "etapa": 1, "historico": [{"em": "x", "texto": "a"}]})
    repo.cliente_aplicar("C1", {"etapa": 2, "historico": [{"em": "y", "texto": "b"}]})
    c = repo.cliente_get("C1")
    assert c["etapa"] == 2 and [h["texto"] for h in c["historico"]] == ["a", "b"]  # histórico só cresce
    repo.cliente_aplicar("C1", {"dataKickoff": {"__delete__": True}})
    assert "dataKickoff" not in repo.cliente_get("C1")
    assert repo.cliente_get("C2") is None


def test_tabelas_novas_nao_mexem_nas_existentes(tmp_path):
    caminho = str(tmp_path / "a.db")
    Repo(caminho)
    con = sqlite3.connect(caminho)
    tabelas = {r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    assert {"leads", "mensagens", "atendimento", "config", "gastos", "base", "clientes"} <= tabelas
    assert [r[1] for r in con.execute("PRAGMA table_info(base)")] == ["id", "doc", "status"]
    assert [r[1] for r in con.execute("PRAGMA table_info(clientes)")] == ["id", "doc"]


# --------------------------------------------------------------------------- importador

def test_importa_base_de_pasta_com_um_json_por_empresa(tmp_path):
    pasta = tmp_path / "base"
    pasta.mkdir()
    for i in (1, 2):
        d = doc_base(i)
        d.pop("id")  # na exportação o id é o nome do arquivo
        (pasta / f"D{i:05d}.json").write_text(json.dumps(d, ensure_ascii=False), encoding="utf-8")
    (pasta / "leia-me.txt").write_text("não é json", encoding="utf-8")
    (pasta / "quebrado.json").write_text("{", encoding="utf-8")
    repo = Repo(":memory:")
    r = importar_base(repo, str(pasta))
    assert r == {"importados": 2, "ignorados": 1}
    assert repo.base_get("D00002")["nome"] == "Associação Fictícia 2"


def test_importa_base_de_arquivo_em_varias_formas(tmp_path):
    repo = Repo(":memory:")
    lista = [{"id": "D00001", "data": {k: v for k, v in doc_base(1).items() if k != "id"}}, doc_base(2), {"nome": "sem id"}]
    p = tmp_path / "b.json"
    p.write_text(json.dumps(lista), encoding="utf-8")
    assert importar_base(repo, str(p)) == {"importados": 2, "ignorados": 1}
    p.write_text(json.dumps({"docs": [doc_base(3)]}), encoding="utf-8")
    assert importar_base(repo, str(p)) == {"importados": 1, "ignorados": 0}
    assert len(repo.base_todos()) == 3


def test_reimportar_base_nao_desfaz_promocao(tmp_path):
    repo = Repo(":memory:")
    repo.base_put(doc_base(1, status="na_cadencia", leadId="B0001", migradoEm="2026-10-07T15:00:00Z"))
    p = tmp_path / "b.json"
    p.write_text(json.dumps([doc_base(1, nome="Nome Novo")]), encoding="utf-8")
    importar_base(repo, str(p))
    d = repo.base_get("D00001")
    assert d["nome"] == "Nome Novo" and d["status"] == "na_cadencia" and d["leadId"] == "B0001"


def test_importa_clientes_e_posvenda(tmp_path):
    repo = Repo(":memory:")
    p = tmp_path / "c.json"
    p.write_text(json.dumps([{"id": "C1", "nome": "Cliente Fictício", "etapa": 1}, {"nome": "sem id"}]), encoding="utf-8")
    assert importar_clientes(repo, str(p)) == {"importados": 1, "ignorados": 1}
    pv = tmp_path / "posvenda.json"
    pv.write_text(json.dumps({"etapas": [{"n": 1, "nome": "Boas-vindas", "quando": "imediato", "texto": "Oi"}],
                              "produtos": {"Outro": {}}}), encoding="utf-8")
    assert importar_posvenda(repo, str(pv)) is True
    assert repo.config_get("posvenda")["etapas"][0]["nome"] == "Boas-vindas"
    pv.write_text(json.dumps({"data": {"etapas": []}}), encoding="utf-8")
    assert importar_posvenda(repo, str(pv)) is False  # sem etapas: não grava por cima


RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _rodar(tmp_path, args, db):
    env = dict(os.environ, DB_CAMINHO=db, PYTHONPATH=os.pathsep.join([RAIZ, os.path.join(RAIZ, "..", "prospeccao")]))
    return subprocess.run([sys.executable, "-m", "atendente.importar"] + args, env=env, capture_output=True, text=True,
                          cwd=str(tmp_path))


def test_cli_aceita_base_clientes_e_posvenda(tmp_path):
    db = str(tmp_path / "x.db")
    pasta = tmp_path / "base"
    pasta.mkdir()
    (pasta / "D00001.json").write_text(json.dumps(doc_base(1)), encoding="utf-8")
    cl = tmp_path / "c.json"
    cl.write_text(json.dumps([{"id": "C1", "nome": "Cliente Fictício"}]), encoding="utf-8")
    pv = tmp_path / "pv.json"
    pv.write_text(json.dumps({"etapas": [{"n": 1, "nome": "Boas-vindas", "quando": "imediato", "texto": "Oi"}]}),
                  encoding="utf-8")
    r = _rodar(tmp_path, ["--base", str(pasta), "--clientes", str(cl), "--posvenda", str(pv)], db)
    assert r.returncode == 0, r.stderr
    assert "base: importados=1" in r.stdout and "clientes: importados=1" in r.stdout and "posvenda: gravado" in r.stdout
    repo = Repo(db)
    assert repo.base_get("D00001") and repo.cliente_get("C1") and repo.config_get("posvenda")
    r = _rodar(tmp_path, ["--base", str(tmp_path / "nao_existe")], db)
    assert r.returncode == 1 and "não encontrei" in r.stderr.lower()


# --------------------------------------------------------------------------- API: lista

def test_base_exige_login(ctx):
    assert pedir(ctx, "GET", "/api/base")[0] == 401
    assert pedir(ctx, "POST", "/api/base/D00001/promover", {})[0] == 401
    assert pedir(ctx, "POST", "/api/base/promover", {"ids": ["D00001"]})[0] == 401


def test_base_vazia(ctx):
    ck = entrar(ctx)
    r = json_de(pedir(ctx, "GET", "/api/base", cookie=ck))
    assert r["itens"] == [] and r["total"] == 0 and r["totalBase"] == 0


def test_base_lista_ordenada_com_icp_e_contagens(ctx):
    popular_base(ctx.repo)
    ck = entrar(ctx)
    r = json_de(pedir(ctx, "GET", "/api/base", cookie=ck))
    assert r["total"] == 5 and r["totalBase"] == 5 and r["pagina"] == 1
    # faixa, depois score maior
    assert [d["id"] for d in r["itens"]] == ["D00001", "D00004", "D00005", "D00002", "D00003"]
    por_id = {d["id"]: d for d in r["itens"]}
    assert por_id["D00001"]["icp"] == "ICP3"            # agro fala como entidade (segmentos ampliados)
    assert por_id["D00002"]["icp"] == "ICP6"
    assert por_id["D00005"]["icp"] == "ICP3"            # conselho dentro de "Conselhos e advocacia"
    assert por_id["D00003"]["icp"] == ""                # sem cadência
    assert r["contagens"] == {"todas": 5, "base": 4, "pedido": 0, "na_cadencia": 1, "sem_cadencia": 0}
    assert ["MT", 1] in r["opcoes"]["uf"] and ["SP", 3] in r["opcoes"]["uf"]
    assert [x[0] for x in r["opcoes"]["tier"]] == ["B", "C"]
    assert ["ICP3", "Empresas, agro e entidades", 3] in r["opcoes"]["icp"]


def test_base_filtros_busca_e_paginas(ctx):
    popular_base(ctx.repo)
    ck = entrar(ctx)

    def ids(q):
        return [d["id"] for d in json_de(pedir(ctx, "GET", "/api/base" + q, cookie=ck))["itens"]]

    assert ids("?tier=C") == ["D00002", "D00003"]
    assert ids("?uf=MT") == ["D00002"]
    assert ids("?uf=sem") == ["D00003"]
    assert ids("?icp=ICP6") == ["D00002"]
    assert ids("?icp=sem") == ["D00003"]
    assert ids("?segmento=Entidades%20do%20agro") == ["D00001", "D00004"]
    assert ids("?status=na_cadencia") == ["D00004"]
    assert ids("?busca=feiras%20ficticias") == ["D00002"]      # sem acento
    assert ids("?busca=cuiaba") == ["D00002"]
    r = json_de(pedir(ctx, "GET", "/api/base?por=2&pagina=2", cookie=ck))
    assert [d["id"] for d in r["itens"]] == ["D00005", "D00002"] and r["paginas"] == 3 and r["total"] == 5
    # contagens seguem os filtros, menos o de situação
    r = json_de(pedir(ctx, "GET", "/api/base?tier=B&status=base", cookie=ck))
    assert r["contagens"]["todas"] == 3 and r["contagens"]["na_cadencia"] == 1 and r["total"] == 2
    assert pedir(ctx, "GET", "/api/base?por=0", cookie=ck)[0] == 400
    assert pedir(ctx, "GET", "/api/base?pagina=x", cookie=ck)[0] == 400


# --------------------------------------------------------------------------- API: promover

def test_promover_vira_lead_com_a_regra_do_promover_base(ctx):
    popular_base(ctx.repo)
    ctx.repo.lead_put({"id": "B0007", "nome": "Lead Antigo", "site": "outra-ficticia.com.br", "historico": []})
    ck = entrar(ctx)
    st, _, corpo = pedir(ctx, "POST", "/api/base/D00002/promover", {}, cookie=ck)
    assert st == 200, corpo
    r = json.loads(corpo)
    assert r == {"ok": True, "leadId": "B0008", "novo": True}
    lead = ctx.repo.lead_get("B0008")
    assert lead["nome"] == "Feiras Fictícias do Centro-Oeste" and lead["icp"] == "ICP6"
    assert lead["situacao"] == "ativo" and lead["etapa"] == 0 and len(lead["toques"]) == 3
    assert lead["baseExplee"]["dominio"] == "entidade-ficticia-2.org.br" and lead["baseExplee"]["baseId"] == "D00002"
    assert lead["uf"] == "MT" and lead["regiao"] == "MT"
    assert lead["enriquecimento"]["fila"] is True
    assert any("ana" in h["texto"] for h in lead["historico"])
    b = ctx.repo.base_get("D00002")
    assert b["status"] == "na_cadencia" and b["leadId"] == "B0008" and b["migradoEm"]


def test_promover_e_idempotente_e_nunca_duplica(ctx):
    popular_base(ctx.repo)
    ck = entrar(ctx)
    r1 = json_de(pedir(ctx, "POST", "/api/base/D00001/promover", {}, cookie=ck))
    r2 = json_de(pedir(ctx, "POST", "/api/base/D00001/promover", {}, cookie=ck))
    # D00004 já aponta para B0003: o número novo nunca colide com um id que a base já usa
    assert r1["leadId"] == r2["leadId"] == "B0004" and r1["novo"] is True and r2["novo"] is False
    assert len(ctx.repo.leads_todos()) == 1
    # mesmo domínio já na central por outro caminho: não cria lead, só aponta
    ctx.repo.base_put(doc_base(9, dominio="ja-existe.com.br"))
    ctx.repo.lead_put({"id": "R0001", "nome": "Já existe", "site": "https://www.ja-existe.com.br/contato"})
    r3 = json_de(pedir(ctx, "POST", "/api/base/D00009/promover", {}, cookie=ck))
    assert r3 == {"ok": True, "leadId": "R0001", "novo": False}
    assert ctx.repo.base_get("D00009")["leadId"] == "R0001" and len(ctx.repo.leads_todos()) == 2


def test_promover_sem_cadencia_e_inexistente(ctx):
    popular_base(ctx.repo)
    ck = entrar(ctx)
    st, _, corpo = pedir(ctx, "POST", "/api/base/D00003/promover", {}, cookie=ck)
    assert st == 409 and "cadência" in json.loads(corpo)["erro"]
    b = ctx.repo.base_get("D00003")
    assert b["status"] == "sem_cadencia" and "Segmento sem cadência" in b["motivo"]
    assert ctx.repo.leads_todos() == []
    assert pedir(ctx, "POST", "/api/base/D99999/promover", {}, cookie=ck)[0] == 404


def test_promover_varios(ctx):
    popular_base(ctx.repo)
    ck = entrar(ctx)
    st, _, corpo = pedir(ctx, "POST", "/api/base/promover", {"ids": ["D00001", "D00002", "D00003", "D00004", "D00404"]},
                         cookie=ck)
    assert st == 200, corpo
    r = json.loads(corpo)
    assert sorted(x["id"] for x in r["promovidos"]) == ["D00001", "D00002"]
    assert len({x["leadId"] for x in r["promovidos"]}) == 2
    assert [x["id"] for x in r["pulados"]] == ["D00003"]
    assert r["jaNaCentral"] == [{"id": "D00004", "leadId": "B0003"}]
    assert r["naoEncontrados"] == ["D00404"]
    assert len(ctx.repo.leads_todos()) == 2
    # de novo: nada novo
    r = json_de(pedir(ctx, "POST", "/api/base/promover", {"ids": ["D00001", "D00002"]}, cookie=ck))
    assert r["promovidos"] == [] and len(r["jaNaCentral"]) == 2 and len(ctx.repo.leads_todos()) == 2


def test_promover_varios_valida_o_pedido(ctx):
    ck = entrar(ctx)
    assert pedir(ctx, "POST", "/api/base/promover", {"ids": []}, cookie=ck)[0] == 400
    assert pedir(ctx, "POST", "/api/base/promover", {"ids": "D1"}, cookie=ck)[0] == 400
    assert pedir(ctx, "POST", "/api/base/promover", {"ids": [f"D{i}" for i in range(51)]}, cookie=ck)[0] == 400
    assert pedir(ctx, "POST", "/api/base/promover", {"ids": ["D1"]}, cookie=ck,
                 headers={"Origin": "http://outro.site"})[0] == 403

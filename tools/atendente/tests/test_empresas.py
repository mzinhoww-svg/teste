"""Prospecção: empresas da campanha (CNPJ de MT primeiro, Google Maps do treg para completar site e telefone).

CNPJs, nomes e telefones fictícios (55659999000NN); treg falso no formato real."""
import pytest

from atendente.db import Repo
from atendente.prospeccao import campanha as camp
from atendente.prospeccao import empresas
from atendente.prospeccao.campanha import Orcamento

from test_treg_ops import _cli, _ok


def doc(i, **extra):
    d = {"cnpj": f"000000000001{i:02d}", "razao": f"MERCADO FICTICIO {i} LTDA", "fantasia": f"MERCADO FICTICIO {i}",
         "cnae": "4711302", "municipio": "CUIABA", "uf": "MT", "porte": "micro", "telefone": "", "telefones": [],
         "email": "", "socios": [], "fonte": "receita"}
    d.update(extra)
    return d


@pytest.fixture
def repo():
    r = Repo(":memory:", sal="sal-de-teste")
    r.cnpj_put(doc(1))
    r.cnpj_put(doc(2, municipio="VARZEA GRANDE", porte="epp"))
    r.cnpj_put(doc(3, cnae="5611201"))                       # outro CNAE
    r.cnpj_put(doc(4, municipio="SINOP"))                     # outra cidade
    r.cnpj_put(doc(5, porte="demais", site="https://mercado-5.com.br", dominio="mercado-5.com.br"))
    r.cnpj_put(doc(6, situacao="08"))                         # baixada: nunca entra
    return r


def campanha(**extra):
    a = dict(segmento="Empresas B2B médias", cidades_mt=["Cuiabá", "Várzea Grande"], cnaes=["4711-3/02"],
             porte="todas", oferta="marketing")
    a.update(extra)
    return camp.nova(**a)


def lugar(nome, **extra):
    p = {"title": nome, "address": "Rua Um, 10 - Centro, Cuiabá - MT", "phoneNumber": "(65) 99990-0041",
         "website": "https://www.mercado-ficticio.com.br/", "category": "Supermercado", "placeId": "ChIJ-teste"}
    p.update(extra)
    return p


def test_cnpj_de_mt_primeiro_filtrado_por_cnae_cidade_e_ativa(repo):
    cli, _ = _cli({"treg.google.serp.maps": _ok({"places": []})})
    r = empresas.achar(repo, cli, campanha(), Orcamento(10**6))
    assert [e["cnpj"] for e in r] == ["00000000000101", "00000000000102", "00000000000105"]
    assert [e["classePorte"] for e in r] == ["pequena", "media", "grande"]
    assert r[0]["nome"] == "Mercado Ficticio 1" and r[0]["id"] == r[0]["cnpj"]


def test_porte_da_campanha_filtra(repo):
    cli, _ = _cli({"treg.google.serp.maps": _ok({"places": []})})
    assert [e["cnpj"] for e in empresas.achar(repo, cli, campanha(porte="média"), Orcamento(0))] == ["00000000000102"]


def test_maps_completa_site_e_telefone_e_nao_paga_duas_vezes(repo):
    cli, t = _cli({"treg.google.serp.maps": lambda h, c: _ok(
        {"places": [lugar("Padaria Que Não É"), lugar(c["q"].split(" em ")[0].title())]}, "serper", 2_000)})
    o = Orcamento(10**6)
    r = empresas.achar(repo, cli, campanha(), o)
    e1 = r[0]
    assert e1["site"] == "https://www.mercado-ficticio.com.br/" and e1["dominio"] == "mercado-ficticio.com.br"
    assert e1["telefoneMaps"] == "5565999900041" and e1["telefone"] == ""   # o do cadastro não muda
    assert len(t.chamadas) == 2                     # a 5 já tinha site
    assert o.gasto_micro == 4_000
    assert repo.cnpj_get("00000000000101")["dominio"] == "mercado-ficticio.com.br"
    empresas.achar(repo, cli, campanha(), o)
    assert len(t.chamadas) == 2                     # já consultado: não busca de novo


def test_maps_sem_lugar_parecido_nao_inventa_site(repo):
    cli, t = _cli({"treg.google.serp.maps": _ok({"places": [lugar("Oficina Qualquer")]}, "serper", 2_000)})
    r = empresas.achar(repo, cli, campanha(), Orcamento(10**6))
    assert r[0].get("site", "") == "" and r[0].get("dominio", "") == ""


def test_empresa_fechada_nunca_entra(repo):
    cli, _ = _cli({"treg.google.serp.maps": lambda h, c: _ok(
        {"places": [lugar(c["q"].split(" em ")[0].title() + " (Permanentemente fechado)")]}, "serper", 2_000)})
    r = empresas.achar(repo, cli, campanha(), Orcamento(10**6))
    assert [e["cnpj"] for e in r] == ["00000000000105"]
    assert repo.cnpj_get("00000000000101")["fechado"] is True
    cli2, t2 = _cli({})
    assert [e["cnpj"] for e in empresas.achar(repo, cli2, campanha(), Orcamento(10**6))] == ["00000000000105"]


def test_sem_orcamento_nao_chama_maps(repo):
    cli, t = _cli({})
    r = empresas.achar(repo, cli, campanha(), Orcamento(0))
    assert len(r) == 3 and t.chamadas == []

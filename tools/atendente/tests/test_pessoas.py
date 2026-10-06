"""Prospecção: cargos por porte e quem é a pessoa a procurar em cada empresa (sócios primeiro, treg depois).

Treg falso no formato real (test_treg_ops.Transporte); nomes e domínios fictícios."""
import pytest

from atendente.db import Repo
from atendente.prospeccao import pessoas, qualificar
from atendente.prospeccao.campanha import Orcamento

from test_treg_ops import _cli, _ok


@pytest.mark.parametrize("porte,oferta,esperado", [
    ("micro", "marketing", ["dono", "sócio"]),
    ("", "marketing", ["dono", "sócio"]),
    (None, "marketing", ["dono", "sócio"]),
    ("pequena", "pessoas", ["dono", "sócio"]),
    ("epp", "marketing", ["marketing", "comunicação", "dono"]),
    ("média", "marketing", ["marketing", "comunicação", "dono"]),
    ("demais", "pessoas", ["RH", "marketing"]),
    ("grande", "marketing", ["marketing"]),
])
def test_regra_por_porte_tabela(porte, oferta, esperado):
    assert pessoas.regra_por_porte(porte, oferta) == esperado


def test_rh_so_com_oferta_pessoas():
    assert "RH" in pessoas.regra_por_porte("demais", "pessoas")
    assert "RH" in pessoas.regra_por_porte("demais", " Pessoas ")
    for oferta in ("marketing", "video", ""):
        assert "RH" not in pessoas.regra_por_porte("demais", oferta)
    assert "RH" not in pessoas.regra_por_porte("epp", "pessoas")


def test_porte_desconhecido_recusa():
    with pytest.raises(ValueError):
        pessoas.regra_por_porte("gigante", "marketing")


def test_classe_porte_da_receita():
    assert [pessoas.classe_porte(p) for p in ("micro", "", None, "epp", "demais", "média")] == \
        ["pequena", "pequena", "pequena", "media", "grande", "media"]


def socio(nome, qualificacao="Sócio-Administrador", tipo="pf", faixa="41-50", **extra):
    return {"nome": nome, "qualificacao": qualificacao, "faixa_etaria": faixa, "tipo": tipo, **extra}


def empresa(**extra):
    e = {"id": "00000000000191", "cnpj": "00000000000191", "nome": "Mercado Fictício", "cnae": "4711302",
         "municipio": "CUIABA", "uf": "MT", "porte": "micro", "telefone": "", "email": "",
         "dominio": "mercado-ficticio.com.br", "site": "https://mercado-ficticio.com.br",
         "socios": [socio("JOAO DA SILVA EXEMPLO", "Sócio"), socio("MARIA EXEMPLO DOS SANTOS"),
                    socio("PEDRO PROCURADOR FICTICIO", "Procurador"),
                    socio("CRIANCA FICTICIA", "Sócio", faixa="0-12")]}
    e.update(extra)
    return e


def test_pequena_so_socios_administradores_primeiro_sem_gastar():
    cli, t = _cli({})
    r = pessoas.achar(Repo(":memory:"), cli, empresa(), ["dono", "sócio"], Orcamento(1_000_000))
    assert [p["nome"] for p in r] == ["Maria Exemplo dos Santos", "Joao da Silva Exemplo"]
    assert t.chamadas == []                              # pequena com sócio: não chama o treg
    m = r[0]
    assert m["fonte"] == "receita" and m["cargo"] == "Sócio-Administrador" and m["persona"] == "decisor"
    assert m["empresaId"] == "00000000000191" and m["dominio"] == "mercado-ficticio.com.br"
    assert m["chavePessoa"] == qualificar.chave_pessoa("MARIA EXEMPLO DOS SANTOS", ["00000000000191"], "41-50")


def test_socio_pessoa_juridica_sobe_um_nivel():
    repo = Repo(":memory:")
    repo.cnpj_put({"cnpj": "11111111000191", "socios": [socio("ANA HOLDING FICTICIA", "Administrador")]})
    e = empresa(socios=[socio("HOLDING FICTICIA LTDA", "Sócio", tipo="pj", cnpj="11111111000191"),
                        socio("OUTRA PJ FICTICIA", "Sócio", tipo="pj", cnpj="22222222000191")])
    cli, _ = _cli({})
    r = pessoas.achar(repo, cli, e, ["dono"], Orcamento(0))
    assert [p["nome"] for p in r] == ["Ana Holding Ficticia"]
    assert r[0]["fonte"] == "receita (sócio da sócia)"


def test_media_busca_cargos_no_treg_depois_dos_socios():
    cli, t = _cli({"treg.people.search": _ok({"people": [
        {"name": "Paula Marketing Exemplo", "title": "Gerente de Marketing",
         "linkedin_url": "https://www.linkedin.com/in/paula-exemplo"}]}, "aiark", 0)})
    regra = pessoas.regra_por_porte("epp", "marketing")
    o = Orcamento(1_000_000)
    r = pessoas.achar(Repo(":memory:"), cli, empresa(porte="epp"), regra, o)
    assert [p["nome"] for p in r][:2] == ["Maria Exemplo dos Santos", "Joao da Silva Exemplo"]
    assert r[-1]["nome"] == "Paula Marketing Exemplo" and r[-1]["fonte"] == "treg:aiark"
    assert r[-1]["persona"] == "comunicacao" and r[-1]["linkedin"].endswith("paula-exemplo")
    # o dono já veio da Receita: o treg só procura os outros cargos
    assert [c["corpo"]["title"] for c in t.chamadas] == ["marketing", "comunicação"]


def test_sem_dominio_nao_chama_treg_e_sem_orcamento_tambem():
    cli, t = _cli({"treg.people.search": _ok({"people": []})})
    pessoas.achar(Repo(":memory:"), cli, empresa(porte="demais", dominio="", site=""), ["marketing"], Orcamento(10**6))
    pessoas.achar(Repo(":memory:"), cli, empresa(porte="demais"), ["marketing"], Orcamento(0))
    assert t.chamadas == []


def test_mesma_pessoa_do_treg_e_da_receita_entra_uma_vez():
    cli, _ = _cli({"treg.people.search": _ok({"people": [{"name": "Maria Exemplo dos Santos", "title": "CEO"}]})})
    r = pessoas.achar(Repo(":memory:"), cli, empresa(porte="demais", socios=[socio("MARIA EXEMPLO DOS SANTOS")]),
                      ["marketing"], Orcamento(10**6))
    assert [p["nome"] for p in r] == ["Maria Exemplo dos Santos"]

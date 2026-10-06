"""Prospecção: campanha nova (só MT, tetos positivos) e o orçamento em micro-dólares que as peças consomem."""
import pytest

from atendente.prospeccao import campanha


def nova(**extra):
    args = dict(segmento="Empresas B2B médias", cidades_mt=["Cuiabá", "Várzea Grande"], cnaes=["4711-3/02"],
                porte="pequena", oferta="marketing")
    args.update(extra)
    return campanha.nova(**args)


def test_campanha_nova_com_padroes():
    c = nova()
    assert c["id"].startswith("C") and c["uf"] == "MT" and c["status"] == "nova"
    assert c["cidades"] == ["Cuiabá", "Várzea Grande"] and c["cnaes"] == ["4711302"]
    assert c["porte"] == "pequena" and c["oferta"] == "marketing"
    assert (c["tetoDiaUsd"], c["tetoCampanhaUsd"], c["metaPorDia"]) == (10, 30, 50)
    assert nova()["id"] != c["id"]


@pytest.mark.parametrize("cidades", [[], ["Campo Grande"], ["Cuiabá", "Goiânia - GO"], ["Sinop/MS"], [""]])
def test_campanha_so_mt(cidades):
    with pytest.raises(ValueError):
        nova(cidades_mt=cidades)


def test_cidade_com_uf_mt_aceita_e_limpa():
    assert nova(cidades_mt=["Sinop - MT", "Sorriso/MT"])["cidades"] == ["Sinop", "Sorriso"]


@pytest.mark.parametrize("extra", [{"teto_dia_usd": 0}, {"teto_campanha_usd": -1}, {"meta_por_dia": 0},
                                   {"cnaes": []}, {"cnaes": ["abc"]}, {"segmento": " "}, {"oferta": ""},
                                   {"porte": "gigante"}, {"teto_dia_usd": 40, "teto_campanha_usd": 30}])
def test_campanha_invalida(extra):
    with pytest.raises(ValueError):
        nova(**extra)


def test_porte_aceita_lista_e_todas():
    assert nova(porte=["média", "grande"])["porte"] == ["media", "grande"]
    assert nova(porte="todas")["porte"] == "todas"


def test_orcamento_consome_registro_e_respeita_teto():
    o = campanha.Orcamento(100_000)
    assert o.cabe(100_000) and not o.cabe(100_001)
    o.registrar({"etapa": "celular", "provedor": "aiark", "custoMicro": 26_000, "achou": True})
    o.registrar({"etapa": "celular", "provedor": "aiark", "custoMicro": 0, "achou": False})
    assert o.gasto_micro == 26_000 and o.restante_micro == 74_000
    assert not o.cabe(80_000)


def test_orcamento_da_campanha_usa_o_menor_teto():
    c = nova(teto_dia_usd=10, teto_campanha_usd=30)
    o = campanha.orcamento(c, gasto_dia_micro=2_000_000, gasto_campanha_micro=25_000_000)
    assert o.restante_micro == 5_000_000
    o = campanha.orcamento(c, gasto_dia_micro=9_000_000, gasto_campanha_micro=0)
    assert o.restante_micro == 1_000_000

import os

import pytest

from msg.fotos import CATALOGO, CENARIOS, curadas, doc_config, foto_para, linha_foto

PASTA = os.path.join(os.path.dirname(__file__), "..", "central", "fotos")


def test_curadas_existem_na_central_e_nenhuma_tem_claquete():
    for k in curadas():
        assert os.path.exists(os.path.join(PASTA, f"{k}.jpg")), k
        assert "claquete" not in k and "Zura" not in CATALOGO[k][4]
    assert sorted(f[:-4] for f in os.listdir(PASTA) if f.endswith(".jpg")) == sorted(curadas())


def test_todo_cenario_tem_foto_curada_e_todo_original_e_unico():
    assert {CATALOGO[k][1] for k in curadas()} == set(CENARIOS)
    originais = [v[0] for v in CATALOGO.values()]
    assert len(originais) == len(set(originais)) == 31


@pytest.mark.parametrize("icp,nome,categoria,esperada", [
    ("ICP1", "Dra. Lara Tavares Dermatologia", "Dermatologia", "estante-pessoa-03"),
    ("ICP1", "Verbene Oftalmologia", "Oftalmologia", "sofa-pessoa-02"),
    ("ICP2", "Handell", "Advocacia", "mesa-pessoa-02"),
    ("ICP3", "Aprosoja", "Associação", "mesa-vazia-02"),
    ("ICP4", "Style Brokers", "Imobiliária", "sofa-vazio-01"),
    ("ICP4", "Zinger Skills", "Escola de oratória", "escritorio-pessoa-01"),
    ("ICP4", "Evolua Mentoria", "Mentoria", "puff-pessoa-04"),
    ("ICP5", "Colégio Maxi", "Escola", "escritorio-pessoa-02"),
    ("ICP5", "Mika Alimentos", "Indústria", "mesa-pessoa-04"),
])
def test_regras_escolhem_foto_curada(icp, nome, categoria, esperada):
    foto = foto_para(icp, nome, categoria)
    assert foto == esperada and foto in curadas()


def test_linha_e_config():
    assert linha_foto("sofa-vazio-01") == "Te mandei uma foto do nosso cenário Sofá, para entrevista em dupla, com clima de conversa."
    cfg = doc_config()["fotos"]
    assert set(cfg) == set(curadas())
    assert all(v["arquivo"] == f"fotos/{k}.jpg" for k, v in cfg.items())

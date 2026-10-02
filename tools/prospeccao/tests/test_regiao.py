import pytest

from msg.checks import check_personal, check_toque
from msg.compose import compose_email, compose_whatsapp, wa_link
from msg.copy_v1 import ICPS, O_QUE_FAZEMOS, T1_ABERTURA, T1_CONVITE, blocos, linhas_copy
from msg.fotos import linha_foto
from msg.regiao import ddd, regiao
from tests.conftest import lead, personal


# ---------------------------------------------------------------- regiao: telefone

@pytest.mark.parametrize("tel,esperado", [("65 99999-1234", "MT"), ("+55 66 3531-0000", "MT"),
                                          ("(11) 98888-7777", "fora"), ("5562999990000", "fora")])
def test_ddd_do_telefone_do_lead(tel, esperado):
    assert regiao({"nome": "Empresa Qualquer", "site": "qualquer.com.br", "telefone": tel}) == esperado


def test_ddd_dos_contatos_e_ganha_dos_sinais_de_texto():
    lead_ = {"nome": "CNC - Confederação Nacional do Comércio", "site": "cnc.org.br", "telefone": "",
             "contatos": [{"telefone": "65999991234"}]}
    assert regiao(lead_) == "MT"
    lead_["contatos"] = [{"telefone": "61999991234"}]
    assert regiao(lead_) == "fora"
    # um número de MT basta; contato inválido não conta
    assert regiao({"nome": "X", "contatos": [{"telefone": "11999991234"}, {"telefone": "66999991234"}]}) == "MT"
    assert regiao({"nome": "Agência Exemplo", "contatos": [{"telefone": "11999991234", "invalido": True}]}) == "?"


def test_ddd_invalido_e_ignorado():
    assert ddd("123") == "" and ddd("65 99999-1234") == "65"
    assert regiao({"nome": "Agência Exemplo", "telefone": "123"}) == "?"


def test_aceita_doc_embrulhado():
    assert regiao({"id": "B0001", "data": {"nome": "OAB MT", "site": "oabmt.org.br"}}) == "MT"


# ---------------------------------------------------------------- regiao: nome e domínio

@pytest.mark.parametrize("nome,site", [
    ("OAB MT", "oabmt.org.br"), ("CRCMT", "crcmt.org.br"), ("Senai Mato Grosso", "senaimt.com.br"),
    ("Eventos Exemplo", "eventoscuiaba.com.br"), ("Clínica Modelo", "clinicasinop.com.br"),
    ("Agência Modelo Rondonópolis", "modelo.com.br"), ("Associação Exemplo", "exemplo.org.br"),
])
def test_sinais_de_mt(nome, site):
    lead_ = {"nome": nome, "site": site}
    if nome == "Associação Exemplo":
        lead_["perfil"] = {"cidade": "Várzea Grande"}
    assert regiao(lead_) == "MT"


@pytest.mark.parametrize("nome,site", [
    ("Sesc Mato Grosso do Sul", "sescms.com.br"), ("CREA-MS", "creams.org.br"), ("OAB Goiás", "oabgo.org.br"),
    ("Senai Goiás", "senaigoias.com.br"), ("CDL Goiânia", "cdlgoiania.com.br"), ("AMHP-DF", "amhp.com.br"),
    ("Associação Médica de Brasília", "ambr.org.br"), ("Eventos Exemplo", "eventos-ms.com.br"),
])
def test_sinais_de_outro_estado(nome, site):
    assert regiao({"nome": nome, "site": site}) == "fora"


@pytest.mark.parametrize("nome,site", [
    ("CNC - Confederação Nacional do Comércio de Bens, Serviços e Turismo", "portaldocomercio.org.br"),
    ("Sistema CNA Senar", "cnabrasil.org.br"), ("CNI", "cni.com.br"), ("Sistema OCB", "somoscooperativismo.coop.br"),
    ("Conselho Federal de Contabilidade", "cfc.org.br"), ("Abrace Energia", "abrace.org.br"),
    ("Messe Muenchen do Brasil", "mm-br.com"), ("Fenasbac", "fenasbac.com.br"),
])
def test_entidade_nacional_e_fora(nome, site):
    assert regiao({"nome": nome, "site": site}) == "fora"


def test_estado_ganha_de_nacional_e_mt_com_outro_estado_e_incerto():
    assert regiao({"nome": "Serviço Nacional de Aprendizagem Rural - AR/MT", "site": "senarmt.org.br"}) == "MT"
    assert regiao({"nome": "Universidade Federal de Mato Grosso", "site": "ufmt.br"}) == "MT"
    assert regiao({"nome": "Rota Cuiabá Goiânia", "site": "rota.com.br"}) == "?"


@pytest.mark.parametrize("nome,site", [("Origami Marketing e Eventos Ltda", "origamieventos.com.br"),
                                       ("Agência Popi", "popi.ag"), ("Hoffmann", "hoffmann.com"), ("", "")])
def test_desconhecido(nome, site):
    assert regiao({"nome": nome, "site": site}) == "?"


# ---------------------------------------------------------------- copy por região

def test_versao_mt_e_a_original():
    assert blocos(1, "ICP3") == blocos(1, "ICP3", regiao="MT")
    assert blocos(1, "ICP3")[0] == T1_ABERTURA and T1_CONVITE in blocos(1, "ICP3")


def test_versao_fora_troca_o_cafe_pela_ligacao():
    t1 = compose_whatsapp(1, "ICP6", "Paulo", "Feira Modelo", "Uma frase.", regiao="fora")
    assert "estúdio de podcast em Cuiabá (MT)." in t1 and "aqui em Cuiabá" not in t1
    assert "café" not in t1 and "conhecer o estúdio" not in t1
    assert "Quando vierem a Cuiabá" in t1 and "nossa equipe vai até vocês" in t1 and "ligação" in t1
    assert "estúdio móvel" not in t1
    t2 = compose_whatsapp(2, "ICP6", "Paulo", "Feira Modelo", "", regiao="fora")
    assert "por vídeo" in t2
    t3 = compose_whatsapp(3, "ICP6", "Paulo", "Feira Modelo", "", regiao="fora")
    assert "quando vierem a Cuiabá" in t3


def test_versao_incerta_so_tira_o_aqui():
    mt, inc = blocos(1, "ICP1", foto=True), blocos(1, "ICP1", foto=True, regiao="?")
    assert inc[0].endswith("estúdio de podcast em Cuiabá.") and "aqui em Cuiabá" not in inc[0]
    assert inc[1:] == mt[1:]
    for t in (2, 3):
        assert blocos(t, "ICP1", regiao="?") == blocos(t, "ICP1")


def test_regiao_invalida():
    with pytest.raises(ValueError):
        blocos(1, "ICP1", regiao="SP")


@pytest.mark.parametrize("reg", ["MT", "fora", "?"])
@pytest.mark.parametrize("icp", list(ICPS))
def test_todas_as_versoes_passam_na_checagem(icp, reg):
    l, p = lead(icp=icp), personal()
    erros = check_personal(l, p)
    for t in (1, 2, 3):
        for lf in (linha_foto("mesa-vazia-02") if t == 1 else "", ""):
            texto = compose_whatsapp(t, icp, p.saudacao, p.nome_curto, p.frase, lf, reg)
            erros += check_toque(l, p, t, texto, wa_link(l.telefone, texto), lf, reg)
    assert erros == []


def test_checagem_pega_versao_trocada():
    l, p = lead(icp="ICP3"), personal()
    texto = compose_whatsapp(1, "ICP3", p.saudacao, p.nome_curto, p.frase, regiao="fora")
    assert any("difere dos blocos" in e for e in check_toque(l, p, 1, texto, ""))
    assert check_toque(l, p, 1, texto, "", regiao="fora") == []


def test_email_fora_tem_assunto_e_corpo_da_versao():
    assunto, corpo = compose_email(1, "ICP2", "Paulo", "Modelo", "Uma frase.", regiao="fora")
    assert assunto == "Uma ligação rápida, Modelo?" and corpo.startswith("Olá, Paulo") and "Cuiabá (MT)" in corpo
    assert compose_email(1, "ICP2", "Paulo", "Modelo", "Uma frase.")[0] == "Um café no estúdio, Modelo?"


def test_aba_copy_tem_as_versoes():
    rotulos = [x[0] for x in linhas_copy()]
    assert any("fora de MT" in r for r in rotulos) and any("região desconhecida" in r for r in rotulos)
    assert ("Toque 1 · bloco 3", "ICP6", O_QUE_FAZEMOS["ICP6"]) in linhas_copy()

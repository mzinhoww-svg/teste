from msg.enriquecimento import cnpj_valido, contato_direto, doc_lead, normalizar, status, telefone_valido


def test_cnpj_com_digito_verificador():
    assert cnpj_valido("33.000.167/0001-01")
    assert not cnpj_valido("33.000.167/0001-02")
    assert not cnpj_valido("11111111111111")
    assert not cnpj_valido("123")


def test_telefone_brasileiro_com_ddd():
    assert telefone_valido("(65) 99999-1111") == "5565999991111"
    assert telefone_valido("+55 65 3000-0000") == "556530000000"
    assert telefone_valido("99999-1111") == ""
    assert telefone_valido("(65) 8999-911111") == ""


def _reg(**kw):
    base = {"id": "R0001", "empresa": {"cnpj": "33000167000101", "razaoSocial": "EXEMPLO SA"},
            "socios": [{"nome": "FULANA DE TAL", "qualificacao": "Sócio-Administrador"}],
            "decisores": [{"nome": "Fulana de Tal", "cargo": "Sócia-diretora", "fonte": "https://exemplo.com.br/equipe", "confianca": "alta"}],
            "contatos": [
                {"papel": "geral", "telefone": "6530000000", "whatsapp": "?", "fonte": "site", "confianca": "alta"},
                {"papel": "decisor", "nome": "Fulana", "telefone": "65999991111", "whatsapp": "sim", "fonte": "Instagram", "confianca": "alta"},
                {"papel": "comunicacao", "nome": "Beltrano", "email": "imprensa@exemplo.com.br", "fonte": "site", "confianca": "alta"},
            ]}
    base.update(kw)
    return base


def test_normalizar_valida_e_numera_contatos():
    limpo, avisos = normalizar(_reg())
    assert avisos == []
    assert [c["id"] for c in limpo["contatos"]] == ["k1", "k2", "k3"]
    assert limpo["empresa"]["fonte"].endswith("33000167000101")


def test_normalizar_descarta_sem_fonte_cnpj_invalido_e_duplicado():
    limpo, avisos = normalizar(_reg(
        empresa={"cnpj": "33000167000102"},
        decisores=[{"nome": "Sem Fonte", "cargo": "CEO"}],
        contatos=[{"papel": "decisor", "telefone": "65999991111", "fonte": "site"},
                  {"papel": "decisor", "telefone": "65999991111", "fonte": "site"},
                  {"papel": "geral", "telefone": "65999992222"}]))
    assert limpo["empresa"]["cnpj"] == "" and limpo["socios"] == []
    assert limpo["decisores"] == []
    assert len(limpo["contatos"]) == 1
    assert any("CNPJ inválido" in a for a in avisos)


def test_contato_direto_prefere_comunicacao_com_whatsapp_e_status():
    limpo, _ = normalizar(_reg())
    assert contato_direto(limpo)["id"] == "k2"  # comunicação só tem e-mail; decisor tem WhatsApp
    limpo["contatos"].append({"id": "k4", "papel": "comunicacao", "nome": "", "cargo": "", "telefone": "5565988887777",
                              "whatsapp": "sim", "email": "", "fonte": "site", "confianca": "alta"})
    assert contato_direto(limpo)["id"] == "k4"
    assert status(limpo) == "completo"
    assert status(normalizar(_reg(decisores=[], contatos=[]))[0]) == "parcial"
    assert status(normalizar({"id": "R9"})[0]) == "bruto"


def test_doc_lead_leva_status_e_sugestao():
    limpo, _ = normalizar(_reg())
    d = doc_lead(limpo, "2026-10-02T00:00:00Z")
    assert d["enriquecimento"]["status"] == "completo"
    assert d["enriquecimento"]["contatoSugerido"] == "k2"

from msg.enriquecimento import (cnpj_valido, contato_direto, contatos_hunter, doc_lead, normalizar, somar_contatos,
                                status, telefone_valido)


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


def test_noticia_de_risco_vai_para_alertas_e_nao_para_sinais():
    limpo, _ = normalizar(_reg(sinais=[
        {"texto": "Canal no YouTube com entrevistas", "fonte": "https://youtube.com/x"},
        {"texto": "Atenção: professores acusaram a direção de assédio moral", "fonte": "https://noticia"},
        {"texto": "Sócio citado em suspeita de propina", "fonte": "https://noticia2"},
    ]))
    assert [x["texto"] for x in limpo["sinais"]] == ["Canal no YouTube com entrevistas"]
    assert [x["texto"] for x in limpo["alertas"]] == ["professores acusaram a direção de assédio moral",
                                                      "Sócio citado em suspeita de propina"]
    assert doc_lead(limpo, "x")["alertas"] == limpo["alertas"]


def _hunter(*emails):
    return {"domain": "exemplo.com.br", "emails": list(emails)}


def test_hunter_casa_socio_pelo_nome_e_ignora_email_conhecido():
    limpo, _ = normalizar(_reg())
    h = _hunter(
        {"value": "fulana@exemplo.com.br", "first_name": "Fulana", "last_name": "Tal", "position": "Sócia",
         "seniority": "executive", "confidence": 95, "verification": {"status": "valid"},
         "sources": [{"uri": "https://exemplo.com.br/equipe"}]},
        {"value": "diretor@exemplo.com.br", "first_name": "Ciclano", "last_name": "Souza", "position": "Diretor comercial",
         "seniority": "executive", "confidence": 80, "sources": []},
        {"value": "estagio@exemplo.com.br", "first_name": "Joao", "last_name": "Silva", "position": "Estagiário",
         "seniority": "junior", "confidence": 90, "sources": []},
        {"value": "imprensa@exemplo.com.br", "first_name": "Beltrano", "last_name": "", "confidence": 99, "sources": []})
    novos = contatos_hunter(limpo, h)
    assert [(c["email"], c["papel"], c["confianca"]) for c in novos] == [
        ("fulana@exemplo.com.br", "decisor", "alta"), ("diretor@exemplo.com.br", "geral", "baixa")]
    assert novos[0]["fonte"] == "Hunter.io · https://exemplo.com.br/equipe"
    assert novos[1]["fonte"] == "Hunter.io · exemplo.com.br"


def test_hunter_sem_verificacao_fica_media_e_somar_renumera():
    limpo, _ = normalizar(_reg(contatos=[{"papel": "geral", "telefone": "6530000000", "fonte": "site"}]))
    novos = contatos_hunter(limpo, _hunter(
        {"value": "fulana@exemplo.com.br", "first_name": "Fulana", "last_name": "de Tal", "confidence": 97,
         "verification": {"status": "accept_all"}, "sources": []}))
    assert novos[0]["confianca"] == "media"
    junto = somar_contatos(limpo, novos)
    assert [c["id"] for c in junto["contatos"]] == ["k1", "k2"]
    assert contato_direto(junto)["email"] == "fulana@exemplo.com.br"
    assert limpo["contatos"][0]["id"] == "k1" and len(limpo["contatos"]) == 1  # não altera o original

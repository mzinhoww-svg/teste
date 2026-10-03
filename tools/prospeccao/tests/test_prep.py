from msg.prep import canal, limpar_telefone, montar, normalizar


def test_limpar_telefone_aceita_formatos_de_mt():
    assert limpar_telefone("(65) 99999-1111") == "5565999991111"
    assert limpar_telefone("+55 65 3000-0000") == "556530000000"
    assert limpar_telefone("065 99999 1111") == "5565999991111"


def test_limpar_telefone_recusa_fora_de_mt_e_incompleto():
    assert limpar_telefone("(11) 95864-0539") == ""
    assert limpar_telefone("99814-4414") == ""
    assert limpar_telefone("(65) 8999-91111") == ""


def test_canal_whatsapp_celular_fixo_com_whatsapp_e_email():
    assert canal(normalizar({"icp": "ICP1", "nome": "A", "telefone": "65999991111"})) == "WhatsApp"
    assert canal(normalizar({"icp": "ICP1", "nome": "A", "telefone": "6530000000",
                             "obs": "site diz WhatsApp"})) == "WhatsApp"
    assert canal(normalizar({"icp": "ICP1", "nome": "A", "telefone": "6530000000",
                             "email": "a@b.com"})) == "E-mail"
    assert canal(normalizar({"icp": "ICP1", "nome": "A", "telefone": "6530000000"})) == "Sem canal"


def test_montar_deduplica_por_telefone_email_e_nome_e_numera():
    brutos = [
        {"icp": "ICP2", "nome": "Escritório A", "telefone": "65999991111", "porte": "médio"},
        {"icp": "ICP2", "nome": "Escritório A Filial", "telefone": "(65) 99999-1111"},
        {"icp": "ICP1", "nome": "Clínica B", "email": "X@b.com"},
        {"icp": "ICP1", "nome": "Clínica C", "email": "x@b.com"},
        {"icp": "ICP1", "nome": "clinica  b!", "telefone": "65999990000"},
        {"icp": "ICP9", "nome": "Fora", "telefone": "65999990001"},
    ]
    leads, desc = montar(brutos)
    # "clinica  b!" tem WhatsApp e score maior que "Clínica B" (só e-mail), então fica no lugar
    # dela; com B descartada, o e-mail de C deixa de colidir com alguém que ficou.
    assert [l.nome for l in leads] == ["Escritório A", "clinica  b!", "Clínica C"]
    assert [l.id for l in leads] == ["R0001", "R0002", "R0003"]
    assert len(desc) == 3


def test_flag_confirmar_numero():
    l = normalizar({"icp": "ICP4", "nome": "X", "telefone": "65999992222",
                    "obs": "Site mostra número com um dígito a menos; confirmar"})
    leads, _ = montar([{"icp": "ICP4", "nome": "X", "telefone": "65999992222", "obs": l.obs}])
    assert "confirmar número" in leads[0].flags


def test_whatsapp_truncado_no_site_nao_vira_canal():
    l = normalizar({"icp": "ICP1", "nome": "A", "telefone": "6530000000",
                    "obs": "WhatsApp do site truncado"})
    assert canal(l) == "Sem canal"

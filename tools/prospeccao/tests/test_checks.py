from msg.checks import check_lote, check_personal, check_toque
from msg.compose import compose_whatsapp, wa_link
from tests.conftest import lead, personal


def _todos(l, p):
    erros = check_personal(l, p)
    for t in (1, 2, 3):
        texto = compose_whatsapp(t, l.icp, p.saudacao, p.nome_curto, p.frase)
        erros += check_toque(l, p, t, texto, wa_link(l.telefone, texto))
    return erros


def test_lead_valido_passa():
    assert _todos(lead(), personal()) == []


def test_saudacao_com_doutor_e_primeiro_nome():
    assert _todos(lead(), personal(saudacao="Dra. Juliana")) == []
    assert _todos(lead(), personal(saudacao="Paulo")) == []
    assert any("saudação" in e for e in _todos(lead(), personal(saudacao="Alves Advogados Cuiabá")))


def test_frase_com_preco_termo_proibido_e_exclamacao():
    for frase, trecho in [("Desconto especial para vocês.", "preço"),
                          ("Vocês já fazem posts toda semana.", "termo proibido"),
                          ("Que trabalho bonito!", "exclamação"),
                          ("Um trabalho incrível.", "superlativo")]:
        assert any(trecho in e for e in _todos(lead(), personal(frase=frase))), frase


def test_numero_inventado_na_frase():
    erros = _todos(lead(), personal(frase="São 30 anos de escritório."))
    assert any("número 30" in e for e in erros)
    ok = _todos(lead(especialidade="escritório fundado há 30 anos"), personal(frase="São 30 anos de escritório."))
    assert not any("número" in e for e in ok)


def test_fonte_instagram_exige_perfil():
    assert any("Instagram" in e for e in _todos(lead(instagram=""), personal(fonte="Instagram")))


def test_mensagem_adulterada_e_link_diferente():
    l, p = lead(), personal()
    texto = compose_whatsapp(1, l.icp, p.saudacao, p.nome_curto, p.frase)
    erros = check_toque(l, p, 1, texto + "\nPS", wa_link(l.telefone, texto))
    assert any("difere dos blocos" in e for e in erros)
    assert any("link decodificado" in e for e in erros)


def test_lote_acusa_frase_repetida():
    p = personal()
    erros = check_lote([(lead(), p), (lead(id="R0002"), personal(id="R0002"))])
    assert erros == ["R0002: frase repetida de R0001"]


def test_nome_oficial_com_cuiaba_passa_e_titulo_de_seo_nao():
    assert _todos(lead(), personal(saudacao="pessoal da CDL Cuiabá", nome_curto="CDL Cuiabá")) == []
    erros = _todos(lead(), personal(nome_curto="Clínica X | Dermatologia em Cuiabá"))
    assert any("sufixo de SEO" in e for e in erros)

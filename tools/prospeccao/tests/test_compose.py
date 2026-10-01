import urllib.parse

from msg.compose import compose_email, compose_whatsapp, wa_link
from msg.copy_v1 import ASSINATURA_EMAIL, O_QUE_FAZEMOS


def test_toque_1_tem_frase_e_bloco_do_icp():
    t = compose_whatsapp(1, "ICP3", "pessoal da Aprosoja", "Aprosoja", "Frase única.")
    linhas = t.split("\n")
    assert linhas[0].startswith("Oi, pessoal da Aprosoja, tudo bem? Aqui é a Letícia")
    assert linhas[1] == "Frase única."
    assert linhas[2] == O_QUE_FAZEMOS["ICP3"]
    assert "conhecer o estúdio" in t


def test_toques_2_e_3_sao_iguais_para_todos_e_nao_repetem_a_frase():
    t2 = compose_whatsapp(2, "ICP1", "Ana", "Clínica Ana", "Frase única.")
    t3 = compose_whatsapp(3, "ICP1", "Ana", "Clínica Ana", "Frase única.")
    assert "Diagnóstico de Presença Institucional" in t2 and t2.startswith("Oi, Ana,")
    assert "episódio piloto" in t3 and t3.startswith("Oi, Ana,")
    assert "Frase única." not in t2 + t3
    assert "{" not in t2 + t3


def test_wa_link_ida_e_volta():
    texto = compose_whatsapp(1, "ICP2", "Paulo", "Paulo", "Ação & reação?")
    link = wa_link("5565999990000", texto)
    assert link.startswith("https://wa.me/5565999990000?text=")
    assert urllib.parse.unquote(link.split("text=", 1)[1]) == texto


def test_email_troca_oi_por_ola_e_assina():
    assunto, corpo = compose_email(2, "ICP5", "pessoal da Ápice", "Ápice", "x")
    assert assunto == "Um diagnóstico por nossa conta, Ápice"
    assert corpo.startswith("Olá, pessoal da Ápice")
    assert corpo.rstrip().endswith(ASSINATURA_EMAIL.splitlines()[-1])
    assert "responder este e-mail" in corpo

"""Leva 1: dados no card (resumo do lead), detalhe do lead para o painel e as visões rápidas do quadro.

Fixtures no FORMATO REAL da Central (nome = nome da empresa; empresa = dict do CNPJ; decisores, contatos, perfil, toques,
enviado1..3...), com dados 100% fictícios: nenhum telefone ou nome real."""
import json
import threading

import pytest

from atendente import api_leads, servidor
from atendente.db import Repo

from test_servidor import AGORA, AtendenteFalso, USUARIOS, WaFalso, json_de, pedir  # noqa: F401

TEL = "5565999900001"
MSG1 = ("Oi, Antônio, tudo bem? Aqui é a Letícia, da Reiners Media, estúdio de podcast aqui em Cuiabá.\n\n"
        "Te mandei uma foto do nosso cenário Mesa de reunião, para bate-papo com até quatro pessoas.\n\n"
        "Que dia fica bom para você?")
MSG2 = "Oi, Antônio, passando de novo por aqui. Posso te mandar um diagnóstico rápido?"
MSG3 = "Oi, Antônio, última mensagem: topa um piloto de um episódio?"


def real(i, **extra):
    d = {
        "id": f"R{i:03d}", "nome": f"Escritório Fictício {i}", "ordem": i, "versaoCopy": "v2",
        "empresa": {"cnpj": "12345678000190", "razaoSocial": f"Fictícia Advocacia {i} Ltda", "porte": "ME",
                    "abertura": "2001-05-01", "cnae": "6911-7/01 Serviços advocatícios", "situacao": "ATIVA",
                    "municipio": "Cuiabá", "nomeFantasia": "", "capitalSocial": None, "fonte": ""},
        "canal": "WhatsApp", "categoria": "Advocacia", "segmento": "Jurídico e contábil", "faixa": "A", "icp": "ICP3",
        "score": 80, "pais": "Brasil", "uf": "MT", "cidade": "Cuiabá", "bairro": "Centro",
        "telefone": TEL, "email": "contato@ficticia.example", "site": "https://ficticia.example",
        "instagram": "@ficticia", "redes": {"instagram": "https://www.instagram.com/ficticia/", "linkedinEmpresa": "",
                                             "youtube": ""},
        "saudacao": "Antônio", "situacao": "ativo", "etapa": 0, "enviado1": None, "enviado2": None, "enviado3": None,
        "foto": "mesa-pessoa-02", "fotoEscolhida": None,
        "toques": [{"n": 1, "mensagem": MSG1, "assunto": "", "corpo": "", "waLink": "https://wa.me/x"},
                   {"n": 2, "mensagem": MSG2, "assunto": "", "corpo": ""},
                   {"n": 3, "mensagem": MSG3, "assunto": "", "corpo": ""}],
        "decisores": [{"nome": "Antônio Fictício Pereira", "cargo": "Sócio fundador", "fonte": "https://ficticia.example/",
                       "linkedin": "", "confianca": "alta"}],
        "contatos": [{"id": "k1", "papel": "geral", "nome": "", "cargo": "", "telefone": TEL,
                      "email": "contato@ficticia.example", "whatsapp": "sim", "fonte": "site", "confianca": "alta"}],
        "contatoAtivo": None,
        "perfil": {"cidade": "Cuiabá", "especialidade": "advocacia cível e trabalhista", "porte": "médio", "nota": 4.7,
                   "avaliacoes": 31, "fonteDados": "https://ficticia.example/", "fonteFrase": "Especialidade"},
        "sinais": [{"texto": "Tem canal no YouTube parado", "fonte": "https://youtube.example/ficticia"}],
        "socios": [{"nome": "Antônio Fictício Pereira", "qualificacao": "Sócio-Administrador"}],
        "fraseUnica": "Um escritório que vai do cível ao trabalhista.", "flags": [], "alertas": [],
        "pendencias": ["Sem contato direto dos sócios"], "enriquecimento": {"status": "parcial"}, "historico": [],
    }
    d.update(extra)
    return d


class Ctx:
    pass


@pytest.fixture
def ctx():
    c = Ctx()
    c.repo = Repo(":memory:")
    c.wa = WaFalso()
    c.cfg = {"webhook_segredo": "s", "segredo_sessao": "segredo-de-teste-da-sessao-bem-longo",
             "usuarios": dict(USUARIOS), "relogio": lambda: AGORA, "fotos_url": "https://fotos.example/central/"}
    c.srv = servidor.criar_servidor(c.repo, AtendenteFalso(), c.wa, c.cfg, "127.0.0.1", 0)
    c.porta = c.srv.server_address[1]
    threading.Thread(target=lambda: c.srv.serve_forever(poll_interval=0.05), daemon=True).start()
    yield c
    c.srv.shutdown()
    c.srv.server_close()


def entrar(c):
    st, h, _ = pedir(c, "POST", "/login", {"usuario": "ana", "senha": USUARIOS["ana"]})
    assert st == 200
    return h["set-cookie"].split(";")[0]


def resumos(c):
    return {l["id"]: l for l in json_de(pedir(c, "GET", "/api/leads", cookie=entrar(c)))}


# --------------------------------------------------------------------------- resumo (card)

def test_resumo_traz_os_dados_do_card(ctx):
    ctx.repo.lead_put(real(1))
    s = resumos(ctx)["R001"]
    assert s["empresa"] == "Escritório Fictício 1"
    assert (s["segmento"], s["faixa"], s["canal"], s["uf"], s["cidade"], s["pais"]) == (
        "Jurídico e contábil", "A", "WhatsApp", "MT", "Cuiabá", "Brasil")
    assert (s["score"], s["icp"], s["categoria"]) == (80, "ICP3", "Advocacia")
    assert s["toque"] == 0 and s["proximoToque"] == 1 and s["temFoto"] is True
    assert s["quemDecide"] == "Antônio Fictício Pereira" and s["decisor"] == "nome"
    assert s["grupo"] == "hoje" and s["proximaEm"] == "2026-10-07" and s["agendadoPara"] is None
    assert s["visoes"] == ["nao_enviados", "hoje"]


def test_resumo_nao_espalha_o_telefone_inteiro(ctx):
    ctx.repo.lead_put(real(1))
    corpo = pedir(ctx, "GET", "/api/leads", cookie=entrar(ctx))[2].decode("utf-8")
    assert TEL not in corpo and "999900001" not in corpo
    s = json.loads(corpo)[0]
    assert "telefone" not in s
    assert s["telefoneMascarado"].endswith("0001") and "•" in s["telefoneMascarado"]


def test_resumo_cidade_cai_no_perfil_e_campos_faltando_nao_quebram(ctx):
    ctx.repo.lead_put(real(1, cidade=None, uf=None))
    ctx.repo.lead_put({"id": "MIN", "nome": "Só nome"})                  # lead mínimo, sem nada além do nome
    r = resumos(ctx)
    assert r["R001"]["cidade"] == "Cuiabá" and r["R001"]["uf"] == ""
    m = r["MIN"]
    assert m["segmento"] == "" and m["faixa"] == "" and m["score"] is None and m["quemDecide"] is None
    assert m["decisor"] == "sem" and m["telefoneMascarado"] == "" and m["temFoto"] is False


def test_resumo_toque_proximo_e_agendamento(ctx):
    ctx.repo.lead_put(real(1, etapa=1, enviado1="2026-10-07T13:00:00Z"))                    # enviou hoje
    ctx.repo.lead_put(real(2, etapa=2, enviado1="2026-09-20T13:00:00Z", enviado2="2026-09-28T13:00:00Z",
                           agendamento={"n": 3, "id": "ag9", "sendAt": "2026-10-07T16:00:00Z", "jid": "j"}))
    r = resumos(ctx)
    assert r["R001"]["toque"] == 1 and r["R001"]["proximoToque"] == 2
    assert r["R001"]["proximaEm"] == "2026-10-11" and r["R001"]["grupo"] == "aguardando"   # 4 dias depois
    assert r["R002"]["toque"] == 2 and r["R002"]["proximoToque"] == 3
    assert r["R002"]["agendadoPara"] == "2026-10-07T16:00:00Z"


def test_quem_decide_com_contato_do_decisor(ctx):
    contatos = [{"id": "k2", "papel": "decisor", "nome": "Rosa Fictícia", "telefone": "5565999900002", "whatsapp": "sim"}]
    ctx.repo.lead_put(real(1, contatos=contatos))
    ctx.repo.lead_put(real(2, decisores=[], contatos=[]))
    r = resumos(ctx)
    assert r["R001"]["decisor"] == "contato" and r["R002"]["decisor"] == "sem"


def test_busca_sem_acento_por_pessoa_cnpj_e_cidade(ctx):
    ctx.repo.lead_put(real(1))
    b = resumos(ctx)["R001"]["busca"]
    assert "antonio ficticio pereira" in b and "12345678000190" in b and "cuiaba" in b and "r001" in b
    assert TEL not in b


# --------------------------------------------------------------------------- visões rápidas

@pytest.mark.parametrize("extra, esperado", [
    ({}, ["nao_enviados", "hoje"]),
    ({"etapa": 1, "enviado1": "2026-10-07T13:00:00Z"}, ["enviado1"]),
    ({"etapa": 1, "enviado1": "2026-10-01T13:00:00Z"}, ["hoje", "enviado1"]),
    ({"etapa": 2, "enviado1": "2026-09-20T13:00:00Z", "enviado2": "2026-10-06T13:00:00Z"}, ["enviado2"]),
    ({"etapa": 3, "enviado3": "2026-10-01T13:00:00Z"}, ["enviado3"]),
    ({"situacao": "respondeu", "etapa": 1, "enviado1": "2026-10-01T13:00:00Z"}, ["responderam", "resp_wa"]),
    ({"situacao": "respondeu", "canal": "E-mail", "explee": {"resposta": "Ok, me envie", "quente": True}},
     ["responderam", "resp_explee"]),
    ({"situacao": "respondeu", "explee": {"resposta": "Ok"}, "respostasVistasAte": "2026-10-07T13:00:00Z"},
     ["responderam", "resp_explee", "resp_wa"]),
    ({"telefone": "", "contatos": []}, ["nao_enviados", "sem_contato"]),
    ({"situacao": "fechou", "etapa": 2}, []),
    ({"situacao": "sair"}, []),
    ({"situacao": None}, ["nao_enviados", "hoje"]),
])
def test_visoes_seguem_a_cadencia(extra, esperado):
    lead = real(1, **extra)
    assert api_leads.visoes(lead, servidor.coluna_do_lead(lead, AGORA), AGORA) == esperado


@pytest.mark.parametrize("extra, grupo", [
    ({}, "hoje"),
    ({"etapa": 1, "enviado1": "2026-10-07T13:00:00Z"}, "aguardando"),
    ({"etapa": 3, "enviado3": "2026-10-01T13:00:00Z"}, "encerrado"),
    ({"telefone": "", "contatos": []}, "semcontato"),
    ({"situacao": "respondeu"}, "respondeu"),
    ({"situacao": "fechou"}, "fechou"),
    ({"situacao": "sair"}, "sair"),
])
def test_grupo_igual_ao_da_central_antiga(extra, grupo):
    lead = real(1, **extra)
    assert api_leads.grupo(lead, servidor.coluna_do_lead(lead, AGORA)) == grupo


def test_mascarar_telefone():
    assert api_leads.mascarar("5565999900001") == "+55 (65) •••••-0001"
    assert api_leads.mascarar("(65) 3000-1234") == "+55 (65) ••••-1234"
    assert api_leads.mascarar("") == "" and api_leads.mascarar(None) == ""


# --------------------------------------------------------------------------- detalhe (painel)

def detalhe(c, id_):
    return json_de(pedir(c, "GET", f"/api/leads/{id_}", cookie=entrar(c)))


def test_detalhe_traz_proximo_toque_montado_com_foto(ctx):
    ctx.repo.lead_put(real(1))
    ctx.repo.msg_add("R001", "j", False, "Oi", "TEXT", "w1", "2026-10-07T13:00:00Z")
    d = detalhe(ctx, "R001")
    p = d["proximo"]
    assert p["n"] == 1 and p["nome"] == "Visita" and p["texto"] == MSG1 and p["quando"] == "hoje"
    assert p["foto"] == {"id": "mesa-pessoa-02", "cenario": "Mesa de reunião",
                         "url": "https://fotos.example/central/mesa-pessoa-02.jpg"}
    # o que já existia continua
    assert d["empresa"] == "Escritório Fictício 1" and d["empresaDados"]["cnpj"] == "12345678000190"
    assert d["mensagens"][0]["texto"] == "Oi"
    assert d["decisores"][0]["nome"] == "Antônio Fictício Pereira" and d["socios"] and d["sinais"] and d["perfil"]
    assert d["telefoneFormatado"] == "+55 (65) 99990-0001"
    assert d["local"] == "Cuiabá/MT"


def test_detalhe_usa_a_saudacao_do_contato_ativo_e_a_foto_escolhida(ctx):
    contatos = [{"id": "k2", "papel": "decisor", "nome": "rosa fictícia", "telefone": "5565999900002"}]
    ctx.repo.lead_put(real(1, contatos=contatos, contatoAtivo="k2", fotoEscolhida="sofa-pessoa-01"))
    p = detalhe(ctx, "R001")["proximo"]
    assert p["texto"].startswith("Oi, Rosa, tudo bem?")
    assert "cenário Sofá, para entrevista em dupla" in p["texto"]
    assert p["foto"]["id"] == "sofa-pessoa-01" and p["foto"]["cenario"] == "Sofá"
    assert p["para"] == "rosa fictícia"


def test_detalhe_toque_2_sem_foto_e_quando(ctx):
    ctx.repo.lead_put(real(1, etapa=1, enviado1="2026-10-07T13:00:00Z"))
    ctx.repo.lead_put(real(2, etapa=1, enviado1="2026-10-01T13:00:00Z",
                           agendamento={"n": 2, "id": "a", "sendAt": "2026-10-07T18:30:00Z", "jid": "j"}))
    p = detalhe(ctx, "R001")["proximo"]
    assert p["n"] == 2 and p["nome"] == "Diagnóstico" and p["texto"] == MSG2 and p["foto"] is None
    assert p["quando"] == "2026-10-11" and p["agendadoPara"] is None
    p2 = detalhe(ctx, "R002")["proximo"]
    assert p2["quando"] == "hoje" and p2["agendadoPara"] == "2026-10-07T18:30:00Z"


def test_detalhe_sem_fotos_url_mostra_o_cenario_sem_link(ctx):
    ctx.cfg.pop("fotos_url")
    ctx.repo.lead_put(real(1))
    assert detalhe(ctx, "R001")["proximo"]["foto"] == {"id": "mesa-pessoa-02", "cenario": "Mesa de reunião", "url": None}


@pytest.mark.parametrize("extra", [{"situacao": "respondeu"}, {"situacao": "sair"}, {"situacao": "fechou"},
                                   {"etapa": 3, "enviado3": "2026-10-01T13:00:00Z"}, {"toques": []}])
def test_detalhe_sem_proximo_toque(ctx, extra):
    ctx.repo.lead_put(real(1, **extra))
    assert detalhe(ctx, "R001")["proximo"] is None


def test_detalhe_links_so_http(ctx):
    ctx.repo.lead_put(real(1, site="ficticia.example", instagram="@ficticia",
                           redes={"instagram": "", "linkedinEmpresa": "javascript:alert(1)",
                                  "youtube": "https://youtube.example/@ficticia"}))
    links = detalhe(ctx, "R001")["links"]
    assert links == [{"rotulo": "Site", "url": "https://ficticia.example"},
                     {"rotulo": "Instagram", "url": "https://instagram.com/ficticia"},
                     {"rotulo": "YouTube", "url": "https://youtube.example/@ficticia"}]
    assert api_leads.link_seguro("javascript:alert(1)") is None
    assert api_leads.link_seguro("JaVaScRiPt:alert(1)") is None
    assert api_leads.link_seguro("data:text/html,x") is None
    assert api_leads.link_seguro("http://ok.example/a") == "http://ok.example/a"


def test_detalhe_404_e_sem_login(ctx):
    assert pedir(ctx, "GET", "/api/leads/NAO", cookie=entrar(ctx))[0] == 404
    ctx.repo.lead_put(real(1))
    assert pedir(ctx, "GET", "/api/leads/R001")[0] == 401


def test_detalhe_lead_minimo_nao_quebra(ctx):
    ctx.repo.lead_put({"id": "MIN", "nome": "Só nome", "toques": [{"n": 1}], "decisores": None, "redes": None})
    d = detalhe(ctx, "MIN")
    assert d["proximo"] is None and d["links"] == [] and d["telefoneFormatado"] == ""

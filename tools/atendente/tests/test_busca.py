"""Busca geral da Central: acha lead, empresa da Base ou cliente por nome, sócio, cidade, CNPJ, e-mail, site e TELEFONE
(inteiro ou só o final). Dados 100% fictícios; telefones 55659999000NN."""
import json
import threading
from urllib.parse import quote

import pytest

from atendente import servidor
from atendente.db import Repo

from test_servidor import AGORA, AtendenteFalso, USUARIOS, WaFalso, json_de, pedir  # noqa: F401


class Ctx:
    pass


@pytest.fixture
def ctx():
    c = Ctx()
    c.repo = Repo(":memory:")
    c.cfg = {"webhook_segredo": "s", "segredo_sessao": "segredo-de-teste-da-sessao-bem-longo",
             "usuarios": dict(USUARIOS), "relogio": lambda: AGORA}
    c.srv = servidor.criar_servidor(c.repo, AtendenteFalso(), WaFalso(), c.cfg, "127.0.0.1", 0)
    c.porta = c.srv.server_address[1]
    threading.Thread(target=lambda: c.srv.serve_forever(poll_interval=0.05), daemon=True).start()
    c.repo.lead_put({"id": "R0037", "nome": "Contabilist Contabilidade", "segmento": "Jurídico e contábil", "faixa": "A",
                     "cidade": "Cuiabá", "uf": "MT", "situacao": "respondeu", "etapa": 1,
                     "empresa": {"cnpj": "12345678000190", "razaoSocial": "Fictícia Contábil Ltda"},
                     "telefone": "65 99990-0037", "email": "contato@ficticia.example", "site": "https://ficticia.example",
                     "decisores": [{"nome": "Francisco Fictício Silva", "cargo": "Sócio-administrador"}],
                     "contatos": [{"id": "k1", "papel": "geral", "telefone": "5565999900037"}]})
    c.repo.lead_put({"id": "R0002", "nome": "Padaria do Zé", "segmento": "Alimentação", "cidade": "Várzea Grande",
                     "uf": "MT", "situacao": "ativo", "telefone": "5565999900002"})
    c.repo.base_put({"id": "D00001", "nome": "Supermercado Exemplo", "dominio": "supermercadoexemplo.example",
                     "segmento": "Varejo", "cidade": "Cuiabá", "uf": "MT", "status": "base",
                     "pessoas": [{"nome": "Maria Fictícia Souza", "cargo": "Proprietária"}],
                     "contatos": [{"telefone": "5565999900088"}]})
    c.repo.cliente_put({"id": "CL001", "nome": "Cliente Teste Ltda", "contato": {"telefone": "5565999900055"}})
    yield c
    c.srv.shutdown()
    c.srv.server_close()


def entrar(c):
    st, h, _ = pedir(c, "POST", "/login", {"usuario": "ana", "senha": USUARIOS["ana"]})
    assert st == 200
    return h["set-cookie"].split(";")[0]


def buscar(c, q, cookie=None):
    return json_de(pedir(c, "GET", "/api/buscar?q=" + quote(q), cookie=cookie or entrar(c)))


def ids(r):
    return [x["id"] for x in r["resultados"]]


def test_exige_login(ctx):
    assert pedir(ctx, "GET", "/api/buscar?q=padaria")[0] == 401


def test_acha_pelo_nome_sem_acento_e_sem_maiuscula(ctx):
    assert ids(buscar(ctx, "contabilist")) == ["R0037"]
    assert ids(buscar(ctx, "VARZEA")) == ["R0002"]


def test_acha_pelo_final_do_telefone_do_print(ctx):
    r = buscar(ctx, "9990-0037")
    assert ids(r) == ["R0037"] and r["resultados"][0]["motivo"] == "telefone"


def test_acha_pelo_telefone_com_formatacao_e_sem_o_55_e_sem_o_nono_digito(ctx):
    for q in ("(65) 99990-0037", "+55 65 99990-0037", "65 9990-0037", "5565999900037"):
        assert "R0037" in ids(buscar(ctx, q)), q


def test_acha_pelo_socio_cnpj_email_e_site(ctx):
    assert ids(buscar(ctx, "francisco")) == ["R0037"]
    assert ids(buscar(ctx, "12.345.678/0001-90")) == ["R0037"]
    assert ids(buscar(ctx, "contato@ficticia")) == ["R0037"]
    assert ids(buscar(ctx, "ficticia.example")) == ["R0037"]


def test_acha_na_base_e_em_clientes_com_o_tipo(ctx):
    r = buscar(ctx, "supermercado")
    assert [(x["tipo"], x["id"]) for x in r["resultados"]] == [("base", "D00001")]
    assert [(x["tipo"], x["id"]) for x in buscar(ctx, "maria")["resultados"]] == [("base", "D00001")]
    assert [(x["tipo"], x["id"]) for x in buscar(ctx, "99900055")["resultados"]] == [("cliente", "CL001")]


def test_resultado_nao_vaza_telefone_inteiro_e_diz_o_estado(ctx):
    corpo = pedir(ctx, "GET", "/api/buscar?q=99900037", cookie=entrar(ctx))[2].decode("utf-8")
    assert "5565999900037" not in corpo and "999900037" not in corpo
    x = json.loads(corpo)["resultados"][0]
    assert x["nome"] == "Contabilist Contabilidade" and x["situacao"] == "respondeu"
    assert x["coluna"] == "Responderam" and x["cidade"] == "Cuiabá"


def test_consulta_curta_demais_ou_vazia_nao_busca(ctx):
    assert buscar(ctx, "a")["resultados"] == [] and buscar(ctx, "")["resultados"] == []
    assert buscar(ctx, "123")["resultados"] == []                 # 3 dígitos soltos acham tudo: não vale


def test_sem_resultado_devolve_lista_vazia_e_limite_de_30(ctx):
    assert buscar(ctx, "zzzzzz")["resultados"] == []
    for i in range(40):
        ctx.repo.lead_put({"id": f"X{i:03d}", "nome": f"Loja Teste {i}", "situacao": "ativo"})
    r = buscar(ctx, "loja teste")
    assert len(r["resultados"]) == 30 and r["total"] == 40


def test_lead_so_com_nome_nao_quebra(ctx):
    ctx.repo.lead_put({"id": "MIN", "nome": "Só nome mínimo"})
    ctx.repo.lead_put({"id": "VAZ"})
    assert ids(buscar(ctx, "minimo")) == ["MIN"]

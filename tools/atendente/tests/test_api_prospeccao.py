"""Rotas da prospecção (aba Prospecção): o contrato que web/leva5.js já segue (tests/e2e/test_leva5.py).

Servidor de verdade em 127.0.0.1, treg e WA-AKG falsos no formato real. Dados fictícios, telefones 55659999000NN."""
import http.client
import json
import threading

import pytest

from atendente import servidor
from atendente.db import Repo
from atendente.prospeccao import ciclo as cic

from test_ciclo import AGORA, TOKEN, Treg, Wa, empresa, nome_de, todos_celulares

USUARIOS = {"ana": "senha-inventada-ana"}
CAMPOS = {"id", "nome", "segmento", "cidades", "status", "tetoDiaUsd", "tetoCampanhaUsd", "gastoHojeUsd",
          "gastoTotalUsd", "funil"}
FUNIL = {"empresas", "pessoas", "comContato", "qualificados", "promovidos", "descartados"}


class Ctx:
    pass


@pytest.fixture
def ctx():
    c = Ctx()
    c.repo = Repo(":memory:", sal="sal-de-teste")
    for i in range(1, 4):
        c.repo.cnpj_put(empresa(i))
    c.treg = Treg(todos_celulares())
    c.ciclo = cic.Ciclo(c.repo, Wa(), TOKEN, lambda: AGORA, transporte=c.treg)
    cfg = {"webhook_segredo": "segredo-de-teste-do-webhook", "segredo_sessao": "segredo-de-teste-da-sessao-bem-longo",
           "usuarios": dict(USUARIOS), "relogio": lambda: AGORA, "ciclo_prospeccao": c.ciclo}
    c.srv = servidor.criar_servidor(c.repo, object(), Wa(), cfg, "127.0.0.1", 0)
    c.porta = c.srv.server_address[1]
    threading.Thread(target=lambda: c.srv.serve_forever(poll_interval=0.05), daemon=True).start()
    yield c
    c.srv.shutdown()
    c.srv.server_close()


def pedir(c, metodo, caminho, corpo=None, cookie=None):
    con = http.client.HTTPConnection("127.0.0.1", c.porta, timeout=10)
    h = {"Cookie": cookie} if cookie else {}
    dados = None
    if corpo is not None:
        dados = json.dumps(corpo).encode()
        h["Content-Type"] = "application/json"
    con.request(metodo, caminho, body=dados, headers=h)
    r = con.getresponse()
    out = r.status, json.loads(r.read() or b"null")
    con.close()
    return out


def entrar(c):
    con = http.client.HTTPConnection("127.0.0.1", c.porta, timeout=10)
    con.request("POST", "/login", body=json.dumps({"usuario": "ana", "senha": USUARIOS["ana"]}),
                headers={"Content-Type": "application/json"})
    r = con.getresponse()
    r.read()
    ck = r.getheader("Set-Cookie").split(";")[0]
    con.close()
    return ck


NOVA = {"nome": "Mercados", "segmento": "Empresas B2B médias", "cidades": ["Cuiabá"], "cnaes": ["4711-3/02"],
        "porte": "pequena", "oferta": "", "tetoDiaUsd": 10, "tetoCampanhaUsd": 30, "metaPorDia": 50}


def test_api_exige_login(ctx):
    assert pedir(ctx, "GET", "/api/prospeccao")[0] == 401
    assert pedir(ctx, "POST", "/api/prospeccao/campanhas", NOVA)[0] == 401


def test_api_contrato_da_tela(ctx):
    ck = entrar(ctx)
    st, est = pedir(ctx, "GET", "/api/prospeccao", cookie=ck)
    assert st == 200 and est["disponivel"] is True and est["rodando"] is False
    assert est["campanhas"] == [] and est["progresso"] is None and "semToken" not in est
    # criar
    st, r = pedir(ctx, "POST", "/api/prospeccao/campanhas", dict(NOVA, cidades=["Goiânia - GO"]), cookie=ck)
    assert st == 400 and "Mato Grosso" in r["erro"]
    st, camp = pedir(ctx, "POST", "/api/prospeccao/campanhas", NOVA, cookie=ck)
    assert st == 201 and CAMPOS <= set(camp) and set(camp["funil"]) == FUNIL and camp["status"] == "nova"
    cid = camp["id"]
    # iniciar: confirmação explícita, 202, depois 409 se ainda rodando (aqui já terminou: roda de novo e conclui)
    st, r = pedir(ctx, "POST", f"/api/prospeccao/campanhas/{cid}/iniciar", {}, cookie=ck)
    assert st == 400 and "US$" in r["erro"]
    st, r = pedir(ctx, "POST", f"/api/prospeccao/campanhas/{cid}/iniciar", {"confirmo": True}, cookie=ck)
    assert st == 202
    assert ctx.ciclo.esperar(10)
    st, est = pedir(ctx, "GET", "/api/prospeccao", cookie=ck)
    c = est["campanhas"][0]
    assert c["status"] == "concluida" and c["funil"]["promovidos"] == 3 and c["gastoTotalUsd"] > 0
    assert est["progresso"] is None
    # funil detalhado (as duas formas de caminho)
    for caminho in (f"/api/prospeccao/campanhas/{cid}/funil", f"/api/prospeccao/{cid}/funil"):
        st, f = pedir(ctx, "GET", caminho, cookie=ck)
        assert st == 200 and [e["n"] for e in f["etapas"]] == [3, 3, 3, 3, 3]
        assert f["descartes"] == [] and f["custoPorLeadUsd"] == pytest.approx(0.026)
    assert pedir(ctx, "GET", "/api/prospeccao/campanhas/nao-existe/funil", cookie=ck)[0] == 404
    # parar sem rodada: 409
    assert pedir(ctx, "POST", "/api/prospeccao/parar", {}, cookie=ck)[0] == 409
    assert "55659999" not in json.dumps(est)


def test_api_409_parar_e_402(ctx):
    liberar, entrou = threading.Event(), threading.Event()

    def antes(ep, nome):
        entrou.set()
        liberar.wait(5)
    ctx.treg.antes = antes
    ck = entrar(ctx)
    cid = pedir(ctx, "POST", "/api/prospeccao/campanhas", NOVA, cookie=ck)[1]["id"]
    assert pedir(ctx, "POST", f"/api/prospeccao/campanhas/{cid}/iniciar", {"confirmo": True}, cookie=ck)[0] == 202
    assert entrou.wait(5)
    st, est = pedir(ctx, "GET", "/api/prospeccao", cookie=ck)
    assert est["rodando"] is True and est["progresso"]["campanhaId"] == cid
    assert est["campanhas"][0]["status"] == "rodando"
    st, r = pedir(ctx, "POST", f"/api/prospeccao/campanhas/{cid}/iniciar", {"confirmo": True}, cookie=ck)
    assert st == 409 and "andamento" in r["erro"]
    st, est = pedir(ctx, "POST", "/api/prospeccao/parar", {}, cookie=ck)
    assert st == 200
    liberar.set()
    assert ctx.ciclo.esperar(5)
    st, est = pedir(ctx, "GET", "/api/prospeccao", cookie=ck)
    assert est["campanhas"][0]["status"] == "parada" and est["motivoParada"] == "parado pela equipe"
    # sem saldo: a próxima rodada para no 402 e iniciar logo depois responde 402
    ctx.treg.antes = None
    ctx.treg.saldo_em = {nome_de(2)}
    assert pedir(ctx, "POST", f"/api/prospeccao/campanhas/{cid}/iniciar", {"confirmo": True}, cookie=ck)[0] == 202
    assert ctx.ciclo.esperar(5)
    st, r = pedir(ctx, "POST", f"/api/prospeccao/campanhas/{cid}/iniciar", {"confirmo": True}, cookie=ck)
    assert st == 402 and "Recarregue" in r["erro"]


def test_api_teto_pausar_retomar(ctx):
    ck = entrar(ctx)
    cid = pedir(ctx, "POST", "/api/prospeccao/campanhas", NOVA, cookie=ck)[1]["id"]
    st, r = pedir(ctx, "POST", f"/api/prospeccao/campanhas/{cid}/teto", {"tetoDiaUsd": 40, "tetoCampanhaUsd": 30},
                  cookie=ck)
    assert st == 400
    st, r = pedir(ctx, "POST", f"/api/prospeccao/campanhas/{cid}/teto", {"tetoDiaUsd": 5, "tetoCampanhaUsd": 20},
                  cookie=ck)
    assert st == 200 and r["tetoDiaUsd"] == 5 and r["tetoCampanhaUsd"] == 20
    st, r = pedir(ctx, "POST", f"/api/prospeccao/campanhas/{cid}/pausar", {}, cookie=ck)
    assert st == 200 and r["status"] == "pausada"
    assert pedir(ctx, "POST", f"/api/prospeccao/campanhas/{cid}/iniciar", {"confirmo": True}, cookie=ck)[0] == 409
    st, r = pedir(ctx, "POST", f"/api/prospeccao/campanhas/{cid}/retomar", {}, cookie=ck)
    assert st == 200 and r["status"] == "parada"
    assert pedir(ctx, "POST", "/api/prospeccao/campanhas/nao-existe/pausar", {}, cookie=ck)[0] == 404


def test_api_sem_token_pelo_ambiente():
    repo = Repo(":memory:", sal="sal-de-teste")
    cfg = {"webhook_segredo": "x" * 20, "segredo_sessao": "y" * 30, "usuarios": dict(USUARIOS),
           "relogio": lambda: AGORA, "ambiente": {}}
    srv = servidor.criar_servidor(repo, object(), Wa(), cfg, "127.0.0.1", 0)
    try:
        from atendente import api_prospeccao
        c = api_prospeccao.ciclo_do(srv)
        assert c is api_prospeccao.ciclo_do(srv)
        est = c.estado()
        assert est["disponivel"] is False and "TREG_TOKEN" in est["semToken"]
        cfg["ambiente"] = {"TREG_API_KEY": "outro-token-inventado"}
        srv2 = servidor.criar_servidor(repo, object(), Wa(), cfg, "127.0.0.1", 0)
        try:
            assert api_prospeccao.ciclo_do(srv2).estado()["disponivel"] is True
        finally:
            srv2.server_close()
    finally:
        srv.server_close()

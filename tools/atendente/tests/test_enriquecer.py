"""Enriquecimento na VPS (leva 4): rodada única em segundo plano, teto de US$10, parar, progresso e histórico.

Nada aqui gasta dinheiro nem usa a rede: o treg é um transporte falso (ou o simulador do script) e o site é uma
função falsa. Dados no formato real (nome = empresa, empresa = dict), números fictícios 55659999000NN."""
import http.client
import json
import threading
from datetime import datetime, timedelta, timezone

import pytest

from atendente import enriquecer, servidor
from atendente.db import Repo

AGORA = datetime(2026, 10, 7, 15, 0, tzinfo=timezone.utc)
TOKEN = "tok-de-teste-inventado"
USUARIOS = {"ana": "senha-inventada-ana"}


def _lead(i, **extra):
    d = {"id": f"R{i:04d}", "nome": f"Empresa Teste {i}", "empresa": {"cnpj": "", "municipio": "Cuiabá"},
         "situacao": "ativo", "faixa": "B", "score": 50, "etapa": 0, "canal": "whatsapp",
         "site": f"https://www.empresa{i}.com.br/", "telefone": "", "saudacao": f"Pessoa{i}",
         "contatos": [], "historico": [], "pendencias": ["Telefone/WhatsApp do decisor"],
         "decisores": [{"nome": f"Pessoa{i} Silva", "cargo": "Sócio", "linkedin": f"https://www.linkedin.com/in/pessoa{i}"}],
         "enriquecimento": {"status": "parcial"}, "contatoAtivo": "k1"}
    d.update(extra)
    return d


def _tel(i):
    return f"55659999000{i:02d}"


class TregFalso:
    """Transporte falso do treg. `regra(lead_id, url)` devolve (status, headers, corpo dict)."""

    def __init__(self, regra=None):
        self.chamadas = []
        self.regra = regra or self.padrao

    @staticmethod
    def padrao(lead_id, url):
        n = int(lead_id[1:])
        if n % 2:   # ímpar acha
            return 200, {"X-Treg-Cost-Micro": "125000", "X-Treg-Call-Id": f"c{n}", "X-Treg-Served-By": "falso"}, \
                {"output": {"phone": _tel(n)}}
        return 200, {"X-Treg-Cost-Micro": "0", "X-Treg-Call-Id": f"c{n}"}, {"output": {}}

    def __call__(self, metodo, url, headers, corpo):
        chave = headers.get("Idempotency-Key", "")
        lead_id = chave.split("-")[-2]
        self.chamadas.append((url, lead_id, dict(headers)))
        st, hs, dados = self.regra(lead_id, url)
        return st, hs, json.dumps(dados).encode()


def _enr(repo, transporte=None, token=TOKEN, **kw):
    kw.setdefault("relogio", lambda: AGORA)
    kw.setdefault("coletar_site", lambda dominio: {"whatsapp": [], "telefones": [], "emails": [], "ceps": [], "fonte": None})
    return enriquecer.Enriquecedor(repo, token=token, transporte=transporte or TregFalso(), **kw)


@pytest.fixture
def repo():
    r = Repo(":memory:")
    for i in range(1, 7):
        r.lead_put(_lead(i))
    r.lead_put(_lead(7, situacao="sair"))
    r.lead_put(_lead(8, situacao="fechou"))
    r.lead_put(_lead(9, decisores=[]))   # sem decisor: fora do alvo
    return r


# ---------------------------------------------------------------- contêiner

def test_importa_so_com_o_que_o_dockerfile_copia(tmp_path):
    """O Dockerfile copia só atendente/, prospeccao/scripts e prospeccao/msg para /app. As rotas do enriquecimento
    têm de carregar nesse recorte (só com o que ele copia), senão o servidor inteiro não sobe."""
    import os
    import shutil
    import subprocess
    import sys
    tools = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    docker = open(os.path.join(tools, "atendente", "Dockerfile"), encoding="utf-8").read()
    for origem in ("tools/atendente/atendente /app/atendente", "tools/prospeccao/scripts /app/scripts",
                   "tools/prospeccao/msg /app/msg"):
        assert f"COPY {origem}" in docker
    ign = shutil.ignore_patterns("__pycache__")
    shutil.copytree(os.path.join(tools, "atendente", "atendente"), tmp_path / "atendente", ignore=ign)
    shutil.copytree(os.path.join(tools, "prospeccao", "scripts"), tmp_path / "scripts", ignore=ign)
    shutil.copytree(os.path.join(tools, "prospeccao", "msg"), tmp_path / "msg", ignore=ign)
    (tmp_path / "central").mkdir()          # o Dockerfile também copia estes dois (aba Base, promover_base)
    for nome in ("__init__.py", "seed.py"):
        assert f"COPY tools/prospeccao/central/{nome} /app/central/{nome}" in docker
        shutil.copy(os.path.join(tools, "prospeccao", "central", nome), tmp_path / "central" / nome)
    codigo = ("import sys; sys.path.insert(0, sys.argv[1]); import atendente.servidor, atendente.rotas as r; "
              "assert any('enriquecer' in p.pattern for _, p, _ in r.ROTAS); "
              "import scripts.site_contatos, scripts.enriquecer_leads")
    r = subprocess.run([sys.executable, "-I", "-c", codigo, str(tmp_path)], cwd=str(tmp_path),
                       capture_output=True, text=True, timeout=60)
    assert r.returncode == 0, r.stderr


# ---------------------------------------------------------------- token

def test_token_vem_do_ambiente_e_aceita_treg_api_key():
    assert enriquecer.token_do_ambiente({"TREG_TOKEN": " a "}) == "a"
    assert enriquecer.token_do_ambiente({"TREG_API_KEY": "b"}) == "b"
    assert enriquecer.token_do_ambiente({"TREG_TOKEN": "", "TREG_API_KEY": ""}) is None


# ---------------------------------------------------------------- plano

def test_plano_conta_candidatos_custo_e_teto(repo):
    p = _enr(repo).plano()
    assert p["candidatos"] == 6
    assert p["ignorados"] == 2 and p["foraDoAlvo"] == 1
    assert p["tetoUsd"] == 10
    assert p["custoEstimadoUsd"] == pytest.approx(6 * 0.33 * 0.125, abs=0.01)
    assert p["disponivel"] is True


def test_estado_sem_token_explica_e_nao_deixa_iniciar(repo):
    e = _enr(repo, token=None)
    est = e.estado()
    assert est["disponivel"] is False and "TREG_TOKEN" in est["semToken"]
    with pytest.raises(enriquecer.Recusado, match="token"):
        e.iniciar("ana", confirmo=True)


def test_iniciar_exige_confirmacao_do_teto(repo):
    with pytest.raises(enriquecer.Recusado, match="US\\$ 10"):
        _enr(repo).iniciar("ana", confirmo=False)


def test_atendente_parado_nao_deixa_iniciar(repo):
    repo.config_set("status", "parado")
    with pytest.raises(enriquecer.Recusado, match="parado"):
        _enr(repo).iniciar("ana", confirmo=True)


def test_sem_candidatos_recusa(repo):
    r = Repo(":memory:")
    r.lead_put(_lead(1, situacao="sair"))
    with pytest.raises(enriquecer.Recusado, match="Nenhum lead"):
        _enr(r).iniciar("ana", confirmo=True)


# ---------------------------------------------------------------- rodada

def test_rodada_completa_grava_resultado_no_lead_e_historico(repo):
    t = TregFalso()
    e = _enr(repo, t)
    e.iniciar("ana", confirmo=True)
    assert e.esperar(5)
    est = e.estado()
    assert est["status"] == "concluido" and est["rodando"] is False
    pr = est["progresso"]
    assert pr["consultados"] == 6 and pr["achados"] == 3 and pr["gastoMicro"] == 375000 and pr["candidatos"] == 6
    assert len(est["historicoExecucoes"]) == 1
    h = est["historicoExecucoes"][0]
    assert h["achados"] == 3 and h["por"] == "ana" and h["motivoParada"] is None and h["simulado"] is False
    l1 = repo.lead_get("R0001")
    novo = [c for c in l1["contatos"] if c.get("papel") == "decisor"][0]
    assert novo["telefone"] == _tel(1) and "treg" in novo["fonte"]
    assert l1["buscaTreg"]["resultado"] == "achou" and l1["contatoAtivo"] == "k1"
    assert "ana" in l1["historico"][-1]["texto"]
    assert l1["pendencias"] == []
    l2 = repo.lead_get("R0002")
    assert l2["buscaTreg"]["resultado"] == "nao_achou" and not l2["contatos"]
    # sair/fechou nunca consultados nem mexidos
    assert repo.lead_get("R0007") == _lead(7, situacao="sair")
    assert {c[1] for c in t.chamadas} == {"R0001", "R0002", "R0003", "R0004", "R0005", "R0006"}
    assert all(c[2]["X-Treg-Token"] == TOKEN for c in t.chamadas)
    # já buscados há menos de 90 dias: a próxima rodada não tem o que fazer
    assert e.plano()["candidatos"] == 0


def test_token_nunca_vai_para_o_banco(repo):
    e = _enr(repo)
    e.iniciar("ana", confirmo=True)
    e.esperar(5)
    tudo = json.dumps([repo.config_get("enriquecimento"), repo.leads_todos(), e.estado()])
    assert TOKEN not in tudo


def test_uma_rodada_por_vez_e_parar(repo):
    liberar, entrou = threading.Event(), threading.Event()

    def regra(lead_id, url):
        entrou.set()
        liberar.wait(5)
        return 200, {"X-Treg-Cost-Micro": "0"}, {"output": {}}
    e = _enr(repo, TregFalso(regra))
    e.iniciar("ana", confirmo=True)
    assert entrou.wait(5)
    assert e.estado()["status"] == "executando" and e.estado()["rodando"] is True
    with pytest.raises(enriquecer.Ocupado):
        e.iniciar("ana", confirmo=True)
    e.parar("ana")
    liberar.set()
    assert e.esperar(5)
    est = e.estado()
    assert est["status"] == "parado" and est["motivoParada"] == "parado pela equipe"
    assert est["progresso"]["consultados"] == 1
    assert est["historicoExecucoes"][-1]["motivoParada"] == "parado pela equipe"


def test_parar_sem_rodada_recusa(repo):
    with pytest.raises(enriquecer.Recusado):
        _enr(repo).parar("ana")


def test_para_sozinho_no_teto_de_10_dolares():
    r = Repo(":memory:")
    for i in range(1, 11):
        r.lead_put(_lead(i))
    t = TregFalso(lambda lead_id, url: (200, {"X-Treg-Cost-Micro": "4000000"}, {"output": {"phone": _tel(1)}}))
    e = _enr(r, t)
    e.iniciar("ana", confirmo=True)
    e.esperar(5)
    est = e.estado()
    assert est["status"] == "parado" and est["motivoParada"] == "teto de US$10"
    assert len(t.chamadas) == 3 and est["progresso"]["gastoMicro"] == 12_000_000


def test_falha_de_uma_empresa_nao_derruba_a_rodada(repo):
    def regra(lead_id, url):
        if lead_id == "R0001":
            raise RuntimeError("quebrou do nada")
        if lead_id == "R0002":
            return 500, {}, {"detail": "x"}
        return TregFalso.padrao(lead_id, url)
    e = _enr(repo, TregFalso(regra))
    e.iniciar("ana", confirmo=True)
    e.esperar(5)
    est = e.estado()
    assert est["status"] == "concluido"
    assert est["progresso"]["erros"] == 2 and est["progresso"]["consultados"] == 4
    assert repo.lead_get("R0001")["buscaTreg"]["resultado"] == "erro"


def test_saldo_insuficiente_vira_mensagem_clara(repo):
    corpo = {"error": "insufficient_balance", "balance_micro": 0, "estimated_cost_micro": 150000,
             "topup_url": "https://treg.to/topup"}
    e = _enr(repo, TregFalso(lambda lead_id, url: (402, {}, corpo)))
    e.iniciar("ana", confirmo=True)
    e.esperar(5)
    est = e.estado()
    assert est["status"] == "parado" and est["motivoParada"] == "saldo insuficiente"
    assert "saldo" in est["motivoTexto"].lower() and "Traceback" not in json.dumps(est)
    assert "buscaTreg" not in repo.lead_get("R0001")


def test_parar_tudo_do_atendente_interrompe_a_rodada(repo):
    def regra(lead_id, url):
        repo.config_set("status", "parado")
        return 200, {"X-Treg-Cost-Micro": "0"}, {"output": {}}
    e = _enr(repo, TregFalso(regra))
    e.iniciar("ana", confirmo=True)
    e.esperar(5)
    est = e.estado()
    assert est["status"] == "parado" and est["progresso"]["consultados"] == 1
    assert "Parar tudo" in est["motivoParada"]


def test_simulacao_nao_gasta_nem_mexe_nos_leads(repo):
    antes = repo.leads_todos()
    e = _enr(repo, token=None, transporte=None)
    e.iniciar("ana", confirmo=True, simular=True)
    e.esperar(5)
    est = e.estado()
    assert est["status"] == "concluido" and est["simulado"] is True
    assert est["progresso"]["consultados"] == 6
    assert est["historicoExecucoes"][-1]["simulado"] is True
    assert repo.leads_todos() == antes


def test_contato_do_site_para_quem_nao_tem_telefone_nenhum():
    r = Repo(":memory:")
    r.lead_put(_lead(1, decisores=[]))                              # fora do treg, mas tem site e nenhum telefone
    r.lead_put(_lead(2, decisores=[], telefone=_tel(2)))             # já tem telefone: não visita o site
    r.lead_put(_lead(3, decisores=[], situacao="sair"))
    visitados = []

    def site(dominio):
        visitados.append(dominio)
        return {"whatsapp": [_tel(41)], "telefones": [], "emails": ["contato@empresa1.com.br"], "ceps": [],
                "fonte": "https://empresa1.com.br/contato"}
    e = _enr(r, coletar_site=site)
    p = e.plano()
    assert p["candidatos"] == 0 and p["site"] == 1
    e.iniciar("ana", confirmo=True)
    e.esperar(5)
    assert visitados == ["empresa1.com.br"]
    l1 = r.lead_get("R0001")
    c = l1["contatos"][-1]
    assert c["papel"] == "geral" and c["telefone"] == _tel(41) and c["whatsapp"] == "sim"
    assert l1["siteContatos"]["achou"] is True and l1["contatoAtivo"] == "k1"
    assert e.estado()["progresso"]["siteAchados"] == 1
    assert e.plano()["site"] == 0   # não visita de novo


def test_rodada_que_ficou_pela_metade_no_reinicio_aparece_parada(repo):
    repo.config_set("enriquecimento", {"status": "executando", "execucaoId": "E1", "historicoExecucoes": []})
    est = _enr(repo).estado()
    assert est["status"] == "parado" and "reiniciou" in est["motivoTexto"]


def test_limpeza_normaliza_telefones_antes_de_buscar():
    r = Repo(":memory:")
    r.lead_put(_lead(1, contatos=[{"id": "k1", "papel": "geral", "telefone": "(65) 99990-0011"}]))
    e = _enr(r)
    e.iniciar("ana", confirmo=True)
    e.esperar(5)
    assert r.lead_get("R0001")["contatos"][0]["telefone"] == _tel(11)


# ---------------------------------------------------------------- API

class Ctx:
    pass


@pytest.fixture
def ctx(repo):
    c = Ctx()
    c.repo = repo
    c.enr = _enr(repo)
    cfg = {"webhook_segredo": "segredo-de-teste-do-webhook", "segredo_sessao": "segredo-de-teste-da-sessao-bem-longo",
           "usuarios": dict(USUARIOS), "relogio": lambda: AGORA, "enriquecedor": c.enr}
    c.srv = servidor.criar_servidor(repo, object(), object(), cfg, "127.0.0.1", 0)
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


def test_api_exige_login(ctx):
    assert pedir(ctx, "GET", "/api/enriquecer")[0] == 401
    assert pedir(ctx, "POST", "/api/enriquecer/iniciar", {"confirmo": True})[0] == 401


def test_api_estado_plano_iniciar_409_e_historico(ctx):
    ck = entrar(ctx)
    st, est = pedir(ctx, "GET", "/api/enriquecer", cookie=ck)
    assert st == 200 and est["disponivel"] is True and est["status"] == "ocioso" and est["tetoUsd"] == 10
    st, p = pedir(ctx, "GET", "/api/enriquecer/plano", cookie=ck)
    assert st == 200 and p["candidatos"] == 6
    st, r = pedir(ctx, "POST", "/api/enriquecer/iniciar", {}, cookie=ck)
    assert st == 400 and "US$ 10" in r["erro"]
    st, r = pedir(ctx, "POST", "/api/enriquecer/iniciar", {"confirmo": True}, cookie=ck)
    assert st == 202 and r["status"] == "executando"
    ctx.enr.esperar(5)
    st, est = pedir(ctx, "GET", "/api/enriquecer", cookie=ck)
    assert est["status"] == "concluido" and len(est["historicoExecucoes"]) == 1
    st, r = pedir(ctx, "POST", "/api/enriquecer/parar", {}, cookie=ck)
    assert st == 409


def test_api_409_com_rodada_em_andamento(ctx):
    liberar, entrou = threading.Event(), threading.Event()

    def regra(lead_id, url):
        entrou.set()
        liberar.wait(5)
        return 200, {"X-Treg-Cost-Micro": "0"}, {"output": {}}
    ctx.enr.transporte = TregFalso(regra)
    ck = entrar(ctx)
    assert pedir(ctx, "POST", "/api/enriquecer/iniciar", {"confirmo": True}, cookie=ck)[0] == 202
    assert entrou.wait(5)
    st, r = pedir(ctx, "POST", "/api/enriquecer/iniciar", {"confirmo": True}, cookie=ck)
    assert st == 409 and "andamento" in r["erro"]
    st, r = pedir(ctx, "POST", "/api/enriquecer/parar", {}, cookie=ck)
    assert st == 200
    liberar.set()
    ctx.enr.esperar(5)
    assert pedir(ctx, "GET", "/api/enriquecer", cookie=ck)[1]["motivoParada"] == "parado pela equipe"


def test_api_sem_token(ctx):
    ctx.enr.token = None
    ck = entrar(ctx)
    st, est = pedir(ctx, "GET", "/api/enriquecer", cookie=ck)
    assert est["disponivel"] is False
    st, r = pedir(ctx, "POST", "/api/enriquecer/iniciar", {"confirmo": True}, cookie=ck)
    assert st == 400 and "token" in r["erro"]


def test_api_cria_o_enriquecedor_pelo_ambiente_sem_token(repo):
    cfg = {"webhook_segredo": "x" * 20, "segredo_sessao": "y" * 30, "usuarios": dict(USUARIOS),
           "relogio": lambda: AGORA, "ambiente": {}}
    srv = servidor.criar_servidor(repo, object(), object(), cfg, "127.0.0.1", 0)
    try:
        from atendente import api_enriquecer
        e = api_enriquecer.enriquecedor_do(srv)
        assert e is api_enriquecer.enriquecedor_do(srv) and e.estado()["disponivel"] is False
    finally:
        srv.server_close()

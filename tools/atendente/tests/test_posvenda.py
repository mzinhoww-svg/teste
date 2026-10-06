"""Leva 3: Pós-venda (clientes e etapas do config/posvenda), Novo cliente, Virar cliente e backup das tabelas novas.

Fixtures sintéticas na forma da Central antiga (clientes/<id>: nome, saudacao, telefone, email, produto, origem,
leadId, segmento, etapa, situacao, criadoEm, dataKickoff, dataGravacao, pvEnviadoN, pvConcluidoN). Nenhum dado real.
"""
import json
import os
import sqlite3
import tempfile

from atendente import api_posvenda

from test_servidor import AGORA, ctx, entrar, json_de, pedir  # noqa: F401  (fixture ctx)

PV = {
    "versao": "teste",
    "etapas": [
        {"n": 1, "nome": "Boas-vindas", "quando": "imediato", "texto": "Oi, {saudacao}, bem-vindos ao {produto}."},
        {"n": 2, "nome": "Kickoff", "quando": "data", "campoData": "dataKickoff", "vespera": False,
         "texto": "Oi, {saudacao}, confirmando o kickoff {quando}."},
        {"n": 3, "nome": "Gravação", "quando": "data", "campoData": "dataGravacao", "vespera": True,
         "texto": "Oi, {saudacao}, gravação {quando}, {local}. {preparo}"},
        {"n": 4, "nome": "Recorrência", "quando": 15, "texto": "Oi, {saudacao}. {recorrencia}"},
    ],
    "produtos": {"Hora de Estúdio": {"entregaveis": "os arquivos", "local": "aqui no estúdio"},
                 "Podcast In Loco": {"entregaveis": "o episódio", "local": "na sede de vocês"},
                 "Outro": {"entregaveis": "o material", "local": "no local combinado"}},
    "preparo": {"estudio": "Chegue 20 minutos antes.", "sede": "A equipe chega antes."},
    "recorrencia": {"padrao": "Vamos pensar num formato mensal?"},
}


def cliente(id_, **extra):
    c = {"id": id_, "nome": f"Cliente Fictício {id_}", "saudacao": "pessoal da Fictícia", "telefone": "5565999900001",
         "email": "", "produto": "Hora de Estúdio", "origem": "Cadastro manual", "leadId": None, "segmento": "",
         "etapa": 1, "situacao": "ativo", "criadoEm": "2026-10-01T12:00:00Z", "dataKickoff": None, "dataGravacao": None,
         "historico": []}
    c.update(extra)
    return c


# --------------------------------------------------------------------------- regras puras

def test_grupo_e_vencimento_seguem_a_central_antiga():
    hoje = AGORA  # quarta, 07/10, 11h em Cuiabá
    g = lambda c: api_posvenda.info_cliente(c, PV, hoje)["grupo"]  # noqa: E731
    assert g(cliente("a")) == "hoje"                                        # imediato
    assert g(cliente("a", pvEnviado1="2026-10-07T13:00:00Z")) == "andamento"  # já enviou a desta etapa
    assert g(cliente("a", etapa=2)) == "hoje"                               # falta marcar a data: é a ação do dia
    assert g(cliente("a", etapa=2, dataKickoff="2026-10-09T14:00")) == "hoje"
    assert g(cliente("a", etapa=3, dataGravacao="2026-10-08T09:00")) == "hoje"       # véspera é hoje
    assert g(cliente("a", etapa=3, dataGravacao="2026-10-10T09:00")) == "andamento"  # véspera é dia 09
    assert g(cliente("a", etapa=4, pvConcluido3="2026-10-01T12:00:00Z")) == "andamento"  # 15 dias depois
    assert g(cliente("a", etapa=4, pvConcluido3="2026-09-20T12:00:00Z")) == "hoje"
    assert g(cliente("a", situacao="pausado")) == "pausado"
    assert g(cliente("a", etapa=5)) == "concluido"
    assert g(cliente("a", situacao="concluido")) == "concluido"


def test_texto_da_etapa_preenche_os_campos():
    info = api_posvenda.info_cliente(cliente("a", produto="Podcast In Loco", etapa=3, dataGravacao="2026-10-09T14:00"),
                                     PV, AGORA)
    assert info["texto"] == "Oi, pessoal da Fictícia, gravação sexta, 09/10, às 14h, na sede de vocês. A equipe chega antes."
    assert info["link"].startswith("https://wa.me/5565999900001?text=Oi%2C%20pessoal")
    info = api_posvenda.info_cliente(cliente("a", etapa=2), PV, AGORA)
    assert info["precisaData"] is True and info["campoData"] == "dataKickoff" and info["link"] == ""
    info = api_posvenda.info_cliente(cliente("a", telefone="", email="contato@ficticia.example"), PV, AGORA)
    assert info["link"].startswith("mailto:contato@ficticia.example?subject=")


# --------------------------------------------------------------------------- lista

def test_posvenda_exige_login(ctx):
    for metodo, caminho in [("GET", "/api/posvenda"), ("POST", "/api/clientes"), ("GET", "/api/clientes/C1"),
                            ("POST", "/api/clientes/C1/acao"), ("POST", "/api/clientes/C1/data"),
                            ("POST", "/api/leads/L1/virar-cliente")]:
        assert pedir(ctx, metodo, caminho, {} if metodo == "POST" else None)[0] == 401, caminho


def test_posvenda_vazio_usa_textos_padrao(ctx):
    ck = entrar(ctx)
    r = json_de(pedir(ctx, "GET", "/api/posvenda", cookie=ck))
    assert r["clientes"] == [] and r["contagens"]["todos"] == 0
    assert r["configPadrao"] is True and len(r["config"]["etapas"]) >= 5    # msg/copy_posvenda.py
    assert "Outro" in r["produtos"]


def test_posvenda_lista_com_etapas_e_contagens(ctx):
    ctx.repo.config_set("posvenda", PV)
    ctx.repo.cliente_put(cliente("C1"))
    ctx.repo.cliente_put(cliente("C2", situacao="pausado"))
    ctx.repo.cliente_put(cliente("C3", etapa=3, dataGravacao="2026-10-10T09:00"))
    ctx.repo.cliente_put(cliente("C4", etapa=5, situacao="concluido"))
    ck = entrar(ctx)
    r = json_de(pedir(ctx, "GET", "/api/posvenda", cookie=ck))
    assert r["configPadrao"] is False
    assert r["contagens"] == {"todos": 4, "hoje": 1, "andamento": 1, "pausado": 1, "concluido": 1, "gravacoes7d": 1}
    ordem = [c["id"] for c in r["clientes"]]
    assert ordem[-1] == "C2"                          # pausado por último
    c1 = next(c for c in r["clientes"] if c["id"] == "C1")
    assert c1["pv"]["grupo"] == "hoje" and c1["pv"]["etapaNome"] == "Boas-vindas" and c1["pv"]["total"] == 4
    assert c1["pv"]["texto"] == "Oi, pessoal da Fictícia, bem-vindos ao Hora de Estúdio."
    assert pedir(ctx, "GET", "/api/clientes/C1", cookie=ck)[0] == 200
    assert pedir(ctx, "GET", "/api/clientes/C9", cookie=ck)[0] == 404


# --------------------------------------------------------------------------- novo cliente

def test_novo_cliente_valida_e_grava(ctx):
    ctx.repo.config_set("posvenda", PV)
    ck = entrar(ctx)
    ruins = [({}, "nome"), ({"nome": "X", "produto": "Outro"}, "WhatsApp ou um e-mail"),
             ({"nome": "X", "telefone": "123", "produto": "Outro"}, "DDD"),
             ({"nome": "X", "email": "sem-arroba", "produto": "Outro"}, "e-mail"),
             ({"nome": "X", "email": "a@b.example", "produto": "Inventado"}, "serviço"),
             ({"nome": "X", "email": "a@b.example", "produto": "Outro", "valor": -1}, "valor"),
             ({"nome": "X", "email": "a@b.example", "produto": "Outro", "valor": "muito"}, "valor")]
    for corpo, trecho in ruins:
        st, _, b = pedir(ctx, "POST", "/api/clientes", corpo, cookie=ck)
        assert st == 400 and trecho in json.loads(b)["erro"], (corpo, b)
    st, _, b = pedir(ctx, "POST", "/api/clientes", {"nome": "  Clínica Fictícia  ", "saudacao": "Dra. Exemplo",
                                                   "telefone": "(65) 99990-0002", "produto": "Hora de Estúdio",
                                                   "valor": 1500.5}, cookie=ck)
    assert st == 200, b
    r = json.loads(b)
    c = ctx.repo.cliente_get(r["id"])
    assert r["id"].startswith("C") and c["nome"] == "Clínica Fictícia" and c["telefone"] == "5565999900002"
    assert c["etapa"] == 1 and c["situacao"] == "ativo" and c["valor"] == 1500.5 and c["origem"] == "Cadastro manual"
    assert c["historico"][-1]["texto"].endswith("por ana") and c["leadId"] is None
    # sem saudação: usa um cumprimento neutro com o nome
    r = json_de(pedir(ctx, "POST", "/api/clientes", {"nome": "Outra Fictícia", "email": "oi@ficticia.example",
                                                      "produto": "Outro"}, cookie=ck))
    assert ctx.repo.cliente_get(r["id"])["saudacao"] == "pessoal da Outra Fictícia"
    assert len(ctx.repo.clientes_todos()) == 2


def test_virar_cliente_a_partir_do_lead(ctx):
    ctx.repo.config_set("posvenda", PV)
    ctx.repo.lead_put({"id": "L7", "nome": "Empresa Fictícia 7", "empresa": {"cnpj": ""}, "saudacao": "Maria",
                       "telefone": "(65) 99990-0007", "canal": "WhatsApp", "segmento": "Saúde", "situacao": "respondeu",
                       "etapa": 1, "agendamento": {"id": "ag7", "n": 2}, "historico": []})
    ck = entrar(ctx)
    st, _, b = pedir(ctx, "POST", "/api/leads/L7/virar-cliente", {"produto": "Podcast In Loco", "valor": 3000}, cookie=ck)
    assert st == 200, b
    assert json.loads(b) == {"ok": True, "id": "L7"}
    c = ctx.repo.cliente_get("L7")
    assert c["nome"] == "Empresa Fictícia 7" and c["leadId"] == "L7" and c["origem"] == "Prospecção"
    assert c["telefone"] == "5565999900007" and c["saudacao"] == "Maria" and c["valor"] == 3000
    lead = ctx.repo.lead_get("L7")
    assert lead["situacao"] == "fechou" and "agendamento" not in lead and ctx.wa.cancelados == ["ag7"]
    assert "Virou cliente" in lead["historico"][-1]["texto"] and "ana" in lead["historico"][-1]["texto"]
    st, _, b = pedir(ctx, "POST", "/api/leads/L7/virar-cliente", {"produto": "Outro"}, cookie=ck)
    assert st == 409 and "já é cliente" in json.loads(b)["erro"]
    assert pedir(ctx, "POST", "/api/leads/L404/virar-cliente", {"produto": "Outro"}, cookie=ck)[0] == 404
    assert pedir(ctx, "POST", "/api/leads/L7/virar-cliente", {"produto": "Nada"}, cookie=ck)[0] == 400


# --------------------------------------------------------------------------- etapas

def test_acoes_de_etapa(ctx):
    ctx.repo.config_set("posvenda", PV)
    ctx.repo.cliente_put(cliente("C1"))
    ck = entrar(ctx)

    def acao(a, st=200):
        s, _, b = pedir(ctx, "POST", "/api/clientes/C1/acao", {"acao": a}, cookie=ck)
        assert s == st, (a, b)
        return ctx.repo.cliente_get("C1")

    acao("voltar", 409)                                   # já está na primeira
    c = acao("enviado")
    assert c["pvEnviado1"] == "2026-10-07T15:00:00Z"
    c = acao("desfazer-enviado")
    assert "pvEnviado1" not in c
    c = acao("concluir")
    assert c["etapa"] == 2 and c["pvConcluido1"] == "2026-10-07T15:00:00Z"
    c = acao("voltar")
    assert c["etapa"] == 1 and "pvConcluido1" not in c
    c = acao("pausar")
    assert c["situacao"] == "pausado"
    acao("concluir", 409)                                 # pausado não anda
    c = acao("retomar")
    assert c["situacao"] == "ativo"
    for _ in range(4):
        c = acao("concluir")
    assert c["situacao"] == "concluido" and c["etapa"] == 5
    acao("concluir", 409)
    acao("inventada", 400)
    textos = [h["texto"] for h in c["historico"]]
    assert all(t.endswith("(ana)") for t in textos) and len(textos) >= 9
    assert pedir(ctx, "POST", "/api/clientes/C9/acao", {"acao": "concluir"}, cookie=ck)[0] == 404


def test_marcar_data(ctx):
    ctx.repo.config_set("posvenda", PV)
    ctx.repo.cliente_put(cliente("C1", etapa=2))
    ck = entrar(ctx)
    st, _, b = pedir(ctx, "POST", "/api/clientes/C1/data", {"campo": "dataKickoff", "valor": "2026-10-09T14:00"}, cookie=ck)
    assert st == 200, b
    assert ctx.repo.cliente_get("C1")["dataKickoff"] == "2026-10-09T14:00"
    assert json_de(pedir(ctx, "GET", "/api/clientes/C1", cookie=ck))["pv"]["precisaData"] is False
    assert pedir(ctx, "POST", "/api/clientes/C1/data", {"campo": "senha", "valor": ""}, cookie=ck)[0] == 400
    assert pedir(ctx, "POST", "/api/clientes/C1/data", {"campo": "dataKickoff", "valor": "amanhã"}, cookie=ck)[0] == 400
    pedir(ctx, "POST", "/api/clientes/C1/data", {"campo": "dataKickoff", "valor": ""}, cookie=ck)
    assert ctx.repo.cliente_get("C1")["dataKickoff"] is None


# --------------------------------------------------------------------------- backup

def test_backup_leva_base_e_clientes(ctx):
    ctx.repo.cliente_put(cliente("C1"))
    ctx.repo.base_put({"id": "D00001", "nome": "Associação Fictícia", "status": "base"})
    ck = entrar(ctx)
    st, _, dados = pedir(ctx, "GET", "/api/backup", cookie=ck)
    assert st == 200
    fd, tmp = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    try:
        with open(tmp, "wb") as fh:
            fh.write(dados)
        con = sqlite3.connect(tmp)
        assert con.execute("SELECT id, status FROM base").fetchall() == [("D00001", "base")]
        assert [r[0] for r in con.execute("SELECT id FROM clientes")] == ["C1"]
        con.close()
    finally:
        os.unlink(tmp)


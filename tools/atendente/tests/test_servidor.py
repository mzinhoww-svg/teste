import hashlib
import hmac
import http.client
import json
import os
import sqlite3
import tempfile
import threading
from datetime import datetime, timezone

import pytest

from atendente import servidor
from atendente.db import Repo
from scripts import wa_akg

SEGREDO_WEBHOOK = "segredo-de-teste-do-webhook"
SEGREDO_SESSAO = "segredo-de-teste-da-sessao-bem-longo"
USUARIOS = {"ana": "senha-inventada-ana", "beto": "senha-inventada-beto"}
AGORA = datetime(2026, 10, 7, 15, 0, tzinfo=timezone.utc)  # quarta, 11h em Cuiabá


class AtendenteFalso:
    def __init__(self):
        self.recebidas = []
        self.falhar = False

    def tratar_mensagem(self, m, agora):
        if self.falhar:
            raise RuntimeError("quebrou")
        self.recebidas.append((m, agora))
        return "respondida"


class WaFalso:
    def __init__(self):
        self.pendentes = []
        self.historico = []
        self.cancelados = []
        self.fora = False

    def conectado(self):
        if self.fora:
            raise wa_akg.WaAkgErro(0, "fora do ar")
        return True

    def agendadas(self, aba):
        if self.fora:
            raise wa_akg.WaAkgErro(0, "fora do ar")
        return list(self.pendentes if aba == "pending" else self.historico)

    def cancelar(self, id_):
        self.cancelados.append(id_)
        self.pendentes = [p for p in self.pendentes if p["id"] != id_]

    # envio imediato (a equipe escrevendo pela tela)
    enviados = None
    existem = None

    def verificar(self, numeros):
        if self.fora:
            raise wa_akg.WaAkgErro(0, "fora do ar")
        return {n: (f"{n}@s.whatsapp.net" if (self.existem is None or n in self.existem) else None) for n in numeros}

    def enviar_texto(self, jid, texto):
        if self.fora:
            raise wa_akg.WaAkgErro(503, "fora do ar")
        if self.enviados is None:
            self.enviados = []
        self.enviados.append((jid, texto))


class Ctx:
    pass


def _lead(i, **extra):
    d = {"id": f"L{i}", "nome": f"Lead {i}", "empresa": f"Empresa {i}", "canal": "whatsapp",
         "telefone": f"(65) 99990-00{i:02d}", "situacao": "ativo", "etapa": 1,
         "enviado1": "2026-10-01T15:00:00Z", "historico": []}
    d.update(extra)
    return d


@pytest.fixture
def ctx(tmp_path):
    c = Ctx()
    c.repo = Repo(":memory:")
    c.atendente = AtendenteFalso()
    c.wa = WaFalso()
    web = tmp_path / "web"
    web.mkdir()
    (web / "index.html").write_text("<html>tela</html>", encoding="utf-8")
    (web / "app.js").write_text("console.log(1)", encoding="utf-8")
    (tmp_path / "segredo.txt").write_text("NAO PODE SAIR", encoding="utf-8")
    cfg = {"webhook_segredo": SEGREDO_WEBHOOK, "segredo_sessao": SEGREDO_SESSAO, "usuarios": dict(USUARIOS),
           "pasta_web": str(web), "relogio": lambda: AGORA}
    c.cfg = cfg
    c.srv = servidor.criar_servidor(c.repo, c.atendente, c.wa, cfg, "127.0.0.1", 0)
    c.porta = c.srv.server_address[1]
    t = threading.Thread(target=lambda: c.srv.serve_forever(poll_interval=0.05), daemon=True)
    t.start()
    yield c
    c.srv.shutdown()
    c.srv.server_close()


def pedir(c, metodo, caminho, corpo=None, cookie=None, headers=None, bruto=None):
    con = http.client.HTTPConnection("127.0.0.1", c.porta, timeout=10)
    h = dict(headers or {})
    dados = bruto
    if corpo is not None:
        dados = json.dumps(corpo).encode("utf-8")
        h.setdefault("Content-Type", "application/json")
    if cookie:
        h["Cookie"] = cookie
    con.request(metodo, caminho, body=dados, headers=h)
    r = con.getresponse()
    corpo_resp = r.read()
    out = (r.status, dict((k.lower(), v) for k, v in r.getheaders()), corpo_resp)
    con.close()
    return out


def json_de(resp):
    return json.loads(resp[2].decode("utf-8"))


def entrar(c, usuario="ana"):
    st, h, _ = pedir(c, "POST", "/login", {"usuario": usuario, "senha": USUARIOS[usuario]})
    assert st == 200
    return h["set-cookie"].split(";")[0]


def assinar(corpo: bytes, segredo=SEGREDO_WEBHOOK):
    return {"X-Webhook-Signature": "sha256=" + hmac.new(segredo.encode(), corpo, hashlib.sha256).hexdigest()}


PAYLOAD = {"event": "message.received", "sessionId": "s", "timestamp": "2026-10-07T14:59:00Z",
           "data": {"key": {"remoteJid": "5565999900011@s.whatsapp.net", "fromMe": False, "id": "ABC1"},
                    "type": "TEXT", "content": "Oi, tenho interesse", "isGroup": False}}


def test_saude_sem_login(ctx):
    st, _, corpo = pedir(ctx, "GET", "/saude")
    assert st == 200 and json.loads(corpo) == {"ok": True}


def test_webhook_sem_assinatura_401_e_com_assinatura_200(ctx):
    corpo = json.dumps(PAYLOAD).encode()
    assert pedir(ctx, "POST", "/webhook", bruto=corpo)[0] == 401
    assert pedir(ctx, "POST", "/webhook", bruto=corpo, headers=assinar(corpo, "outro-segredo"))[0] == 401
    assert pedir(ctx, "POST", "/webhook", bruto=corpo, headers={"X-Webhook-Signature": "abc"})[0] == 401
    assert ctx.atendente.recebidas == []
    resp = pedir(ctx, "POST", "/webhook", bruto=corpo, headers=assinar(corpo))
    assert resp[0] == 200 and json_de(resp) == {"resultado": "respondida"}
    m, agora = ctx.atendente.recebidas[0]
    assert m.wa_id == "ABC1" and m.numero == "5565999900011" and m.texto == "Oi, tenho interesse"


def test_webhook_corpo_adulterado_401(ctx):
    corpo = json.dumps(PAYLOAD).encode()
    cab = assinar(corpo)
    adulterado = corpo.replace(b"interesse", b"desconto!")
    assert pedir(ctx, "POST", "/webhook", bruto=adulterado, headers=cab)[0] == 401
    assert ctx.atendente.recebidas == []


def test_webhook_evento_ignorado_responde_200_e_erro_interno_500(ctx):
    corpo = json.dumps({"event": "session.connected", "data": {}}).encode()
    resp = pedir(ctx, "POST", "/webhook", bruto=corpo, headers=assinar(corpo))
    assert resp[0] == 200 and json_de(resp) == {"resultado": "ignorada"}
    corpo = json.dumps(PAYLOAD).encode()
    ctx.atendente.falhar = True
    assert pedir(ctx, "POST", "/webhook", bruto=corpo, headers=assinar(corpo))[0] == 500


def test_webhook_sem_segredo_configurado_503(ctx):
    ctx.cfg["webhook_segredo"] = ""
    corpo = json.dumps(PAYLOAD).encode()
    assert pedir(ctx, "POST", "/webhook", bruto=corpo, headers=assinar(corpo, ""))[0] == 503


def test_api_sem_login_401(ctx):
    for metodo, caminho in [("GET", "/api/estado"), ("GET", "/api/leads"), ("GET", "/api/leads/L1"),
                            ("GET", "/api/atendimento"), ("GET", "/api/backup"),
                            ("POST", "/api/config"), ("POST", "/api/leads/L1/situacao"),
                            ("POST", "/api/leads/L1/nota")]:
        corpo = {} if metodo == "POST" else None
        assert pedir(ctx, metodo, caminho, corpo)[0] == 401, caminho


def test_login_certo_e_errado_e_bloqueio_apos_5(ctx):
    st, h, _ = pedir(ctx, "POST", "/login", {"usuario": "ana", "senha": USUARIOS["ana"]})
    assert st == 200
    sc = h["set-cookie"]
    assert sc.startswith("sessao=") and "HttpOnly" in sc and "SameSite=Strict" in sc and "Max-Age=43200" in sc
    assert pedir(ctx, "GET", "/api/estado", cookie=sc.split(";")[0])[0] == 200
    for _ in range(5):
        assert pedir(ctx, "POST", "/login", {"usuario": "ana", "senha": "errada"})[0] == 401
    # depois de 5 erros o IP fica bloqueado, até com a senha certa
    assert pedir(ctx, "POST", "/login", {"usuario": "ana", "senha": USUARIOS["ana"]})[0] == 429
    st, h, _ = pedir(ctx, "POST", "/logout", cookie=sc.split(";")[0])
    assert st == 200 and "Max-Age=0" in h["set-cookie"]


def test_login_usuario_inexistente_401(ctx):
    assert pedir(ctx, "POST", "/login", {"usuario": "ninguem", "senha": "x"})[0] == 401
    assert pedir(ctx, "POST", "/login", bruto=b"nao e json")[0] == 400


def test_cookie_adulterado_nao_vale(ctx):
    ck = entrar(ctx)
    valor = ck.split("=", 1)[1]
    corpo, assin = valor.rsplit(".", 1)
    assert pedir(ctx, "GET", "/api/estado", cookie=f"sessao={corpo}.{'0' * len(assin)}")[0] == 401
    assert pedir(ctx, "GET", "/api/estado", cookie=f"sessao={corpo}x.{assin}")[0] == 401
    assert pedir(ctx, "GET", "/api/estado", cookie="sessao=lixo")[0] == 401
    # assinado com outro segredo
    falso = servidor.assinar_sessao("outro-segredo", "ana", AGORA.timestamp() + 3600)
    assert pedir(ctx, "GET", "/api/estado", cookie=f"sessao={falso}")[0] == 401
    # expirado
    velho = servidor.assinar_sessao(SEGREDO_SESSAO, "ana", AGORA.timestamp() - 1)
    assert pedir(ctx, "GET", "/api/estado", cookie=f"sessao={velho}")[0] == 401
    # usuário que não existe mais
    fantasma = servidor.assinar_sessao(SEGREDO_SESSAO, "fantasma", AGORA.timestamp() + 3600)
    assert pedir(ctx, "GET", "/api/estado", cookie=f"sessao={fantasma}")[0] == 401


def test_estado_traz_painel_e_gasto(ctx):
    ctx.repo.gasto_add("m", 10, 10, 0.37, "2026-10-03T12:00:00Z")
    ctx.repo.gasto_add("m", 10, 10, 9.0, "2026-09-03T12:00:00Z")
    ctx.repo.atendimento_add(leadId="L1", em="2026-10-07T13:00:00Z", acao="sozinha")
    ctx.repo.atendimento_add(leadId="L2", em="2026-10-07T13:30:00Z", acao="avisou")
    ctx.repo.atendimento_add(leadId="L3", em="2026-10-07T13:40:00Z", acao="sair")
    ctx.repo.atendimento_add(leadId="L4", em="2026-10-07T13:50:00Z", acao="humano")
    ctx.repo.atendimento_add(leadId="L5", em="2026-10-06T13:00:00Z", acao="avisou")
    ctx.wa.pendentes = [{"id": "p1", "sendAt": "2026-10-07T16:00:00Z", "status": "PENDING"},
                        {"id": "p2", "sendAt": "2026-10-07T16:30:00Z", "status": "PENDING"}]
    ctx.wa.historico = [{"id": "h1", "sendAt": "2026-10-07T13:00:00Z", "status": "SENT"},
                        {"id": "h2", "sendAt": "2026-10-06T13:00:00Z", "status": "SENT"},
                        {"id": "h3", "sendAt": "2026-10-07T13:30:00Z", "status": "FAILED"}]
    e = json_de(pedir(ctx, "GET", "/api/estado", cookie=entrar(ctx)))
    assert e["config"] == {"status": "pausado", "auto_resposta": False, "por_lote": 3, "limite_dia": 12,
                           "modelo": e["config"]["modelo"], "teto_usd_mes": 5.0}
    assert e["config"]["modelo"]
    assert e["painel"] == {"naFila": 2, "enviadasHoje": 1, "respostasHoje": 3, "autoHoje": 1,
                           "avisosHoje": 1, "gastoMesUsd": pytest.approx(0.37)}
    assert e["wa"] == {"conectado": True}


def test_estado_com_wa_fora_devolve_null(ctx):
    ctx.wa.fora = True
    e = json_de(pedir(ctx, "GET", "/api/estado", cookie=entrar(ctx)))
    assert e["wa"] == {"conectado": False}
    assert e["painel"]["naFila"] is None and e["painel"]["enviadasHoje"] is None
    assert e["painel"]["gastoMesUsd"] == 0


def test_config_valida_limites_e_recusa_invalido(ctx):
    ck = entrar(ctx)
    ok = {"status": "ativo", "auto_resposta": True, "por_lote": 10, "limite_dia": 60,
          "modelo": "um/modelo", "teto_usd_mes": 50}
    r = pedir(ctx, "POST", "/api/config", ok, cookie=ck)
    assert r[0] == 200 and json_de(r)["config"] == ok
    assert ctx.repo.config_get("status") == "ativo" and ctx.repo.config_get("por_lote") == 10
    ruins = [{"status": "ligado"}, {"status": 1}, {"auto_resposta": "sim"}, {"auto_resposta": 1},
             {"por_lote": 0}, {"por_lote": 11}, {"por_lote": "3"}, {"por_lote": True}, {"por_lote": 2.5},
             {"limite_dia": 0}, {"limite_dia": 61}, {"modelo": ""}, {"modelo": "   "}, {"modelo": "x" * 81},
             {"modelo": 3}, {"teto_usd_mes": -1}, {"teto_usd_mes": 50.01}, {"teto_usd_mes": "5"},
             {"teto_usd_mes": True}, {"desconhecido": 1}, {}]
    for ruim in ruins:
        r = pedir(ctx, "POST", "/api/config", ruim, cookie=ck)
        assert r[0] == 400, ruim
        assert json_de(r)["erro"], ruim
    # um campo ruim junto com um bom não grava nada
    r = pedir(ctx, "POST", "/api/config", {"por_lote": 1, "limite_dia": 99}, cookie=ck)
    assert r[0] == 400 and ctx.repo.config_get("por_lote") == 10
    # teto 0 e limites mínimos valem
    assert pedir(ctx, "POST", "/api/config", {"teto_usd_mes": 0, "por_lote": 1, "limite_dia": 1}, cookie=ck)[0] == 200


def test_config_chama_o_gancho_ao_mudar(ctx):
    vistos = []
    ctx.cfg["ao_mudar_config"] = vistos.append
    pedir(ctx, "POST", "/api/config", {"modelo": "outro/modelo"}, cookie=entrar(ctx))
    assert vistos and vistos[-1]["modelo"] == "outro/modelo"


def test_parado_cancela_pendentes(ctx):
    ctx.repo.lead_put(_lead(1, agendamento={"n": 2, "id": "p1", "sendAt": "2026-10-07T16:00:00Z", "jid": "j"}))
    ctx.repo.lead_put(_lead(2, agendamento={"n": 2, "id": "ja-saiu", "sendAt": "2026-10-07T13:00:00Z", "jid": "j"}))
    ctx.repo.lead_put(_lead(3))
    ctx.wa.pendentes = [{"id": "p1", "sendAt": "2026-10-07T16:00:00Z"}, {"id": "p9", "sendAt": "2026-10-07T17:00:00Z"}]
    r = pedir(ctx, "POST", "/api/config", {"status": "parado"}, cookie=entrar(ctx))
    assert r[0] == 200 and json_de(r)["cancelados"] == 2
    assert sorted(ctx.wa.cancelados) == ["p1", "p9"]
    assert ctx.repo.config_get("status") == "parado"
    l1, l2 = ctx.repo.lead_get("L1"), ctx.repo.lead_get("L2")
    assert "agendamento" not in l1 and "cancelado" in l1["historico"][-1]["texto"].lower()
    assert l2["agendamento"]["id"] == "ja-saiu"  # não estava pendente: fica para a conferência


def test_parado_grava_mesmo_com_wa_fora(ctx):
    ctx.wa.fora = True
    r = pedir(ctx, "POST", "/api/config", {"status": "parado"}, cookie=entrar(ctx))
    assert r[0] == 200 and ctx.repo.config_get("status") == "parado"
    assert json_de(r)["erroCancelar"]


def test_leads_agrupados_por_coluna(ctx):
    r = ctx.repo
    r.lead_put(_lead(1, situacao="sair"))
    r.lead_put(_lead(2, situacao="fechou"))
    r.lead_put(_lead(3, situacao="respondeu", historico=[
        {"em": "2026-10-07T13:00:00Z", "texto": "ATENÇÃO: pediu orçamento"}]))
    r.lead_put(_lead(4, telefone="", canal="instagram"))
    r.lead_put(_lead(5, etapa=0, enviado1=None))                       # vence hoje
    r.lead_put(_lead(6, etapa=1, enviado1="2026-10-07T12:00:00Z"))     # enviado hoje: aguarda
    r.lead_put(_lead(7, empresa=None, nome="So Nome", enviado1="2026-10-07T12:00:00Z"))
    r.msg_add("L3", "j", False, "Quero saber o preço", "TEXT", "w1", "2026-10-07T13:00:00Z")
    r.msg_add("L3", "j", True, "Já te chamo", "TEXT", "w2", "2026-10-07T13:05:00Z")
    r2 = json_de(pedir(ctx, "GET", "/api/leads", cookie=entrar(ctx)))
    por_id = {l["id"]: l for l in r2}
    assert {k: por_id[k]["coluna"] for k in por_id} == {
        "L1": "Saíram", "L2": "Fecharam", "L3": "Responderam", "L4": "Sem contato", "L5": "Para hoje",
        "L6": "Aguardando", "L7": "Aguardando"}
    assert por_id["L3"]["ultimaMensagem"]["texto"] == "Já te chamo"
    assert por_id["L3"]["atencao"] == "ATENÇÃO: pediu orçamento"
    assert por_id["L1"]["ultimaMensagem"] is None and por_id["L1"]["atencao"] is None
    assert por_id["L1"]["empresa"] == "Lead 1" and por_id["L7"]["empresa"] == "So Nome"   # nome é o nome da empresa
    assert {"id", "nome", "empresa", "coluna", "etapa", "situacao", "ultimaMensagem", "atencao"} <= set(por_id["L1"])
    assert "telefone" not in por_id["L1"]           # o resumo vai para a lista inteira: telefone só mascarado


def test_lead_completo_com_mensagens_e_404(ctx):
    ctx.repo.lead_put(_lead(1))
    ctx.repo.msg_add("L1", "j", False, "Oi", "TEXT", "w1", "2026-10-07T13:00:00Z")
    ck = entrar(ctx)
    d = json_de(pedir(ctx, "GET", "/api/leads/L1", cookie=ck))
    assert d["id"] == "L1" and d["mensagens"][0]["texto"] == "Oi" and d["mensagens"][0]["de_mim"] is False
    assert pedir(ctx, "GET", "/api/leads/NAO", cookie=ck)[0] == 404


def test_situacao_e_nota_gravam_no_historico(ctx):
    ctx.repo.lead_put(_lead(1, agendamento={"n": 2, "id": "p1", "sendAt": "x", "jid": "j"}))
    ctx.wa.pendentes = [{"id": "p1", "sendAt": "2026-10-07T16:00:00Z"}]
    ck = entrar(ctx, "beto")
    r = pedir(ctx, "POST", "/api/leads/L1/situacao", {"situacao": "sair"}, cookie=ck)
    assert r[0] == 200
    l = ctx.repo.lead_get("L1")
    assert l["situacao"] == "sair" and "sair" in l["historico"][-1]["texto"] and "beto" in l["historico"][-1]["texto"]
    assert "agendamento" not in l and ctx.wa.cancelados == ["p1"]  # quem saiu não recebe o envio agendado
    assert pedir(ctx, "POST", "/api/leads/L1/situacao", {"situacao": "banido"}, cookie=ck)[0] == 400
    assert pedir(ctx, "POST", "/api/leads/NAO/situacao", {"situacao": "ativo"}, cookie=ck)[0] == 404
    assert pedir(ctx, "POST", "/api/leads/L1/situacao", {"situacao": "ativo"}, cookie=ck)[0] == 200
    assert ctx.repo.lead_get("L1")["situacao"] == "ativo"
    r = pedir(ctx, "POST", "/api/leads/L1/nota", {"texto": "  Ligou de volta  "}, cookie=ck)
    assert r[0] == 200
    ult = ctx.repo.lead_get("L1")["historico"][-1]
    assert "Ligou de volta" in ult["texto"] and "beto" in ult["texto"] and ult["em"] == "2026-10-07T15:00:00Z"
    assert pedir(ctx, "POST", "/api/leads/L1/nota", {"texto": "   "}, cookie=ck)[0] == 400
    assert pedir(ctx, "POST", "/api/leads/L1/nota", {"texto": "x" * 1001}, cookie=ck)[0] == 400


def test_atendimento_lista_com_limite(ctx):
    for i in range(5):
        ctx.repo.atendimento_add(leadId=f"L{i}", em=f"2026-10-07T13:0{i}:00Z", acao="sozinha")
    ck = entrar(ctx)
    assert len(json_de(pedir(ctx, "GET", "/api/atendimento?limite=3", cookie=ck))) == 3
    assert len(json_de(pedir(ctx, "GET", "/api/atendimento", cookie=ck))) == 5
    assert pedir(ctx, "GET", "/api/atendimento?limite=abc", cookie=ck)[0] == 400


def test_backup_baixa_banco_valido(ctx, tmp_path):
    ctx.repo.lead_put(_lead(1))
    st, h, corpo = pedir(ctx, "GET", "/api/backup", cookie=entrar(ctx))
    assert st == 200 and "attachment" in h["content-disposition"]
    arq = tmp_path / "copia.db"
    arq.write_bytes(corpo)
    con = sqlite3.connect(str(arq))
    assert con.execute("SELECT id FROM leads").fetchall() == [("L1",)]
    assert con.execute("PRAGMA integrity_check").fetchone() == ("ok",)
    con.close()


def test_corpo_gigante_413(ctx):
    grande = b"x" * (1024 * 1024 + 1)
    assert pedir(ctx, "POST", "/webhook", bruto=grande)[0] == 413
    assert pedir(ctx, "POST", "/login", bruto=grande)[0] == 413
    assert pedir(ctx, "POST", "/api/config", bruto=grande, cookie=entrar(ctx))[0] == 413


def test_estaticos_servem_e_nao_saem_da_pasta_web(ctx):
    st, h, corpo = pedir(ctx, "GET", "/")
    assert st == 200 and corpo == b"<html>tela</html>" and h["content-type"].startswith("text/html")
    st, h, _ = pedir(ctx, "GET", "/app.js")
    assert st == 200 and "javascript" in h["content-type"]
    assert pedir(ctx, "GET", "/nao-existe.css")[0] == 404
    for caminho in ["/../segredo.txt", "/%2e%2e/segredo.txt", "/..%2fsegredo.txt", "/a/../../segredo.txt",
                    "/%2e%2e%2fsegredo.txt", "/..\\segredo.txt", "/app.js%00.png"]:
        st, _, corpo = pedir(ctx, "GET", caminho)
        assert st in (400, 403, 404) and b"NAO PODE SAIR" not in corpo, caminho
    # socket cru: o cliente http.client normaliza menos, mas o caminho "../" literal precisa falhar também
    con = http.client.HTTPConnection("127.0.0.1", ctx.porta, timeout=10)
    con.request("GET", "/../segredo.txt")
    r = con.getresponse()
    assert b"NAO PODE SAIR" not in r.read()
    con.close()


# ---- status "aguardando", IP atrás do proxy, Path do cookie

def test_config_aceita_aguardando_e_ligar_liga_a_auto_resposta(ctx):
    ck = entrar(ctx)
    ctx.repo.config_set("status", "aguardando")
    ctx.repo.config_set("auto_resposta", False)
    assert json_de(pedir(ctx, "GET", "/api/estado", cookie=ck))["config"]["status"] == "aguardando"
    r = pedir(ctx, "POST", "/api/config", {"status": "ativo"}, cookie=ck)
    assert r[0] == 200
    assert json_de(r)["config"]["status"] == "ativo" and json_de(r)["config"]["auto_resposta"] is True
    assert ctx.repo.config_get("auto_resposta") is True
    # voltar para aguardando é aceito
    assert pedir(ctx, "POST", "/api/config", {"status": "aguardando"}, cookie=ck)[0] == 200


def test_ligar_respeita_auto_resposta_enviada_e_so_vale_saindo_de_aguardando(ctx):
    ck = entrar(ctx)
    ctx.repo.config_set("status", "aguardando")
    pedir(ctx, "POST", "/api/config", {"status": "ativo", "auto_resposta": False}, cookie=ck)
    assert ctx.repo.config_get("auto_resposta") is False
    # fora de "aguardando", ativar não mexe na auto_resposta (retomar depois de parar)
    ctx.repo.config_set("status", "parado")
    pedir(ctx, "POST", "/api/config", {"status": "ativo"}, cookie=ck)
    assert ctx.repo.config_get("auto_resposta") is False


@pytest.mark.parametrize("peer,xff,esperado", [
    ("172.18.0.1", "203.0.113.9", "203.0.113.9"),
    ("10.0.0.5", "198.51.100.7, 203.0.113.9", "203.0.113.9"),
    ("192.168.1.2", "203.0.113.9", "203.0.113.9"),
    ("127.0.0.1", "203.0.113.9", "203.0.113.9"),
    ("::1", "203.0.113.9", "203.0.113.9"),
    ("8.8.4.4", "203.0.113.9", "8.8.4.4"),   # peer público: XFF forjado não vale
    ("172.18.0.1", None, "172.18.0.1"),
    ("172.18.0.1", "lixo", "172.18.0.1"),
])
def test_ip_do_cliente_so_confia_em_proxy_local_ou_privado(peer, xff, esperado):
    assert servidor.ip_do_cliente(peer, xff) == esperado


def test_bloqueio_de_login_conta_o_ip_do_xff(ctx):
    h = {"X-Forwarded-For": "203.0.113.9"}
    for _ in range(5):
        assert pedir(ctx, "POST", "/login", {"usuario": "ana", "senha": "errada"}, headers=h)[0] == 401
    assert pedir(ctx, "POST", "/login", {"usuario": "ana", "senha": USUARIOS["ana"]}, headers=h)[0] == 429
    # outra pessoa, outro IP, não é afetada
    h2 = {"X-Forwarded-For": "203.0.113.10"}
    assert pedir(ctx, "POST", "/login", {"usuario": "ana", "senha": USUARIOS["ana"]}, headers=h2)[0] == 200


def _cookie_login(ctx, headers=None):
    st, h, _ = pedir(ctx, "POST", "/login", {"usuario": "ana", "senha": USUARIOS["ana"]}, headers=headers)
    assert st == 200
    return h["set-cookie"]


def test_cookie_path_padrao_e_com_prefixo(ctx):
    assert "Path=/;" in _cookie_login(ctx)
    sc = _cookie_login(ctx, {"X-Forwarded-Prefix": "/central"})
    assert "Path=/central/;" in sc
    st, h, _ = pedir(ctx, "POST", "/logout", cookie=sc.split(";")[0], headers={"X-Forwarded-Prefix": "/central"})
    assert "Path=/central/;" in h["set-cookie"] and "Max-Age=0" in h["set-cookie"]


@pytest.mark.parametrize("ruim", ["/; Domain=evil.com", "central", "/a/b", "/Central", "/", "//x", "/x y"])
def test_cookie_ignora_prefixo_malicioso(ctx, ruim):
    sc = _cookie_login(ctx, {"X-Forwarded-Prefix": ruim})
    assert "Path=/;" in sc and "Domain" not in sc


def test_empresa_no_formato_real_da_central_e_um_objeto_e_o_nome_vem_de_nome(ctx):
    """Nos dados reais da Central, `empresa` é um objeto (dados do CNPJ, às vezes vazio) e o nome fica em `nome`.
    A tela mostrava "[object Object]" nos cards."""
    r = ctx.repo
    r.lead_put(_lead(1, nome="Espósito Advocacia", empresa={"cnpj": "", "cnae": "", "municipio": "Cuiabá"}))
    r.lead_put(_lead(2, nome="Abrace Energia", empresa={}))
    r.lead_put(_lead(3, nome="", empresa={"razaoSocial": "Razão Social Ltda"}))
    r.lead_put(_lead(4, nome="Só texto", empresa="Empresa em texto"))
    r.lead_put(_lead(5, nome=None, empresa=None))
    cookie = entrar(ctx)
    por_id = {l["id"]: l for l in json_de(pedir(ctx, "GET", "/api/leads", cookie=cookie))}
    assert por_id["L1"]["empresa"] == "Espósito Advocacia"
    assert por_id["L2"]["empresa"] == "Abrace Energia"
    assert por_id["L3"]["empresa"] == "Razão Social Ltda"
    assert por_id["L4"]["empresa"] == "Só texto"
    assert por_id["L5"]["empresa"] == "Sem nome"
    for l in por_id.values():
        assert isinstance(l["empresa"], str) and "object" not in l["empresa"].lower()
    d = json_de(pedir(ctx, "GET", "/api/leads/L1", cookie=cookie))
    assert d["empresa"] == "Espósito Advocacia"                       # texto, para a tela
    assert d["empresaDados"]["municipio"] == "Cuiabá"                 # o objeto original continua disponível


# --------------------------------------------------------------------------- equipe responde pela tela

def test_equipe_envia_mensagem_pela_tela_e_fica_registrado(ctx):
    ctx.repo.lead_put(_lead(1, telefone="(65) 99990-0011", situacao="ativo",
                            agendamento={"n": 2, "id": "s1", "sendAt": "2026-10-08T13:00:00Z", "jid": "x"}))
    ctx.wa.pendentes = [{"id": "s1", "jid": "5565999900011@s.whatsapp.net"}]
    cookie = entrar(ctx)
    r = pedir(ctx, "POST", "/api/leads/L1/enviar", {"texto": "  Oi! Posso te ligar hoje às 15h?  "}, cookie=cookie)
    assert r[0] == 200, r
    assert ctx.wa.enviados == [("5565999900011@s.whatsapp.net", "Oi! Posso te ligar hoje às 15h?")]
    lead = ctx.repo.lead_get("L1")
    assert lead["situacao"] == "respondeu" and "agendamento" not in lead         # conversa começou: sai da cadência
    assert ctx.wa.cancelados == ["s1"]                                           # e o toque pendente é cancelado
    assert any("ana" in h["texto"] and "Posso te ligar" in h["texto"] for h in lead["historico"])
    msgs = ctx.repo.msgs_do_lead("L1")
    assert msgs[-1]["de_mim"] is True and msgs[-1]["texto"] == "Oi! Posso te ligar hoje às 15h?"
    linha = ctx.repo.atendimento_lista(10, "L1")[0]
    assert linha["acao"] == "humano" and linha["humanoRespondeu"] is True


def test_envio_pela_tela_recusa_texto_vazio_longo_lead_que_saiu_e_numero_sem_whatsapp(ctx):
    ctx.repo.lead_put(_lead(1, telefone="(65) 99990-0011"))
    ctx.repo.lead_put(_lead(2, telefone="(65) 99990-0022", situacao="sair"))
    ctx.repo.lead_put(_lead(3, telefone="(65) 99990-0033"))
    ctx.wa.existem = ["5565999900011"]
    cookie = entrar(ctx)
    assert pedir(ctx, "POST", "/api/leads/L1/enviar", {"texto": "   "}, cookie=cookie)[0] == 400
    assert pedir(ctx, "POST", "/api/leads/L1/enviar", {"texto": "a" * 1001}, cookie=cookie)[0] == 400
    assert pedir(ctx, "POST", "/api/leads/L1/enviar", {"texto": 123}, cookie=cookie)[0] == 400
    r = pedir(ctx, "POST", "/api/leads/L2/enviar", {"texto": "oi"}, cookie=cookie)
    assert r[0] == 409 and "sair" in json_de(r)["erro"].lower()
    r = pedir(ctx, "POST", "/api/leads/L3/enviar", {"texto": "oi"}, cookie=cookie)
    assert r[0] == 400 and "whatsapp" in json_de(r)["erro"].lower()
    assert not ctx.wa.enviados                                                   # nada saiu em nenhum caso


def test_envio_pela_tela_exige_login_e_mostra_erro_se_o_whatsapp_cair(ctx):
    ctx.repo.lead_put(_lead(1, telefone="(65) 99990-0011"))
    assert pedir(ctx, "POST", "/api/leads/L1/enviar", {"texto": "oi"})[0] == 401
    ctx.wa.fora = True
    r = pedir(ctx, "POST", "/api/leads/L1/enviar", {"texto": "oi"}, cookie=entrar(ctx))
    assert r[0] == 502 and "whatsapp" in json_de(r)["erro"].lower()
    assert ctx.repo.lead_get("L1")["situacao"] == "ativo"                        # não mudou nada se não enviou
    assert pedir(ctx, "POST", "/api/leads/L404/enviar", {"texto": "oi"}, cookie=entrar(ctx))[0] == 404

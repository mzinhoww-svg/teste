"""Leva 2: mover card entre colunas, ver o próximo toque e enviar o toque agora (api_acoes.py).

Servidor real em porta efêmera, banco em memória, WhatsApp falso. Leads no formato real da Central (nome = empresa,
empresa = dict, toques com mensagem). Números 100% fictícios."""
import threading
from datetime import datetime, timezone

import pytest

from atendente import servidor
from atendente.db import Repo
from scripts import wa_akg
from test_servidor import AtendenteFalso, Ctx, WaFalso, USUARIOS, SEGREDO_SESSAO, SEGREDO_WEBHOOK, entrar, json_de, pedir

AGORA = datetime(2026, 10, 7, 15, 0, tzinfo=timezone.utc)  # quarta, 11h em Cuiabá
FOTOS = "https://fotos.exemplo.invalid/fotos"
TOQUE1 = ("Oi, Paulo, tudo bem? Aqui é a Letícia, da Reiners Media. Te mandei uma foto do nosso estúdio.")


class WaComAgenda(WaFalso):
    def __init__(self):
        super().__init__()
        self.agendados_agora = []
        self.falhar_agendar = False
        self.falhar_cancelar = False

    def agendar(self, jid, texto, send_at, midia_url=None):
        if self.fora or self.falhar_agendar:
            raise wa_akg.WaAkgErro(503, "fora do ar")
        self.agendados_agora.append({"jid": jid, "texto": texto, "sendAt": send_at, "midia": midia_url})
        id_ = f"ag-{len(self.agendados_agora)}"
        self.pendentes.append({"id": id_, "jid": jid, "sendAt": send_at, "status": "PENDING"})
        return id_

    def cancelar(self, id_):
        if self.fora or self.falhar_cancelar:
            raise wa_akg.WaAkgErro(503, "fora do ar")
        super().cancelar(id_)


def lead_real(i, **extra):
    """Forma real: `nome` é a empresa, `empresa` é um dict do CNPJ, canal "WhatsApp", toques com mensagem."""
    d = {"id": f"L{i}", "nome": f"Empresa Fictícia {i}", "empresa": {"cnpj": "", "municipio": "Cuiabá"},
         "canal": "WhatsApp", "telefone": f"(65) 99990-00{i:02d}", "situacao": "ativo", "etapa": 0,
         "saudacao": "Paulo", "foto": "estudio-a", "contatos": [], "decisores": [],
         "toques": [{"n": 1, "mensagem": TOQUE1, "assunto": "", "corpo": "", "waLink": ""},
                    {"n": 2, "mensagem": "Oi, Paulo, é a Letícia de novo, da Reiners Media.", "assunto": "", "corpo": "", "waLink": ""},
                    {"n": 3, "mensagem": "Oi, Paulo, prometo que é a última.", "assunto": "", "corpo": "", "waLink": ""}],
         "historico": []}
    d.update(extra)
    return d


@pytest.fixture
def ctx(tmp_path):
    c = Ctx()
    c.repo = Repo(":memory:")
    c.atendente = AtendenteFalso()
    c.wa = WaComAgenda()
    web = tmp_path / "web"
    web.mkdir()
    (web / "index.html").write_text("<html>tela</html>", encoding="utf-8")
    c.cfg = {"webhook_segredo": SEGREDO_WEBHOOK, "segredo_sessao": SEGREDO_SESSAO, "usuarios": dict(USUARIOS),
             "pasta_web": str(web), "relogio": lambda: AGORA, "fotos_url": FOTOS}
    c.srv = servidor.criar_servidor(c.repo, c.atendente, c.wa, c.cfg, "127.0.0.1", 0)
    c.porta = c.srv.server_address[1]
    threading.Thread(target=lambda: c.srv.serve_forever(poll_interval=0.05), daemon=True).start()
    yield c
    c.srv.shutdown()
    c.srv.server_close()


def mover(c, lead_id, coluna, cookie):
    return pedir(c, "POST", f"/api/leads/{lead_id}/mover", {"coluna": coluna}, cookie=cookie)


# --------------------------------------------------------------------------- mover

@pytest.mark.parametrize("coluna,situacao", [("Responderam", "respondeu"), ("Saíram", "sair"), ("Fecharam", "fechou")])
def test_mover_para_coluna_de_saida_muda_situacao_e_cancela_o_agendado(ctx, coluna, situacao):
    ctx.repo.lead_put(lead_real(1, etapa=1, enviado1="2026-10-01T15:00:00Z",
                                agendamento={"n": 2, "id": "s1", "sendAt": "2026-10-08T13:00:00Z", "jid": "x"}))
    ctx.wa.pendentes = [{"id": "s1"}]
    cookie = entrar(ctx)
    r = mover(ctx, "L1", coluna, cookie)
    assert r[0] == 200, r
    d = json_de(r)
    assert d["coluna"] == coluna and d["situacao"] == situacao and d["situacaoAntes"] == "ativo"
    lead = ctx.repo.lead_get("L1")
    assert lead["situacao"] == situacao and "agendamento" not in lead
    assert ctx.wa.cancelados == ["s1"]
    assert any(coluna in h["texto"] and "ana" in h["texto"] for h in lead["historico"])
    # a coluna da tela acompanha
    cards = {l["id"]: l for l in json_de(pedir(ctx, "GET", "/api/leads", cookie=cookie))}
    assert cards["L1"]["coluna"] == coluna


def test_mover_de_volta_para_a_cadencia_vira_ativo_e_diz_onde_o_card_ficou(ctx):
    ctx.repo.lead_put(lead_real(1, situacao="respondeu", etapa=1, enviado1="2026-10-06T15:00:00Z"))
    ctx.repo.lead_put(lead_real(2, situacao="sair"))
    cookie = entrar(ctx)
    r = mover(ctx, "L1", "Para hoje", cookie)                     # o toque 2 só vence daqui a 4 dias
    assert r[0] == 200
    d = json_de(r)
    assert ctx.repo.lead_get("L1")["situacao"] == "ativo"
    assert d["coluna"] == "Aguardando" and "aviso" in d and "Aguardando" in d["aviso"]
    r = mover(ctx, "L2", "Aguardando", cookie)                    # sem toque ainda: vence hoje
    d = json_de(r)
    assert r[0] == 200 and d["coluna"] == "Para hoje" and d["situacaoAntes"] == "sair"


def test_mover_para_sem_contato_e_recusado_com_mensagem_clara_e_nao_muda_nada(ctx):
    ctx.repo.lead_put(lead_real(1))
    cookie = entrar(ctx)
    r = mover(ctx, "L1", "Sem contato", cookie)
    assert r[0] == 409 and "automátic" in json_de(r)["erro"].lower()
    lead = ctx.repo.lead_get("L1")
    assert lead["situacao"] == "ativo" and lead["historico"] == []


def test_mover_valida_coluna_lead_e_login(ctx):
    ctx.repo.lead_put(lead_real(1))
    assert mover(ctx, "L1", "Fecharam", None)[0] == 401
    cookie = entrar(ctx)
    assert mover(ctx, "L1", "Coluna inventada", cookie)[0] == 400
    assert pedir(ctx, "POST", "/api/leads/L1/mover", {"coluna": 3}, cookie=cookie)[0] == 400
    assert mover(ctx, "L404", "Fecharam", cookie)[0] == 404
    r = pedir(ctx, "POST", "/api/leads/L1/mover", {"coluna": "Fecharam"}, cookie=cookie,
              headers={"Origin": "http://site-malicioso.invalid"})
    assert r[0] == 403
    assert ctx.repo.lead_get("L1")["situacao"] == "ativo"


def test_mover_para_a_mesma_coluna_nao_registra_nada(ctx):
    ctx.repo.lead_put(lead_real(1, situacao="fechou"))
    cookie = entrar(ctx)
    r = mover(ctx, "L1", "Fecharam", cookie)
    assert r[0] == 200 and json_de(r).get("semMudanca") is True
    assert ctx.repo.lead_get("L1")["historico"] == []


def test_mover_avisa_quando_nao_consegue_cancelar_o_agendado(ctx):
    ctx.repo.lead_put(lead_real(1, etapa=1, enviado1="2026-10-01T15:00:00Z",
                                agendamento={"n": 2, "id": "s1", "sendAt": "2026-10-08T13:00:00Z", "jid": "x"}))
    ctx.wa.falhar_cancelar = True
    r = mover(ctx, "L1", "Saíram", entrar(ctx))
    assert r[0] == 200 and "cancelar" in json_de(r)["aviso"].lower()
    assert ctx.repo.lead_get("L1")["situacao"] == "sair"


# --------------------------------------------------------------------------- próximo toque

def test_proximo_toque_monta_a_mensagem_e_a_foto(ctx):
    ctx.repo.lead_put(lead_real(1))
    ctx.repo.lead_put(lead_real(2, etapa=1, enviado1="2026-10-01T15:00:00Z"))
    cookie = entrar(ctx)
    d = json_de(pedir(ctx, "GET", "/api/leads/L1/proximo-toque", cookie=cookie))
    assert d["n"] == 1 and d["texto"] == TOQUE1 and d["foto"] == "estudio-a"
    assert d["midiaUrl"] == FOTOS + "/estudio-a.jpg" and d["podeEnviar"] is True
    d = json_de(pedir(ctx, "GET", "/api/leads/L2/proximo-toque", cookie=cookie))
    assert d["n"] == 2 and d["texto"].startswith("Oi, Paulo, é a Letícia de novo") and d["midiaUrl"] is None
    assert pedir(ctx, "GET", "/api/leads/L404/proximo-toque", cookie=cookie)[0] == 404


def test_proximo_toque_diz_por_que_nao_pode_enviar(ctx):
    ctx.repo.lead_put(lead_real(1, situacao="sair"))
    ctx.repo.lead_put(lead_real(2, etapa=3, enviado3="2026-10-01T15:00:00Z"))
    ctx.repo.lead_put(lead_real(3, canal="E-mail", toques=[{"n": 1, "assunto": "Podcast", "corpo": "Olá, corpo do e-mail", "mensagem": ""}]))
    ctx.repo.lead_put(lead_real(4, telefone=""))
    cookie = entrar(ctx)
    d = json_de(pedir(ctx, "GET", "/api/leads/L4/proximo-toque", cookie=cookie))
    assert d["podeEnviar"] is False and "telefone" in d["motivo"] and d["texto"] == TOQUE1   # ainda dá para copiar
    d = json_de(pedir(ctx, "GET", "/api/leads/L1/proximo-toque", cookie=cookie))
    assert d["podeEnviar"] is False and "sair" in d["motivo"].lower()
    d = json_de(pedir(ctx, "GET", "/api/leads/L2/proximo-toque", cookie=cookie))
    assert d["podeEnviar"] is False and d["n"] is None and "três toques" in d["motivo"]
    d = json_de(pedir(ctx, "GET", "/api/leads/L3/proximo-toque", cookie=cookie))
    assert d["podeEnviar"] is False and "e-mail" in d["motivo"].lower()
    assert d["texto"] == "Olá, corpo do e-mail" and d["assunto"] == "Podcast"     # o atalho c copia o corpo


# --------------------------------------------------------------------------- enviar o toque agora

def enviar(c, lead_id, cookie):
    return pedir(c, "POST", f"/api/leads/{lead_id}/enviar-toque", {}, cookie=cookie)


def test_enviar_toque_agora_manda_texto_e_foto_e_marca_enviado(ctx):
    ctx.repo.lead_put(lead_real(1))
    r = enviar(ctx, "L1", entrar(ctx))
    assert r[0] == 200, r
    assert len(ctx.wa.agendados_agora) == 1
    a = ctx.wa.agendados_agora[0]
    assert a["jid"] == "5565999900001@s.whatsapp.net" and a["texto"] == TOQUE1
    assert a["midia"] == FOTOS + "/estudio-a.jpg"
    assert wa_akg._data(a["sendAt"]) <= AGORA + wa_akg.timedelta(minutes=1)          # sai agora, não numa fila futura
    lead = ctx.repo.lead_get("L1")
    assert lead["etapa"] == 1 and lead["enviado1"] == "2026-10-07T15:00:00Z"
    assert lead["jidWa"] == a["jid"]
    assert lead["agendamento"]["id"] == "ag-1" and lead["agendamento"]["n"] == 1   # a conferência acompanha se saiu
    assert any("Toque 1" in h["texto"] and "ana" in h["texto"] for h in lead["historico"])
    d = json_de(r)
    assert d["n"] == 1 and d["coluna"] == "Aguardando"


def test_enviar_toque_cancela_o_agendado_antes_e_nunca_duplica(ctx):
    ctx.repo.lead_put(lead_real(1, etapa=1, enviado1="2026-10-01T15:00:00Z",
                                agendamento={"n": 2, "id": "s1", "sendAt": "2026-10-07T18:00:00Z", "jid": "x"}))
    ctx.wa.pendentes = [{"id": "s1", "status": "PENDING"}]
    cookie = entrar(ctx)
    r = enviar(ctx, "L1", cookie)
    assert r[0] == 200, r
    assert ctx.wa.cancelados == ["s1"] and len(ctx.wa.agendados_agora) == 1
    lead = ctx.repo.lead_get("L1")
    assert lead["etapa"] == 2 and lead["enviado2"] == "2026-10-07T15:00:00Z"
    # clicar de novo não manda o toque 3 hoje: o próximo só vence depois da espera
    r = enviar(ctx, "L1", cookie)
    assert r[0] == 409 and len(ctx.wa.agendados_agora) == 1


def test_enviar_toque_recusa_se_o_agendado_ja_saiu_ou_esta_saindo(ctx):
    ctx.repo.lead_put(lead_real(1, etapa=1, enviado1="2026-10-01T15:00:00Z",
                                agendamento={"n": 2, "id": "s9", "sendAt": "2026-10-07T14:59:00Z", "jid": "x"}))
    ctx.wa.pendentes = []                                          # não está mais pendente: pode já ter saído
    r = enviar(ctx, "L1", entrar(ctx))
    assert r[0] == 409 and not ctx.wa.agendados_agora and not ctx.wa.cancelados
    assert ctx.repo.lead_get("L1")["etapa"] == 1


def test_enviar_toque_travas(ctx):
    ctx.repo.lead_put(lead_real(1, situacao="sair"))
    ctx.repo.lead_put(lead_real(2, situacao="fechou"))
    ctx.repo.lead_put(lead_real(3, telefone=""))
    ctx.repo.lead_put(lead_real(4))
    ctx.repo.lead_put(lead_real(5, canal="E-mail"))
    ctx.repo.lead_put(lead_real(6, toques=[]))
    ctx.repo.lead_put(lead_real(7, situacao="respondeu", etapa=1, enviado1="2026-10-01T15:00:00Z"))
    ctx.wa.existem = ["5565999900001", "5565999900002", "5565999900005", "5565999900006", "5565999900007"]
    cookie = entrar(ctx)
    for i, status, trecho in [(1, 409, "sair"), (2, 409, "fechou"), (3, 400, "telefone"), (4, 400, "whatsapp"),
                              (5, 409, "e-mail"), (6, 409, "mensagem"), (7, 409, "respondeu")]:
        r = enviar(ctx, f"L{i}", cookie)
        assert r[0] == status, (i, r)
        assert trecho in json_de(r)["erro"].lower(), (i, json_de(r))
    assert not ctx.wa.agendados_agora
    for i in range(1, 8):
        assert ctx.repo.lead_get(f"L{i}")["historico"] == []


def test_enviar_toque_com_whatsapp_fora_nao_muda_nada(ctx):
    ctx.repo.lead_put(lead_real(1, agendamento={"n": 1, "id": "s1", "sendAt": "2026-10-07T18:00:00Z", "jid": "x"}))
    ctx.wa.pendentes = [{"id": "s1"}]
    cookie = entrar(ctx)
    ctx.wa.fora = True
    r = enviar(ctx, "L1", cookie)
    assert r[0] == 502 and "não foi enviad" in json_de(r)["erro"].lower()
    lead = ctx.repo.lead_get("L1")
    assert lead["etapa"] == 0 and lead["agendamento"]["id"] == "s1" and lead["historico"] == []
    # o WhatsApp volta, mas o agendamento falha: o agendado antigo já foi cancelado e o lead fica sem agendamento
    ctx.wa.fora = False
    ctx.wa.falhar_agendar = True
    r = enviar(ctx, "L1", cookie)
    assert r[0] == 502
    lead = ctx.repo.lead_get("L1")
    assert lead["etapa"] == 0 and "agendamento" not in lead and "enviado1" not in lead


def test_enviar_toque_foto_prometida_sem_endereco_das_fotos(ctx):
    ctx.cfg["fotos_url"] = ""
    ctx.repo.lead_put(lead_real(1))
    r = enviar(ctx, "L1", entrar(ctx))
    assert r[0] == 409 and "foto" in json_de(r)["erro"].lower() and not ctx.wa.agendados_agora


def test_enviar_toque_com_tudo_parado_nao_envia(ctx):
    ctx.repo.config_set("status", "parado")
    ctx.repo.lead_put(lead_real(1))
    r = enviar(ctx, "L1", entrar(ctx))
    assert r[0] == 409 and "parado" in json_de(r)["erro"].lower() and not ctx.wa.agendados_agora


def test_enviar_toque_dois_cliques_ao_mesmo_tempo_saem_uma_vez(ctx):
    ctx.repo.lead_put(lead_real(1))
    cookie = entrar(ctx)
    res = []
    ts = [threading.Thread(target=lambda: res.append(enviar(ctx, "L1", cookie)[0])) for _ in range(4)]
    for t in ts:
        t.start()
    for t in ts:
        t.join()
    assert sorted(res) == [200, 409, 409, 409] and len(ctx.wa.agendados_agora) == 1


def test_conferencia_depois_do_envio_agora_nao_avanca_o_toque_de_novo(ctx):
    """O planejador confere o agendamento: quando sair, só registra, sem pular para o toque 2."""
    ctx.repo.lead_put(lead_real(1))
    enviar(ctx, "L1", entrar(ctx))
    lead = ctx.repo.lead_get("L1")
    r = wa_akg.conferir([lead], [], [{"id": "ag-1", "status": "SENT", "sendAt": "2026-10-07T15:00:05Z"}], AGORA)
    assert r["updates"][0]["data"].get("etapa") is None

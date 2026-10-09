"""Conversa completa no card: copia do WhatsApp o que mandamos e o que o lead já escreveu (e só isso)."""
import json
from datetime import datetime, timedelta, timezone

from atendente import conversas
from atendente.db import Repo
from atendente.ia import OpenRouter
from test_servidor import ctx, entrar, json_de, pedir  # noqa: F401 (fixture)

AGORA = datetime(2026, 10, 7, 15, 0, tzinfo=timezone.utc)
JID = "556599990001@s.whatsapp.net"


def lead(**extra):
    d = {"id": "L1", "nome": "Clínica Modelo", "canal": "WhatsApp", "situacao": "respondeu", "etapa": 1,
         "jidWa": JID, "enviado1": "2026-10-06T13:00:00Z",
         "respostasVistasAte": "2026-10-06T14:00:00Z", "historico": []}
    d.update(extra)
    return d


class WaConversa:
    def __init__(self, msgs):
        self.msgs = msgs
        self.lidas = []

    def mensagens(self, jid):
        self.lidas.append(jid)
        return list(self.msgs.get(jid, []))


MSGS = {JID: [
    {"id": "a1", "fromMe": True, "timestamp": "2026-10-06T13:00:00Z", "content": "Oi, aqui é a Letícia."},
    {"id": "a2", "fromMe": False, "timestamp": "2026-10-06T14:00:00Z", "content": "Oi! Quem indicou?"},
    {"id": "a3", "fromMe": True, "timestamp": "2026-10-06T14:10:00Z", "content": "Te mandei pelo celular agora."},
    {"id": "a4", "fromMe": False, "timestamp": "2026-10-07T14:00:00Z", "content": "Quero marcar uma visita."},
]}


def test_traz_o_que_mandamos_e_o_que_o_lead_ja_escreveu_mas_nao_a_resposta_nova():
    repo = Repo(":memory:")
    repo.lead_put(lead())
    n = conversas.sincronizar_lead(repo, WaConversa(MSGS), repo.lead_get("L1"), AGORA)
    textos = [(m["de_mim"], m["texto"]) for m in repo.msgs_do_lead("L1")]
    assert n == 3
    assert textos == [(True, "Oi, aqui é a Letícia."), (False, "Oi! Quem indicou?"), (True, "Te mandei pelo celular agora.")]
    # a resposta nova (depois de respostasVistasAte) fica para a caixa de entrada, que passa pelo atendente


def test_repetir_nao_duplica_nem_a_copia_do_webhook():
    repo = Repo(":memory:")
    repo.lead_put(lead())
    repo.msg_add("L1", JID, True, "Oi, aqui é a Letícia.", "TEXT", "outro-id", "2026-10-06T13:00:02Z")
    wa = WaConversa(MSGS)
    assert conversas.sincronizar_lead(repo, wa, repo.lead_get("L1"), AGORA) == 2
    assert conversas.sincronizar_lead(repo, wa, repo.lead_get("L1"), AGORA) == 0
    assert len(repo.msgs_do_lead("L1")) == 3


def test_rodada_so_le_conversas_recentes_e_ativas():
    repo = Repo(":memory:")
    repo.lead_put(lead())
    repo.lead_put(lead(id="L2", jidWa="2@s.whatsapp.net", situacao="sair"))
    repo.lead_put(lead(id="L3", jidWa="3@s.whatsapp.net", enviado1="2026-08-01T13:00:00Z",
                       respostasVistasAte="2026-08-02T13:00:00Z"))
    repo.lead_put(lead(id="L4", jidWa="4@s.whatsapp.net", enviado1=None, respostasVistasAte=None,
                       sonda={"enviadaEm": "2026-10-07T13:00:00Z", "liberada": True}))
    wa = WaConversa(MSGS)
    r = conversas.sincronizar(repo, wa, AGORA)
    assert sorted(wa.lidas) == sorted([JID, "4@s.whatsapp.net"]) and r["erros"] == 0


def test_falha_num_lead_nao_para_a_rodada():
    class Quebra(WaConversa):
        def mensagens(self, jid):
            if jid == JID:
                raise RuntimeError("fora")
            return super().mensagens(jid)
    repo = Repo(":memory:")
    repo.lead_put(lead())
    repo.lead_put(lead(id="L4", jidWa="4@s.whatsapp.net"))
    r = conversas.sincronizar(repo, Quebra(MSGS), AGORA)
    assert r == {"leads": 1, "mensagens": 0, "erros": 1}


# --------------------------------------------------------------------------- resumo da IA

class Transporte:
    def __init__(self, conteudo):
        self.conteudo, self.pedidos = conteudo, []

    def __call__(self, metodo, url, headers, corpo):
        self.pedidos.append(json.loads(corpo))
        return 200, {}, json.dumps({"choices": [{"message": {"content": json.dumps(self.conteudo)}}],
                                    "usage": {"prompt_tokens": 300, "completion_tokens": 40, "cost": 0.0004}}).encode()


def test_ia_resume_a_conversa_e_registra_o_gasto():
    repo = Repo(":memory:")
    t = Transporte({"resumo": "Quer marcar visita.", "momento": "quer marcar visita", "proximo": "Mandar a agenda."})
    ia = OpenRouter("sk-x", repo, "", transporte=t)
    msgs = [{"de_mim": False, "texto": "Quero marcar uma visita.", "em": "2026-10-07T14:00:00Z"}]
    r = ia.resumir("Clínica Modelo", msgs, AGORA)
    assert r == {"resumo": "Quer marcar visita.", "momento": "quer marcar visita", "proximo": "Mandar a agenda."}
    assert "Lead: Quero marcar uma visita." in t.pedidos[0]["messages"][1]["content"]
    assert repo.gasto_mes(AGORA) > 0


def test_ia_sem_conversa_ou_saida_ruim_devolve_none():
    repo = Repo(":memory:")
    assert OpenRouter("sk-x", repo, "", transporte=Transporte({})).resumir("X", [], AGORA) is None
    msgs = [{"de_mim": False, "texto": "oi", "em": "2026-10-07T14:00:00Z"}]
    assert OpenRouter("sk-x", repo, "", transporte=Transporte({"resumo": ""})).resumir("X", msgs, AGORA) is None


# --------------------------------------------------------------------------- rotas do card

def test_rota_sincronizar_traz_a_conversa(ctx):
    ctx.repo.lead_put(lead())
    ctx.wa.mensagens = WaConversa(MSGS).mensagens
    r = pedir(ctx, "POST", "/api/leads/L1/sincronizar", {}, cookie=entrar(ctx))
    assert r[0] == 200 and json_de(r)["novas"] == 3 and len(json_de(r)["mensagens"]) == 3


def test_rota_resumo_guarda_no_lead(ctx):
    ctx.repo.lead_put(lead())
    ctx.repo.msg_add("L1", JID, False, "Quero marcar", "TEXT", "x1", "2026-10-07T14:00:00Z")

    class IaFalsa:
        def resumir(self, nome, msgs, agora):
            return {"resumo": f"{nome}: {len(msgs)} msg", "momento": "quer marcar", "proximo": "agenda"}
    ctx.atendente.ia = IaFalsa()
    r = pedir(ctx, "POST", "/api/leads/L1/resumo", {}, cookie=entrar(ctx))
    assert r[0] == 200 and json_de(r)["momento"] == "quer marcar"
    assert ctx.repo.lead_get("L1")["resumoIa"]["resumo"].endswith("1 msg")


def test_rota_resumo_sem_conversa_recusa(ctx):
    ctx.repo.lead_put(lead())
    r = pedir(ctx, "POST", "/api/leads/L1/resumo", {}, cookie=entrar(ctx))
    assert r[0] == 409

"""Integração de ponta a ponta: servidor HTTP real (porta aleatória), Repo real, Avisador/Atendente/Trabalhos reais,
WA-AKG falso com agendador de verdade e OpenRouter falso (só o transporte). Dados todos fictícios.

Assert só no que dá para ver de fora: o que o WA falso recebeu e o que o banco guarda."""
import hashlib
import hmac
import http.client
import json
import threading
import urllib.parse
from datetime import datetime, timedelta, timezone

import pytest

from atendente import servidor
from atendente.avisos import Avisador
from atendente.db import Repo
from atendente.ia import OpenRouter
from atendente.importar import importar_leads
from atendente.nucleo import Atendente
from atendente.planejador import conferencia_respostas, rodada_envios
from atendente.trabalhos import Trabalhos
from scripts import wa_akg
from scripts.wa_akg import WaAkgCliente

SEGREDO_WEBHOOK = "segredo-inventado-do-webhook-123"
SEGREDO_SESSAO = "segredo-inventado-da-sessao-bem-longo"
USUARIOS = {"ana": "senha-inventada-ana"}
EQUIPE = "5565999900099"
INICIO = datetime(2026, 10, 6, 14, 0, tzinfo=timezone.utc)      # terça, 10h em Cuiabá
RESPOSTA_AUTO = "De nada! Qualquer coisa, é só chamar por aqui."


def tel(i):
    return f"55659999000{i:02d}"


def jid(i):
    return f"{tel(i)}@s.whatsapp.net"


def lead(i, **kw):
    base = {"id": f"R{i:04d}", "nome": f"Empresa Teste {i}", "canal": "WhatsApp", "situacao": "ativo", "etapa": 0,
            "enviado1": None, "telefone": tel(i), "contatos": [], "contatoAtivo": None, "historico": [], "ordem": i, "score": 90, "faixa": "A",
            "toques": [{"n": 1, "mensagem": "Oi, tudo bem?"}, {"n": 2, "mensagem": "Toque 2."},
                       {"n": 3, "mensagem": "Toque 3."}]}
    base.update(kw)
    return base


# --------------------------------------------------------------------------- falsos

class WaFalso:
    """Transporte do WA-AKG: agendador de verdade; guarda o que recebeu (`enviados` = envios imediatos)."""

    def __init__(self):
        self.pendentes, self.historico, self.enviados, self.cancelados = [], [], [], []
        self.msgs, self.seq = {}, 0

    def __call__(self, metodo, url, headers, corpo=None):
        corpo = json.loads(corpo) if corpo else {}
        if url.endswith("/sessions"):
            return 200, {}, json.dumps([{"sessionId": "reiners", "status": "Connected"}]).encode()
        if url.endswith("/check"):
            res = [{"number": n, "exists": True, "jid": f"{n}@s.whatsapp.net"} for n in corpo["numbers"]]
            return 200, {}, json.dumps({"data": {"results": res}}).encode()
        if metodo == "POST" and url.endswith("/send"):
            destino = urllib.parse.unquote(url.split("/messages/reiners/")[1].rsplit("/send", 1)[0])
            self.enviados.append((destino, corpo["message"]["text"]))
            return 200, {}, json.dumps({"status": True, "data": {"key": {"id": f"e{len(self.enviados)}"}}}).encode()
        if metodo == "POST" and "/scheduler/" in url:
            self.seq += 1
            self.pendentes.append({"id": f"s{self.seq}", "sendAt": corpo["sendAt"], "jid": corpo["jid"],
                                   "content": corpo["content"], "status": "PENDING"})
            return 200, {}, json.dumps({"data": {"id": f"s{self.seq}"}}).encode()
        if metodo == "DELETE":
            id_ = urllib.parse.unquote(url.rsplit("/", 1)[1])
            self.cancelados.append(id_)
            self.pendentes = [p for p in self.pendentes if p["id"] != id_]
            return 200, {}, b"{}"
        if "/scheduler/" in url and "tab=history" in url:
            return 200, {}, json.dumps({"data": self.historico}).encode()
        if "/scheduler/" in url:
            return 200, {}, json.dumps({"data": self.pendentes}).encode()
        if "/chat/reiners/" in url:
            chave = urllib.parse.unquote(url.rsplit("/", 1)[1])
            return 200, {}, json.dumps(self.msgs.get(chave, [])).encode()
        return 404, {}, b""

    # ---- leitura do que aconteceu
    def para(self, destino):
        return [t for d, t in self.enviados if d == destino]

    def para_equipe(self):
        return self.para(f"{EQUIPE}@s.whatsapp.net")

    def pendentes_de(self, destino):
        return [p for p in self.pendentes if p["jid"] == destino]


class OpenRouterFalso:
    """Transporte do OpenRouter: devolve o JSON de classificação conforme o texto do lead."""

    def __init__(self):
        self.chamadas = []

    def __call__(self, metodo, url, headers, corpo=None):
        pedido = json.loads(corpo)
        texto = json.loads(pedido["messages"][-1]["content"])["mensagem_do_lead"]
        self.chamadas.append(texto)
        t = texto.lower()
        if "tira da lista" in t:
            saida = {"intencao": "sair", "simples": False, "resposta": "", "motivo": "pediu para sair"}
        elif "quanto custa" in t:
            saida = {"intencao": "complexo", "simples": False, "resposta": "", "motivo": "pergunta de preço"}
        else:
            saida = {"intencao": "neutra", "simples": True, "resposta": RESPOSTA_AUTO, "motivo": "agradecimento"}
        corpo_resp = {"choices": [{"message": {"content": json.dumps(saida, ensure_ascii=False)}}],
                      "usage": {"prompt_tokens": 100, "completion_tokens": 20, "cost": 0.002}}
        return 200, {}, json.dumps(corpo_resp).encode()


class Relogio:
    def __init__(self):
        self.t = INICIO

    def __call__(self):
        return self.t

    def avancar(self, minutos=10):
        self.t += timedelta(minutes=minutos)
        return self.t


class Cenario:
    def __init__(self, tmp_path):
        self.tmp = tmp_path
        self.relogio = Relogio()
        self.wa_falso = WaFalso()
        self.wa = WaAkgCliente("http://wa/api", "chave-inventada", "reiners", transporte=self.wa_falso,
                               dormir=lambda s: None)
        self.repo = Repo(":memory:")
        self.ia_falsa = OpenRouterFalso()
        self.ia = OpenRouter("chave-ia-inventada", self.repo, "Conhecimento de teste.", transporte=self.ia_falsa)
        self.avisador = Avisador(self.wa, [EQUIPE], self.repo)
        self.atendente = Atendente(self.repo, self.wa, self.ia, self.avisador)
        self.trabalhos = Trabalhos(self.repo, self.wa, self.atendente, self.avisador,
                                   {"SAIDA_DIR": str(tmp_path / "saida"), "BACKUP_DIR": str(tmp_path / "bk")},
                                   relogio=self.relogio)
        web = tmp_path / "web"
        web.mkdir()
        (web / "index.html").write_text("<html>tela</html>", encoding="utf-8")
        cfg = {"webhook_segredo": SEGREDO_WEBHOOK, "segredo_sessao": SEGREDO_SESSAO, "usuarios": dict(USUARIOS),
               "pasta_web": str(web), "relogio": self.relogio}
        self.srv = servidor.criar_servidor(self.repo, self.atendente, self.wa, cfg, porta=0)
        self.porta = self.srv.server_address[1]
        self.thread = threading.Thread(target=self.srv.serve_forever, daemon=True)
        self.thread.start()
        self.cookie = None
        self.seq = 0

    def fechar(self):
        self.srv.shutdown()
        self.srv.server_close()

    # ---- HTTP
    def _http(self, metodo, caminho, corpo=None, cabecalhos=None):
        con = http.client.HTTPConnection("127.0.0.1", self.porta, timeout=10)
        try:
            con.request(metodo, caminho, body=corpo, headers=cabecalhos or {})
            r = con.getresponse()
            bruto = r.read()
            return r.status, dict(r.getheaders()), (json.loads(bruto) if bruto.startswith((b"{", b"[")) else bruto)
        finally:
            con.close()

    def login(self):
        corpo = json.dumps({"usuario": "ana", "senha": USUARIOS["ana"]}).encode()
        status, hdrs, _ = self._http("POST", "/login", corpo, {"Content-Type": "application/json"})
        assert status == 200
        self.cookie = hdrs["Set-Cookie"].split(";")[0]

    def api(self, metodo, caminho, dados=None):
        if self.cookie is None:
            self.login()
        corpo = json.dumps(dados).encode() if dados is not None else None
        h = {"Cookie": self.cookie}
        if corpo is not None:
            h["Content-Type"] = "application/json"
        return self._http(metodo, caminho, corpo, h)

    def estado(self):
        status, _, d = self.api("GET", "/api/estado")
        assert status == 200
        return d

    # ---- webhook
    def assinar(self, corpo: bytes) -> str:
        return "sha256=" + hmac.new(SEGREDO_WEBHOOK.encode(), corpo, hashlib.sha256).hexdigest()

    def webhook(self, i, texto, tipo="TEXT", assinar=True, assinatura=None, wa_id=None, quando=None):
        """Avança o relógio (a menos que `quando` venha) e entrega o evento do lead i."""
        self.seq += 1
        em = quando or self.relogio.avancar(10)
        payload = {"event": "message.received", "timestamp": em.strftime("%Y-%m-%dT%H:%M:%SZ"),
                   "data": {"key": {"id": wa_id or f"W{self.seq}", "remoteJid": jid(i), "fromMe": False},
                            "type": tipo, "content": texto}}
        corpo = json.dumps(payload).encode()
        h = {"Content-Type": "application/json"}
        if assinatura is not None:
            h["X-Webhook-Signature"] = assinatura
        elif assinar:
            h["X-Webhook-Signature"] = self.assinar(corpo)
        return self._http("POST", "/webhook", corpo, h)

    # ---- atalhos
    def importar(self, leads):
        caminho = self.tmp / "exportacao.json"
        caminho.write_text(json.dumps({"leads": leads}, ensure_ascii=False), encoding="utf-8")
        return importar_leads(self.repo, str(caminho))

    def rodada(self):
        return rodada_envios(self.repo, self.wa, self.relogio(), "", str(self.tmp / "saida"))

    def sozinhas(self, lead_id=None):
        return [a for a in self.repo.atendimento_lista(limite=500, lead_id=lead_id) if a["acao"] == "sozinha"]

    def avisos_na_fila(self):
        return self.avisador.pendentes()


@pytest.fixture
def cen(tmp_path):
    c = Cenario(tmp_path)
    yield c
    c.fechar()


@pytest.fixture
def cen5(cen):
    """Cinco leads importados, fila ativa, respostas automáticas ligadas, tudo agendado no WA falso."""
    assert cen.importar([lead(i) for i in range(1, 6)]) == {"importados": 5, "ignorados": 0}
    cen.repo.config_set("status", "ativo")
    cen.repo.config_set("auto_resposta", True)
    r = cen.rodada()
    assert r["agendados"] == 5 and r["erros"] == 0
    return cen


# --------------------------------------------------------------------------- o dia completo

def test_dia_completo(cen5):
    c, wa = cen5, cen5.wa_falso

    # ---- 1) os envios foram agendados no ritmo e gravados em cada lead
    assert len(wa.pendentes) == 5
    horas = sorted(wa_akg._data(p["sendAt"]) for p in wa.pendentes)
    assert all(9 <= h.astimezone(wa_akg.FUSO).hour < 17 and h.astimezone(wa_akg.FUSO).weekday() < 5 for h in horas)
    assert all(horas[i + 5] - horas[i] >= timedelta(minutes=30) for i in range(len(horas) - 5))
    for i in range(1, 6):
        ag = c.repo.lead_get(f"R{i:04d}")["agendamento"]
        assert ag["n"] == 1 and ag["jid"] == jid(i) and any(p["id"] == ag["id"] for p in wa.pendentes)
    assert wa.enviados == []
    assert c.estado()["painel"]["naFila"] == 5

    # ---- 2) "obrigada!" do lead 1: resposta automática, pendente dele cancelado, 1 linha 'sozinha'
    status, _, corpo = c.webhook(1, "obrigada!")
    assert status == 200 and corpo == {"resultado": "respondida"}
    assert wa.para(jid(1)) == [RESPOSTA_AUTO]
    assert wa.pendentes_de(jid(1)) == [] and len(wa.pendentes) == 4
    assert c.repo.lead_get("R0001").get("agendamento") is None
    assert c.repo.lead_get("R0001")["situacao"] == "respondeu"
    linhas = c.sozinhas("R0001")
    assert len(linhas) == 1 and linhas[0]["respostaEnviada"] == RESPOSTA_AUTO and linhas[0]["mensagemLead"] == "obrigada!"
    assert c.estado()["painel"]["autoHoje"] == 1
    assert c.estado()["painel"]["naFila"] == 4
    assert wa.para_equipe() == []

    # ---- 3) "quanto custa?" do lead 2: nada para o lead; um aviso para a equipe
    status, _, corpo = c.webhook(2, "quanto custa?")
    assert status == 200 and corpo == {"resultado": "avisada"}
    assert wa.para(jid(2)) == []
    assert wa.pendentes_de(jid(2)) == []                         # respondeu: o toque agendado não sai mais
    assert c.avisos_na_fila() == 1
    r = c.avisador.descarregar(c.relogio(), forcar=True)
    assert r["itens"] == 1 and r["enviados"] == [EQUIPE]
    equipe = wa.para_equipe()
    assert len(equipe) == 1 and "Empresa Teste 2" in equipe[0] and "quanto custa" in equipe[0]
    assert c.avisos_na_fila() == 0
    assert [a["acao"] for a in c.repo.atendimento_lista(lead_id="R0002")] == ["avisou"]
    assert len(c.sozinhas()) == 1                                  # continua só a do lead 1

    # ---- 4) "me tira da lista" do lead 3: vira 'sair', nenhuma mensagem sai
    antes = list(wa.enviados)
    status, _, corpo = c.webhook(3, "me tira da lista")
    assert status == 200 and corpo == {"resultado": "sair"}
    assert c.repo.lead_get("R0003")["situacao"] == "sair"
    assert wa.enviados == antes
    assert wa.pendentes_de(jid(3)) == []
    assert c.avisos_na_fila() == 0
    # e quem saiu nunca mais recebe nada, mesmo que escreva de novo
    chamadas_ia = len(c.ia_falsa.chamadas)
    c.webhook(3, "obrigada!")
    assert wa.enviados == antes and len(c.ia_falsa.chamadas) == chamadas_ia
    assert c.repo.lead_get("R0003")["situacao"] == "sair"

    # ---- 5) interruptor de respostas automáticas desligado pela API: "obrigada!" só vira aviso
    status, _, corpo = c.api("POST", "/api/config", {"auto_resposta": False})
    assert status == 200 and corpo["config"]["auto_resposta"] is False
    antes = list(wa.enviados)
    status, _, corpo = c.webhook(4, "obrigada!")
    assert corpo == {"resultado": "avisada"}
    assert wa.enviados == antes and wa.para(jid(4)) == []
    assert len(c.sozinhas()) == 1
    assert c.estado()["painel"]["autoHoje"] == 1
    r = c.avisador.descarregar(c.relogio(), forcar=True)
    assert r["itens"] == 1
    assert len(wa.para_equipe()) == 2 and "Empresa Teste 4" in wa.para_equipe()[-1]
    c.api("POST", "/api/config", {"auto_resposta": True})

    # ---- 6) status parado pela API: nada sai e os pendentes de todos são cancelados no WA
    assert len(wa.pendentes) == 1 and wa.pendentes_de(jid(5))        # sobrou o lead 5
    status, _, corpo = c.api("POST", "/api/config", {"status": "parado"})
    assert status == 200 and corpo["config"]["status"] == "parado" and corpo["cancelados"] == 1
    assert wa.pendentes == []
    assert all(l.get("agendamento") is None for l in c.repo.leads_todos())
    posts_antes = len(wa.enviados)
    c.rodada()                                                       # a rodada com a fila parada nunca agenda
    assert wa.pendentes == [] and len(wa.enviados) == posts_antes
    chamadas_ia = len(c.ia_falsa.chamadas)
    c.webhook(5, "obrigada!")                                        # parado: toda resposta vira aviso, sem IA
    assert wa.para(jid(5)) == [] and len(c.ia_falsa.chamadas) == chamadas_ia
    assert c.avisos_na_fila() == 1
    c.avisador.descarregar(c.relogio(), forcar=True)
    assert len(wa.para_equipe()) == 3

    # ---- 7) teto de gasto estourado: a IA nem é chamada e o caso vira aviso
    c.api("POST", "/api/config", {"status": "ativo"})
    c.repo.gasto_add("modelo-de-teste", 1000, 1000, 5.01, wa_akg._iso(c.relogio()))
    assert c.estado()["painel"]["gastoMesUsd"] > 5.0
    chamadas_ia = len(c.ia_falsa.chamadas)
    antes = list(wa.enviados)
    c.repo.aplicar("R0005", {"situacao": "ativo"})
    c.webhook(5, "muito obrigada!")
    assert len(c.ia_falsa.chamadas) == chamadas_ia                   # teto: transporte da IA não foi tocado
    assert wa.enviados == antes
    assert c.avisos_na_fila() == 1
    c.avisador.descarregar(c.relogio(), forcar=True)
    assert len(wa.para_equipe()) == 4 and "Empresa Teste 5" in wa.para_equipe()[-1]
    assert len(c.sozinhas()) == 1

    # saldo do dia no painel
    p = c.estado()["painel"]
    assert p["autoHoje"] == 1 and p["avisosHoje"] == 4


# --------------------------------------------------------------------------- ritmo

def test_ritmo_nunca_mais_de_5_em_30_min_e_50_por_dia(cen):
    cen.importar([lead(i) for i in range(1, 61)])
    cen.repo.config_set("status", "ativo")
    cen.repo.config_set("por_lote", 5)
    cen.repo.config_set("limite_dia", 50)
    cen.repo.config_set("limite_novos", 50)
    total = 0
    for _ in range(3):
        total += cen.rodada()["agendados"]
    pend = cen.wa_falso.pendentes
    assert total == 50 and len(pend) == 50
    horas = sorted(wa_akg._data(p["sendAt"]) for p in pend)
    assert all(horas[i + 5] - horas[i] >= timedelta(minutes=30) for i in range(len(horas) - 5))
    por_dia = {}
    for h in horas:
        d = h.astimezone(wa_akg.FUSO).date()
        por_dia[d] = por_dia.get(d, 0) + 1
    assert max(por_dia.values()) <= 50
    assert len({p["jid"] for p in pend}) == 50                       # ninguém agendado duas vezes
    assert len([l for l in cen.repo.leads_todos() if l.get("agendamento")]) == 50


# --------------------------------------------------------------------------- webhook

def test_webhook_sem_assinatura_ou_com_assinatura_errada_e_401_e_nada_muda(cen5):
    c, wa = cen5, cen5.wa_falso
    antes_leads, antes_pend = c.repo.leads_todos(), list(wa.pendentes)
    for kw in ({"assinar": False}, {"assinatura": "sha256=" + "0" * 64}, {"assinatura": "lixo"}):
        status, _, _ = c.webhook(1, "obrigada!", **kw)
        assert status == 401
    # corpo adulterado depois de assinado
    payload = {"event": "message.received", "data": {"key": {"id": "X1", "remoteJid": jid(1), "fromMe": False},
                                                     "type": "TEXT", "content": "obrigada!"}}
    corpo = json.dumps(payload).encode()
    assinatura = c.assinar(corpo)
    adulterado = corpo.replace(b"obrigada", b"quanto custa")
    status, _, _ = c._http("POST", "/webhook", adulterado, {"X-Webhook-Signature": assinatura})
    assert status == 401
    assert c.repo.leads_todos() == antes_leads
    assert wa.pendentes == antes_pend and wa.enviados == [] and wa.cancelados == []
    assert c.repo.msgs_do_lead("R0001") == [] and c.repo.atendimento_lista() == []
    assert c.ia_falsa.chamadas == [] and c.avisos_na_fila() == 0


def test_mesma_mensagem_por_webhook_e_conferencia_trata_uma_vez(cen5):
    c, wa = cen5, cen5.wa_falso
    # lead 1 já recebeu o toque 1 (a conferência só acompanha quem recebeu)
    c.repo.aplicar("R0001", {"etapa": 1, "enviado1": "2026-10-05T14:00:00Z"})
    c.repo.aplicar("R0002", {"etapa": 1, "enviado1": "2026-10-05T14:00:00Z"})
    # A) primeiro o webhook, depois a conferência vê a mesma mensagem (com o relógio do WhatsApp 30 s adiante)
    t = c.relogio.avancar(10)
    assert c.webhook(1, "obrigada!", quando=t)[2] == {"resultado": "respondida"}
    wa.msgs[jid(1)] = [{"fromMe": False, "content": "obrigada!", "type": "TEXT",
                        "timestamp": (t + timedelta(seconds=30)).strftime("%Y-%m-%dT%H:%M:%SZ")}]
    c.relogio.avancar(2)
    r = conferencia_respostas(c.repo, c.wa, c.atendente, c.relogio())
    assert r["mensagens"] == 1 and r["resultados"] == {"duplicada": 1} and r["erros"] == 0
    assert [m["texto"] for m in c.repo.msgs_do_lead("R0001") if not m["de_mim"]] == ["obrigada!"]
    assert len(c.sozinhas("R0001")) == 1 and wa.para(jid(1)) == [RESPOSTA_AUTO]
    # B) primeiro a conferência, depois o webhook com a mesma mensagem
    t = c.relogio.avancar(10)
    wa.msgs[jid(2)] = [{"fromMe": False, "content": "obrigada!", "type": "TEXT",
                        "timestamp": t.strftime("%Y-%m-%dT%H:%M:%SZ")}]
    r = conferencia_respostas(c.repo, c.wa, c.atendente, c.relogio())
    assert r["resultados"] == {"respondida": 1}
    assert c.webhook(2, "obrigada!", quando=t + timedelta(seconds=20))[2] == {"resultado": "duplicada"}
    assert [m["texto"] for m in c.repo.msgs_do_lead("R0002") if not m["de_mim"]] == ["obrigada!"]
    assert len(c.sozinhas("R0002")) == 1 and wa.para(jid(2)) == [RESPOSTA_AUTO]
    # C) o mesmo webhook (mesmo wa_id) reenviado
    assert c.webhook(1, "obrigada!", wa_id="W-fixo")[0] == 200
    antes = len(c.repo.msgs_do_lead("R0001"))
    assert c.webhook(1, "obrigada!", wa_id="W-fixo")[2] == {"resultado": "duplicada"}
    assert len(c.repo.msgs_do_lead("R0001")) == antes


def test_midia_vira_aviso_sem_chamar_a_ia(cen5):
    c, wa = cen5, cen5.wa_falso
    status, _, corpo = c.webhook(1, "", tipo="IMAGE")
    assert status == 200 and corpo == {"resultado": "avisada"}
    assert c.ia_falsa.chamadas == []
    assert wa.para(jid(1)) == [] and wa.pendentes_de(jid(1)) == []
    assert c.avisos_na_fila() == 1
    c.avisador.descarregar(c.relogio(), forcar=True)
    equipe = wa.para_equipe()
    assert len(equipe) == 1 and "Empresa Teste 1" in equipe[0]
    assert c.sozinhas() == []
    assert [a["acao"] for a in c.repo.atendimento_lista()] == ["avisou"]


# --------------------------------------------------------------------------- laços (Trabalhos reais)

def test_trabalhos_planejador_e_avisos_com_atraso(cen):
    c, wa = cen, cen.wa_falso
    c.importar([lead(i) for i in range(1, 4)])
    c.repo.config_set("status", "ativo")
    c.repo.config_set("auto_resposta", True)
    c.trabalhos._passo_planejador()
    assert len(wa.pendentes) == 3
    c.webhook(1, "quanto custa?")
    c.trabalhos._passo_avisos()                      # ainda dentro do atraso de 40 s: junta, não manda
    assert wa.para_equipe() == [] and c.avisos_na_fila() == 1
    c.relogio.avancar(1)
    c.trabalhos._passo_avisos()
    assert len(wa.para_equipe()) == 1 and c.avisos_na_fila() == 0
    c.api("POST", "/api/config", {"status": "parado"})
    assert wa.pendentes == []
    c.trabalhos._passo_planejador()
    assert wa.pendentes == []

import threading
import time
from datetime import datetime, timezone

from atendente.avisos import Avisador
from atendente.db import Repo
from atendente.nucleo import Atendente
from atendente.webhook import Mensagem

AGORA = datetime(2026, 10, 6, 14, 0, tzinfo=timezone.utc)
EQUIPE = ["5565999900001", "5565999900002"]
CAL = "https://cal.com/leticiareiners/30min"


class WaFalso:
    def __init__(self):
        self.enviados, self._l = [], threading.Lock()

    def enviar_texto(self, jid, texto):
        with self._l:
            self.enviados.append((jid, texto))
        return {"data": {"key": {"id": "x"}}}

    def agendadas(self, aba):
        return []

    def cancelar(self, id_):
        pass

    def verificar(self, numeros):
        return {n: f"{n}@s.whatsapp.net" for n in numeros}

    def mensagens(self, jid):
        return []


class IaLenta:
    def __init__(self, espera=0.05):
        self.espera = espera

    def classificar(self, texto, contexto, agora):
        time.sleep(self.espera)
        return {"intencao": "interesse", "simples": True, "resposta": "Que bom! Agenda: " + CAL, "motivo": "x"}


def lead(i):
    tel = f"55659999{i:04d}"
    return {"id": f"R{i:04d}", "nome": f"Clínica {i}", "canal": "WhatsApp", "situacao": "ativo", "etapa": 1,
            "enviado1": "2026-10-05T14:00:00Z", "telefone": tel[2:], "historico": [],
            "toques": [{"n": 1, "mensagem": "Oi!"}]}


def msg(i, wa_id):
    num = f"55659999{i:04d}"
    return Mensagem(wa_id=wa_id, jid=f"{num}@s.whatsapp.net", numero=num, de_mim=False, tipo="TEXT",
                    texto="Tenho interesse", em="2026-10-06T14:00:00Z", grupo=False)


def montar(n_leads):
    repo = Repo(":memory:")
    wa = WaFalso()
    for i in range(1, n_leads + 1):
        repo.lead_put(lead(i))
    return Atendente(repo, wa, IaLenta(), Avisador(wa, EQUIPE, repo, atraso_s=0)), repo, wa


def paralelo(fns):
    res, ths = [], []
    lk = threading.Lock()

    def roda(f):
        r = f()
        with lk:
            res.append(r)
    for f in fns:
        ths.append(threading.Thread(target=roda, args=(f,)))
    for t in ths:
        t.start()
    for t in ths:
        t.join()
    return res


def test_rajada_do_mesmo_lead_gera_uma_resposta_automatica_so():
    at, repo, wa = montar(1)
    res = paralelo([lambda: at.tratar_mensagem(msg(1, "A1"), AGORA),
                    lambda: at.tratar_mensagem(msg(1, "A2"), AGORA)])
    assert sorted(res) == ["avisada", "respondida"]
    assert len(wa.enviados) == 1


def test_cem_leads_em_paralelo_nunca_passam_de_20_respostas_no_dia():
    at, repo, wa = montar(100)
    res = paralelo([(lambda i=i: at.tratar_mensagem(msg(i, f"W{i}"), AGORA)) for i in range(1, 101)])
    assert res.count("respondida") == 20 and len(wa.enviados) == 20
    assert repo.auto_respostas_hoje(AGORA) == 20
    assert res.count("avisada") == 80

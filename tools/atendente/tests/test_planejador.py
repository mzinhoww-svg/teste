import json
import os
import threading
from datetime import datetime, timedelta, timezone

import pytest

from atendente import planejador, trabalhos
from atendente.db import Repo
from atendente.planejador import conferencia_respostas, rodada_envios
from atendente.trabalhos import Trabalhos
from scripts import wa_akg
from scripts.wa_akg import WaAkgCliente

# terça-feira, 10h em Cuiabá (14h UTC)
AGORA = datetime(2026, 10, 6, 14, 0, tzinfo=timezone.utc)
SABADO = datetime(2026, 10, 10, 14, 0, tzinfo=timezone.utc)
NOITE = datetime(2026, 10, 6, 22, 0, tzinfo=timezone.utc)      # terça 18h em Cuiabá


def tel(i):
    return f"55659999000{i:02d}"


def jid(i):
    return f"{tel(i)}@s.whatsapp.net"


def lead(i, **kw):
    base = {"id": f"R{i:04d}", "nome": f"Clínica {i}", "canal": "WhatsApp", "situacao": "ativo", "etapa": 0,
            "enviado1": None, "telefone": tel(i), "contatos": [], "contatoAtivo": None, "historico": [], "ordem": i,
            "toques": [{"n": 1, "mensagem": "Oi, tudo bem?"}, {"n": 2, "mensagem": "Toque 2."},
                       {"n": 3, "mensagem": "Toque 3."}]}
    base.update(kw)
    return base


class WaFalso:
    """Transporte do WA-AKG com agendador de verdade (guarda o que agenda, cancela, responde)."""

    def __init__(self, status="Connected", mensagens=None):
        self.status, self.msgs = status, mensagens or {}
        self.pendentes, self.historico, self.chamadas, self.seq = [], [], [], 0

    def __call__(self, metodo, url, headers, corpo=None):
        corpo = json.loads(corpo) if corpo else {}
        self.chamadas.append((metodo, url, corpo))
        if url.endswith("/sessions"):
            return 200, {}, json.dumps([{"sessionId": "reiners", "status": self.status}]).encode()
        if url.endswith("/check"):
            res = [{"number": n, "exists": True, "jid": f"{n}@s.whatsapp.net"} for n in corpo["numbers"]]
            return 200, {}, json.dumps({"data": {"results": res}}).encode()
        if metodo == "POST" and "/scheduler/" in url:
            self.seq += 1
            self.pendentes.append({"id": f"s{self.seq}", "sendAt": corpo["sendAt"], "jid": corpo["jid"],
                                   "content": corpo["content"], "status": "PENDING"})
            return 200, {}, json.dumps({"data": {"id": f"s{self.seq}"}}).encode()
        if metodo == "DELETE":
            id_ = url.rsplit("/", 1)[1]
            self.pendentes = [p for p in self.pendentes if p["id"] != id_]
            return 200, {}, b"{}"
        if "/scheduler/" in url and "tab=history" in url:
            return 200, {}, json.dumps({"data": self.historico}).encode()
        if "/scheduler/" in url:
            return 200, {}, json.dumps({"data": self.pendentes}).encode()
        if "/chat/reiners/" in url:
            chave = url.rsplit("/", 1)[1].replace("%40", "@")
            return 200, {}, json.dumps(self.msgs.get(chave, [])).encode()
        return 404, {}, b""

    def agendamentos_post(self):
        return [c for c in self.chamadas if c[0] == "POST" and "/scheduler/" in c[1]]


def cliente(fake):
    return WaAkgCliente("http://wa/api", "chave_secreta", "reiners", transporte=fake, dormir=lambda s: None)


@pytest.fixture
def repo(tmp_path):
    return Repo(str(tmp_path / "t.db"))


@pytest.fixture
def saida(tmp_path):
    return str(tmp_path / "saida")


def config(repo, status="ativo", por_lote=5, limite_dia=50):
    repo.config_set("status", status)
    repo.config_set("por_lote", por_lote)
    repo.config_set("limite_dia", limite_dia)


class AtendenteFalso:
    """Mesma regra do real: msg_add barra duplicada; o resto só conta."""

    def __init__(self, repo, explodir=False):
        self.repo, self.recebidas, self.resultados, self.explodir = repo, [], [], explodir

    def tratar_mensagem(self, m, agora):
        self.recebidas.append(m)
        if self.explodir:
            raise RuntimeError("quebrou")
        lead_ = self.repo.lead_por_numero(m.numero)
        if lead_ is None:
            r = "desconhecido"
        elif not self.repo.msg_add(lead_["id"], m.jid, m.de_mim, m.texto, m.tipo, m.wa_id, m.em):
            r = "duplicada"
        else:
            r = "respondida"
        self.resultados.append(r)
        return r


class AvisadorFalso:
    def __init__(self, falha=False):
        self.itens, self.descarregos, self.falha = [], [], falha

    def adicionar(self, lead, motivo, trecho, agora):
        self.itens.append((lead, motivo, trecho, agora))

    def descarregar(self, agora, forcar=False):
        self.descarregos.append((agora, forcar))
        if self.falha:
            raise RuntimeError("avisador quebrou")
        return None


def msg(de_mim, texto, quando, tipo="TEXT"):
    return {"fromMe": de_mim, "content": texto, "timestamp": quando, "type": tipo}


# --------------------------------------------------------------------------- rodada_envios

def test_rodada_agenda_no_ritmo_e_grava_o_agendamento(repo, saida):
    config(repo)
    for i in range(1, 61):
        repo.lead_put(lead(i))
    wa = WaFalso()
    r1 = rodada_envios(repo, cliente(wa), AGORA, "https://f", saida)
    assert r1["agendados"] == 30                     # a rodada consulta só os primeiros max(20, 6*X) candidatos
    r2 = rodada_envios(repo, cliente(wa), AGORA, "https://f", saida)
    assert r2["agendados"] == 20                     # limite do dia (50) já contado do que está no agendador
    assert len(wa.pendentes) == 50
    horas = sorted(wa_akg._data(p["sendAt"]) for p in wa.pendentes)
    assert all(h.astimezone(wa_akg.FUSO).weekday() < 5 and 9 <= h.astimezone(wa_akg.FUSO).hour < 17 for h in horas)
    assert all(horas[i + 5] - horas[i] >= timedelta(minutes=30) for i in range(len(horas) - 5))  # nunca mais de 5 em 30 min
    com_agendamento = [l for l in repo.leads_todos() if l.get("agendamento")]
    assert len(com_agendamento) == 50
    ag = com_agendamento[0]["agendamento"]
    assert ag["n"] == 1 and ag["id"].startswith("s") and ag["jid"].endswith("@s.whatsapp.net")
    assert "agendado no WhatsApp" in com_agendamento[0]["historico"][-1]["texto"]
    # a mesma rodada de novo não duplica ninguém
    r3 = rodada_envios(repo, cliente(wa), AGORA, "https://f", saida)
    assert r3["agendados"] == 0 and len(wa.pendentes) == 50


def test_rodada_usa_por_lote_e_limite_do_config(repo, saida):
    config(repo, por_lote=2, limite_dia=7)
    for i in range(1, 21):
        repo.lead_put(lead(i))
    wa = WaFalso()
    r = rodada_envios(repo, cliente(wa), AGORA, "https://f", saida)
    assert r["agendados"] == 7
    horas = sorted(wa_akg._data(p["sendAt"]) for p in wa.pendentes)
    assert all(horas[i + 2] - horas[i] >= timedelta(minutes=30) for i in range(len(horas) - 2))


def test_rodada_padroes_sao_3_por_lote_e_12_por_dia(repo, saida):
    repo.config_set("status", "ativo")        # sem por_lote nem limite_dia
    for i in range(1, 41):
        repo.lead_put(lead(i))
    wa = WaFalso()
    assert rodada_envios(repo, cliente(wa), AGORA, "https://f", saida)["agendados"] == 12
    assert rodada_envios(repo, cliente(wa), AGORA, "https://f", saida)["agendados"] == 0


def test_rodada_so_agenda_com_status_ativo_e_cancela_pendentes_se_pausada(repo, saida):
    config(repo)
    for i in range(1, 4):
        repo.lead_put(lead(i))
    wa = WaFalso()
    assert rodada_envios(repo, cliente(wa), AGORA, "https://f", saida)["agendados"] == 3
    for estado in ("pausado", "parado"):
        config(repo, status=estado)
        antes = len(wa.agendamentos_post())
        r = rodada_envios(repo, cliente(wa), AGORA, "https://f", saida)
        assert len(wa.agendamentos_post()) == antes
        assert set(r) >= {"cancelados"}
        if estado == "pausado":
            assert r["cancelados"] == 3 and wa.pendentes == []
            assert all(not l.get("agendamento") for l in repo.leads_todos())
            assert "cancelado" in repo.lead_get("R0001")["historico"][-1]["texto"]
        else:
            assert r["cancelados"] == 0


def test_rodada_pausada_nao_cancela_o_que_ja_saiu_e_marca_como_enviado(repo, saida):
    config(repo, status="pausado")
    repo.lead_put(lead(1, agendamento={"n": 1, "id": "s1", "sendAt": "2026-10-06T13:00:00Z", "jid": jid(1)}))
    wa = WaFalso()
    wa.historico = [{"id": "s1", "status": "SENT", "sendAt": "2026-10-06T13:01:00.000Z"}]
    r = rodada_envios(repo, cliente(wa), AGORA, "https://f", saida)
    l = repo.lead_get("R0001")
    assert r == {"cancelados": 0}
    assert l["etapa"] == 1 and l["enviado1"] and not l.get("agendamento") and l["jidWa"] == jid(1)


def test_rodada_ativa_confere_antes_de_planejar(repo, saida):
    config(repo)
    repo.lead_put(lead(1, agendamento={"n": 1, "id": "s1", "sendAt": "2026-10-06T13:00:00Z", "jid": jid(1)}))
    wa = WaFalso()
    wa.historico = [{"id": "s1", "status": "SENT", "sendAt": "2026-10-06T13:01:00.000Z"}]
    r = rodada_envios(repo, cliente(wa), AGORA, "https://f", saida)
    assert r["agendados"] == 0                         # toque 2 só vence daqui a 4 dias
    assert repo.lead_get("R0001")["etapa"] == 1 and r["conferencia"]["enviados"] == 1


def test_rodada_fora_do_horario_nao_agenda(repo, saida):
    config(repo)
    repo.lead_put(lead(1))
    wa = WaFalso()
    for quando in (SABADO, NOITE):
        r = rodada_envios(repo, cliente(wa), quando, "https://f", saida)
        assert r["agendados"] == 0
    assert wa.agendamentos_post() == [] and not repo.lead_get("R0001").get("agendamento")


def test_rodada_com_sessao_caida_devolve_sessao_caida_e_nao_agenda(repo, saida):
    config(repo)
    repo.lead_put(lead(1))
    wa = WaFalso(status="SCAN_QR")
    assert rodada_envios(repo, cliente(wa), AGORA, "https://f", saida) == {"sessao_caida": True}
    assert wa.agendamentos_post() == []


def test_rodada_nao_vaza_chave_nem_deixa_leads_em_disco(repo, saida, capsys):
    config(repo)
    repo.lead_put(lead(1))
    rodada_envios(repo, cliente(WaFalso()), AGORA, "https://f", saida)
    assert "chave_secreta" not in capsys.readouterr().out
    restos = [f for _, _, fs in os.walk(saida) for f in fs] if os.path.isdir(saida) else []
    assert restos == []


# --------------------------------------------------------------------------- conferencia_respostas

def lead_em_conversa(i, **kw):
    return lead(i, etapa=1, enviado1="2026-10-01T14:00:00Z", jidWa=jid(i), **kw)


def test_conferencia_trata_mensagem_nova_uma_vez(repo):
    repo.lead_put(lead_em_conversa(1))
    wa = WaFalso(mensagens={jid(1): [msg(False, "Pode ser quinta", "2026-10-02T09:00:00Z")]})
    # o webhook já entregou esta mesma mensagem (id diferente, mesmo texto e horário)
    assert repo.msg_add("R0001", jid(1), False, "Pode ser quinta", "TEXT", "wh-1", "2026-10-02T09:00:01Z")
    at = AtendenteFalso(repo)
    r = conferencia_respostas(repo, cliente(wa), at, AGORA)
    assert at.resultados == ["duplicada"] and r["mensagens"] == 1
    assert len(repo.msgs_do_lead("R0001")) == 1
    # segunda conferência: o que já foi visto não volta
    conferencia_respostas(repo, cliente(wa), at, AGORA)
    assert len(at.recebidas) == 1


def test_conferencia_monta_a_mensagem_sintetica(repo):
    repo.lead_put(lead_em_conversa(1))
    wa = WaFalso(mensagens={jid(1): [msg(True, "Oi!", "2026-10-02T08:00:00Z"),
                                      msg(False, "", "2026-10-02T09:00:00Z", tipo="AUDIO")]})
    at = AtendenteFalso(repo)
    r = conferencia_respostas(repo, cliente(wa), at, AGORA)
    assert len(at.recebidas) == 1 and r["mensagens"] == 1 and r["resultados"] == {"respondida": 1}
    m = at.recebidas[0]
    assert m.wa_id == f"poll:{jid(1)}:2026-10-02T09:00:00Z"
    assert (m.jid, m.numero, m.de_mim, m.grupo, m.tipo) == (jid(1), tel(1), False, False, "AUDIO")
    assert m.texto == "[audio]" and m.em == "2026-10-02T09:00:00Z"


def test_conferencia_atualiza_respostasVistasAte(repo):
    repo.lead_put(lead_em_conversa(1))
    wa = WaFalso(mensagens={jid(1): [msg(False, "um", "2026-10-02T09:00:00Z"), msg(False, "dois", "2026-10-02T09:05:00Z")]})
    at = AtendenteFalso(repo)
    conferencia_respostas(repo, cliente(wa), at, AGORA)
    assert repo.lead_get("R0001")["respostasVistasAte"] == "2026-10-02T09:05:00Z"
    assert [m.texto for m in at.recebidas] == ["um", "dois"]
    wa.msgs[jid(1)].append(msg(False, "três", "2026-10-03T10:00:00Z"))
    conferencia_respostas(repo, cliente(wa), at, AGORA)
    assert [m.texto for m in at.recebidas] == ["um", "dois", "três"]
    assert repo.lead_get("R0001")["respostasVistasAte"] == "2026-10-03T10:00:00Z"


def test_conferencia_nao_avanca_o_marcador_se_o_atendente_quebrar(repo):
    repo.lead_put(lead_em_conversa(1))
    repo.lead_put(lead_em_conversa(2))
    wa = WaFalso(mensagens={jid(1): [msg(False, "oi", "2026-10-02T09:00:00Z")],
                            jid(2): [msg(False, "olá", "2026-10-02T09:00:00Z")]})
    r = conferencia_respostas(repo, cliente(wa), AtendenteFalso(repo, explodir=True), AGORA)
    assert r["erros"] == 2
    assert not repo.lead_get("R0001").get("respostasVistasAte")      # tenta de novo na próxima
    assert not repo.lead_get("R0002").get("respostasVistasAte")


def test_conferencia_sem_novidade_nao_chama_o_atendente(repo):
    repo.lead_put(lead_em_conversa(1))
    at = AtendenteFalso(repo)
    r = conferencia_respostas(repo, cliente(WaFalso()), at, AGORA)
    assert at.recebidas == [] and r["mensagens"] == 0


# --------------------------------------------------------------------------- Trabalhos

def montar(repo, tmp_path, agora=AGORA, wa=None, avisador=None, atendente=None, **env):
    relogio = {"t": agora}
    cfg = {"BACKUP_DIR": str(tmp_path / "backups"), "SAIDA_DIR": str(tmp_path / "saida"), "FOTOS_URL": "https://f", **env}
    t = Trabalhos(repo, cliente(wa or WaFalso()), atendente or AtendenteFalso(repo), avisador or AvisadorFalso(), cfg,
                  relogio=lambda: relogio["t"])
    return t, relogio


def test_sessao_caida_avisa_uma_vez(repo, tmp_path):
    wa, av = WaFalso(status="SCAN_QR"), AvisadorFalso()
    t, rel = montar(repo, tmp_path, wa=wa, avisador=av)
    t._passo_saude()
    t._passo_saude()
    rel["t"] = AGORA + timedelta(hours=5, minutes=55)
    t._passo_saude()
    assert len(av.itens) == 1
    rel["t"] = AGORA + timedelta(hours=6, minutes=1)
    t._passo_saude()
    assert len(av.itens) == 2
    assert "WhatsApp" in av.itens[0][1]


def test_sessao_conectada_nao_avisa(repo, tmp_path):
    av = AvisadorFalso()
    t, _ = montar(repo, tmp_path, avisador=av)
    t._passo_saude()
    assert av.itens == []


def test_wa_akg_fora_do_ar_tambem_avisa(repo, tmp_path):
    def mudo(*a, **k):
        return 0, {}, b""
    av = AvisadorFalso()
    t = Trabalhos(repo, WaAkgCliente("http://wa/api", "k", "reiners", transporte=mudo, dormir=lambda s: None),
                  AtendenteFalso(repo), av, {"BACKUP_DIR": str(tmp_path)}, relogio=lambda: AGORA)
    t._passo_saude()
    assert len(av.itens) == 1


def test_backup_mantem_14(repo, tmp_path):
    repo.config_set("status", "ativo")
    t, rel = montar(repo, tmp_path)
    for dia in range(20):
        rel["t"] = datetime(2026, 9, 1, 7, 0, tzinfo=timezone.utc) + timedelta(days=dia)   # 03:00 em Cuiabá
        t._passo_backup()
    arquivos = sorted(os.listdir(tmp_path / "backups"))
    assert len(arquivos) == 14
    assert arquivos[0] == "atendente-20260907.db" and arquivos[-1] == "atendente-20260920.db"
    copia = Repo(str(tmp_path / "backups" / arquivos[-1]))
    assert copia.config_get("status") == "ativo"


def test_backup_so_e_devido_a_partir_das_3h_de_cuiaba_e_uma_vez_por_dia(repo, tmp_path):
    t, _ = montar(repo, tmp_path)
    assert not t._backup_devido(datetime(2026, 10, 6, 6, 59, tzinfo=timezone.utc))      # 02:59 em Cuiabá
    assert t._backup_devido(datetime(2026, 10, 6, 7, 0, tzinfo=timezone.utc))
    t._passo_backup()
    assert not t._backup_devido(AGORA) and t._ultimo_backup == wa_akg._data("2026-10-06T14:00:00Z").astimezone(wa_akg.FUSO).date()
    assert t._backup_devido(AGORA + timedelta(days=1))


def test_planejador_dentro_da_janela_agenda(repo, tmp_path):
    config(repo)
    repo.lead_put(lead(1))
    wa = WaFalso()
    t, _ = montar(repo, tmp_path, wa=wa)
    t._passo_planejador()
    assert len(wa.pendentes) == 1


def test_planejador_fora_da_janela_so_confere(repo, tmp_path):
    config(repo)
    repo.lead_put(lead(1))
    repo.lead_put(lead(2, agendamento={"n": 1, "id": "s1", "sendAt": "2026-10-10T13:00:00Z", "jid": jid(2)}))
    wa = WaFalso()
    wa.historico = [{"id": "s1", "status": "SENT", "sendAt": "2026-10-10T13:01:00.000Z"}]
    for quando in (SABADO, NOITE, datetime(2026, 10, 6, 11, 0, tzinfo=timezone.utc)):   # sáb, 18h, 07h
        t, _ = montar(repo, tmp_path, agora=quando, wa=wa)
        t._passo_planejador()
    assert wa.agendamentos_post() == []
    assert repo.lead_get("R0002")["etapa"] == 1               # a conferência rodou


def test_planejador_fora_da_janela_pausado_ainda_cancela(repo, tmp_path):
    config(repo, status="pausado")
    repo.lead_put(lead(1, agendamento={"n": 1, "id": "s1", "sendAt": "2026-10-12T13:00:00Z", "jid": jid(1)}))
    wa = WaFalso()
    wa.pendentes = [{"id": "s1", "sendAt": "2026-10-12T13:00:00Z", "jid": jid(1), "content": "x", "status": "PENDING"}]
    t, _ = montar(repo, tmp_path, agora=SABADO, wa=wa)
    t._passo_planejador()
    assert wa.pendentes == [] and not repo.lead_get("R0001").get("agendamento")


def test_passo_avisos_e_conferencia_chamam_os_colaboradores(repo, tmp_path):
    repo.lead_put(lead_em_conversa(1))
    wa = WaFalso(mensagens={jid(1): [msg(False, "oi", "2026-10-02T09:00:00Z")]})
    av, at = AvisadorFalso(), AtendenteFalso(repo)
    t, _ = montar(repo, tmp_path, wa=wa, avisador=av, atendente=at)
    t._passo_avisos()
    t._passo_conferencia()
    assert av.descarregos == [(AGORA, False)] and len(at.recebidas) == 1


def test_erro_num_passo_nao_derruba_e_nao_vaza_segredo(repo, tmp_path, caplog):
    av = AvisadorFalso(falha=True)
    t, _ = montar(repo, tmp_path, avisador=av)
    with caplog.at_level("ERROR"):
        assert t._seguro("avisos", t._passo_avisos) is False
    assert "RuntimeError" in caplog.text and "avisador quebrou" in caplog.text
    assert t._seguro("saude", t._passo_saude) is True


def test_iniciar_e_parar_rodam_os_lacos_em_threads_daemon(repo, tmp_path):
    config(repo)
    repo.lead_put(lead(1))
    wa, av = WaFalso(), AvisadorFalso()
    t, _ = montar(repo, tmp_path, wa=wa, avisador=av)
    t.INTERVALO_AVISOS = 0.01
    t.INTERVALO_BACKUP = 0.01
    antes = threading.active_count()
    t.iniciar()
    t.iniciar()                                         # idempotente
    try:
        for _ in range(200):
            if len(av.descarregos) >= 3 and len(wa.pendentes) == 1 and os.path.isdir(tmp_path / "backups"):
                break
            threading.Event().wait(0.02)
        assert len(av.descarregos) >= 3
        assert len(wa.pendentes) == 1                   # planejador rodou ao ligar
        assert os.listdir(tmp_path / "backups")         # backup devido (já passou das 3h)
        assert all(th.daemon for th in t._threads) and len(t._threads) == 5
    finally:
        t.parar()
    assert threading.active_count() <= antes
    n = len(av.descarregos)
    threading.Event().wait(0.1)
    assert len(av.descarregos) == n                     # parou mesmo


# --------------------------------------------------------------------------- corridas e novo status

class WaComGancho(WaFalso):
    """Chama `gancho(n_agendamento)` logo depois de guardar cada agendamento (simula o mundo mudando no meio)."""

    def __init__(self, gancho=None, timeout_no=None, **kw):
        super().__init__(**kw)
        self.gancho, self.timeout_no, self.n = gancho, timeout_no, 0

    def __call__(self, metodo, url, headers, corpo=None):
        r = super().__call__(metodo, url, headers, corpo)
        if metodo == "POST" and "/scheduler/" in url:
            self.n += 1
            if self.gancho:
                self.gancho(self.n)
            if self.timeout_no == self.n:
                return 500, {}, b"{}"            # o WA-AKG agendou, mas a resposta não chegou
        return r


def test_lead_que_responde_no_meio_da_rodada_tem_o_toque_cancelado(repo, saida):
    config(repo)
    repo.lead_put(lead(1))
    repo.lead_put(lead(2))
    wa = WaComGancho(gancho=lambda n: repo.aplicar("R0001", {"situacao": "respondeu"}) if n == 1 else None)
    r = rodada_envios(repo, cliente(wa), AGORA, "https://f", saida)
    assert r["revertidos"] == 1
    assert [p["jid"] for p in wa.pendentes] == [jid(2)]
    l1 = repo.lead_get("R0001")
    assert "agendamento" not in l1 and l1["situacao"] == "respondeu"
    assert repo.lead_get("R0002")["agendamento"]


def test_status_que_vira_parado_no_meio_cancela_tudo_o_que_a_rodada_agendou(repo, saida):
    config(repo)
    for i in range(1, 4):
        repo.lead_put(lead(i))
    wa = WaComGancho(gancho=lambda n: repo.config_set("status", "parado") if n == 1 else None)
    r = rodada_envios(repo, cliente(wa), AGORA, "https://f", saida)
    assert r["revertidos"] == 3 and wa.pendentes == []
    assert all("agendamento" not in l for l in repo.leads_todos())


def test_agendamento_que_deu_timeout_e_adotado_e_nao_duplica(repo, saida):
    config(repo)
    repo.lead_put(lead(1))
    wa = WaComGancho(timeout_no=1)
    r1 = rodada_envios(repo, cliente(wa), AGORA, "https://f", saida)
    assert r1["erros"] == 1 and len(wa.pendentes) == 1
    assert "agendamento" not in repo.lead_get("R0001")
    r2 = rodada_envios(repo, cliente(wa), AGORA, "https://f", saida)
    assert r2["agendados"] == 0 and len(wa.agendamentos_post()) == 1 and len(wa.pendentes) == 1
    ag = repo.lead_get("R0001")["agendamento"]
    assert ag["n"] == 1 and ag["id"] == "s1" and ag["jid"] == jid(1) and ag["sendAt"]


def test_aguardando_nao_agenda_e_nao_cancela(repo, saida):
    config(repo, status="aguardando")
    repo.lead_put(lead(1, agendamento={"n": 1, "id": "s1", "sendAt": "2026-10-06T15:00:00Z", "jid": jid(1)}))
    repo.lead_put(lead(2))
    wa = WaFalso()
    wa.pendentes = [{"id": "s1", "jid": jid(1), "sendAt": "2026-10-06T15:00:00Z", "content": "x", "status": "PENDING"},
                    {"id": "s2", "jid": jid(3), "sendAt": "2026-10-06T16:00:00Z", "content": "y", "status": "PENDING"}]
    r = rodada_envios(repo, cliente(wa), AGORA, "https://f", saida)
    assert r == {"aguardando": True}
    assert len(wa.pendentes) == 2 and wa.agendamentos_post() == []
    assert not [c for c in wa.chamadas if c[0] == "DELETE"]
    assert repo.lead_get("R0001")["agendamento"]


def test_trabalhos_aguardando_so_confere(repo, saida, monkeypatch):
    config(repo, status="aguardando")
    chamadas = []
    monkeypatch.setattr(trabalhos, "conferir_envios", lambda *a, **k: chamadas.append("conferir"))
    monkeypatch.setattr(trabalhos, "rodada_envios", lambda *a, **k: chamadas.append("rodada"))
    t = Trabalhos(repo, WaFalso(), None, None, {"SAIDA_DIR": saida}, relogio=lambda: AGORA)
    t._passo_planejador()
    assert chamadas == ["conferir"]

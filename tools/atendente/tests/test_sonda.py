"""Sonda "Olá": antes do toque 1, manda um "Olá", espera e só então libera o toque."""
from datetime import datetime, timedelta, timezone

import pytest

from atendente import sonda
from atendente.db import Repo
from atendente.planejador import completar_sondas, rodada_envios
from scripts import wa_akg
from test_planejador import WaFalso, cliente, config, lead, jid

BOT = "Bem vindo a Empresa Exemplo! Digite apenas o número da opção desejada."
AGORA = datetime(2026, 10, 7, 14, 0, tzinfo=timezone.utc)     # terça, 10h em Cuiabá


@pytest.fixture
def repo(tmp_path):
    r = Repo(str(tmp_path / "s.db"))
    config(r)
    r.config_set("sonda_ola", True)
    return r


@pytest.fixture
def saida(tmp_path):
    return str(tmp_path / "saida")


def textos(wa):
    return [p["content"] for p in wa.pendentes]


def test_primeiro_contato_manda_so_o_ola_e_segura_o_toque(repo, saida):
    repo.lead_put(lead(1))
    wa = WaFalso()
    r = rodada_envios(repo, cliente(wa), AGORA, "https://f", saida)
    assert textos(wa) == ["Olá"] and r["agendados"] == 0 and r["sonda"]["enviadas"] == 1
    l = repo.lead_get("R0001")
    assert l["sonda"]["liberada"] is False and not l.get("agendamento")
    wa.pendentes = []                                   # o "Olá" saiu
    # meia hora depois sem resposta: a espera acabou, libera e agenda o toque 1
    r2 = rodada_envios(repo, cliente(wa), AGORA + timedelta(minutes=30), "https://f", saida)
    assert r2["sonda"]["sem_resposta"] == 1 and r2["agendados"] == 1
    assert textos(wa) == ["Oi, tudo bem?"]
    assert repo.lead_get("R0001")["sonda"]["resultado"] == "sem_resposta"


def test_dentro_da_espera_o_toque_nao_sai(repo, saida):
    repo.lead_put(lead(1))
    wa = WaFalso()
    rodada_envios(repo, cliente(wa), AGORA, "https://f", saida)
    r = rodada_envios(repo, cliente(wa), AGORA + timedelta(seconds=20), "https://f", saida)
    assert r["agendados"] == 0 and textos(wa) == ["Olá"]


def test_robo_responde_ao_ola_e_o_toque_segue(repo):
    repo.lead_put(lead(1))
    wa = WaFalso()
    sonda.enviar(repo, cliente(wa), AGORA, 5)
    repo.msg_add("R0001", jid(1), False, BOT, "TEXT", "w1", (AGORA + timedelta(seconds=20)).strftime("%Y-%m-%dT%H:%M:%SZ"))
    r = sonda.resolver(repo, AGORA + timedelta(minutes=5))
    assert r["robo"] == 1
    l = repo.lead_get("R0001")
    assert l["sonda"]["resultado"] == "robo" and l["situacao"] == "ativo" and sonda.seguram_o_toque(repo) == set()


def test_pessoa_responde_ao_ola_marca_humano(repo):
    repo.lead_put(lead(1))
    sonda.enviar(repo, cliente(WaFalso()), AGORA, 5)
    repo.msg_add("R0001", jid(1), False, "Oi, quem é?", "TEXT", "w1", (AGORA + timedelta(seconds=20)).strftime("%Y-%m-%dT%H:%M:%SZ"))
    assert sonda.resolver(repo, AGORA + timedelta(minutes=5))["humano"] == 1


def test_respeita_o_lote_e_o_espaco_entre_as_sondas(repo):
    for i in range(1, 8):
        repo.lead_put(lead(i))
    wa = WaFalso()
    assert sonda.enviar(repo, cliente(wa), AGORA, 3) == 3
    horas = sorted(wa_akg._data(p["sendAt"]) for p in wa.pendentes)
    assert all(b - a >= timedelta(seconds=60) for a, b in zip(horas, horas[1:]))


def test_lead_que_ja_recebeu_toque_ou_nao_esta_ativo_nao_leva_ola(repo):
    repo.lead_put(lead(1, etapa=1, enviado1="2026-10-01T14:00:00Z"))
    repo.lead_put(lead(2, situacao="respondeu"))
    repo.lead_put(lead(3, situacao="sair"))
    repo.lead_put(lead(4, canal="E-mail"))
    wa = WaFalso()
    assert sonda.enviar(repo, cliente(wa), AGORA, 5) == 0 and wa.pendentes == []


def test_interruptor_desligado_mantem_o_fluxo_antigo(repo, saida):
    repo.config_set("sonda_ola", False)
    repo.lead_put(lead(1))
    wa = WaFalso()
    r = rodada_envios(repo, cliente(wa), AGORA, "https://f", saida)
    assert r["agendados"] == 1 and textos(wa) == ["Oi, tudo bem?"]


def test_numero_sem_whatsapp_nao_trava_nem_quebra(repo):
    repo.lead_put(lead(1))
    wa = WaFalso()
    c = cliente(wa)
    c.verificar = lambda numeros: {}
    assert sonda.enviar(repo, c, AGORA, 5) == 0
    assert "sonda" not in repo.lead_get("R0001")


def test_ola_ainda_pendente_nao_e_adotado_como_toque_1(repo, saida):
    repo.lead_put(lead(1))
    wa = WaFalso()
    rodada_envios(repo, cliente(wa), AGORA, "https://f", saida)
    rodada_envios(repo, cliente(wa), AGORA + timedelta(seconds=20), "https://f", saida)    # "Olá" ainda pendente
    l = repo.lead_get("R0001")
    assert not l.get("agendamento") and textos(wa) == ["Olá"]


def test_conferencia_completa_a_sonda_e_agenda_o_toque_sem_esperar_o_planejador(repo, saida):
    repo.lead_put(lead(1))
    wa = WaFalso()
    rodada_envios(repo, cliente(wa), AGORA, "https://f", saida)              # manda o "Olá"
    wa.pendentes = []                                                        # o "Olá" saiu
    assert completar_sondas(repo, cliente(wa), AGORA + timedelta(seconds=20), "https://f", saida) is None
    r = completar_sondas(repo, cliente(wa), AGORA + timedelta(seconds=50), "https://f", saida)
    assert r["agendados"] == 1 and r["sonda"]["enviadas"] == 0 and textos(wa) == ["Oi, tudo bem?"]


def test_completar_sondas_nao_manda_ola_novo_nem_roda_pausado(repo, saida):
    repo.lead_put(lead(1))
    wa = WaFalso()
    assert completar_sondas(repo, cliente(wa), AGORA, "https://f", saida) is None and wa.pendentes == []
    rodada_envios(repo, cliente(wa), AGORA, "https://f", saida)
    repo.config_set("status", "pausado")
    assert completar_sondas(repo, cliente(wa), AGORA + timedelta(minutes=5), "https://f", saida) is None


def _enviadas_hoje(wa, n):
    wa.historico = [{"id": f"h{i}", "sendAt": (AGORA - timedelta(minutes=10 + i)).strftime("%Y-%m-%dT%H:%M:%SZ"),
                     "jid": f"x{i}@s.whatsapp.net", "content": "Olá", "status": wa_akg.SENT} for i in range(n)]


def test_ola_conta_no_limite_do_dia(repo, saida):
    """O "Olá" entra no limite do dia: com 12 por dia e 12 já enviadas, nada mais sai."""
    config(repo, limite_dia=12)
    for i in range(1, 4):
        repo.lead_put(lead(i))
    wa = WaFalso()
    _enviadas_hoje(wa, 12)
    r = rodada_envios(repo, cliente(wa), AGORA, "https://f", saida)
    assert r["sonda"]["enviadas"] == 0 and r["agendados"] == 0 and wa.pendentes == []


def test_ola_so_ocupa_as_vagas_que_sobram(repo, saida):
    config(repo, limite_dia=12, por_lote=5)
    for i in range(1, 6):
        repo.lead_put(lead(i))
    wa = WaFalso()
    _enviadas_hoje(wa, 10)
    r = rodada_envios(repo, cliente(wa), AGORA, "https://f", saida)
    assert r["sonda"]["enviadas"] == 2 and len(wa.pendentes) == 2


def test_sem_conferir_o_agendador_nao_manda_ola():
    class Quebrado:
        def agendadas(self, aba):
            raise RuntimeError("fora do ar")
    assert sonda.vagas_hoje(Quebrado(), AGORA, 50) == 0


def test_no_maximo_12_conversas_novas_por_dia(repo, saida):
    """Conversa nova = "Olá". Passou de `novos_dia`, não abre mais nenhuma no dia, mesmo com folga no teto total."""
    config(repo, por_lote=10)
    repo.config_set("novos_dia", 3)
    for i in range(1, 8):
        repo.lead_put(lead(i))
    wa = WaFalso()
    assert rodada_envios(repo, cliente(wa), AGORA, "https://f", saida)["sonda"]["enviadas"] == 3
    r = rodada_envios(repo, cliente(wa), AGORA + timedelta(minutes=30), "https://f", saida)
    assert r["sonda"]["enviadas"] == 0 and textos(wa).count("Olá") == 3
    # no dia seguinte abre mais 3
    r = rodada_envios(repo, cliente(wa), AGORA + timedelta(days=1), "https://f", saida)
    assert r["sonda"]["enviadas"] == 3


def test_padrao_e_12_conversas_novas(repo):
    assert sonda.vagas_novos(repo, AGORA) == 12

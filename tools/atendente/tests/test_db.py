from datetime import datetime, timedelta, timezone

import pytest

from atendente.db import Repo


@pytest.fixture
def repo():
    return Repo(":memory:")


def utc(*a):
    return datetime(*a, tzinfo=timezone.utc)


def test_lead_ida_e_volta(repo):
    l = {"id": "a1", "nome": "Clínica Ação", "situacao": "ativo", "canal": "wa", "historico": [{"x": 1}]}
    repo.lead_put(l)
    assert repo.lead_get("a1") == l
    assert repo.lead_get("nao") is None
    l["nome"] = "Outro"
    repo.lead_put(l)
    assert repo.lead_get("a1")["nome"] == "Outro"
    assert len(repo.leads_todos()) == 1
    with pytest.raises(ValueError):
        repo.lead_put({"nome": "sem id"})


def test_aplicar_mescla_e_remove_campo_com___delete__(repo):
    repo.lead_put({"id": "a1", "nome": "X", "agendamento": {"em": "2026-10-06T14:00:00Z"}, "etapa": 1})
    novo = repo.aplicar("a1", {"etapa": 2, "agendamento": {"__delete__": True}, "nota": "ok"})
    assert novo == {"id": "a1", "nome": "X", "etapa": 2, "nota": "ok"}
    assert repo.lead_get("a1") == novo


def test_msg_add_recusa_wa_id_repetido(repo):
    assert repo.msg_add("a1", "j@s", False, "oi", "TEXT", "W1", "2026-10-06T14:00:00Z")
    assert not repo.msg_add("a1", "j@s", False, "outro texto", "TEXT", "W1", "2026-10-06T16:00:00Z")
    assert len(repo.msgs_do_lead("a1")) == 1


def test_msg_add_recusa_mesmo_texto_do_mesmo_lead_em_120s(repo):
    assert repo.msg_add("a1", "j@s", False, "quero saber", "TEXT", "W1", "2026-10-06T14:00:00Z")
    assert not repo.msg_add("a1", "j@s", False, "quero saber", "TEXT", None, "2026-10-06T14:01:30Z")
    assert not repo.msg_add("a1", "j@s", False, "quero saber", "TEXT", "W2", "2026-10-06T13:58:30Z")
    # outro lead, ou o outro lado da conversa, entra
    assert repo.msg_add("a2", "j@s", False, "quero saber", "TEXT", None, "2026-10-06T14:01:00Z")
    assert repo.msg_add("a1", "j@s", True, "quero saber", "TEXT", None, "2026-10-06T14:01:00Z")


def test_msg_add_aceita_o_mesmo_texto_depois_de_120s(repo):
    assert repo.msg_add("a1", "j@s", False, "oi", "TEXT", None, "2026-10-06T14:00:00Z")
    assert repo.msg_add("a1", "j@s", False, "oi", "TEXT", None, "2026-10-06T14:02:01Z")
    ms = repo.msgs_do_lead("a1")
    assert [m["em"] for m in ms] == ["2026-10-06T14:00:00Z", "2026-10-06T14:02:01Z"]
    assert ms[0]["de_mim"] is False


def test_msgs_do_lead_mais_antigas_primeiro_e_limite(repo):
    for i in range(5):
        repo.msg_add("a1", "j@s", False, f"m{i}", "TEXT", f"W{i}", f"2026-10-06T14:0{i}:00Z")
    assert [m["texto"] for m in repo.msgs_do_lead("a1", limite=3)] == ["m2", "m3", "m4"]


def test_lead_por_numero_acha_por_telefone_e_por_jidWa(repo):
    repo.lead_put({"id": "a1", "telefone": "(65) 99990-0011"})
    repo.lead_put({"id": "a2", "telefone": "", "jidWa": "5565999900022@s.whatsapp.net"})
    repo.lead_put({"id": "a3", "telefone": "6599990033", "contatoAtivo": "c1",
                   "contatos": [{"id": "c1", "telefone": "65999900044"}]})
    assert repo.lead_por_numero("5565999900011")["id"] == "a1"
    assert repo.lead_por_numero("5565999900022")["id"] == "a2"
    assert repo.lead_por_numero("5565999900044")["id"] == "a3"
    assert repo.lead_por_numero("5565999900099") is None
    assert repo.lead_por_numero("") is None


def test_gasto_mes_soma_so_o_mes_de_cuiaba(repo):
    # 2026-10-01T02:00Z = 30/09 22:00 em Cuiabá (setembro); 2026-10-01T04:00Z = 00:00 de 01/10 (outubro)
    repo.gasto_add("m", 1, 1, 1.0, "2026-10-01T02:00:00Z")
    repo.gasto_add("m", 1, 1, 2.0, "2026-10-01T04:00:00Z")
    repo.gasto_add("m", 1, 1, 0.5, "2026-10-20T12:00:00Z")
    # 01/11 02:00Z = 31/10 22:00 em Cuiabá: ainda outubro
    repo.gasto_add("m", 1, 1, 0.25, "2026-11-01T02:00:00Z")
    repo.gasto_add("m", 1, 1, 9.0, "2026-11-01T04:00:00Z")
    assert repo.gasto_mes(utc(2026, 10, 15, 12)) == pytest.approx(2.75)
    assert repo.gasto_mes(utc(2026, 9, 30, 12)) == pytest.approx(1.0)
    # 23h de Cuiabá do dia 31/10 = 03:00Z de 01/11: continua outubro
    assert repo.gasto_mes(utc(2026, 11, 1, 3)) == pytest.approx(2.75)
    assert repo.gasto_mes(utc(2026, 11, 1, 4)) == pytest.approx(9.0)


def test_auto_respostas_hoje_conta_so_acao_sozinha_do_dia_de_cuiaba(repo):
    # dia 06/10 em Cuiabá = 04:00Z de 06/10 até 03:59Z de 07/10
    repo.atendimento_add(leadId="a1", em="2026-10-06T04:00:00Z", acao="sozinha")
    repo.atendimento_add(leadId="a2", em="2026-10-07T03:59:00Z", acao="sozinha")
    repo.atendimento_add(leadId="a3", em="2026-10-06T15:00:00Z", acao="avisou")
    repo.atendimento_add(leadId="a4", em="2026-10-06T03:59:00Z", acao="sozinha")   # dia 05 em Cuiabá
    repo.atendimento_add(leadId="a5", em="2026-10-07T04:00:00Z", acao="sozinha")   # dia 07
    assert repo.auto_respostas_hoje(utc(2026, 10, 6, 14)) == 2
    assert repo.auto_respostas_hoje(utc(2026, 10, 7, 2)) == 2   # ainda dia 06 em Cuiabá


def test_ultima_auto_resposta(repo):
    assert repo.ultima_auto_resposta("a1") is None
    repo.atendimento_add(leadId="a1", em="2026-10-05T14:00:00Z", acao="sozinha")
    repo.atendimento_add(leadId="a1", em="2026-10-06T14:00:00Z", acao="sozinha")
    repo.atendimento_add(leadId="a1", em="2026-10-07T14:00:00Z", acao="avisou")
    repo.atendimento_add(leadId="a2", em="2026-10-08T14:00:00Z", acao="sozinha")
    assert repo.ultima_auto_resposta("a1") == utc(2026, 10, 6, 14)


def test_atendimento_lista(repo):
    i = repo.atendimento_add(leadId="a1", empresa="E", em="2026-10-06T14:00:00Z", humanoRespondeu=False,
                             acao="avisou", motivoAviso="mídia")
    assert isinstance(i, int)
    repo.atendimento_add(leadId="a2", em="2026-10-06T15:00:00Z", acao="sozinha")
    todos = repo.atendimento_lista()
    assert [r["leadId"] for r in todos] == ["a2", "a1"]
    so = repo.atendimento_lista(lead_id="a1")
    assert len(so) == 1 and so[0]["humanoRespondeu"] is False and so[0]["motivoAviso"] == "mídia"


def test_config_padrao_e_json(repo):
    assert repo.config_get("x") is None
    assert repo.config_get("x", 5) == 5
    repo.config_set("x", {"a": [1, "ç"], "b": True})
    assert repo.config_get("x") == {"a": [1, "ç"], "b": True}
    repo.config_set("status", "ativo")
    repo.config_set("status", "parado")
    assert repo.config_get("status") == "parado"


def test_backup_gera_arquivo_que_abre(repo, tmp_path):
    repo.lead_put({"id": "a1", "nome": "X"})
    repo.config_set("k", 1)
    destino = str(tmp_path / "bkp.db")
    repo.backup(destino)
    copia = Repo(destino)
    assert copia.lead_get("a1")["nome"] == "X"
    assert copia.config_get("k") == 1

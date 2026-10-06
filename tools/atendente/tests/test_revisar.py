"""Revisão dos leads: robôs de WhatsApp Business que foram tratados como resposta de gente."""
from datetime import datetime, timezone

import pytest

from atendente.db import Repo
from atendente import revisar

AGORA = datetime(2026, 10, 7, 15, 0, tzinfo=timezone.utc)
BOT = "Bem vindo a Empresa Exemplo! Digite apenas o número da opção desejada."


def lead(i, **kw):
    d = {"id": f"R{i:03d}", "nome": f"Empresa Teste {i}", "situacao": "respondeu", "etapa": 1, "canal": "WhatsApp",
         "enviado1": "2026-10-06T14:00:00Z", "telefone": f"55659999000{i:02d}",
         "historico": [{"em": "2026-10-06T14:00:00Z", "texto": "Toque 1 enviado"}]}
    d.update(kw)
    return d


def msg(repo, lid, texto, de_mim=False, n=[0]):
    n[0] += 1
    repo.msg_add(lid, "x@s.whatsapp.net", de_mim, texto, "TEXT", f"w{n[0]}", f"2026-10-06T15:{n[0] % 60:02d}:00Z")


@pytest.fixture
def repo():
    r = Repo(":memory:")
    # A: só robô; marcado "respondeu" pelo atendente; nota de atenção de ruído
    r.lead_put(lead(1, historico=[{"em": "2026-10-06T14:00:00Z", "texto": "Toque 1 enviado"},
                                  {"em": "2026-10-06T15:00:00Z", "texto": "ATENÇÃO: IA indisponível. Mensagem do lead: " + BOT}]))
    msg(r, "R001", BOT)
    # B: pessoa de verdade, ainda sem resposta nossa
    r.lead_put(lead(2))
    msg(r, "R002", "Bom Dia")
    msg(r, "R002", "Vou te passar o contato da superetendente")
    # C: robô, mas a equipe marcou "respondeu" à mão
    r.lead_put(lead(3, historico=[{"em": "2026-10-06T14:00:00Z", "texto": "Situação mudou para respondeu (por ana)"}]))
    msg(r, "R003", BOT)
    # D: robô + pessoa
    r.lead_put(lead(4))
    msg(r, "R004", BOT)
    msg(r, "R004", "Oi, pode me mandar uma proposta?")
    # E: já saiu; F: ativo normal
    r.lead_put(lead(5, situacao="sair"))
    msg(r, "R005", BOT)
    r.lead_put(lead(6, situacao="ativo"))
    return r


def test_relatorio_sem_aplicar_nao_muda_nada(repo):
    antes = {l["id"]: (l["situacao"], len(l["historico"])) for l in repo.leads_todos()}
    r = revisar.revisar(repo, aplicar=False, agora=AGORA)
    assert r["voltam_para_cadencia"] == ["R001"] and r["aplicado"] is False
    assert antes == {l["id"]: (l["situacao"], len(l["historico"])) for l in repo.leads_todos()}


def test_aplicar_volta_so_o_lead_que_era_robo_e_limpa_a_nota(repo):
    r = revisar.revisar(repo, aplicar=True, agora=AGORA)
    a = repo.lead_get("R001")
    assert a["situacao"] == "ativo" and r["aplicado"] is True
    textos = [h["texto"] for h in a["historico"]]
    assert not any(t.startswith("ATENÇÃO:") for t in textos)
    assert any("não era resposta de pessoa" in t for t in textos)
    for i in (2, 3, 4, 5, 6):                                     # pessoa, marcação manual, mistura, saiu, ativo
        assert repo.lead_get(f"R{i:03d}")["situacao"] == {2: "respondeu", 3: "respondeu", 4: "respondeu",
                                                         5: "sair", 6: "ativo"}[i]


def test_lista_quem_ainda_espera_resposta_nossa(repo):
    r = revisar.revisar(repo, aplicar=False, agora=AGORA)
    assert "R002" in r["esperam_resposta"] and "R004" in r["esperam_resposta"]
    assert "R001" not in r["esperam_resposta"]                    # robô não espera resposta


def test_rodar_de_novo_nao_muda_mais(repo):
    revisar.revisar(repo, aplicar=True, agora=AGORA)
    r2 = revisar.revisar(repo, aplicar=True, agora=AGORA)
    assert r2["voltam_para_cadencia"] == [] and r2["notas_removidas"] == 0


def test_lead_sem_mensagens_ou_so_com_nome_nao_quebra(repo):
    repo.lead_put({"id": "MIN", "nome": "Só nome"})
    repo.lead_put({"id": "VAZ", "situacao": "respondeu"})
    revisar.revisar(repo, aplicar=True, agora=AGORA)

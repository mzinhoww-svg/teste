from datetime import datetime, timezone

from atendente.db import Repo
from atendente.refazer import refazer_primeiro_toque

AGORA = datetime(2026, 10, 6, 14, 0, tzinfo=timezone.utc)


class WaFalso:
    def __init__(self):
        self.cancelados = []
        self.fora = False

    def cancelar(self, id_):
        if self.fora:
            raise RuntimeError("fora do ar")
        self.cancelados.append(id_)


def _lead(i, **extra):
    d = {"id": i, "nome": f"Empresa {i}", "canal": "WhatsApp", "situacao": "ativo", "etapa": 1,
         "enviado1": "2026-10-02T18:00:00Z", "historico": [{"em": "2026-10-02T18:00:00Z", "texto": "Toque 1 enviado"}]}
    d.update(extra)
    return d


def test_leads_marcados_como_enviados_sem_envio_real_voltam_a_ser_primeiro_toque():
    r, wa = Repo(":memory:"), WaFalso()
    r.lead_put(_lead("R1", agendamento={"n": 2, "id": "s1", "sendAt": "2026-10-06T14:30:00Z", "jid": "x"},
                     enviado2="2026-10-05T10:00:00Z"))
    r.lead_put(_lead("R2"))
    out = refazer_primeiro_toque(r, wa, AGORA, manter={"TESTE"})
    assert out == {"refeitos": 2, "cancelados": 1, "erros": 0}
    for i in ("R1", "R2"):
        l = r.lead_get(i)
        assert l["etapa"] == 0 and "enviado1" not in l and "enviado2" not in l and "agendamento" not in l
        assert l["historico"][0]["texto"] == "Toque 1 enviado"                     # o histórico antigo continua
        assert "Primeiro toque refeito" in l["historico"][-1]["texto"]
    assert wa.cancelados == ["s1"]                                                  # a 2ª mensagem agendada foi cancelada


def test_nao_mexe_em_teste_em_quem_respondeu_saiu_ou_ainda_esta_na_etapa_0():
    r, wa = Repo(":memory:"), WaFalso()
    r.lead_put(_lead("TESTE"))
    r.lead_put(_lead("R3", situacao="respondeu"))
    r.lead_put(_lead("R4", situacao="sair"))
    r.lead_put(_lead("R5", etapa=0, enviado1=None))
    r.lead_put(_lead("R6", canal="E-mail"))
    antes = {i: r.lead_get(i) for i in ("TESTE", "R3", "R4", "R5", "R6")}
    out = refazer_primeiro_toque(r, wa, AGORA, manter={"TESTE"})
    assert out == {"refeitos": 0, "cancelados": 0, "erros": 0}
    assert {i: r.lead_get(i) for i in antes} == antes


def test_se_nao_conseguir_cancelar_conta_o_erro_e_mantem_o_agendamento_para_a_conferencia():
    r, wa = Repo(":memory:"), WaFalso()
    wa.fora = True
    r.lead_put(_lead("R7", agendamento={"n": 2, "id": "s9", "sendAt": "2026-10-06T14:30:00Z", "jid": "x"}))
    out = refazer_primeiro_toque(r, wa, AGORA, manter=set())
    assert out["erros"] == 1 and out["refeitos"] == 0
    assert r.lead_get("R7")["etapa"] == 1                                           # nada muda se o cancelamento falhar


def test_rodar_duas_vezes_nao_repete():
    r, wa = Repo(":memory:"), WaFalso()
    r.lead_put(_lead("R8"))
    assert refazer_primeiro_toque(r, wa, AGORA, manter=set())["refeitos"] == 1
    assert refazer_primeiro_toque(r, wa, AGORA, manter=set())["refeitos"] == 0

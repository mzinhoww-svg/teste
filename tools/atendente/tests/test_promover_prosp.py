"""Prospecção: prospecto qualificado vira lead na cadência pela mesma porta da aba Base (api_base.promover).

Fixtures sintéticas: telefones 55659999000NN, nomes, CNPJs e domínios fictícios."""
from datetime import datetime, timezone

import pytest

from atendente.db import Repo
from atendente.prospeccao import promover as prom
from scripts import wa_akg

AGORA = datetime(2026, 10, 7, 14, 0, tzinfo=timezone.utc)
CEL = "5565999900051"


@pytest.fixture
def repo():
    r = Repo(":memory:", sal="sal-de-teste")
    r.campanha_put({"id": "C1", "segmento": "Empresas B2B médias", "uf": "MT", "status": "rodando"})
    return r


def prospecto(repo, i=51, **extra):
    p = {"id": f"P{i}", "campanhaId": "C1", "estado": "qualificado", "motivo": "", "nome": "Maria Exemplo dos Santos",
         "cargo": "Sócio-Administrador", "persona": "decisor", "linkedin": "", "chavePessoa": f"p_k{i}",
         "celular": "(65) 99990-0051", "celularWa": CEL, "jidWa": f"{CEL}@s.whatsapp.net",
         "email": f"maria@distribuidora-ficticia-{i}.com.br", "fonte": "receita:cadastro", "fonteEmail": "treg:trykitt",
         "dominio": f"distribuidora-ficticia-{i}.com.br", "site": f"https://distribuidora-ficticia-{i}.com.br",
         "empresa": "Distribuidora Fictícia", "empresaId": "00000000000151", "cidade": "Cuiabá",
         "custoMicro": 5_000}
    p.update(extra)
    repo.prospecto_put(p)
    return p


def test_lead_novo_fala_com_a_pessoa_pelo_nome(repo):
    p = prospecto(repo)
    r = prom.promover(repo, p, "leticia", AGORA)
    assert r["leadId"].startswith("B") and r["novo"] is True
    lead = repo.lead_get(r["leadId"])
    assert lead["saudacao"] == "Maria"
    assert "Maria" in lead["toques"][0]["mensagem"]
    assert lead["uf"] == "MT" and lead["regiao"] == "MT" and lead["nome"] == "Distribuidora Fictícia"
    # o destino é a pessoa, com WhatsApp já confirmado
    assert wa_akg.telefone_destino(lead) == CEL and lead["jidWa"] == f"{CEL}@s.whatsapp.net"
    c = wa_akg.contato_ativo(lead)
    assert c["nome"] == "Maria Exemplo dos Santos" and c["whatsapp"] == "sim" and c["papel"] == "decisor"
    # fonte e data gravadas; nada de Explee nem fila de enriquecimento (o celular já veio)
    assert lead["prospectoId"] == "P51"
    assert lead["prospeccao"]["fonteCelular"] == "receita:cadastro" and lead["prospeccao"]["em"].startswith("2026-10-07")
    assert "fila" not in lead["enriquecimento"]
    assert not any("Explee" in h["texto"] for h in lead["historico"])
    assert "migrado sem enriquecer" not in lead["flags"]
    assert CEL not in " ".join(h["texto"] for h in lead["historico"])
    # o prospecto e a Base apontam para o lead
    assert repo.prospecto_get("P51")["estado"] == "promovido" and repo.prospecto_get("P51")["leadId"] == r["leadId"]
    base = [b for b in repo.base_todos() if b.get("prospectoId") == "P51"]
    assert len(base) == 1 and base[0]["status"] == "na_cadencia" and base[0]["leadId"] == r["leadId"]
    assert base[0]["uf"] == "MT" and base[0]["decisor"]["nome"] == "Maria Exemplo dos Santos"


def test_promover_idempotente_nao_duplica(repo):
    p = prospecto(repo)
    a = prom.promover(repo, p, "leticia", AGORA)
    b = prom.promover(repo, p, "leticia", AGORA)
    c = prom.promover(repo, dict(p, leadId=None, estado="qualificado"), "leticia", AGORA)  # cópia antiga
    assert a["leadId"] == b["leadId"] == c["leadId"]
    assert len(repo.leads_todos()) == 1 and len(repo.base_todos()) == 1
    assert b["novo"] is False


def test_so_promove_qualificado(repo):
    p = prospecto(repo, estado="descartado", motivo="sem WhatsApp")
    r = prom.promover(repo, p, "leticia", AGORA)
    assert r["leadId"] is None and "qualificado" in r["motivo"]
    assert repo.leads_todos() == [] and repo.base_todos() == []


def test_sem_dominio_volta_para_a_base_com_motivo(repo):
    p = prospecto(repo, dominio="", site="")
    r = prom.promover(repo, p, "leticia", AGORA)
    assert r["leadId"] is None and r["motivo"] == "sem domínio"
    assert repo.leads_todos() == []
    b = repo.base_todos()[0]
    assert b["status"] == "sem_cadencia" and b["motivo"] == "sem domínio"
    assert repo.prospecto_get("P51")["estado"] == "qualificado"      # continua guardado para outro canal


def test_segmento_sem_cadencia_volta_para_a_base(repo):
    repo.campanha_put({"id": "C2", "segmento": "Supermercados", "uf": "MT"})
    p = prospecto(repo, campanhaId="C2")
    r = prom.promover(repo, p, "leticia", AGORA)
    assert r["leadId"] is None and "segmento sem cadência" in r["motivo"]


def test_empresa_ja_na_central_nao_mexe_no_lead(repo):
    repo.lead_put({"id": "B0007", "nome": "Distribuidora Fictícia", "site": "distribuidora-ficticia-51.com.br",
                   "historico": []})
    p = prospecto(repo)
    r = prom.promover(repo, p, "leticia", AGORA)
    assert r == {"leadId": "B0007", "novo": False}
    assert repo.lead_get("B0007") == {"id": "B0007", "nome": "Distribuidora Fictícia",
                                      "site": "distribuidora-ficticia-51.com.br", "historico": []}

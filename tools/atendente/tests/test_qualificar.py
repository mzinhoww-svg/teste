"""Prospecção: normalização do celular, chave de pessoa e qualificação (dedup, lista de saída, WhatsApp).

Fixtures sintéticas: telefones 55659999000NN, nomes e domínios fictícios.
"""
from datetime import datetime, timezone

import pytest

from atendente.db import Repo
from atendente.prospeccao import qualificar as q
from scripts.wa_akg import WaAkgErro

AGORA = datetime(2026, 10, 7, 14, 0, tzinfo=timezone.utc)


class WaFalso:
    """verificar(numeros) -> {numero: jid | None}, como o WaAkgCliente."""

    def __init__(self, sem_whatsapp=(), fora=False):
        self.sem, self.fora, self.chamadas = set(sem_whatsapp), fora, []

    def verificar(self, numeros):
        self.chamadas.append(list(numeros))
        if self.fora:
            raise WaAkgErro(0, "WA-AKG não respondeu em /chat/reiners/check (sem conexão)")
        return {n: (None if n in self.sem else f"{n}@s.whatsapp.net") for n in numeros}


@pytest.fixture
def repo():
    return Repo(":memory:", sal="sal-de-teste")


def prospecto(i=11, **extra):
    p = {"id": f"P{i}", "campanhaId": "C1", "estado": "contato", "nome": "Maria Exemplo", "cargo": "Sócia",
         "chavePessoa": f"k{i}", "celular": f"(65) 99990-00{i:02d}", "email": f"maria@mercado-ficticio-{i}.com.br",
         "linkedin": "", "dominio": f"mercado-ficticio-{i}.com.br", "cnpj": f"000000000001{i:02d}"}
    p.update(extra)
    return p


# ---------------------------------------------------------------- normalizar_celular

@pytest.mark.parametrize("texto", ["(65) 99990-0011", "+55 65 99990-0011", "5565999900011", "065 99990 0011",
                                   "65999900011", " 65.99990.0011 ", "+55 (65) 9 9990-0011"])
def test_celular_sujo_normaliza(texto):
    assert q.normalizar_celular(texto) == "5565999900011"


@pytest.mark.parametrize("texto", ["(65) 3322-1100", "6533221100", "556533221100", "556599900011",
                                   "", None, "abc", "999900011", "5500" + "999900011", "123456789012345",
                                   "(65) 99990-001", "0800 123 4567"])
def test_fixo_nao_vai_para_whatsapp(texto):
    assert q.normalizar_celular(texto) is None


def test_varios_numeros_no_campo_pega_o_celular():
    assert q.normalizar_celular("(65) 3322-1100 / (65) 99990-0012") == "5565999900012"


def test_fixo_nao_qualifica(repo):
    wa = WaFalso()
    r = q.qualificar(repo, wa, prospecto(celular="(65) 3322-1100"), AGORA)
    assert r["estado"] == "descartado" and "celular" in r["motivo"]
    assert wa.chamadas == []


# ---------------------------------------------------------------- chave_pessoa

def test_mesmo_dono_cinco_cnpjs_uma_chave():
    cnpjs = [f"0000000{i}000101" for i in range(1, 6)]
    chaves = {q.chave_pessoa("JOÃO DA SILVA EXEMPLO", [c], "5") for c in cnpjs}
    chaves.add(q.chave_pessoa("  João da  Silva Exemplo ", cnpjs, "5"))
    assert len(chaves) == 1


def test_chave_separa_faixa_etaria_e_nome():
    a = q.chave_pessoa("João da Silva Exemplo", ["00000001000101"], "5")
    assert a != q.chave_pessoa("João da Silva Exemplo", ["00000001000101"], "3")
    assert a != q.chave_pessoa("Maria da Silva Exemplo", ["00000001000101"], "5")
    assert "joao" not in a.lower() and "silva" not in a.lower()   # chave não expõe o nome


def test_nome_curto_nao_junta_pessoas_de_empresas_diferentes():
    assert q.chave_pessoa("João", ["00000001000101"], "") != q.chave_pessoa("João", ["00000002000101"], "")
    # filial da mesma raiz é a mesma empresa
    assert q.chave_pessoa("João", ["00000001000101"], "") == q.chave_pessoa("João", ["00000001000282"], "")


# ---------------------------------------------------------------- qualificar

def test_qualifica_com_whatsapp_e_grava(repo):
    p = prospecto()
    repo.prospecto_put(p)
    wa = WaFalso()
    r = q.qualificar(repo, wa, p, AGORA)
    assert r["estado"] == "qualificado"
    assert r["numero"] == "5565999900011" and r["jid"] == "5565999900011@s.whatsapp.net"
    assert wa.chamadas == [["5565999900011"]]
    g = repo.prospecto_get("P11")
    assert g["estado"] == "qualificado" and g["celularWa"] == "5565999900011"
    assert g["jidWa"] == "5565999900011@s.whatsapp.net" and g["qualificadoEm"] == "2026-10-07T14:00:00Z"


def test_quem_pediu_sair_nunca_qualifica(repo):
    repo.sair_add("65 99990-0011")
    wa = WaFalso()
    r = q.qualificar(repo, wa, prospecto(), AGORA)
    assert r == {"estado": "descartado", "motivo": "pediu para sair"}
    assert wa.chamadas == []                                 # nem é consultado
    repo2 = Repo(":memory:", sal="sal-de-teste")
    repo2.sair_add("maria@mercado-ficticio-11.com.br")       # pelo e-mail também
    assert q.qualificar(repo2, wa, prospecto(), AGORA)["motivo"] == "pediu para sair"


def test_sem_whatsapp_descarta_com_motivo(repo):
    p = prospecto()
    repo.prospecto_put(p)
    r = q.qualificar(repo, WaFalso(sem_whatsapp={"5565999900011"}), p, AGORA)
    assert r["estado"] == "descartado" and r["motivo"] == "sem WhatsApp"
    g = repo.prospecto_get("P11")
    assert g["estado"] == "descartado" and g["motivo"] == "sem WhatsApp"


def test_wa_fora_do_ar_nao_descarta(repo):
    p = prospecto()
    repo.prospecto_put(p)
    r = q.qualificar(repo, WaFalso(fora=True), p, AGORA)
    assert r["estado"] == "pendente" and "WhatsApp" in r["motivo"]
    assert repo.prospecto_get("P11")["estado"] == "contato"      # fica onde estava, tenta de novo depois


def test_ja_e_lead_pelo_telefone(repo):
    repo.lead_put({"id": "R0001", "nome": "Outra", "telefone": "65999900011", "contatos": []})
    r = q.qualificar(repo, WaFalso(), prospecto(), AGORA)
    assert r["estado"] == "descartado" and "R0001" in r["motivo"]


def test_ja_e_lead_pelo_contato_ou_dominio(repo):
    repo.lead_put({"id": "R0002", "site": "https://www.mercado-ficticio-11.com.br/", "contatos": []})
    assert "R0002" in q.qualificar(repo, WaFalso(), prospecto(), AGORA)["motivo"]
    repo2 = Repo(":memory:", sal="s")
    repo2.lead_put({"id": "R0003", "contatos": [{"id": "c1", "telefone": "+55 65 99990-0011"}]})
    assert "R0003" in q.qualificar(repo2, WaFalso(), prospecto(), AGORA)["motivo"]


def test_dominio_generico_nao_conta_como_duplicado(repo):
    repo.lead_put({"id": "R0004", "site": "https://instagram.com/x", "email": "a@gmail.com", "contatos": []})
    r = q.qualificar(repo, WaFalso(), prospecto(dominio="instagram.com", email="b@gmail.com"), AGORA)
    assert r["estado"] == "qualificado"


def test_ja_esta_na_base_pelo_linkedin_ou_dominio(repo):
    repo.base_put({"id": "D00001", "dominio": "outra-ficticia.com.br", "status": "base",
                   "decisor": {"nome": "X", "linkedin": "https://www.linkedin.com/in/maria-exemplo-ficticia/"}})
    r = q.qualificar(repo, WaFalso(), prospecto(linkedin="linkedin.com/in/maria-exemplo-ficticia"), AGORA)
    assert r["estado"] == "descartado" and "Base" in r["motivo"]
    repo.base_put({"id": "D00002", "dominio": "mercado-ficticio-12.com.br", "status": "base"})
    assert "Base" in q.qualificar(repo, WaFalso(), prospecto(12), AGORA)["motivo"]


def test_ja_e_cliente(repo):
    repo.cliente_put({"id": "K1", "nome": "Cliente Fictício", "telefone": "5565999900011"})
    r = q.qualificar(repo, WaFalso(), prospecto(), AGORA)
    assert r["estado"] == "descartado" and "cliente" in r["motivo"]


def test_mesma_pessoa_ja_qualificada_em_outro_prospecto(repo):
    repo.prospecto_put(prospecto(11, estado="qualificado", chavePessoa="dono-x"))
    outro = prospecto(12, chavePessoa="dono-x")                       # mesmo dono, outro CNPJ
    r = q.qualificar(repo, WaFalso(), outro, AGORA)
    assert r["estado"] == "descartado" and "mesma pessoa" in r["motivo"]
    mesmo_numero = prospecto(13, celular="65999900011", chavePessoa="k13")
    assert "mesma pessoa" in q.qualificar(repo, WaFalso(), mesmo_numero, AGORA)["motivo"]


def test_requalificar_o_mesmo_prospecto_e_idempotente(repo):
    p = prospecto()
    repo.prospecto_put(p)
    assert q.qualificar(repo, WaFalso(), p, AGORA)["estado"] == "qualificado"
    assert q.qualificar(repo, WaFalso(), repo.prospecto_get("P11"), AGORA)["estado"] == "qualificado"
    # e o lead que ele mesmo virou (promovido) não conta como duplicado
    repo.lead_put({"id": "B0001", "prospectoId": "P11", "telefone": "65999900011", "contatos": []})
    assert q.qualificar(repo, WaFalso(), repo.prospecto_get("P11"), AGORA)["estado"] == "qualificado"


def test_motivo_nao_leva_telefone(repo):
    repo.lead_put({"id": "R0001", "telefone": "65999900011", "contatos": []})
    r = q.qualificar(repo, WaFalso(), prospecto(), AGORA)
    assert "99990" not in r["motivo"]

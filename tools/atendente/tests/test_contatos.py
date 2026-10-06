"""Prospecção: cascata de contato da pessoa (cadastro filtrado → celular pago → e-mail).

Treg falso no formato real; filtro de contabilidade pela tabela contatos_compartilhados (só hash). Telefones
55659999000NN, domínios fictícios."""
import pytest

from atendente.db import Repo
from atendente.prospeccao import cnpj_mt, contatos
from atendente.prospeccao.campanha import Orcamento

from test_treg_ops import _cli, _ok

CEL_CADASTRO = "5565999900031"
CEL_TREG = "5565999900032"


class WaFalso:
    def __init__(self, sem=()):
        self.sem, self.chamadas = set(sem), []

    def verificar(self, numeros):
        self.chamadas.append(list(numeros))
        return {n: (None if n in self.sem else f"{n}@s.whatsapp.net") for n in numeros}


@pytest.fixture
def repo():
    return Repo(":memory:", sal="sal-de-teste")


def empresa(**extra):
    e = {"id": "00000000000191", "cnpj": "00000000000191", "nome": "Mercado Fictício", "cnae": "4711302",
         "porte": "micro", "telefone": "(65) 99990-0031", "telefones": ["(65) 99990-0031"],
         "email": "", "dominio": "mercado-ficticio.com.br", "socios": []}
    e.update(extra)
    return e


def pessoa(**extra):
    p = {"nome": "Maria Exemplo", "cargo": "Sócio-Administrador", "fonte": "receita", "linkedin": "",
         "chavePessoa": "p_teste", "empresa": "Mercado Fictício", "dominio": "mercado-ficticio.com.br"}
    p.update(extra)
    return p


def respostas(celular=None, email=None, provedor="aiark", custo=26_000):
    return {"treg.people.phone.find": _ok({"phone": celular}, provedor, custo if celular else 0),
            "treg.people.email.find": _ok({"email": email}, "trykitt", 5_000 if email else 0)}


def test_cascata_para_no_primeiro_achado(repo):
    cli, t = _cli(respostas(celular=CEL_TREG, email="maria@mercado-ficticio.com.br"))
    r = contatos.enriquecer(repo, cli, WaFalso(), pessoa(), empresa(), Orcamento(10**6))
    assert r["celular"] == CEL_CADASTRO and r["fonte"] == "receita:cadastro"
    assert [c["endpoint"] for c in t.chamadas] == ["treg.people.email.find"]   # celular grátis: não paga celular
    assert r["email"] == "maria@mercado-ficticio.com.br" and r["fonteEmail"] == "treg:trykitt"
    assert r["custoMicro"] == 5_000


def test_cadastro_compartilhado_nao_vira_celular(repo):
    repo.compartilhado_set(cnpj_mt.chave_hash("telefone", CEL_CADASTRO), 3, ["4711302", "4712100"],
                           "2026-10-01", "2026-10-07")
    cli, t = _cli(respostas(celular="+55 65 99990-0032"))
    o = Orcamento(10**6)
    r = contatos.enriquecer(repo, cli, WaFalso(), pessoa(), empresa(), o)
    assert r["celular"] == CEL_TREG and r["fonte"] == "treg:aiark"
    assert t.chamadas[0]["endpoint"] == "treg.people.phone.find"
    assert t.chamadas[0]["headers"]["X-Treg-Route-Prefer"].startswith("aiark")
    assert r["custoMicro"] == 26_000 and o.gasto_micro == 26_000


def test_cadastro_de_empresa_de_contabilidade_nao_vira_celular(repo):
    cli, _ = _cli(respostas())
    r = contatos.enriquecer(repo, cli, WaFalso(), pessoa(), empresa(cnae="6920601"), Orcamento(10**6))
    assert r["celular"] is None


def test_cadastro_fixo_ou_sem_whatsapp_segue_a_cascata(repo):
    cli, t = _cli(respostas(celular=CEL_TREG))
    r = contatos.enriquecer(repo, cli, WaFalso(), pessoa(), empresa(telefones=["(65) 3322-1100"],
                            telefone="(65) 3322-1100"), Orcamento(10**6))
    assert r["fonte"] == "treg:aiark"
    cli, t = _cli(respostas(celular=CEL_TREG))
    r = contatos.enriquecer(repo, cli, WaFalso(sem={CEL_CADASTRO}), pessoa(), empresa(), Orcamento(10**6))
    assert r["celular"] == CEL_TREG


def test_cadastro_so_vale_para_socio_da_receita(repo):
    cli, t = _cli(respostas())
    r = contatos.enriquecer(repo, cli, WaFalso(), pessoa(fonte="treg:aiark", linkedin="https://linkedin.com/in/x"),
                            empresa(), Orcamento(10**6))
    assert r["celular"] is None and t.chamadas[0]["endpoint"] == "treg.people.phone.find"


def test_quem_pediu_sair_nao_e_consultado(repo):
    repo.sair_add(CEL_CADASTRO)
    wa = WaFalso()
    cli, _ = _cli(respostas())
    r = contatos.enriquecer(repo, cli, wa, pessoa(), empresa(), Orcamento(10**6))
    assert r["celular"] is None and wa.chamadas == []


def test_email_de_contador_descartado(repo):
    cli, t = _cli(respostas(email="maria@mercado-ficticio.com.br"))
    r = contatos.enriquecer(repo, cli, WaFalso(), pessoa(),
                            empresa(email="fiscal@contabil-exemplo.com.br"), Orcamento(10**6))
    assert r["email"] == "maria@mercado-ficticio.com.br" and r["fonteEmail"] == "treg:trykitt"
    # e-mail do cadastro no domínio da própria empresa vale, sem pagar
    cli, t = _cli(respostas(email="outro@mercado-ficticio.com.br"))
    r = contatos.enriquecer(repo, cli, WaFalso(), pessoa(),
                            empresa(email="Maria@Mercado-Ficticio.com.br"), Orcamento(10**6))
    assert r["email"] == "maria@mercado-ficticio.com.br" and r["fonteEmail"] == "receita:cadastro"
    assert t.chamadas == []
    # webmail no cadastro não é da empresa
    cli, t = _cli(respostas(email=None))
    r = contatos.enriquecer(repo, cli, WaFalso(), pessoa(), empresa(email="alguem@gmail.com"), Orcamento(10**6))
    assert r["email"] is None


def test_email_do_treg_de_escritorio_contabil_descartado(repo):
    cli, _ = _cli(respostas(email="maria@escritorio-contab-ficticio.com.br"))
    r = contatos.enriquecer(repo, cli, WaFalso(), pessoa(), empresa(), Orcamento(10**6))
    assert r["email"] is None


def test_sem_linkedin_e_sem_site_nao_paga(repo):
    cli, t = _cli(respostas(celular=CEL_TREG))
    r = contatos.enriquecer(repo, cli, WaFalso(), pessoa(dominio=""), empresa(dominio="", telefones=[], telefone=""),
                            Orcamento(10**6))
    assert r["celular"] is None and t.chamadas == []


def test_sem_orcamento_nao_paga_e_avisa(repo):
    cli, t = _cli(respostas(celular=CEL_TREG))
    r = contatos.enriquecer(repo, cli, WaFalso(), pessoa(), empresa(telefones=[], telefone=""), Orcamento(1_000))
    assert r["celular"] is None and r["semOrcamento"] and t.chamadas == []


def test_miss_pago_registra_custo_zero(repo):
    cli, t = _cli(respostas())
    o = Orcamento(10**6)
    r = contatos.enriquecer(repo, cli, WaFalso(), pessoa(), empresa(telefones=[], telefone=""), o)
    assert r == {"celular": None, "email": None, "fonte": "", "fonteEmail": "", "custoMicro": 0,
                 "semOrcamento": False}
    assert len(t.chamadas) == 2

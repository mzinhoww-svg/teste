"""Camada de alto nível do treg para a prospecção (Tarefa 1).

Nada aqui usa a rede nem gasta dinheiro: o `TregCliente` real fala com um transporte falso que devolve o formato
real do treg (corpo `{output, raw, _treg: {served_by, tried}}`, custo em `X-Treg-Cost-Micro`). "Não achou" é 200
com `output.phone == null` ou `output.places == []`. Números fictícios 55659999000NN."""
import json

import pytest

from atendente.prospeccao import treg_ops
from scripts.enriquecer_leads import TregCliente, TregErro


class Transporte:
    """Responde por endpoint: `respostas[endpoint] = (status, headers, corpo)` ou uma função (headers, corpo)."""

    def __init__(self, respostas):
        self.respostas = respostas
        self.chamadas = []

    def __call__(self, metodo, url, headers, corpo):
        ep = url.rsplit("/", 1)[-1]
        dados = json.loads(corpo) if corpo else None
        self.chamadas.append({"endpoint": ep, "headers": dict(headers), "corpo": dados})
        r = self.respostas[ep]
        if callable(r):
            r = r(headers, dados)
        status, hs, body = r
        return status, hs, json.dumps(body).encode()


def _ok(output, provedor="aiark", custo=0, tried=None):
    return 200, {"X-Treg-Cost-Micro": str(custo), "X-Treg-Served-By": provedor, "X-Treg-Call-Id": "call-teste"}, \
        {"output": output, "raw": {}, "_treg": {"served_by": provedor, "tried": tried or [provedor]}}


def _cli(respostas):
    t = Transporte(respostas)
    return TregCliente("tok-de-teste-inventado", transporte=t, dormir=lambda s: None), t


PESSOA = {"nome": "Pessoa Exemplo Silva", "dominio": "empresa-exemplo.com.br", "empresa": "Empresa Exemplo",
          "linkedin": "https://www.linkedin.com/in/pessoa-exemplo"}


# ---------------------------------------------------------------- cabeçalhos de rota no TregCliente

def test_chamar_aceita_cabecalhos_de_rota_sem_mexer_no_teto():
    cli, t = _cli({"treg.people.phone.find": _ok({"phone": None})})
    cli.chamar("treg.people.phone.find", {"x": 1}, 150_000, "k1",
               cabecalhos={"X-Treg-Route-Prefer": "aiark", "X-Treg-Route-Exclude": "lusha"})
    h = t.chamadas[0]["headers"]
    assert h["X-Treg-Route-Prefer"] == "aiark"
    assert h["X-Treg-Route-Exclude"] == "lusha"
    assert h["X-Treg-Route-Max-Cost"] == "0.15"
    assert "Prefer" not in json.dumps(t.chamadas[0]["corpo"])     # opções de rota nunca no corpo


def test_chamar_recusa_cabecalho_que_nao_e_de_rota_ou_que_sobrepoe_o_teto():
    cli, t = _cli({"treg.people.phone.find": _ok({"phone": None})})
    for ruim in ({"X-Treg-Token": "outro"}, {"Idempotency-Key": "x"}, {"X-Treg-Route-Max-Cost": "9"}):
        with pytest.raises(ValueError):
            cli.chamar("treg.people.phone.find", {}, 150_000, "k", cabecalhos=ruim)
    assert t.chamadas == []


def test_chamar_sem_cabecalhos_continua_igual():
    cli, t = _cli({"treg.people.phone.find": _ok({"phone": None})})
    cli.chamar("treg.people.phone.find", {}, 10_000, "k")
    assert not any(k.startswith("X-Treg-Route-") and k != "X-Treg-Route-Max-Cost" for k in t.chamadas[0]["headers"])


# ---------------------------------------------------------------- celular

def test_celular_miss_nao_e_erro():
    cli, _ = _cli({"treg.people.phone.find": _ok({"phone": None})})
    assert treg_ops.celular(cli, PESSOA, [], 150_000, "k") is None


def test_celular_achou_devolve_telefone_provedor_e_custo():
    cli, t = _cli({"treg.people.phone.find": _ok({"phone": "+55 (65) 99990-0001"}, "wiza", 120_000)})
    r = treg_ops.celular(cli, PESSOA, ["wiza"], 150_000, "k")
    assert r == {"telefone": "5565999900001", "provedor": "wiza", "custoMicro": 120_000}
    corpo = t.chamadas[0]["corpo"]
    assert corpo["linkedin_url"] == PESSOA["linkedin"]
    assert corpo["domain"] == PESSOA["dominio"]                   # roteado: manda tudo que sabe


def test_celular_fixo_nao_conta_como_achado():
    cli, _ = _cli({"treg.people.phone.find": _ok({"phone": "556530000000"}, "aiark", 26_000)})
    vistos = []
    assert treg_ops.celular(cli, PESSOA, [], 150_000, "k", registro=vistos.append) is None
    assert vistos == [{"etapa": "celular", "provedor": "aiark", "custoMicro": 26_000, "achou": False}]


def test_ordem_vira_cabecalho_prefer():
    cli, t = _cli({"treg.people.phone.find": _ok({"phone": None})})
    treg_ops.celular(cli, PESSOA, ["aiark", "wiza", "-lusha", "-dropleads"], 150_000, "k")
    h = t.chamadas[0]["headers"]
    assert h["X-Treg-Route-Prefer"] == "aiark,wiza"
    assert h["X-Treg-Route-Exclude"] == "lusha,dropleads"


def test_ordem_vazia_nao_manda_cabecalho_de_rota():
    cli, t = _cli({"treg.people.phone.find": _ok({"phone": None})})
    treg_ops.celular(cli, PESSOA, [], 150_000, "k")
    h = t.chamadas[0]["headers"]
    assert "X-Treg-Route-Prefer" not in h and "X-Treg-Route-Exclude" not in h


def test_402_vira_SemSaldo():
    corpo = {"error": "insufficient_balance", "balance_micro": 3, "topup_url": "https://treg.to/topup"}
    cli, _ = _cli({"treg.people.phone.find": (402, {}, corpo),
                   "treg.people.email.find": (402, {}, corpo),
                   "treg.google.serp.maps": (402, {}, corpo),
                   "treg.people.search": (402, {}, corpo)})
    with pytest.raises(treg_ops.SemSaldo) as e:
        treg_ops.celular(cli, PESSOA, [], 150_000, "k")
    assert "saldo" in str(e.value).lower()
    with pytest.raises(treg_ops.SemSaldo):
        treg_ops.email(cli, PESSOA, 10_000, "k")
    with pytest.raises(treg_ops.SemSaldo):
        treg_ops.maps(cli, "padaria", "Cuiabá", 5_000, "k")
    with pytest.raises(treg_ops.SemSaldo):
        treg_ops.decisores(cli, "empresa-exemplo.com.br", ["dono"], 5_000, "k")


def test_402_de_teto_da_chamada_nao_e_falta_de_saldo():
    cli, _ = _cli({"treg.people.phone.find": (402, {}, {"error": "route_max_cost"})})
    with pytest.raises(TregErro) as e:
        treg_ops.celular(cli, PESSOA, [], 150_000, "k")
    assert not isinstance(e.value, treg_ops.SemSaldo)


def test_celular_sem_linkedin_manda_nome_e_dominio():
    cli, t = _cli({"treg.people.phone.find": _ok({"phone": None})})
    treg_ops.celular(cli, {"nome": "Pessoa Exemplo Silva", "dominio": "empresa-exemplo.com.br"}, [], 150_000, "k")
    corpo = t.chamadas[0]["corpo"]
    assert corpo["first_name"] == "Pessoa" and corpo["last_name"] == "Exemplo Silva"
    assert corpo["full_name"] == "Pessoa Exemplo Silva"
    assert "linkedin_url" not in corpo


# ---------------------------------------------------------------- e-mail

def test_email_achou_e_miss():
    cli, _ = _cli({"treg.people.email.find": _ok({"email": "pessoa@empresa-exemplo.com.br"}, "trykitt", 5_000)})
    assert treg_ops.email(cli, PESSOA, 10_000, "k") == {
        "email": "pessoa@empresa-exemplo.com.br", "provedor": "trykitt", "custoMicro": 5_000}
    cli, _ = _cli({"treg.people.email.find": _ok({"email": None})})
    assert treg_ops.email(cli, PESSOA, 10_000, "k") is None
    cli, _ = _cli({"treg.people.email.find": _ok({"email": "isto não é e-mail"})})
    assert treg_ops.email(cli, PESSOA, 10_000, "k") is None


# ---------------------------------------------------------------- Google Maps

def test_maps_monta_corpo_e_normaliza_lugares():
    lugar = {"title": "Padaria Exemplo", "address": "Rua Um, 10 - Centro, Cuiabá - MT",
             "phoneNumber": "(65) 99990-0002", "website": "https://padaria-exemplo.com.br/",
             "category": "Padaria", "placeId": "ChIJ-teste-1"}
    cli, t = _cli({"treg.google.serp.maps": _ok({"places": [lugar, {"title": ""}]}, "serper", 2_000)})
    r = treg_ops.maps(cli, "padaria", "Cuiabá", 5_000, "k")
    assert r == [{"nome": "Padaria Exemplo", "endereco": "Rua Um, 10 - Centro, Cuiabá - MT",
                  "telefone": "5565999900002", "site": "https://padaria-exemplo.com.br/", "categoria": "Padaria",
                  "place_id": "ChIJ-teste-1"}]
    corpo = t.chamadas[0]["corpo"]
    assert corpo["country"] == "br" and corpo["language"] == "pt"
    assert "padaria" in corpo["q"] and "Cuiabá" in corpo["q"] and "MT" in corpo["q"]


def test_maps_lista_vazia_e_miss():
    cli, _ = _cli({"treg.google.serp.maps": _ok({"places": []})})
    assert treg_ops.maps(cli, "padaria", "Cuiabá", 5_000, "k") == []


def test_maps_telefone_sujo_vira_vazio():
    cli, _ = _cli({"treg.google.serp.maps": _ok({"places": [{"title": "X", "phone": "ramal 12"}]})})
    assert treg_ops.maps(cli, "padaria", "Cuiabá", 5_000, "k")[0]["telefone"] == ""


# ---------------------------------------------------------------- decisores

def test_decisores_normaliza_pessoas():
    pessoas = [{"name": "Pessoa Um", "title": "Sócio-proprietário",
                "linkedin_url": "https://www.linkedin.com/in/pessoa-um"},
               {"full_name": "Pessoa Dois", "job_title": "Gerente de Marketing"},
               {"name": ""}]
    cli, t = _cli({"treg.people.search": _ok({"people": pessoas}, "aiark", 0)})
    r = treg_ops.decisores(cli, "empresa-exemplo.com.br", ["dono", "marketing"], 5_000, "k")
    assert r == [{"nome": "Pessoa Um", "cargo": "Sócio-proprietário",
                  "linkedin": "https://www.linkedin.com/in/pessoa-um"},
                 {"nome": "Pessoa Dois", "cargo": "Gerente de Marketing", "linkedin": ""}]
    corpo = t.chamadas[0]["corpo"]
    assert corpo["company_domain"] == "empresa-exemplo.com.br" and corpo["title"] == "dono"


def test_decisores_vazio():
    cli, _ = _cli({"treg.people.search": _ok({"people": []})})
    assert treg_ops.decisores(cli, "empresa-exemplo.com.br", ["dono"], 5_000, "k") == []


def test_decisores_uma_chamada_por_cargo_sem_repetir_pessoa():
    pessoas = [{"name": "Pessoa Um", "title": "Sócio"}]
    cli, t = _cli({"treg.people.search": _ok({"people": pessoas}, "aiark", 0)})
    r = treg_ops.decisores(cli, "empresa-exemplo.com.br", ["dono", "sócio"], 5_000, "k")
    assert len(t.chamadas) == 2 and [c["corpo"]["title"] for c in t.chamadas] == ["dono", "sócio"]
    assert [p["nome"] for p in r] == ["Pessoa Um"]            # a mesma pessoa nas duas buscas entra uma vez

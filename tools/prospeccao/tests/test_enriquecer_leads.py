import json
from datetime import datetime, timedelta, timezone

import pytest

from scripts.enriquecer_leads import (TregCliente, aplicar, decisor_alvo, estimar, executar, extrair_telefone, ler_token,
                                      limpar, limpar_telefone, main, recuperar_call, selecionar,
                                      transporte_simulado)

AGORA = datetime(2026, 10, 2, 12, 0, tzinfo=timezone.utc)
TEL = "5565999991111"


def lead(id="R1", **kw):
    base = {"id": id, "nome": "Empresa", "saudacao": "Dr. Davi", "situacao": "ativo", "faixa": "B", "score": 50,
            "etapa": 1, "site": "https://www.exemplo.com.br/contato", "contatos": [], "historico": [],
            "pendencias": [], "decisores": [{"nome": "Davi Hoffmann Ferreira", "cargo": "Sócio", "linkedin": ""}],
            "enriquecimento": {"status": "parcial"}, "contatoAtivo": "k1"}
    base.update(kw)
    return base


# ---------------------------------------------------------------- limpeza

def test_normaliza_10_e_11_digitos():
    assert limpar_telefone("(65) 3000-0000") == "556530000000"
    assert limpar_telefone("065 99999-1111") == TEL
    assert limpar_telefone("+55 65 99999-1111") == TEL
    assert limpar_telefone("12345") == ""


def test_limpar_marca_invalido_sem_apagar_e_registra():
    l = lead(contatos=[{"id": "k1", "telefone": "(65) 99999-1111"}, {"id": "k2", "telefone": "123"},
                       {"id": "k3", "email": "a@b.com"}])
    out, alt = limpar([l])
    c = out[0]["contatos"]
    assert [x["id"] for x in c] == ["k1", "k2", "k3"]
    assert c[0]["telefone"] == TEL and "invalido" not in c[0]
    assert c[1]["telefone"] == "123" and c[1]["invalido"] is True
    assert "telefone" not in c[2]
    assert {(a["tipo"], a["contatoId"]) for a in alt} == {("normalizado", "k1"), ("invalido", "k2")}
    assert l["contatos"][0]["telefone"] == "(65) 99999-1111"  # entrada intacta


def test_limpar_deduplica_e_mescla():
    l = lead(contatos=[{"id": "k1", "papel": "geral", "telefone": "65999991111", "email": ""},
                       {"id": "k2", "papel": "decisor", "telefone": "(65) 99999-1111", "email": "d@x.com",
                        "nome": "Davi"}])
    out, alt = limpar([l])
    assert len(out[0]["contatos"]) == 1
    k = out[0]["contatos"][0]
    assert k["id"] == "k1" and k["papel"] == "geral" and k["email"] == "d@x.com" and k["nome"] == "Davi"
    assert [a["tipo"] for a in alt] == ["normalizado", "normalizado", "duplicado_removido"]


def test_limpar_ignora_sair_e_fechou():
    ls = [lead("A", situacao="sair", contatos=[{"id": "k1", "telefone": "65999991111"}]),
          lead("B", situacao="fechou", contatos=[{"id": "k1", "telefone": "65999991111"}])]
    out, alt = limpar(ls)
    assert out == ls
    assert [a["tipo"] for a in alt] == ["ignorado", "ignorado"]


# ---------------------------------------------------------------- seleção

def test_decisor_alvo_saudacao_sem_acento_e_titulo():
    l = lead(saudacao="Dra. Joana", decisores=[{"nome": "Carlos Silva"}, {"nome": "Dra. JOÃNA Prado"}])
    assert decisor_alvo(l)[0] == 1
    l2 = lead(saudacao="Dr. Zé", decisores=[{"nome": "Carlos Silva"}, {"nome": "Ana"}])
    assert decisor_alvo(l2)[0] == 0
    assert decisor_alvo(lead(decisores=[])) is None


def test_selecionar_exclusoes():
    velho = (AGORA - timedelta(days=91)).isoformat()
    novo = (AGORA - timedelta(days=10)).isoformat()
    ls = [
        lead("ok"), lead("sair", situacao="sair"), lead("fechou", situacao="fechou"),
        lead("recente", buscaTreg={"em": novo, "resultado": "nao_achou"}), lead("antigo", buscaTreg={"em": velho, "resultado": "nao_achou"}),
        lead("tem", contatos=[{"id": "k1", "papel": "decisor", "telefone": TEL}]),
        lead("invalido", contatos=[{"id": "k1", "papel": "decisor", "telefone": "1", "invalido": True}]),
        lead("geral", contatos=[{"id": "k1", "papel": "geral", "telefone": TEL}]),
        lead("semdec", decisores=[]),
    ]
    ids = [c["leadId"] for c in selecionar(ls, AGORA)]
    assert sorted(ids) == ["antigo", "geral", "invalido", "ok"]


def test_selecionar_campos_e_ordem():
    ls = [lead("c", faixa="B", score=90, etapa=0), lead("b", faixa="A", score=10, etapa=1),
          lead("a", faixa="A", score=80, etapa=1), lead("d", faixa="A", score=80, etapa=0),
          lead("e", faixa="A", score=80, etapa=0)]
    assert [c["leadId"] for c in selecionar(ls, AGORA)] == ["d", "e", "a", "b", "c"]
    c = selecionar([lead("x")], AGORA)[0]
    assert c == {"leadId": "x", "decisorIndex": 0, "nome": "Davi Hoffmann Ferreira", "primeiro": "Davi",
                 "sobrenome": "Ferreira", "cargo": "Sócio", "linkedin": "", "dominio": "exemplo.com.br"}


# ---------------------------------------------------------------- estimativa

def test_estimar_piloto_e_historico():
    cs = [{"linkedin": "x"}] * 10 + [{"linkedin": ""}] * 10
    e = estimar(cs, [])
    assert e["fonte"] == "piloto" and e["taxa"] == 0.33 and e["custoPorAcertoMicro"] == 125000
    assert e["buscasLinkedin"] == 10
    assert e["custoEstimadoMicro"] == round(20 * 0.33 * 125000 + 10 * 2600)
    h = estimar(cs, [{"consultados": 10, "achados": 5, "gastoMicro": 500000},
                     {"consultados": 10, "achados": 5, "gastoMicro": 500000}])
    assert h["fonte"] == "historico" and h["taxa"] == 0.5 and h["custoPorAcertoMicro"] == 100000
    assert h["custoEstimadoMicro"] == round(20 * 0.5 * 100000 + 26000)


# ---------------------------------------------------------------- cliente falso

class Falso:
    """Transporte falso: `respostas` é uma função (metodo, url, headers, corpo)->(status, headers, dict) ou fila."""

    def __init__(self, fn):
        self.fn, self.chamadas = fn, []

    def __call__(self, metodo, url, headers, corpo):
        self.chamadas.append({"metodo": metodo, "url": url, "headers": headers,
                              "corpo": json.loads(corpo) if corpo else None})
        status, hs, dados = self.fn(self.chamadas[-1])
        return status, hs, json.dumps(dados).encode()


def ok_phone(tel=TEL, custo=125000, prov="wiza", call="c1"):
    return 200, {"X-Treg-Cost-Micro": str(custo), "X-Treg-Call-Id": call, "X-Treg-Served-By": prov}, \
        {"output": {"phone": tel}}


def cliente(fn, dormir=None):
    t = Falso(fn)
    return TregCliente("tok", transporte=t, dormir=dormir or (lambda s: None)), t


def cand(id="R1", linkedin="https://www.linkedin.com/in/davi", **kw):
    c = {"leadId": id, "decisorIndex": 0, "nome": "Davi Hoffmann Ferreira", "primeiro": "Davi",
         "sobrenome": "Ferreira", "cargo": "Sócio", "linkedin": linkedin, "dominio": "exemplo.com.br"}
    c.update(kw)
    return c


def test_achou_com_linkedin_so_manda_linkedin_url():
    cli, t = cliente(lambda c: ok_phone())
    r = executar([cand()], cli, "E1", 5_000_000)
    ch = t.chamadas[0]
    assert ch["url"] == "https://treg.to/call/treg.people.phone.find"
    assert ch["corpo"] == {"linkedin_url": "https://www.linkedin.com/in/davi"}
    assert ch["headers"]["Idempotency-Key"] == "E1-R1-phone"
    assert ch["headers"]["X-Treg-Route-Max-Cost"] == "0.15"  # US$0,15 = 150000 micro
    assert ch["headers"]["X-Treg-Token"] == "tok"
    assert r["consultados"] == 1 and r["achados"] == 1 and r["gastoMicro"] == 125000
    assert r["motivoParada"] is None and r["taxa"] == 1.0
    assert r["porLead"]["R1"] == {"resultado": "achou", "telefone": TEL, "provedor": "wiza",
                                  "callIds": ["c1"], "custoMicro": 125000}


def test_enrich_depois_phone():
    def fn(c):
        if c["url"].endswith("people.enrich"):
            return 200, {"X-Treg-Cost-Micro": "2600", "X-Treg-Call-Id": "e1"}, \
                {"output": {"profile": {"url": "https://br.linkedin.com/in/davi-ferreira-123"}}}
        return ok_phone(call="p1")
    cli, t = cliente(fn)
    r = executar([cand(linkedin="")], cli, "E1", 5_000_000)
    e, p = t.chamadas
    assert e["corpo"] == {"domain": "exemplo.com.br", "full_name": "Davi Hoffmann Ferreira"}
    assert e["headers"]["Idempotency-Key"] == "E1-R1-enrich" and e["headers"]["X-Treg-Route-Max-Cost"] == "0.01"
    assert p["corpo"] == {"linkedin_url": "https://br.linkedin.com/in/davi-ferreira-123"}
    assert p["headers"]["Idempotency-Key"] == "E1-R1-phone"
    x = r["porLead"]["R1"]
    assert x["linkedinNovo"] == "https://br.linkedin.com/in/davi-ferreira-123"
    assert x["callIds"] == ["e1", "p1"] and x["custoMicro"] == 127600 and r["gastoMicro"] == 127600


def test_sem_linkedin_na_resposta_busca_por_nome_e_dominio():
    cli, t = cliente(lambda c: (200, {}, {"output": {}}) if "enrich" in c["url"] else ok_phone())
    executar([cand(linkedin="")], cli, "E1", 5_000_000)
    assert t.chamadas[1]["corpo"] == {"domain": "exemplo.com.br", "first_name": "Davi", "last_name": "Ferreira"}


def test_rejeita_numero_nao_brasileiro_e_pega_o_primeiro_valido():
    cli, _ = cliente(lambda c: ok_phone("+1 555 010 1000", custo=0))
    r = executar([cand()], cli, "E1", 5_000_000)
    assert r["porLead"]["R1"]["resultado"] == "nao_achou" and r["achados"] == 0
    corpo = {"output": {"phones": ["+1 555 010 1000", "(65) 3000-0000", "65 99999-1111"], "employee_phone_type": "mobile"}}
    assert extrair_telefone(corpo) == TEL  # celular antes de fixo
    assert extrair_telefone({"data": {"mobile": 65999991111}}) == TEL
    assert extrair_telefone({"data": {"name": "65999991111"}}) == ""


def test_para_abaixo_de_30_por_cento_depois_do_lote():
    fim = []
    cli, t = cliente(lambda c: ok_phone("", custo=0))
    cs = [cand(f"R{i}") for i in range(25)]
    r = executar(cs, cli, "E1", 5_000_000, lote=10, ao_fim_do_lote=fim.append)
    assert r["motivoParada"] == "acerto abaixo de 30%"
    assert r["consultados"] == 10 and len(t.chamadas) == 10 and len(fim) == 1 and fim[0]["consultados"] == 10


def test_segue_com_30_por_cento():
    n = {"i": 0}

    def fn(c):
        n["i"] += 1
        return ok_phone() if n["i"] % 10 in (1, 2, 3) else ok_phone("", custo=0)
    cli, _ = cliente(fn)
    r = executar([cand(f"R{i}") for i in range(20)], cli, "E1", 50_000_000, lote=10)
    assert r["motivoParada"] is None and r["consultados"] == 20 and r["achados"] == 6


def test_para_no_teto():
    cli, t = cliente(lambda c: ok_phone(custo=4_000_000))
    r = executar([cand(f"R{i}") for i in range(10)], cli, "E1", 100_000_000, teto_micro=10_000_000, lote=100)
    # 2 chamadas = 8,0M; terceira: 8,0M + 0,15M <= 10M ok; 12M > teto depois
    assert r["motivoParada"] == "teto de US$10" and r["gastoMicro"] == 12_000_000 and len(t.chamadas) == 3
    cli, t = cliente(lambda c: ok_phone(custo=1))
    r = executar([cand("R1")], cli, "E1", 100_000_000, teto_micro=149_999)
    assert r["motivoParada"] == "teto de US$10" and not t.chamadas


def test_para_por_saldo():
    cli, t = cliente(lambda c: ok_phone(custo=100_000))
    r = executar([cand(f"R{i}") for i in range(5)], cli, "E1", 300_000, lote=100)
    # saldo 300k: 1ª (restam 300k>=150k), 2ª (restam 200k), 3ª (restam 100k < 150k) não roda
    assert r["motivoParada"] == "saldo insuficiente" and len(t.chamadas) == 2 and r["gastoMicro"] == 200_000


def test_503_saturado_repete_mesma_chave_e_respeita_retry_after():
    esperas, seq = [], iter([(503, {"Retry-After": "7"}, {"treg_saturated": True}),
                             (503, {"Retry-After": "3"}, {"treg_saturated": True})])

    def fn(c):
        try:
            return next(seq)
        except StopIteration:
            return ok_phone()
    cli, t = cliente(fn, dormir=esperas.append)
    r = executar([cand()], cli, "E1", 5_000_000)
    assert esperas == [7.0, 3.0]
    assert [c["headers"]["Idempotency-Key"] for c in t.chamadas] == ["E1-R1-phone"] * 3
    assert r["porLead"]["R1"]["resultado"] == "achou"


def test_503_saturado_desiste_depois_de_3_repeticoes():
    cli, t = cliente(lambda c: (503, {"Retry-After": "1"}, {"treg_saturated": True}))
    r = executar([cand()], cli, "E1", 5_000_000)
    assert len(t.chamadas) == 4 and r["porLead"]["R1"]["resultado"] == "erro"


def test_outro_erro_marca_erro_e_segue():
    def fn(c):
        if c["corpo"]["linkedin_url"].endswith("/bad"):
            return 422, {}, {"detail": "x"}
        return ok_phone()
    cli, t = cliente(fn)
    r = executar([cand("R1", linkedin="https://linkedin.com/in/bad"), cand("R2"),
                  cand("R3", linkedin="https://linkedin.com/in/bad2")], cli, "E1", 5_000_000)
    assert r["porLead"]["R1"]["resultado"] == "erro" and r["porLead"]["R2"]["resultado"] == "achou"
    assert r["erros"] == 1
    assert r["consultados"] == 2 and r["achados"] == 2 and len(t.chamadas) == 3
    cli, t = cliente(lambda c: (500, {}, {"detail": "boom"}))
    r = executar([cand("R1"), cand("R2")], cli, "E1", 5_000_000)
    assert [v["resultado"] for v in r["porLead"].values()] == ["erro", "erro"] and len(t.chamadas) == 2


def test_provedor_pelo_corpo_quando_nao_ha_cabecalho():
    cli, _ = cliente(lambda c: (200, {"X-Treg-Call-Id": "c9"}, {"output": {"phone": TEL}, "_treg": {"served_by": "aiark"}}))
    r = executar([cand()], cli, "E1", 5_000_000)
    assert r["porLead"]["R1"]["provedor"] == "aiark" and r["gastoMicro"] == 0


def test_recuperar_call_get_gratis():
    cli, t = cliente(lambda c: (200, {}, {"stored": True, "response": {"output": {"phone": TEL}}}))
    assert recuperar_call(cli, "abc")["response"]["output"]["phone"] == TEL
    assert t.chamadas[0]["metodo"] == "GET" and t.chamadas[0]["url"] == "https://treg.to/calls/abc/result"


# ---------------------------------------------------------------- aplicar

def r_achou():
    return {"resultado": "achou", "telefone": TEL, "provedor": "wiza", "callIds": ["c1"], "custoMicro": 125000}


def test_aplicar_achou():
    l = lead(contatos=[{"id": "k1", "papel": "geral"}, {"id": "k4", "papel": "geral"}],
             pendencias=["Telefone/WhatsApp do decisor", "Confirmar CNPJ"],
             decisores=[{"nome": "Davi Hoffmann Ferreira", "cargo": "Sócio", "linkedin": ""}])
    antes = json.dumps(l, sort_keys=True)
    r = dict(r_achou(), linkedinNovo="https://linkedin.com/in/davi")
    n = aplicar(l, r, 0, AGORA, "E1")
    assert json.dumps(l, sort_keys=True) == antes
    assert n["contatos"][-1] == {"id": "k5", "papel": "decisor", "nome": "Davi Hoffmann Ferreira", "cargo": "Sócio",
                                 "telefone": TEL, "whatsapp": "?", "email": "",
                                 "fonte": "treg · wiza · call c1", "confianca": "média"}
    assert n["decisores"][0]["linkedin"] == "https://linkedin.com/in/davi"
    assert n["buscaTreg"] == {"em": AGORA.isoformat(), "execucaoId": "E1", "resultado": "achou",
                              "custoMicro": 125000, "callIds": ["c1"]}
    assert n["historico"][-1] == {"em": AGORA.isoformat(), "texto": "Busca de telefone (treg): achou",
                                  "tipo": "enriquecimento"}
    assert n["pendencias"] == ["Confirmar CNPJ"]
    assert n["enriquecimento"]["atualizadoEm"] == "2026-10-02" and n["enriquecimento"]["status"] == "completo"
    assert n["contatoAtivo"] == "k1"


def test_aplicar_nao_achou_erro_e_historico_limitado():
    l = lead(historico=[{"em": "x", "texto": str(i), "tipo": "nota"} for i in range(100)])
    n = aplicar(l, {"resultado": "nao_achou", "callIds": [], "custoMicro": 0}, 0, AGORA, "E1")
    assert len(n["historico"]) == 100 and n["historico"][0]["texto"] == "1"
    assert n["historico"][-1]["texto"] == "Busca de telefone (treg): não achou"
    assert n["pendencias"] == ["Telefone do decisor não encontrado na busca treg (2026-10-02)"]
    assert n["contatos"] == [] and n["buscaTreg"]["resultado"] == "nao_achou"
    e = aplicar(n, {"resultado": "erro", "callIds": [], "custoMicro": 0}, 0, AGORA, "E2")
    assert e["historico"][-1]["texto"] == "Busca de telefone (treg): erro" and e["buscaTreg"]["resultado"] == "erro"
    assert e["contatoAtivo"] == "k1"


# ---------------------------------------------------------------- simulador e CLI

def test_simulador_taxa_e_numeros_ficticios():
    cli = TregCliente("s", transporte=transporte_simulado, dormir=lambda s: None)
    cs = [cand(f"R{i:04d}", linkedin="") for i in range(300)]
    r = executar(cs, cli, "SIM", 10**9, teto_micro=10**9, taxa_minima=0.0)
    assert 0.2 < r["taxa"] < 0.45
    for x in r["porLead"].values():
        if x["resultado"] == "achou":
            assert x["telefone"].startswith("55659000000") and x["custoMicro"] >= 125000


def test_cli_ponta_a_ponta_simulado(tmp_path):
    ls = [lead(f"R{i:04d}", faixa="A", score=90 - i, contatos=[{"id": "k1", "papel": "geral", "telefone": "65999991111"}])
          for i in range(14)]
    (tmp_path / "leads.json").write_text(json.dumps(ls))
    main(["limpar", "--entrada", str(tmp_path / "leads.json"), "--saida", str(tmp_path / "limpos.json"),
          "--alteracoes", str(tmp_path / "alt.json")])
    (tmp_path / "enriquecimento.json").write_text(json.dumps({"historicoExecucoes": []}))
    main(["planejar", "--entrada", str(tmp_path / "limpos.json"), "--config", str(tmp_path / "enriquecimento.json"),
          "--saida", str(tmp_path / "plano.json")])
    plano = json.loads((tmp_path / "plano.json").read_text())
    assert len(plano["candidatos"]) == 14 and plano["estimativa"]["fonte"] == "piloto"
    main(["executar", "--plano", str(tmp_path / "plano.json"), "--entrada", str(tmp_path / "limpos.json"),
          "--saldo-micro", "5000000", "--execucao", "SIM1", "--saida", str(tmp_path / "resultado.json"), "--simular"])
    res = json.loads((tmp_path / "resultado.json").read_text())
    assert res["execucaoId"] == "SIM1" and res["consultados"] >= 1
    assert (tmp_path / "progresso.json").exists()
    atu = json.loads((tmp_path / "atualizados.json").read_text())
    assert len(atu) == res["consultados"] + sum(1 for v in res["porLead"].values() if v["resultado"] == "erro")
    assert all(a["buscaTreg"]["execucaoId"] == "SIM1" and a["contatoAtivo"] == "k1" for a in atu)


# ---------------------------------------------------------------- correções da revisão

def test_excecao_de_rede_vira_erro_e_segue_mantendo_custo():
    import urllib.error
    n = {"i": 0}

    def fn(c):
        n["i"] += 1
        if n["i"] == 1:
            raise urllib.error.URLError("caiu")
        if n["i"] == 2:
            raise ConnectionResetError()
        return ok_phone()
    cli, _ = cliente(fn)
    r = executar([cand("R1"), cand("R2"), cand("R3")], cli, "E1", 5_000_000)
    assert [r["porLead"][i]["resultado"] for i in ("R1", "R2", "R3")] == ["erro", "erro", "achou"]


def test_custo_ja_contado_do_enrich_se_telefone_falha_por_rede():
    def fn(c):
        if "enrich" in c["url"]:
            return 200, {"X-Treg-Cost-Micro": "2600", "X-Treg-Call-Id": "e1"}, {"output": {"u": "https://linkedin.com/in/a"}}
        raise TimeoutError()
    cli, _ = cliente(fn)
    r = executar([cand(linkedin="")], cli, "E1", 5_000_000)
    assert r["porLead"]["R1"]["resultado"] == "erro" and r["gastoMicro"] == 2600 and r["porLead"]["R1"]["custoMicro"] == 2600


def test_para_com_10_erros_consecutivos():
    cli, t = cliente(lambda c: (401, {}, {"detail": "token revogado"}))
    r = executar([cand(f"R{i}") for i in range(30)], cli, "E1", 5_000_000, lote=100)
    assert r["motivoParada"] == "erros consecutivos" and len(t.chamadas) == 10


def test_erro_isolado_zera_contagem_de_consecutivos():
    n = {"i": 0}

    def fn(c):
        n["i"] += 1
        return (500, {}, {}) if n["i"] % 10 else ok_phone()
    cli, _ = cliente(fn)
    r = executar([cand(f"R{i}") for i in range(30)], cli, "E1", 50_000_000, lote=100)
    assert r["motivoParada"] is None


def test_503_saturado_pelo_texto_ou_pelo_retry_after():
    for resp in [(503, {}, {"detail": "treg_saturated, tente de novo"}),
                 (503, {"Retry-After": "2"}, {"detail": "busy"})]:
        esperas, seq = [], iter([resp])
        cli, t = cliente(lambda c: next(seq, None) or ok_phone(), dormir=esperas.append)
        r = executar([cand()], cli, "E1", 5_000_000)
        assert len(t.chamadas) == 2 and r["porLead"]["R1"]["resultado"] == "achou"
        assert len(esperas) == 1
    # 503 sem sinal de saturação não repete
    cli, t = cliente(lambda c: (503, {}, {"detail": "bad gateway"}))
    executar([cand()], cli, "E1", 5_000_000)
    assert len(t.chamadas) == 1


def test_erro_anterior_nao_bloqueia_90_dias():
    novo = (AGORA - timedelta(days=5)).isoformat()
    ls = [lead("e", buscaTreg={"em": novo, "resultado": "erro"}), lead("a", buscaTreg={"em": novo, "resultado": "achou"}),
          lead("n", buscaTreg={"em": novo, "resultado": "nao_achou"})]
    assert [c["leadId"] for c in selecionar(ls, AGORA)] == ["e"]


def test_extracao_prefere_celular_e_ignora_empresa():
    movel, fixo = TEL, "556530000000"
    assert extrair_telefone({"output": {"company_phone": "(65) 3000-0000", "mobile": "65 99999-1111"}}) == movel
    assert extrair_telefone({"output": {"company_phone": "(65) 3000-0000"}}) == ""
    assert extrair_telefone({"output": {"phone": "(65) 3000-0000"}, "raw": {"mobile": "65999991111"}}) == movel
    assert extrair_telefone({"output": {"phone": "(65) 3000-0000"}}) == fixo
    assert extrair_telefone({"output": {"org": {"phone": "65999991111"}, "work_phone": "65999991111"}}) == ""


def test_aplicar_nao_duplica_contato_existente():
    l = lead(contatos=[{"id": "k1", "papel": "geral", "telefone": "(65) 99999-1111"}])
    n = aplicar(l, r_achou(), 0, AGORA, "E1")
    assert len(n["contatos"]) == 1
    assert n["buscaTreg"]["resultado"] == "achou"
    assert n["historico"][-1]["texto"] == "Busca de telefone (treg): achou"


# ---------------------------------------------------------------- uso como biblioteca (atendente na VPS)

def test_parar_interrompe_antes_do_proximo_lead():
    pedidos = {"n": 0}
    cli, t = cliente(lambda c: ok_phone())

    def parar():
        pedidos["n"] += 1
        return "parado pela equipe" if pedidos["n"] > 2 else None
    r = executar([cand(f"R{i}") for i in range(5)], cli, "E1", 5_000_000, parar=parar)
    assert r["motivoParada"] == "parado pela equipe" and len(t.chamadas) == 2 and r["consultados"] == 2


def test_ao_lead_avisa_cada_lead_com_o_parcial():
    vistos = []
    cli, _ = cliente(lambda c: ok_phone())
    executar([cand("R1"), cand("R2")], cli, "E1", 5_000_000,
             ao_lead=lambda lead_id, r, parcial: vistos.append((lead_id, r["resultado"], parcial["consultados"])))
    assert vistos == [("R1", "achou", 1), ("R2", "achou", 2)]


def test_402_sem_saldo_para_a_rodada_sem_marcar_o_lead():
    corpo = {"error": "insufficient_balance", "balance_micro": 1000, "estimated_cost_micro": 150000,
             "topup_url": "https://treg.to/topup"}
    cli, t = cliente(lambda c: (402, {}, corpo))
    r = executar([cand("R1"), cand("R2")], cli, "E1", 5_000_000)
    assert r["motivoParada"] == "saldo insuficiente" and len(t.chamadas) == 1
    assert "R1" not in r["porLead"] and r["erros"] == 0


def test_402_por_teto_da_chamada_continua_sendo_erro_do_lead():
    cli, t = cliente(lambda c: (402, {}, {"error": "route_max_cost"}))
    r = executar([cand("R1"), cand("R2")], cli, "E1", 5_000_000)
    assert r["motivoParada"] is None and r["erros"] == 2 and len(t.chamadas) == 2


def test_ler_token_aceita_treg_api_key(tmp_path):
    assert ler_token({"TREG_API_KEY": "k"}, str(tmp_path / "nada.json")) == ("k", None)
    assert ler_token({"TREG_TOKEN": "t", "TREG_API_KEY": "k"}, str(tmp_path / "nada.json"))[0] == "t"
    assert ler_token({}, str(tmp_path / "nada.json")) == (None, None)

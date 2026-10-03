import json
from urllib.parse import parse_qs, urlparse

import pytest

from scripts.explee_hot_leads import (ExpleeCliente, ExpleeErro, buscar, ler_chave, main, mapear, papel_por_cargo,
                                      resposta_curta)

RESPOSTA = ("Oi Aurimar,\r\n\r\nTenho interesse, me manda o material.\r\n\r\nAbraço,\r\nYuri\r\n\r\n"
            "Em sex., 25 de set. de 2026 às 08:07, Aurimar Nogueira <a@exemplo.org>\r\nescreveu:\r\n\r\n> Olá Yuri,\r\n>")
CAMPANHAS = {"101": "Associações setoriais", "102": "Cooperativas agro"}


def hot(pid="p1", **kw):
    base = {"person_id": pid, "name": "Yuri Araujo", "email": "yuri@sucesu.example", "job_title": "Chief Executive Officer",
            "company_name": "Sucesu", "company_domain": "sucesu.example", "linkedin_url": "https://linkedin.com/in/yuri",
            "country": "BR", "phone": None, "why_hot": RESPOSTA, "became_hot_at": "2026-09-29T10:37:40Z",
            "campaign_id": 101, "note": None, "note_updated_at": None, "note_updated_by": None}
    base.update(kw)
    return base


def central(id="R0001", **kw):
    base = {"id": id, "nome": "Clínica Modelo", "saudacao": "pessoal da Clínica", "situacao": "ativo", "etapa": 2,
            "enviado1": "2026-09-01T10:00:00Z", "enviado2": "2026-09-05T10:00:00Z", "enviado3": None,
            "contatoAtivo": "k1", "site": "https://modelo.example", "email": "contato@modelo.example",
            "contatos": [{"id": "k1", "papel": "decisor", "nome": "Ana", "email": "ana@modelo.example"}],
            "historico": [{"em": "2026-09-01T10:00:00Z", "texto": "Toque 1 enviado"}], "toques": [{"n": 1}]}
    base.update(kw)
    return base


def entrada(*leads):
    return {"leads": list(leads), "campanhas": CAMPANHAS, "maisRecente": None}


def aplicar(existentes, mapa):
    """Simula a gravação do controlador: set dos novos, update (merge raso) das atualizações."""
    por_id = {x["id"]: dict(x) for x in existentes}
    for n in mapa["novos"]:
        por_id[n["id"]] = {"id": n["id"], **n["data"]}
    for a in mapa["atualizacoes"]:
        por_id[a["id"]].update(a["data"])
    return list(por_id.values())


# ---------------------------------------------------------------- lead novo

def test_lead_novo_tem_o_formato_da_central():
    m = mapear(entrada(hot()), [central()])
    assert m["atualizacoes"] == [] and m["ignorados"] == []
    [n] = m["novos"]
    assert n["id"] == "X0001"
    d = n["data"]
    assert d["nome"] == "Sucesu" and d["site"] == "sucesu.example" and d["segmento"] == "Associações setoriais"
    assert d["categoria"] == "Explee" and d["canal"] == "E-mail" and d["email"] == "yuri@sucesu.example"
    assert d["saudacao"] == "Yuri" and d["situacao"] == "respondeu" and d["etapa"] == 0
    assert d["toques"] == [] and d["ordem"] == 9001 and d["flags"] == ["hot lead Explee"]
    assert d["pendencias"] == ["Responder pelo e-mail da Explee ou ligar"]
    assert d["enriquecimento"] == {"status": "parcial"}
    assert d["contatos"] == [{"id": "k1", "papel": "decisor", "nome": "Yuri Araujo", "cargo": "Chief Executive Officer",
                              "telefone": "", "whatsapp": "?", "email": "yuri@sucesu.example",
                              "linkedin": "https://linkedin.com/in/yuri",
                              "fonte": "Explee · campanha Associações setoriais", "confianca": "alta"}]
    assert d["decisores"] == [{"nome": "Yuri Araujo", "cargo": "Chief Executive Officer", "linkedin": "https://linkedin.com/in/yuri",
                               "fonte": "Explee · campanha Associações setoriais"}]
    [h] = d["historico"]
    assert h["em"] == "2026-09-29T10:37:40Z" and h["tipo"] == "explee"
    assert h["texto"].startswith("Respondeu na Explee (campanha Associações setoriais): Oi Aurimar,")
    assert "escreveu" not in h["texto"] and ">" not in h["texto"]
    ex = d["explee"]
    assert ex["personId"] == "p1" and ex["campanhaId"] == 101 and ex["campanha"] == "Associações setoriais"
    assert ex["quente"] is True and ex["quenteEm"] == "2026-09-29T10:37:40Z"
    assert "escreveu:" in ex["resposta"] and "\r" not in ex["resposta"]
    assert ex["respostaCurta"].endswith("Abraço,\nYuri")
    for campo, vazio in [("empresa", {}), ("perfil", None), ("sinais", []), ("alertas", []), ("socios", []),
                         ("redes", None), ("enviado1", None), ("enviado2", None), ("enviado3", None), ("contatoAtivo", None),
                         ("foto", ""), ("fraseUnica", ""), ("instagram", ""), ("bairro", "")]:
        assert campo in d, campo
        if vazio is not None or campo.startswith("enviado") or campo == "contatoAtivo":
            assert d[campo] == vazio, campo


def test_lead_novo_so_com_telefone_vai_por_whatsapp_e_normaliza():
    m = mapear(entrada(hot(email="", phone="(65) 99999-1111", company_name="", job_title="Analista")), [])
    d = m["novos"][0]["data"]
    assert d["canal"] == "WhatsApp" and d["telefone"] == "5565999991111"
    assert d["nome"] == "sucesu.example"  # sem nome da empresa: o domínio
    assert d["contatos"][0]["papel"] == "geral" and d["contatos"][0]["telefone"] == "5565999991111"


def test_sem_email_e_sem_telefone_fica_ignorado():
    m = mapear(entrada(hot(email="", phone=None)), [])
    assert m["novos"] == [] and m["ignorados"][0]["motivo"] == "sem e-mail e sem telefone"


def test_ids_X_seguem_o_maior_existente_e_campanha_desconhecida():
    m = mapear(entrada(hot("a", company_domain="a.example", email="a@a.example", campaign_id=999),
                       hot("b", company_domain="b.example", email="b@b.example", became_hot_at="2026-09-30T00:00:00Z")),
               [central("X0007", site="", email="", contatos=[])])
    assert [n["id"] for n in m["novos"]] == ["X0008", "X0009"]
    assert m["novos"][0]["data"]["segmento"] == "#999"
    assert [n["data"]["ordem"] for n in m["novos"]] == [9008, 9009]


def test_papel_por_cargo():
    for c in ["CEO", "Sócio-administrador", "Diretora Comercial", "Founder", "Head of Marketing", "Presidente"]:
        assert papel_por_cargo(c) == "decisor", c
    for c in ["Analista", "Branch Manager", "", None]:
        assert papel_por_cargo(c) == "geral", c


# ---------------------------------------------------------------- correspondência

def test_casa_pelo_email_do_contato():
    ex = [central(contatos=[{"id": "k1", "email": "ana@modelo.example"}, {"id": "k4", "email": "YURI@sucesu.example"}])]
    m = mapear(entrada(hot()), ex)
    assert m["novos"] == []
    [a] = m["atualizacoes"]
    assert a["id"] == "R0001" and set(a["data"]) == {"historico", "explee"}  # e-mail já é contato: nada em contatos


def test_casa_pelo_dominio_do_site_ignorando_www_e_acrescenta_contato():
    m = mapear(entrada(hot(company_domain="modelo.example", email="dono@modelo.example")),
               [central(site="https://www.modelo.example/contato")])
    assert m["novos"] == []
    [a] = m["atualizacoes"]
    assert set(a["data"]) == {"historico", "explee", "contatos"}
    novo = a["data"]["contatos"][-1]
    assert novo["id"] == "k2" and novo["email"] == "dono@modelo.example" and novo["papel"] == "decisor"
    assert novo["fonte"] == "Explee · campanha Associações setoriais" and novo["confianca"] == "alta"
    assert a["data"]["contatos"][0] == {"id": "k1", "papel": "decisor", "nome": "Ana", "email": "ana@modelo.example"}


def test_casa_pelo_personId_antes_do_resto():
    ex = [central("R0001", site="https://sucesu.example"),
          central("R0002", site="", email="", contatos=[], explee={"personId": "p1", "quenteEm": "2026-09-01T00:00:00Z"})]
    m = mapear(entrada(hot()), ex)
    assert [a["id"] for a in m["atualizacoes"]] == ["R0002"]


def test_lead_existente_nao_muda_situacao_etapa_envios_nem_contato_ativo():
    for situacao in ("ativo", "sair", "fechou"):
        ex = [central(situacao=situacao, site="https://sucesu.example")]
        m = mapear(entrada(hot()), ex)
        [a] = m["atualizacoes"]
        assert not set(a["data"]) & {"situacao", "etapa", "enviado1", "enviado2", "enviado3", "contatoAtivo", "toques"}
        final = aplicar(ex, m)[0]
        assert (final["situacao"], final["etapa"], final["contatoAtivo"]) == (situacao, 2, "k1")
        assert final["enviado1"] == "2026-09-01T10:00:00Z" and final["enviado2"] == "2026-09-05T10:00:00Z"


def test_segunda_rodada_e_idempotente():
    ex = [central(site="https://sucesu.example")]
    lote = entrada(hot("p1"), hot("p2", company_domain="outra.example", email="b@outra.example", name="Bia Lima"),
                   hot("p3", company_domain="outra.example", email="c@outra.example", name="Caio",
                       became_hot_at="2026-09-30T08:00:00Z"))
    m1 = mapear(lote, ex)
    assert [n["id"] for n in m1["novos"]] == ["X0001"]  # p3 é da mesma empresa nova: entra no mesmo lead
    assert len(m1["novos"][0]["data"]["contatos"]) == 2 and len(m1["novos"][0]["data"]["historico"]) == 2
    assert m1["novos"][0]["data"]["explee"]["personId"] == "p3"  # o mais recente
    assert [a["id"] for a in m1["atualizacoes"]] == ["R0001"]
    gravado = aplicar(ex, m1)
    m2 = mapear(lote, gravado)
    assert m2["novos"] == [] and m2["atualizacoes"] == []
    assert len(m2["ignorados"]) == 3 and {i["motivo"] for i in m2["ignorados"]} == {"já importado"}
    # e o formato do banco ({id, data}) também serve
    m3 = mapear(lote, [{"id": x["id"], "data": {k: v for k, v in x.items() if k != "id"}} for x in gravado])
    assert m3["novos"] == [] and m3["atualizacoes"] == []


def test_historico_nao_duplica_e_guarda_100():
    item = {"em": "2026-09-29T10:37:40Z", "tipo": "explee",
            "texto": "Respondeu na Explee (campanha Associações setoriais): " + resposta_curta(RESPOSTA)}
    velho = [{"em": f"2026-08-01T00:{i % 60:02d}:00Z", "texto": f"n{i}"} for i in range(99)]
    ex = [central(site="https://sucesu.example", historico=velho + [item])]
    m = mapear(entrada(hot()), ex)
    [a] = m["atualizacoes"]
    assert "historico" not in a["data"] and "explee" in a["data"]
    ex = [central(site="https://sucesu.example", historico=velho + [{"em": "x", "texto": "y"}])]
    [a] = mapear(entrada(hot()), ex)["atualizacoes"]
    assert len(a["data"]["historico"]) == 100 and a["data"]["historico"][-1]["tipo"] == "explee"
    assert a["data"]["historico"][0]["texto"] == "n1"


def test_hot_lead_mais_antigo_nao_troca_o_bloco_explee():
    ex = [central(site="https://sucesu.example", explee={"personId": "p9", "quenteEm": "2026-09-30T00:00:00Z"})]
    [a] = mapear(entrada(hot("p1")), ex)["atualizacoes"]
    assert "explee" not in a["data"] and "historico" in a["data"]


def test_card_teste_nunca_casa():
    m = mapear(entrada(hot(company_domain="reiners.example", email="x@reiners.example")),
               [{"id": "TESTE", "site": "https://reiners.example", "email": "x@reiners.example"}])
    assert [n["id"] for n in m["novos"]] == ["X0001"]


def test_dominio_de_email_gratuito_nao_casa_pelo_site():
    m = mapear(entrada(hot(company_domain="gmail.com", email="z@gmail.com")), [central(site="https://gmail.com")])
    assert len(m["novos"]) == 1


# ---------------------------------------------------------------- buscar (HTTP simulado)

class Falso:
    """Transporte simulado: responde por caminho, registra as chamadas."""

    def __init__(self, hot_paginas, erros=None):
        self.chamadas, self.hot_paginas, self.erros = [], hot_paginas, list(erros or [])

    def __call__(self, metodo, url, headers):
        u = urlparse(url)
        q = {k: v[0] for k, v in parse_qs(u.query).items()}
        self.chamadas.append((u.path, q, headers))
        if self.erros:
            return self.erros.pop(0), {"Retry-After": "0"}, b"{}"
        if u.path.endswith("/projects"):
            corpo = {"projects": [{"id": 1}, {"id": 2}], "total": 2}
        elif u.path.endswith("/campaigns"):
            corpo = {"campaigns": [{"id": 100 + int(q["project_id"]), "name": "Camp " + q["project_id"]}], "total": 1}
        else:
            corpo = self.hot_paginas[int(q.get("offset", 0)) // 50]
        return 200, {}, json.dumps(corpo).encode()


def _paginas():
    p1 = [hot(f"a{i}", became_hot_at=f"2026-09-{10 + i % 15:02d}T12:00:00Z") for i in range(50)]
    p2 = [hot("b1", became_hot_at="2026-09-29T10:37:40Z"), hot("b2", became_hot_at="2026-09-05T00:00:00Z")]
    return [{"leads": p1, "total": 52, "has_more": True, "next_offset": 50},
            {"leads": p2, "total": 52, "has_more": False, "next_offset": None}]


def test_buscar_pagina_com_has_more_e_traz_campanhas():
    t = Falso(_paginas())
    cli = ExpleeCliente("segredo", transporte=t, dormir=lambda s: None)
    r = buscar(cli, None)
    assert len(r["leads"]) == 52
    assert [q.get("offset") for p, q, _ in t.chamadas if p.endswith("/hot-leads")] == ["0", "50"]
    assert r["campanhas"] == {"101": "Camp 1", "102": "Camp 2"}
    assert r["maisRecente"] == "2026-09-29T10:37:40Z"
    assert all(h["X-API-Key"] == "segredo" and h["User-Agent"] for _, _, h in t.chamadas)
    quando = [h["became_hot_at"] for h in r["leads"]]
    assert quando == sorted(quando)


def test_buscar_filtra_since_estrito():
    t = Falso(_paginas())
    r = buscar(ExpleeCliente("k", transporte=t, dormir=lambda s: None), "2026-09-24T12:00:00Z")
    assert all(h["became_hot_at"] > "2026-09-24T12:00:00Z" for h in r["leads"])
    assert "2026-09-24T12:00:00Z" not in [h["became_hot_at"] for h in r["leads"]]  # igual ao cursor fica de fora
    assert r["maisRecente"] == "2026-09-29T10:37:40Z"
    assert [q.get("since") for p, q, _ in t.chamadas if p.endswith("/hot-leads")][0] == "2026-09-24T12:00:00Z"
    vazio = buscar(ExpleeCliente("k", transporte=Falso(_paginas()), dormir=lambda s: None), "2026-09-29T10:37:40Z")
    assert vazio["leads"] == [] and vazio["maisRecente"] == "2026-09-29T10:37:40Z"  # o cursor não anda


def test_buscar_repete_em_429_e_5xx_e_desiste_depois():
    esperas = []
    t = Falso(_paginas(), erros=[429, 503])
    r = buscar(ExpleeCliente("k", transporte=t, dormir=esperas.append), None)
    assert len(r["leads"]) == 52 and len(esperas) == 2
    t = Falso(_paginas(), erros=[500] * 10)
    with pytest.raises(ExpleeErro) as e:
        ExpleeCliente("segredo", transporte=t, dormir=lambda s: None, tentativas=2).get("/projects")
    assert "segredo" not in str(e.value)
    t = Falso(_paginas(), erros=[401])
    with pytest.raises(ExpleeErro):
        ExpleeCliente("k", transporte=t, dormir=lambda s: None).get("/projects")
    assert len(t.chamadas) == 1  # 4xx que não é 429 não repete


def test_ler_chave_do_ambiente_ou_do_arquivo(tmp_path):
    assert ler_chave({"EXPLEE_API_KEY": " abc "}, str(tmp_path / "nada")) == "abc"
    (tmp_path / "key").write_text("def\n")
    assert ler_chave({}, str(tmp_path / "key")) == "def"
    assert ler_chave({}, str(tmp_path / "nada")) is None


def test_cli_buscar_e_mapear_sem_vazar_a_chave(tmp_path, capsys):
    saida = tmp_path / "hot.json"
    main(["buscar", "--since", "", "--saida", str(saida)],
         cliente=ExpleeCliente("segredo-123", transporte=Falso(_paginas()), dormir=lambda s: None))
    assert "segredo-123" not in saida.read_text() and "segredo-123" not in capsys.readouterr().out
    ex = tmp_path / "leads.json"
    ex.write_text(json.dumps([central()]))
    mapa = tmp_path / "mapa.json"
    main(["mapear", "--entrada", str(saida), "--existentes", str(ex), "--saida", str(mapa)])
    out = json.loads(capsys.readouterr().out)
    m = json.loads(mapa.read_text())
    assert out == {"novos": 1, "atualizacoes": 0, "ignorados": 0}  # todos da mesma empresa: um lead só
    assert m["novos"][0]["id"] == "X0001" and len(m["novos"][0]["data"]["historico"]) == 17  # datas repetidas não duplicam

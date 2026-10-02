import json

from scripts import geo
from scripts.base_explee import doc_base, geo_leads, main as base_main, montar_base, processar
from scripts.geo import ConsultaCep, ddd_de, itens_da_entrada, resolver, resolver_empresa, uf_por_dicas

CEPS = {"78005000": {"state": "MT", "city": "Cuiabá"}, "01310100": {"state": "SP", "city": "São Paulo"}}


class Api:
    """HTTP falso da BrasilAPI: guarda as chamadas; `falhas` são os status devolvidos antes do certo."""

    def __init__(self, falhas=()):
        self.chamadas, self.falhas = [], list(falhas)

    def __call__(self, url):
        self.chamadas.append(url)
        if self.falhas:
            return self.falhas.pop(0), ""
        cep = url.rsplit("/", 1)[1]
        return (200, json.dumps({"cep": cep, **CEPS[cep]})) if cep in CEPS else (404, "")


def consulta(tmp_path, api=None, **kw):
    return ConsultaCep(str(tmp_path / "cep.json"), api or Api(), dormir=lambda s: None, **kw)


def test_cep_do_site_da_uf_e_cidade(tmp_path):
    g = resolver_empresa("empresa.com", "Empresa", {"ceps": ["78005000"]}, consulta=consulta(tmp_path))
    assert g == {"pais": "Brasil", "uf": "MT", "cidade": "Cuiabá", "fonteGeo": "CEP no site"}


def test_varios_ceps_prefere_o_da_uf_do_ddd(tmp_path):
    site = {"ceps": ["01310100", "78005000"], "telefones": ["5565999991111"]}
    g = resolver_empresa("empresa.com", "Empresa", site, consulta=consulta(tmp_path))
    assert (g["uf"], g["cidade"], g["fonteGeo"]) == ("MT", "Cuiabá", "CEP no site")
    site = {"ceps": ["78005000", "01310100"], "whatsapp": ["5511999991111"]}
    g = resolver_empresa("empresa.com", "Empresa", site, consulta=consulta(tmp_path))
    assert (g["uf"], g["cidade"]) == ("SP", "São Paulo")


def test_cep_que_a_api_nao_conhece_cai_no_ddd(tmp_path):
    site = {"ceps": ["99999999"], "telefones": ["556230001111"]}
    g = resolver_empresa("empresa.com", "Empresa", site, consulta=consulta(tmp_path))
    assert g == {"pais": "Brasil", "uf": "GO", "cidade": "", "fonteGeo": "DDD"}


def test_ddd_do_telefone_do_proprio_lead_sem_site():
    g = resolver_empresa("empresa.com", "Empresa", None, telefones=["(65) 99999-1111"])
    assert (g["uf"], g["cidade"], g["fonteGeo"], g["pais"]) == ("MT", "", "DDD", "Brasil")
    assert ddd_de("+55 (11) 3000-0000") == "11" and ddd_de("123") == "" and ddd_de("5500999991111") == ""


def test_dicas_no_nome_e_dominio_mt_so_com_dica_forte():
    assert uf_por_dicas("OAB MT", "oabmt.org.br") == "MT"
    assert uf_por_dicas("Sicredi Sinop", "x.com") == "MT"
    assert uf_por_dicas("Federação de Goiás", "fed.org") == "GO"
    assert uf_por_dicas("Associação Estadual", "assoc-sp.org.br") == "SP"
    assert uf_por_dicas("Mato Grosso do Sul Agro", "agro.com") == "MS"
    assert uf_por_dicas("Agro Fraca", "agrofraca.com") == ""
    assert uf_por_dicas("Mato Grosso e Goiás", "x.com") == ""  # estados diferentes: sem resposta


def test_pais_br_pelo_dominio_pela_explee_ou_nome_do_pais():
    assert resolver_empresa("empresa.com.br", "Empresa")["pais"] == "Brasil"
    assert resolver_empresa("empresa.com", "Empresa", pais_explee="BR")["pais"] == "Brasil"
    assert resolver_empresa("empresa.com", "Empresa", pais_explee="PT")["pais"] == "Portugal"
    assert resolver_empresa("empresa.com", "Empresa") == {"pais": "?", "uf": "", "cidade": "", "fonteGeo": ""}


def test_cache_nao_repete_consulta_nem_do_cep_inexistente(tmp_path):
    api = Api()
    c = consulta(tmp_path, api)
    assert c.uma("78005-000") == {"state": "MT", "city": "Cuiabá"}
    assert c.uma("78005000") == {"state": "MT", "city": "Cuiabá"}
    assert c.uma("99999999") is None and c.uma("99999999") is None
    assert len(api.chamadas) == 2
    c.salvar()
    api2 = Api()
    c2 = consulta(tmp_path, api2)  # outro processo: lê o arquivo
    assert c2.varias(["78005000", "99999999"]) == {"78005000": {"state": "MT", "city": "Cuiabá"}, "99999999": None}
    assert api2.chamadas == []
    assert json.load(open(tmp_path / "cep.json"))["99999999"] is None


def test_retenta_em_429_e_5xx_e_nao_guarda_falha_de_rede(tmp_path):
    api = Api(falhas=[429, 503])
    esperas = []
    c = ConsultaCep(None, api, dormir=esperas.append)
    assert c.uma("78005000") == {"state": "MT", "city": "Cuiabá"}
    assert len(api.chamadas) == 3 and len(esperas) == 2
    api = Api(falhas=[500] * 10)
    c = ConsultaCep(None, api, dormir=lambda s: None, tentativas=3)
    assert c.uma("78005000") is None and len(api.chamadas) == 3 and "78005000" not in c.cache


def test_no_maximo_4_consultas_ao_mesmo_tempo(tmp_path):
    import threading, time
    ativos, pico, trava = [0], [0], threading.Lock()

    def http(url):
        with trava:
            ativos[0] += 1
            pico[0] = max(pico[0], ativos[0])
        time.sleep(0.02)
        with trava:
            ativos[0] -= 1
        return 200, json.dumps({"state": "MT", "city": "Cuiabá"})
    c = ConsultaCep(None, http)
    c.varias(["7800%04d" % i for i in range(30)])
    assert 1 < pico[0] <= 4


def test_resolver_usa_site_contatos_e_pessoas_da_explee(tmp_path):
    itens = itens_da_entrada([{"id": "D00001", "data": {"dominio": "a.com", "nome": "A"}},
                              {"id": "D00002", "data": {"dominio": "b.com", "nome": "B"}}, "c.com.br", "d.com"])
    site = {"a.com": {"ceps": ["78005000"]}, "b.com": {"telefones": ["556530001111"]}}
    pessoas = {"p1": {"lead": {"company_domain": "d.com", "country": "ES"}}, "p2": {"lead": {"company_domain": "d.com", "country": None}}}
    r = resolver(itens, site, pessoas, consulta(tmp_path))
    assert (r["a.com"]["uf"], r["a.com"]["cidade"]) == ("MT", "Cuiabá")
    assert (r["b.com"]["uf"], r["b.com"]["fonteGeo"]) == ("MT", "DDD")
    assert r["c.com.br"]["pais"] == "Brasil" and r["c.com.br"]["uf"] == ""
    assert r["d.com"]["pais"] == "Espanha"
    resumo = geo.resumo(r)
    assert resumo["comUF"] == 2 and resumo["comCidade"] == 1 and resumo["porUF"] == {"MT": 2}


def test_cli_resolver(tmp_path, monkeypatch, capsys):
    api = Api()
    monkeypatch.setattr(geo, "_http_get", api)
    (tmp_path / "doms.json").write_text(json.dumps(["a.com", "b.com.br"]))
    (tmp_path / "site.json").write_text(json.dumps({"a.com": {"ceps": ["78005000"]}}))
    assert geo.main(["resolver", "--dominios", str(tmp_path / "doms.json"), "--site-contatos", str(tmp_path / "site.json"),
                     "--cep-cache", str(tmp_path / "cache.json"), "--saida", str(tmp_path / "geo.json")]) == 0
    saida = json.loads(capsys.readouterr().out)
    assert saida["comUF"] == 1 and saida["comCidade"] == 1 and saida["porUF"] == {"MT": 1}
    assert json.load(open(tmp_path / "geo.json"))["a.com"]["cidade"] == "Cuiabá"
    assert (tmp_path / "cache.json").exists()


# ------------------------------------------------------------ base, processar e geo-leads

def _emp(dom="agro.example", **kw):
    from tests.test_base_explee import empresa
    return empresa(dom, **kw)


def test_doc_base_com_geo_so_quando_geo_vem():
    from tests.test_base_explee import empresa
    assert "uf" not in doc_base(empresa())
    d = doc_base(empresa(), geo={"pais": "Brasil", "uf": "MT", "cidade": "Cuiabá", "fonteGeo": "CEP no site"})
    assert (d["pais"], d["uf"], d["cidade"]) == ("Brasil", "MT", "Cuiabá") and "fonteGeo" not in d
    d = doc_base(empresa(), geo={"pais": "?", "uf": "", "cidade": ""})
    assert (d["pais"], d["uf"], d["cidade"]) == ("", "", "")
    assert len(json.dumps(d, ensure_ascii=False).encode()) <= 2048


def test_montar_base_com_geo_por_dominio_e_limite_de_bytes():
    from tests.test_base_explee import base, empresa
    geo_ = {"a.example": {"pais": "Brasil", "uf": "SP", "cidade": "Campinas " * 20}}
    res = montar_base(base(empresa("a.example"), empresa("b.example")), [], geo=geo_)
    por = {d["data"]["dominio"]: d["data"] for d in res["docs"]}
    assert por["a.example"]["uf"] == "SP" and len(por["a.example"]["cidade"]) <= 60
    assert por["b.example"]["uf"] == ""
    assert all(len(json.dumps(d["data"], ensure_ascii=False).encode()) <= 2048 for d in res["docs"])


def test_processar_copia_geo_e_uf_mt_refaz_os_toques_em_mt():
    from tests.test_base_explee import AGORA, empresa
    docs = []
    for dom, uf in (("a.example", "MT"), ("b.example", "SP")):
        d = doc_base(empresa(dom), geo={"pais": "Brasil", "uf": uf, "cidade": "X"})
        d.update(status="pedido", pedidoEm="2026-10-01T10:00:00Z")
        docs.append({"id": "D" + dom[0], "data": d})
    # a região do documento vem de nome e domínio (sem sinal: "?"); o estado MT do geo vence
    res = processar(docs, [], agora=AGORA)
    por = {n["data"]["site"]: n["data"] for n in res["novosLeads"]}
    assert len(por) == 2
    a, b = por["a.example"], por["b.example"]
    assert (a["pais"], a["uf"], a["cidade"]) == ("Brasil", "MT", "X")
    assert (b["pais"], b["uf"]) == ("Brasil", "SP")
    assert a["regiao"] == "MT"
    assert b["regiao"] != "MT"
    assert a["etapa"] == 0 and all(t["mensagem"] for t in a["toques"])


def test_processar_sem_geo_deixa_campos_vazios():
    from tests.test_base_explee import AGORA, empresa
    d = doc_base(empresa())
    d.update(status="pedido", pedidoEm="2026-10-01T10:00:00Z")
    lead = processar([{"id": "D1", "data": d}], [], agora=AGORA)["novosLeads"][0]["data"]
    assert (lead["pais"], lead["uf"], lead["cidade"]) == ("", "", "")


GEO = {"x.com.br": {"pais": "Brasil", "uf": "SP", "cidade": "Campinas", "fonteGeo": "CEP no site"},
       "b.com": {"pais": "Brasil", "uf": "GO", "cidade": "", "fonteGeo": "DDD"},
       "e.com": {"pais": "Portugal", "uf": "", "cidade": "", "fonteGeo": ""}}


def test_geo_leads_cobre_r_x_e_b_e_so_preenche_vazios():
    leads = [
        {"id": "R0001", "version": 3, "data": {"nome": "Casa", "site": "https://www.x.com.br/", "bairro": "Centro",
                                               "perfil": {"cidade": "Cuiabá"}}},
        {"id": "X0001", "version": 1, "data": {"nome": "Y", "site": "", "explee": {"dominio": "b.com"}}},
        {"id": "B0001", "version": 2, "data": {"nome": "Z", "site": "", "baseExplee": {"dominio": "e.com"}}},
        {"id": "B0002", "version": 5, "data": {"nome": "W", "site": "x.com.br", "uf": "RJ", "cidade": "Niterói", "pais": "Brasil"}},
    ]
    r = {x["id"]: x for x in geo_leads(leads, GEO)}
    # R: tem cidade no perfil (Cuiabá, de MT): a cidade fica, o estado vem dela, não do geo do site
    assert r["R0001"] == {"id": "R0001", "if_version": 3, "data": {"pais": "Brasil", "uf": "MT", "cidade": "Cuiabá"}}
    assert r["X0001"]["data"] == {"pais": "Brasil", "uf": "GO"}
    assert r["B0001"]["data"] == {"pais": "Portugal"}
    assert "B0002" not in r  # nada vazio: nada a gravar, e nada é sobrescrito


def test_geo_leads_nao_mistura_cidade_do_geo_com_uf_que_o_lead_ja_tem():
    leads = [{"id": "B1", "version": 1, "data": {"site": "x.com.br", "uf": "RJ"}},
             {"id": "B2", "version": 1, "data": {"site": "x.com.br", "uf": "SP"}}]
    r = {x["id"]: x["data"] for x in geo_leads(leads, GEO)}
    assert r["B1"] == {"pais": "Brasil"}
    assert r["B2"] == {"pais": "Brasil", "cidade": "Campinas"}


def test_geo_leads_sem_registro_usa_ddd_do_proprio_lead():
    leads = [{"id": "R9", "version": 1, "data": {"nome": "Sem site", "site": "", "telefone": "5565999991111"}}]
    assert geo_leads(leads, {})[0]["data"] == {"pais": "Brasil", "uf": "MT"}


def test_cli_base_com_geo_e_geo_leads(tmp_path, capsys):
    from tests.test_base_explee import base, empresa
    (tmp_path / "base.json").write_text(json.dumps(base(empresa("a.example"))))
    (tmp_path / "geo.json").write_text(json.dumps({"a.example": {"pais": "Brasil", "uf": "MT", "cidade": "Sinop"}}))
    assert base_main(["base", "--entrada", str(tmp_path / "base.json"), "--geo", str(tmp_path / "geo.json"),
                      "--saida", str(tmp_path / "docs.json")]) == 0
    saida = json.loads(capsys.readouterr().out)
    assert saida["comUF"] == 1 and saida["comCidade"] == 1
    assert json.load(open(tmp_path / "docs.json"))[0]["data"]["cidade"] == "Sinop"
    (tmp_path / "leads.json").write_text(json.dumps([{"id": "B1", "version": 4, "data": {"site": "a.example"}}]))
    assert base_main(["geo-leads", "--leads", str(tmp_path / "leads.json"), "--geo", str(tmp_path / "geo.json"),
                      "--saida", str(tmp_path / "up.json")]) == 0
    assert json.load(open(tmp_path / "up.json")) == [{"id": "B1", "if_version": 4,
                                                      "data": {"pais": "Brasil", "uf": "MT", "cidade": "Sinop"}}]

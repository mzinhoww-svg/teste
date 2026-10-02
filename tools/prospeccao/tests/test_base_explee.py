import json
from datetime import datetime, timezone

from scripts.base_explee import atribuir_ids, doc_base, main, montar_base, processar
from scripts.enriquecer_leads import aplicar, selecionar
from scripts.promover_base import promover

AGORA = "2026-10-02T12:00:00Z"


def pessoa(pid, nome, cargo="President", persona="decisor", linkedin="https://linkedin.com/in/x",
           campanha="Entidades do agro"):
    return {"person_id": pid, "nome": nome, "cargo": cargo, "persona": persona, "linkedin": linkedin,
            "intent": None, "campanha": campanha}


def empresa(dominio="agro.example", nome="Associação dos Produtores de Exemplo", segmento="Entidades do agro",
            tier="B", score=50, pessoas=None):
    pessoas = pessoas or [pessoa("p2", "Mariana Souza", "Gerente de Comunicação", "comunicacao", "", segmento),
                          pessoa("p1", "Paulo Pereira", campanha=segmento)]
    return {"dominio": dominio, "nome": nome, "segmento": segmento, "campanhas": [segmento], "tier": tier,
            "score": score, "quente": False, "respondeu": False, "pessoas": pessoas,
            "decisor": next(p for p in pessoas if p["person_id"] == "p1")}


def base(*emps):
    return {"empresas": list(emps), "excluidos": [], "outraOferta": [], "resumo": {}}


# ---------------------------------------------------------------- base

def test_doc_base_enxuto_com_os_campos_da_lista():
    d = doc_base(empresa())
    assert set(d) == {"dominio", "nome", "segmento", "tier", "score", "regiao", "decisor", "pessoas", "comLinkedin",
                      "campanhas", "status", "pedidoEm", "leadId", "migradoEm"}
    assert d["decisor"] == {"nome": "Paulo Pereira", "cargo": "President", "persona": "decisor",
                            "linkedin": "https://linkedin.com/in/x"}
    assert (d["pessoas"], d["comLinkedin"], d["status"], d["pedidoEm"], d["leadId"]) == (2, 1, "base", None, None)
    assert d["regiao"] in ("MT", "fora", "?")
    assert len(json.dumps(d, ensure_ascii=False).encode()) < 1024


def test_doc_base_corta_texto_longo_e_fica_abaixo_de_1kb():
    p = pessoa("p1", "Nome " * 60, "Cargo " * 80, linkedin="https://linkedin.com/in/" + "x" * 400)
    e = empresa(nome="Empresa " * 60, pessoas=[p])
    e["campanhas"] = ["Campanha comprida número %d" % i for i in range(20)]
    assert len(json.dumps(doc_base(e), ensure_ascii=False).encode()) <= 1024


def test_montar_base_so_faixas_pedidas_e_fora_quem_ja_esta_em_leads():
    emps = [empresa("a.example", tier="B"), empresa("b.example", tier="C", score=70), empresa("c.example", tier="A"),
            empresa("www.d.example", tier="B"), empresa("e.example", tier="C"), empresa("f.example", tier="B", score=20)]
    exist = [{"id": "R0001", "site": "https://www.d.example/contato"},
             {"id": "B0001", "data": {"site": "", "baseExplee": {"dominio": "e.example"}}},
             {"id": "R0002", "site": "", "email": "x@a.example"}]
    res = montar_base(base(*emps), exist)
    assert [d["data"]["dominio"] for d in res["docs"]] == ["f.example", "b.example"]  # faixa, depois score
    assert {p["dominio"]: p["motivo"] for p in res["pulados"]} == {
        "a.example": "já na central", "www.d.example": "já na central", "e.example": "já na central"}
    assert all(d["id"].startswith("D") and len(d["id"]) == 6 for d in res["docs"])


def test_ids_estaveis_pelo_dominio():
    emps = [empresa(f"{c}.example") for c in "abcdef"]
    um = {d["data"]["dominio"]: d["id"] for d in montar_base(base(*emps), [])["docs"]}
    outra_ordem = {d["data"]["dominio"]: d["id"] for d in montar_base(base(*reversed(emps)), [])["docs"]}
    assert um == outra_ordem and len(set(um.values())) == 6
    # quem já tinha id fica com ele, mesmo que entre um domínio novo que caia no mesmo número
    ids = atribuir_ids(["x.example", "y.example"], {"y.example": "D00001"})
    assert ids["y.example"] == "D00001" and ids["x.example"] != "D00001"


def test_colisao_anda_para_o_proximo_livre(monkeypatch):
    import scripts.base_explee as be
    monkeypatch.setattr(be, "_hash", lambda d: 7)
    assert be.atribuir_ids(["b.example", "a.example"]) == {"a.example": "D00007", "b.example": "D00008"}


def test_cli_base(tmp_path, capsys):
    (tmp_path / "base.json").write_text(json.dumps(base(empresa("a.example"), empresa("b.example", tier="A"))))
    (tmp_path / "leads.json").write_text("[]")
    main(["base", "--entrada", str(tmp_path / "base.json"), "--tiers", "B,C", "--existentes", str(tmp_path / "leads.json"),
          "--saida", str(tmp_path / "out.json")])
    out = json.loads((tmp_path / "out.json").read_text())
    assert [d["data"]["dominio"] for d in out] == ["a.example"]
    resumo = json.loads(capsys.readouterr().out)
    assert resumo["docs"] == 1 and resumo["porFaixa"] == {"B": 1} and resumo["maiorDocBytes"] < 1024


# ---------------------------------------------------------------- processar

def pedido(emp, bid="D00010", status="pedido", em="2026-10-02T11:00:00Z"):
    d = doc_base(emp)
    d.update(status=status, pedidoEm=em if status != "base" else None)
    return {"id": bid, "data": d}


def test_processar_monta_lead_completo_e_atualiza_a_base():
    exist = [{"id": "B0202", "site": "z.example"}, {"id": "R0001", "site": "r.example"}]
    peds = [pedido(empresa("a.example"), "D00001", em="2026-10-02T11:00:00Z"),
            pedido(empresa("b.example", segmento="produtores de evento e feiras", nome="Feira Modelo"), "D00002",
                   em="2026-10-02T10:00:00Z"),
            pedido(empresa("c.example"), "D00003", status="base")]
    res = processar(peds, exist, None, AGORA)
    assert [(n["id"], n["data"]["site"]) for n in res["novosLeads"]] == [("B0203", "b.example"), ("B0204", "a.example")]
    assert res["baseUpdates"] == [
        {"id": "D00002", "data": {"status": "na_cadencia", "leadId": "B0203", "migradoEm": AGORA}},
        {"id": "D00001", "data": {"status": "na_cadencia", "leadId": "B0204", "migradoEm": AGORA}}]
    d = res["novosLeads"][1]["data"]
    assert d["enriquecimento"] == {"status": "bruto", "migradoSemEnriquecer": True, "fila": True}
    assert d["icp"] == "ICP3" and d["categoria"] == "Entidade do agro" and d["faixa"] == "B"
    assert d["flags"] == ["base Explee", "migrado sem enriquecer"] and d["telefone"] == "" and d["etapa"] == 0
    assert d["baseExplee"]["baseId"] == "D00001" and d["baseExplee"]["dominio"] == "a.example"
    assert [x["nome"] for x in d["decisores"]] == ["Paulo Pereira"]  # sem a base completa, só o decisor
    assert len(d["toques"]) == 3 and all(t["mensagem"] for t in d["toques"])
    assert "a pedido da Letícia" in d["historico"][0]["texto"]


def test_processar_com_base_completa_traz_todas_as_pessoas():
    emp = empresa("a.example")
    res = processar([pedido(emp)], [], base(emp), AGORA)
    assert [x["nome"] for x in res["novosLeads"][0]["data"]["decisores"]] == ["Paulo Pereira", "Mariana Souza"]
    assert res["novosLeads"][0]["data"]["baseExplee"]["personIds"] == ["p1", "p2"]


def test_processar_segmentos_ampliados_que_o_promover_pula():
    for seg, icp in [("Gestão pública", "ICP3"), ("Cooperativas agro", "ICP3"), ("Revendas e agtechs", "ICP5"),
                     ("Empresas B2B médias", "ICP5"), ("Indústrias regionais", "ICP5"), ("Conselhos e advocacia", "ICP2")]:
        emp = empresa(segmento=seg, nome="Modelo Exemplo")
        res = processar([pedido(emp)], [], None, AGORA)
        assert res["pulados"] == [] and res["novosLeads"][0]["data"]["icp"] == icp, seg
    assert promover(base(empresa(segmento="Gestão pública", tier="A")), [], "A", AGORA)["novos"] == []


def test_processar_idempotente_e_quem_ja_e_lead_so_atualiza_a_base():
    peds = [pedido(empresa("a.example"))]
    primeira = processar(peds, [], None, AGORA)
    gravados = [{"id": n["id"], **n["data"]} for n in primeira["novosLeads"]]
    segunda = processar(peds, gravados, None, AGORA)
    assert segunda["novosLeads"] == []
    assert segunda["baseUpdates"] == [{"id": "D00010", "data": {"status": "na_cadencia", "leadId": "B0001", "migradoEm": AGORA}}]


def test_processar_segmento_desconhecido_vai_para_pulados():
    res = processar([pedido(empresa(segmento="Outro segmento"))], [], None, AGORA)
    assert res["novosLeads"] == [] and res["baseUpdates"] == []
    assert res["pulados"][0]["motivo"].startswith("segmento sem cadência")


def test_cli_processar(tmp_path, capsys):
    (tmp_path / "ped.json").write_text(json.dumps([pedido(empresa("a.example"))]))
    (tmp_path / "leads.json").write_text(json.dumps([{"id": "B0007", "site": "q.example"}]))
    main(["processar", "--pedidos", str(tmp_path / "ped.json"), "--existentes", str(tmp_path / "leads.json"),
          "--saida", str(tmp_path / "out.json")])
    out = json.loads((tmp_path / "out.json").read_text())
    assert set(out) == {"novosLeads", "baseUpdates", "pulados"} and out["novosLeads"][0]["id"] == "B0008"
    assert json.loads(capsys.readouterr().out)["ids"] == ["B0008"]


# ---------------------------------------------------------------- enriquecimento

def test_enriquecer_seleciona_os_pedidos_da_base_primeiro_e_tira_da_fila_depois():
    agora = datetime(2026, 10, 2, 12, tzinfo=timezone.utc)
    novo = processar([pedido(empresa("a.example", tier="C", score=10))], [], None, AGORA)["novosLeads"][0]
    lead_novo = {"id": novo["id"], **novo["data"]}
    faixa_a = {**lead_novo, "id": "B0100", "faixa": "A", "score": 90, "site": "x.example",
               "enriquecimento": {"status": "bruto", "migradoSemEnriquecer": True}}
    cands = selecionar([faixa_a, lead_novo], agora)
    assert [c["leadId"] for c in cands] == [novo["id"], "B0100"]
    assert cands[0]["linkedin"] == "https://linkedin.com/in/x" and cands[0]["dominio"] == "a.example"
    depois = aplicar(lead_novo, {"resultado": "nao_achou", "callIds": ["c1"]}, 0, agora, "E1")
    assert "fila" not in depois["enriquecimento"] and depois["contatoAtivo"] is None

"""Funil: etapa de cada lead, contagens, passagem entre etapas, taxa por segmento e marcação comercial."""
from atendente.api_funil import etapa_do_lead, montar
from test_servidor import ctx, entrar, json_de, pedir  # noqa: F401 (fixture)


def lead(i, **extra):
    d = {"id": f"L{i}", "nome": f"Empresa {i}", "canal": "WhatsApp", "situacao": "ativo", "etapa": 0,
         "segmento": "Advocacia", "historico": []}
    d.update(extra)
    return d


def test_etapa_de_cada_lead():
    assert etapa_do_lead(lead(1)) == "novo"
    assert etapa_do_lead(lead(1, sonda={"enviadaEm": "2026-10-07T13:00:00Z"})) == "ola"
    assert etapa_do_lead(lead(1, etapa=2, enviado1="x", enviado2="y")) == "cadencia"
    assert etapa_do_lead(lead(1, situacao="respondeu")) == "respondeu"
    assert etapa_do_lead(lead(1, situacao="respondeu", funil="reuniao")) == "reuniao"
    assert etapa_do_lead(lead(1, situacao="ativo", funil="reuniao")) == "novo"      # voltou para a cadência
    assert etapa_do_lead(lead(1, situacao="fechou", funil="proposta")) == "fechou"
    assert etapa_do_lead(lead(1, situacao="sair")) == "perdido"


def test_contagens_passagem_e_taxa_por_segmento():
    leads = [lead(1), lead(2, sonda={"enviadaEm": "x"}), lead(3, etapa=1, enviado1="x"),
             lead(4, situacao="respondeu", funil="proposta"), lead(5, situacao="fechou"),
             lead(6, situacao="sair", segmento="Contabilidade", etapa=1, enviado1="x"),
             lead(7, segmento="", etapa=1, enviado1="x"), {"id": "TESTE", "situacao": "ativo"}]
    r = montar(leads)
    qtd = {e["id"]: e["qtd"] for e in r["etapas"]}
    assert qtd == {"novo": 1, "ola": 1, "cadencia": 2, "respondeu": 0, "conversa": 0, "reuniao": 0, "proposta": 1,
                   "fechou": 1, "perdido": 1}
    cheg = {e["id"]: e.get("chegaram") for e in r["etapas"]}
    assert cheg["novo"] == 6 and cheg["ola"] == 5 and cheg["proposta"] == 2 and cheg["fechou"] == 1
    assert {e["id"]: e.get("passagem") for e in r["etapas"]}["fechou"] == 50.0
    segs = {s["segmento"]: s for s in r["segmentos"]}
    assert segs["Advocacia"]["contatados"] == 4 and segs["Advocacia"]["responderam"] == 2
    assert segs["Advocacia"]["taxaResposta"] == 50.0
    assert segs["Contabilidade"]["taxaResposta"] == 0.0 and "Sem segmento" in segs
    assert r["segmentos"][0]["segmento"] == "Advocacia"           # melhor taxa primeiro


def test_filtro_por_segmento_so_mostra_os_leads_dele():
    r = montar([lead(1), lead(2, segmento="Contabilidade")], "Contabilidade")
    assert [l["id"] for e in r["etapas"] for l in e["leads"]] == ["L2"]
    assert len(r["segmentos"]) == 2                                # a tabela de segmentos continua completa


def test_rota_funil_e_marcar_etapa(ctx):
    ctx.repo.lead_put(lead(1, etapa=1, enviado1="2026-10-06T13:00:00Z", agendamento={"n": 2, "id": "p9"}))
    ctx.wa.pendentes = [{"id": "p9", "status": "PENDING"}]
    ck = entrar(ctx)
    r = pedir(ctx, "POST", "/api/leads/L1/funil", {"etapa": "reuniao"}, cookie=ck)
    assert r[0] == 200 and json_de(r)["cancelouAgendado"] is True and ctx.wa.cancelados == ["p9"]
    l = ctx.repo.lead_get("L1")
    assert l["situacao"] == "respondeu" and l["funil"] == "reuniao" and not l.get("agendamento")
    assert "Funil: de Em cadência para Reunião marcada" in l["historico"][-1]["texto"]
    f = json_de(pedir(ctx, "GET", "/api/funil?segmento=Advocacia", cookie=ck))
    assert [e["qtd"] for e in f["etapas"] if e["id"] == "reuniao"] == [1]
    # voltar para "Respondeu" tira a marca comercial
    pedir(ctx, "POST", "/api/leads/L1/funil", {"etapa": "respondeu"}, cookie=ck)
    assert "funil" not in ctx.repo.lead_get("L1")


def test_marcar_etapa_recusa_invalida_e_lead_que_saiu(ctx):
    ctx.repo.lead_put(lead(1, situacao="sair"))
    ck = entrar(ctx)
    assert pedir(ctx, "POST", "/api/leads/L1/funil", {"etapa": "proposta"}, cookie=ck)[0] == 409
    assert pedir(ctx, "POST", "/api/leads/L1/funil", {"etapa": "qualquer"}, cookie=ck)[0] == 400
    assert pedir(ctx, "POST", "/api/leads/X9/funil", {"etapa": "proposta"}, cookie=ck)[0] == 404

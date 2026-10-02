import json
from datetime import datetime, timezone

from central.seed import CAMPOS, ESTADO_INICIAL
from msg.copy_v1 import O_QUE_FAZEMOS
from scripts.enriquecer_leads import selecionar
from scripts.explee_hot_leads import lead_novo
from scripts.promover_base import checar, main, nome_curto, promover, recompor

AGORA = "2026-10-02T12:00:00Z"


def pessoa(pid, nome, cargo="President", persona="decisor", linkedin="https://linkedin.com/in/x", campanha="Associações setoriais"):
    return {"person_id": pid, "nome": nome, "cargo": cargo, "persona": persona, "linkedin": linkedin, "intent": None,
            "campanha": campanha}


def empresa(dominio="abex.example", nome="Abex - Associação Brasileira de Exemplo", segmento="Associações setoriais",
            tier="A", score=60, pessoas=None, decisor=None):
    pessoas = pessoas or [pessoa("p2", "Mariana Souza", "Internal Communications", "comunicacao", campanha=segmento),
                          pessoa("p1", "Paulo Pereira", campanha=segmento),
                          pessoa("p3", "Carla Lima", "Coordenadora", "gestao", linkedin="", campanha=segmento)]
    return {"dominio": dominio, "nome": nome, "segmento": segmento, "campanhas": [segmento], "tier": tier,
            "score": score, "quente": False, "respondeu": False, "pessoas": pessoas,
            "decisor": decisor or next(p for p in pessoas if p["person_id"] == "p1")}


def base(*empresas):
    return {"empresas": list(empresas), "excluidos": [], "outraOferta": [], "resumo": {}}


def um(emp, existentes=()):
    res = promover(base(emp), list(existentes), "A", AGORA)
    assert len(res["novos"]) == 1, res["pulados"]
    return res["novos"][0]


# ---------------------------------------------------------------- mapeamento

def test_mapeia_campos_e_tem_todos_os_campos_da_pagina():
    n = um(empresa())
    d = n["data"]
    esperado = (set(CAMPOS) | set(ESTADO_INICIAL) | set(lead_novo({"name": "A", "email": "a@b.c"}, "c", 1)) | {"baseExplee"}) - {"explee"}
    assert esperado <= set(d)
    assert all(d[k] is not None for k in CAMPOS if k != "score")
    assert d["nome"] == "Abex - Associação Brasileira de Exemplo" and d["site"] == "abex.example"
    assert d["segmento"] == "Associações setoriais" and d["categoria"] == "Associação setorial" and d["icp"] == "ICP3"
    assert (d["canal"], d["telefone"], d["email"]) == ("WhatsApp", "", "")
    assert d["situacao"] == "ativo" and d["etapa"] == 0 and d["ordem"] == 5001
    assert (d["enviado1"], d["enviado2"], d["enviado3"], d["contatoAtivo"]) == (None, None, None, None)
    assert d["faixa"] == "A" and d["score"] == 60 and d["flags"] == ["base Explee"]
    assert d["pendencias"] == ["Achar celular do decisor"] and d["enriquecimento"] == {"status": "bruto"}
    assert d["baseExplee"] == {"dominio": "abex.example", "campanhas": ["Associações setoriais"],
                           "personIds": ["p1", "p2", "p3"], "tier": "A", "score": 60}
    assert d["historico"] == [{"em": AGORA, "tipo": "explee", "texto": "Entrou da base Explee (faixa A, campanha "
                               "Associações setoriais): já recebeu e-mail da Explee sem responder"}]
    assert d["perfil"]["especialidade"] and d["perfil"]["fonteDados"] == "Explee"
    for k in ("empresa", "socios", "sinais", "alertas", "contatos"):
        assert not d[k]
    assert d["redes"] == {"linkedinEmpresa": "", "instagram": "", "youtube": ""}
    assert d["foto"] == "mesa-vazia-02"
    json.dumps(n)  # serializável


def test_decisores_por_persona_com_o_escolhido_na_frente():
    d = um(empresa())["data"]
    assert [x["nome"] for x in d["decisores"]] == ["Paulo Pereira", "Mariana Souza", "Carla Lima"]
    assert d["decisores"][0] == {"nome": "Paulo Pereira", "cargo": "President", "linkedin": "https://linkedin.com/in/x",
                                 "fonte": "Explee · campanha Associações setoriais"}


def test_segmentos_viram_icp():
    ev = um(empresa(segmento="produtores de evento e feiras", nome="Feira Modelo Eventos Ltda"))["data"]
    assert ev["icp"] == "ICP6" and ev["foto"] == "sofa-pessoa-01"
    adv = um(empresa(segmento="Conselhos e advocacia", nome="Modelo Advogados"))["data"]
    assert adv["icp"] == "ICP2"
    cons = um(empresa(segmento="Conselhos e advocacia", nome="Conselho Regional de Exemplo"))["data"]
    assert cons["icp"] == "ICP3"


def test_segmento_sem_icp_e_pulado():
    res = promover(base(empresa(segmento="Gestão pública")), [], "A", AGORA)
    assert res["novos"] == [] and res["pulados"][0]["motivo"].startswith("segmento sem cadência")


def test_so_a_faixa_pedida():
    res = promover(base(empresa(), empresa(dominio="b.example", tier="B")), [], "A", AGORA)
    assert [n["data"]["site"] for n in res["novos"]] == ["abex.example"]


# ---------------------------------------------------------------- ids e idempotência

def test_ids_continuam_depois_do_maior_b():
    exist = [{"id": "R0001", "site": "https://r.example"}, {"id": "B0007", "site": "x.example"},
             {"id": "B0003", "data": {"site": "y.example"}}, {"id": "X0001", "site": "z.example"}]
    res = promover(base(empresa(dominio="a.example", score=55), empresa(dominio="c.example", score=60)), exist, "A", AGORA)
    assert [(n["id"], n["data"]["site"], n["data"]["ordem"]) for n in res["novos"]] == [
        ("B0008", "c.example", 5008), ("B0009", "a.example", 5009)]


def test_idempotente_pula_pelo_dominio_ou_site():
    emp = [empresa(dominio="a.example"), empresa(dominio="www.c.example")]
    primeira = promover(base(*emp), [], "A", AGORA)
    gravados = [{"id": n["id"], **n["data"]} for n in primeira["novos"]]
    segunda = promover(base(*emp), gravados, "A", AGORA)
    assert segunda["novos"] == [] and {p["motivo"] for p in segunda["pulados"]} == {"já na central"}
    # Lead antigo com o site com https/www, ou só com explee.dominio, também conta
    exist = [{"id": "R0005", "site": "https://www.a.example/contato"}, {"id": "X0002", "site": "", "explee": {"dominio": "c.example"}}]
    res = promover(base(*emp), exist, "A", AGORA)
    assert res["novos"] == [] and sorted(p["id"] for p in res["pulados"]) == ["R0005", "X0002"]


# ---------------------------------------------------------------- saudação

def test_saudacao_primeiro_nome_do_decisor():
    assert um(empresa())["data"]["saudacao"] == "Paulo"


def test_saudacao_com_titulo_e_caixa():
    ps = [pessoa("p1", "DRA. ANA CRISTINA CALDART")]
    assert um(empresa(pessoas=ps))["data"]["saudacao"] == "Dra. Ana"
    ps = [pessoa("p1", "jose felix")]
    assert um(empresa(pessoas=ps))["data"]["saudacao"] == "Jose"


def test_conta_institucional_nao_vira_saudacao():
    ps = [pessoa("p1", "ANEAC Oficial"), pessoa("p2", "Bruna Alves", "Diretora")]
    d = um(empresa(nome="ANEAC OFICIAL", dominio="aneac.example", pessoas=ps))["data"]
    assert d["saudacao"] == "Bruna" and d["decisores"][0]["nome"] == "Bruna Alves"
    ps = [pessoa("p1", "Atratur Bonito MS")]
    d = um(empresa(nome="Associação dos Atrativos de Bonito e Região", pessoas=ps))["data"]
    assert d["saudacao"] == "pessoal da Associação dos Atrativos de Bonito"
    ps = [pessoa("p1", "Instituto Modelo")]
    assert um(empresa(nome="Instituto Modelo", pessoas=ps))["data"]["saudacao"] == "pessoal do Instituto Modelo"


def test_nome_curto():
    assert nome_curto("Origami Marketing e Eventos Ltda") == "Origami Marketing e Eventos"
    assert nome_curto("Abex - Associação Brasileira") == "Abex"
    assert nome_curto("Febratex Group \U0001F1E7\U0001F1F7") == "Febratex Group"


# ---------------------------------------------------------------- toques

def test_tres_toques_prontos_sem_link_e_passam_na_checagem():
    n = um(empresa())
    d = n["data"]
    assert [t["n"] for t in d["toques"]] == [1, 2, 3]
    assert all(t["mensagem"] and t["waLink"] == "" and t["assunto"] == "" and t["corpo"] == "" for t in d["toques"])
    t1 = d["toques"][0]["mensagem"]
    assert t1.startswith("Oi, Paulo, tudo bem?") and d["fraseUnica"] in t1 and O_QUE_FAZEMOS["ICP3"] in t1
    assert "Te mandei uma foto do nosso cenário" in t1
    assert d["toques"][1]["mensagem"].startswith("Oi, Paulo, é a Letícia de novo")
    assert checar(n["id"], d) == []


def test_toques_dos_eventos_passam_na_checagem():
    n = um(empresa(segmento="produtores de evento e feiras", nome="Feira Modelo"))
    assert O_QUE_FAZEMOS["ICP6"] in n["data"]["toques"][0]["mensagem"]
    assert checar(n["id"], n["data"]) == []


# ---------------------------------------------------------------- região

def test_promover_escolhe_a_versao_pela_regiao():
    fora = um(empresa(nome="CNC - Confederação Nacional do Comércio", dominio="cnc.example"))["data"]
    assert fora["regiao"] == "fora" and "Cuiabá (MT)" in fora["toques"][0]["mensagem"]
    assert "café" not in fora["toques"][0]["mensagem"] and "por vídeo" in fora["toques"][1]["mensagem"]
    mt = um(empresa(nome="OAB MT", dominio="oabmt.example"))["data"]
    assert mt["regiao"] == "MT" and "aqui em Cuiabá" in mt["toques"][0]["mensagem"]
    assert "um café" in mt["toques"][0]["mensagem"]
    inc = um(empresa(nome="Feira Modelo Eventos", dominio="feiramodelo.example", segmento="produtores de evento e feiras"))["data"]
    assert inc["regiao"] == "?" and "estúdio de podcast em Cuiabá." in inc["toques"][0]["mensagem"]
    for n, d in (("B1", fora), ("B2", mt), ("B3", inc)):
        assert checar(n, d) == []


def _promovido(nome="Feira Modelo Eventos", dominio="feiramodelo.example"):
    n = um(empresa(nome=nome, dominio=dominio, segmento="produtores de evento e feiras"))
    return {"novos": [n], "pulados": []}


def test_recompor_usa_o_ddd_do_telefone_achado():
    entrada = _promovido()
    assert entrada["novos"][0]["data"]["regiao"] == "?"
    entrada["novos"][0]["data"]["contatos"] = [{"id": "k1", "papel": "decisor", "telefone": "5511988887777"}]
    saida, rel = recompor(entrada, AGORA)
    d = saida["novos"][0]["data"]
    assert rel["recompostos"] == [{"id": "B0001", "de": "?", "para": "fora"}]
    assert d["regiao"] == "fora" and "Cuiabá (MT)" in d["toques"][0]["mensagem"] and checar("B0001", d) == []
    assert d["historico"][-1]["texto"] == "Toques refeitos para a região fora (antes ?)"
    assert saida["pulados"] == [] and entrada["novos"][0]["data"]["regiao"] == "?"  # entrada intacta
    # de novo: nada muda
    saida2, rel2 = recompor(saida, AGORA)
    assert rel2["recompostos"] == [] and rel2["iguais"] == ["B0001"] and saida2 == saida


def test_recompor_mantem_o_telefone_do_link():
    entrada = _promovido()
    d = entrada["novos"][0]["data"]
    d["telefone"] = "5565999991234"
    d["toques"][0]["waLink"] = "https://wa.me/5565999991234?text=x"
    saida, rel = recompor(entrada, AGORA)
    t = saida["novos"][0]["data"]["toques"]
    assert saida["novos"][0]["data"]["regiao"] == "MT"
    assert t[0]["waLink"].startswith("https://wa.me/5565999991234?text=Oi%2C") and t[1]["waLink"] == ""
    assert checar("B0001", saida["novos"][0]["data"]) == []


def test_recompor_nao_mexe_em_quem_ja_teve_envio():
    for estado in ({"etapa": 1}, {"etapa": 0, "enviado1": "2026-10-01T12:00:00Z"}):
        entrada = _promovido()
        d = entrada["novos"][0]["data"]
        d.update(estado)
        d["contatos"] = [{"telefone": "5511988887777"}]
        antes = json.loads(json.dumps(entrada))
        saida, rel = recompor(entrada, AGORA)
        assert saida == antes and rel["recompostos"] == [] and rel["travados"][0]["id"] == "B0001"


def test_recompor_lista_de_leads_da_central(tmp_path, capsys):
    n = _promovido()["novos"][0]
    lista = [{"id": n["id"], **n["data"], "telefone": "11 98888-7777"},
             {"id": "R0001", "nome": "Lead antigo", "etapa": 0, "toques": []}]
    e, s = tmp_path / "e.json", tmp_path / "s.json"
    e.write_text(json.dumps(lista, ensure_ascii=False), encoding="utf-8")
    main(["recompor", "--entrada", str(e), "--saida", str(s)])
    out = json.loads(s.read_text(encoding="utf-8"))
    assert out[0]["id"] == "B0001" and out[0]["regiao"] == "fora" and out[1] == lista[1]
    rel = json.loads(capsys.readouterr().out)
    assert rel["recompostos"] == 1 and rel["travados"] == [{"id": "R0001", "motivo": "não é da base Explee"}]


# ---------------------------------------------------------------- enriquecimento

def test_seletor_do_enriquecimento_pega_o_lead_promovido():
    n = um(empresa())
    cands = selecionar([{"id": n["id"], **n["data"]}], datetime(2026, 10, 2, tzinfo=timezone.utc))
    assert len(cands) == 1
    c = cands[0]
    assert c["leadId"] == n["id"] and c["decisorIndex"] == 0 and c["nome"] == "Paulo Pereira"
    assert c["linkedin"] == "https://linkedin.com/in/x" and c["dominio"] == "abex.example"


# ---------------------------------------------------------------- CLI

def test_cli(tmp_path, capsys):
    b, e, s = tmp_path / "base.json", tmp_path / "exist.json", tmp_path / "saida.json"
    b.write_text(json.dumps(base(empresa(), empresa(dominio="b.example", tier="B")), ensure_ascii=False), encoding="utf-8")
    e.write_text(json.dumps([{"id": "B0002", "site": "z.example"}]), encoding="utf-8")
    main(["promover", "--base", str(b), "--existentes", str(e), "--tier", "A", "--saida", str(s)])
    out = json.loads(s.read_text(encoding="utf-8"))
    assert [n["id"] for n in out["novos"]] == ["B0003"] and out["pulados"] == []
    assert json.loads(capsys.readouterr().out)["porSegmento"] == {"Associações setoriais": 1}

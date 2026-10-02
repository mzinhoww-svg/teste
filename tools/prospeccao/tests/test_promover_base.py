import json
from datetime import datetime, timezone

from central.seed import CAMPOS, ESTADO_INICIAL
from msg.copy_v1 import O_QUE_FAZEMOS
from scripts.enriquecer_leads import selecionar
from scripts.explee_hot_leads import lead_novo
from scripts.promover_base import checar, main, nome_curto, promover

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
    esperado = set(CAMPOS) | set(ESTADO_INICIAL) | set(lead_novo({"name": "A", "email": "a@b.c"}, "c", 1))
    assert esperado <= set(d)
    assert all(d[k] is not None for k in CAMPOS if k != "score")
    assert d["nome"] == "Abex - Associação Brasileira de Exemplo" and d["site"] == "abex.example"
    assert d["segmento"] == "Associações setoriais" and d["categoria"] == "Associação setorial" and d["icp"] == "ICP3"
    assert (d["canal"], d["telefone"], d["email"]) == ("WhatsApp", "", "")
    assert d["situacao"] == "ativo" and d["etapa"] == 0 and d["ordem"] == 5001
    assert (d["enviado1"], d["enviado2"], d["enviado3"], d["contatoAtivo"]) == (None, None, None, None)
    assert d["faixa"] == "A" and d["score"] == 60 and d["flags"] == ["base Explee"]
    assert d["pendencias"] == ["Achar celular do decisor"] and d["enriquecimento"] == {"status": "bruto"}
    assert d["explee"] == {"dominio": "abex.example", "campanhas": ["Associações setoriais"],
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

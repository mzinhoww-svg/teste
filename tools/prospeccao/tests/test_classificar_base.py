import csv
import json

import pytest

from scripts.classificar_base import classificar, main, persona, resumo_md

CAMPANHAS = {"1": {"nome": "Associações setoriais", "projeto": 36217},
             "2": {"nome": "Entidades do agro", "projeto": 36217},
             "3": {"nome": "Gestão pública", "projeto": 36217},
             "4": {"nome": "produtores de evento e feiras", "projeto": 36217},
             "9": {"nome": "B2B Sales Teams", "projeto": 36223}}


class Base:
    """Monta inbox.json e pessoas.json falsos, uma pessoa por chamada."""

    def __init__(self):
        self.contatos, self.pessoas, self.n = [], {}, 0

    def add(self, dominio="exemplo.org", cargo="CEO", campanha="1", intent=None, replies=0, linkedin=True,
            pais="BR", empresa=None, nome=None, email_resposta=None, intent_pessoas=None):
        self.n += 1
        pid = f"p{self.n:05d}"
        info = CAMPANHAS[campanha]
        self.contatos.append({"person_id": pid, "email": email_resposta, "name": nome if email_resposta else None,
                              "latest_intent": intent, "sent_count": 2, "reply_count": replies,
                              "latest_sent_at": "2026-09-20T10:00:00Z", "latest_reply_at": None,
                              "campaign_id": int(campanha), "campanha": info["nome"], "projeto": info["projeto"]})
        self.pessoas[pid] = {"lead": {"name": nome or f"Pessoa {self.n}", "email": f"p****@{dominio}",
                                      "job_title": cargo, "company_name": empresa or dominio.split(".")[0].title(),
                                      "company_domain": dominio,
                                      "linkedin_url": f"https://linkedin.com/in/{pid}" if linkedin else None,
                                      "country": pais, "phone": None},
                             "intent": intent_pessoas, "erro": None, "n_msgs": 2}
        return pid

    def inbox(self):
        return {"campanhas": CAMPANHAS, "contatos": self.contatos}

    def rodar(self, existentes=None):
        return classificar(self.inbox(), self.pessoas, existentes)


def _empresa(res, dominio):
    return next((e for e in res["empresas"] if e["dominio"] == dominio), None)


def _motivos(res):
    return {(x["dominio"], x["nivel"], x["motivo"]) for x in res["excluidos"]}


# ---------------------------------------------------------------- persona

@pytest.mark.parametrize("cargo,esperado", [
    ("Chief Executive Officer", "decisor"), ("Sócio-Diretor", "decisor"), ("socia fundadora", "decisor"),
    ("FUNDADORA", "decisor"), ("Presidente", "decisor"), ("Vice President", "decisor"), ("Diretora", "decisor"),
    ("Superintendente", "decisor"), ("Owner", "decisor"), ("Managing Partner", "decisor"),
    ("Head of Cabinet", "decisor"), ("Gerente Geral", "decisor"), ("General Manager", "decisor"),
    ("Secretária Executiva", "decisor"),
    ("Gerente de Marketing", "comunicacao"), ("Marketing Director", "comunicacao"),
    ("Assessora de Imprensa", "comunicacao"), ("Comunicação", "comunicacao"), ("Communications Advisor", "comunicacao"),
    ("Relações Institucionais", "comunicacao"), ("Coordenadora de Eventos", "comunicacao"),
    ("Press Spokesperson", "comunicacao"), ("Head of Marketing", "comunicacao"),
    ("Gerente Comercial", "gestao"), ("Coordenador Administrativo", "gestao"), ("Sales Manager", "gestao"),
    ("Supervisor", "gestao"),
    ("Analista de Marketing", "operacional"), ("Assistente Administrativo", "operacional"),
    ("Estagiária", "operacional"), ("Advogado", "operacional"), ("", "operacional"), (None, "operacional"),
])
def test_persona(cargo, esperado):
    assert persona(cargo) == esperado


# ---------------------------------------------------------------- exclusões

@pytest.mark.parametrize("intent,motivo", [("not_interested", "não tem interesse"), ("unsubscribe", "pediu descadastro"),
                                           ("opt_out", "pediu descadastro")])
def test_recusa_tira_a_empresa_inteira(intent, motivo):
    b = Base()
    b.add("recusou.org", intent=intent, replies=1)
    b.add("recusou.org", cargo="Marketing Manager")
    b.add("fica.org")
    res = b.rodar()
    assert _empresa(res, "recusou.org") is None
    assert ("recusou.org", "empresa", motivo) in _motivos(res)
    assert _empresa(res, "fica.org") is not None


@pytest.mark.parametrize("intent,motivo", [("recipient_gone", "saiu da empresa"), ("email_changed", "e-mail mudou")])
def test_pessoa_que_saiu_sai_sozinha(intent, motivo):
    b = Base()
    saiu = b.add("x.org", intent=intent, replies=1)
    fica = b.add("x.org", cargo="Diretor")
    sozinha = b.add("y.org", intent=intent, replies=1)
    res = b.rodar()
    e = _empresa(res, "x.org")
    assert [p["person_id"] for p in e["pessoas"]] == [fica]
    assert any(x["person_id"] == saiu and x["motivo"] == motivo for x in res["excluidos"])
    assert _empresa(res, "y.org") is None and ("y.org", "empresa", motivo) in _motivos(res)
    assert sozinha not in json.dumps(res["empresas"])


def test_intent_de_pessoas_json_tambem_exclui():
    b = Base()
    b.add("z.org", intent=None, intent_pessoas="not_interested")
    assert ("z.org", "empresa", "não tem interesse") in _motivos(b.rodar())


def test_fora_do_brasil_sai_e_pais_vazio_fica():
    b = Base()
    b.add("pt.org", pais="PT")
    b.add("vazio.org", pais=None)
    b.add("misto.org", pais="US")
    b.add("misto.org", pais="BR")
    res = b.rodar()
    assert ("pt.org", "empresa", "fora do Brasil") in _motivos(res)
    assert _empresa(res, "vazio.org") is not None
    assert len(_empresa(res, "misto.org")["pessoas"]) == 1


def test_resposta_automatica_e_neutra():
    b = Base()
    b.add("ferias.org", intent="out_of_office", replies=1)
    b.add("auto.org", intent="auto_acknowledgement", replies=1)
    res = b.rodar()
    for d in ("ferias.org", "auto.org"):
        e = _empresa(res, d)
        assert e is not None and not e["respondeu"] and not e["quente"]


# ---------------------------------------------------------------- agrupamento

def test_agrupa_por_dominio_e_escolhe_o_melhor():
    b = Base()
    b.add("www.Coop.org", cargo="Analista", campanha="2")
    gerente = b.add("coop.org", cargo="Gerente Comercial", campanha="2")
    ceo = b.add("coop.org", cargo="CEO", campanha="1", linkedin=True)
    b.add("coop.org", cargo="Diretor Financeiro", campanha="1", linkedin=False)
    res = b.rodar()
    [e] = res["empresas"]
    assert e["dominio"] == "coop.org" and len(e["pessoas"]) == 4
    assert e["decisor"]["person_id"] == ceo and e["decisor"]["persona"] == "decisor"
    assert e["pessoas"][0]["person_id"] == ceo
    assert set(e["campanhas"]) == {"Associações setoriais", "Entidades do agro"}
    assert e["segmento"] == "Associações setoriais"
    assert gerente in {p["person_id"] for p in e["pessoas"]}


def test_quem_respondeu_vira_o_decisor_e_define_o_segmento():
    b = Base()
    b.add("evt.org", cargo="CEO", campanha="2")
    quente = b.add("evt.org", cargo="Gerente Comercial", campanha="4", intent="hot_lead", replies=1,
                   email_resposta="fulana@evt.org", nome="Fulana")
    e = _empresa(b.rodar(), "evt.org")
    assert e["decisor"]["person_id"] == quente and e["decisor"]["email_visivel"] == "fulana@evt.org"
    assert e["segmento"] == "produtores de evento e feiras"


def test_email_mascarado_nao_aparece():
    b = Base()
    b.add("m.org")
    e = _empresa(b.rodar(), "m.org")
    assert "email_visivel" not in e["decisor"]


# ---------------------------------------------------------------- faixas

def test_hot_lead_e_sempre_a():
    b = Base()
    for i in range(40):
        b.add(f"forte{i}.org", cargo="CEO", campanha="1")
    b.add("frio.org", cargo="Estagiário", campanha="3", linkedin=False, intent="hot_lead", replies=1)
    res = b.rodar()
    e = _empresa(res, "frio.org")
    assert e["tier"] == "A" and e["quente"] is True and e["respondeu"] is True


def test_outra_oferta_fica_de_lado():
    b = Base()
    b.add("crm.com", campanha="9", pais="US")
    b.add("crm2.com", campanha="9", intent="hot_lead", replies=1)
    b.add("ambos.org", campanha="9")
    b.add("ambos.org", campanha="1")
    res = b.rodar()
    assert _empresa(res, "crm2.com") is None
    outra = {e["dominio"]: e for e in res["outraOferta"]}
    assert "crm2.com" in outra and outra["crm2.com"]["tier"] is None and outra["crm2.com"]["score"] is None
    assert ("crm.com", "empresa", "fora do Brasil") in _motivos(res)
    assert len(_empresa(res, "ambos.org")["pessoas"]) == 1 and "ambos.org" in outra
    assert res["resumo"]["outraOferta"] == {"empresas": 2, "pessoas": 2, "quentes": 1}


def test_empresa_da_central_sai():
    b = Base()
    b.add("central.org")
    b.add("contato.org")
    b.add("emailvisivel.org", intent="hot_lead", replies=1, email_resposta="ana@clinica.org")
    b.add("nova.org")
    existentes = [{"id": "R0001", "site": "https://www.central.org/contato", "email": "x@gmail.com", "contatos": []},
                  {"id": "R0002", "site": "https://instagram.com/x", "email": "",
                   "contatos": [{"email": "joao@contato.org"}]},
                  {"id": "R0003", "site": "", "email": "oi@clinica.org", "contatos": None}]
    res = b.rodar(existentes)
    assert {e["dominio"] for e in res["empresas"]} == {"nova.org"}
    for d in ("central.org", "contato.org", "emailvisivel.org"):
        assert (d, "empresa", "já na central") in _motivos(res)


def test_proporcao_das_faixas_num_conjunto_sintetico():
    b = Base()
    cargos = ["CEO", "Diretor", "Gerente de Marketing", "Gerente Comercial", "Analista", "Coordenadora"]
    camps = ["1", "2", "3", "4"]
    for i in range(600):
        dom = f"e{i}.org"
        b.add(dom, cargo=cargos[i % 6], campanha=camps[(i // 6) % 4], linkedin=i % 5 != 0)
        if i % 7 == 0:
            b.add(dom, cargo=cargos[(i + 2) % 6], campanha=camps[(i // 6) % 4], linkedin=i % 3 != 0)
        if i % 9 == 0:
            b.add(dom, cargo="Assessora de Comunicação", campanha=camps[i % 4])
    for i in range(0, 600, 60):
        b.contatos[i]["latest_intent"], b.contatos[i]["reply_count"] = "hot_lead", 1
    res = b.rodar()
    n = len(res["empresas"])
    conta = {f: sum(1 for e in res["empresas"] if e["tier"] == f) for f in "ABC"}
    assert 0.10 <= conta["A"] / n <= 0.15
    assert 0.25 <= conta["B"] / n <= 0.35
    assert all(e["tier"] == "A" for e in res["empresas"] if e["quente"])
    corte = res["resumo"]["cortes"]
    assert all(e["score"] >= corte["A"] for e in res["empresas"] if e["tier"] == "A" and not e["quente"])
    assert all(corte["B"] <= e["score"] < corte["A"] for e in res["empresas"] if e["tier"] == "B")
    assert res["resumo"]["totais"]["A"] == conta["A"]


def test_score_respeita_os_componentes():
    b = Base()
    b.add("a.org", cargo="CEO", campanha="1")
    b.add("b.org", cargo="CEO", campanha="3")
    b.add("c.org", cargo="Analista", campanha="1", linkedin=False)
    res = b.rodar()
    s = {e["dominio"]: e["score"] for e in res["empresas"]}
    assert s["a.org"] > s["b.org"] and s["a.org"] > s["c.org"]
    assert all(0 <= v <= 100 for v in s.values())


# ---------------------------------------------------------------- CLI e saídas

def test_cli_grava_base_resumo_e_csvs(tmp_path, capsys):
    b = Base()
    b.add("assoc.org", campanha="1", intent="hot_lead", replies=1)
    b.add("assoc2.org", campanha="1", cargo="Gerente Comercial")
    b.add("agro.org", campanha="2")
    b.add("nao.org", campanha="2", intent="not_interested", replies=1)
    ib, ps, ex = tmp_path / "inbox.json", tmp_path / "pessoas.json", tmp_path / "existentes.json"
    ib.write_text(json.dumps(b.inbox(), ensure_ascii=False), encoding="utf-8")
    ps.write_text(json.dumps(b.pessoas, ensure_ascii=False), encoding="utf-8")
    ex.write_text(json.dumps([{"id": "R0001", "site": "agro.org", "email": "", "contatos": []}]), encoding="utf-8")
    saida, resumo, pasta = tmp_path / "out" / "base.json", tmp_path / "out" / "resumo.md", tmp_path / "out" / "seg"
    main(["classificar", "--inbox", str(ib), "--pessoas", str(ps), "--existentes", str(ex), "--saida", str(saida),
          "--resumo", str(resumo), "--csv-dir", str(pasta)])
    out = json.loads(capsys.readouterr().out)
    assert out["empresas"] == 2 and out["A"] >= 1
    base = json.loads(saida.read_text(encoding="utf-8"))
    assert set(base) == {"empresas", "excluidos", "outraOferta", "resumo"}
    md = resumo.read_text(encoding="utf-8")
    assert "| Associações setoriais | 2 | 2 |" in md and "já na central" in md and "não tem interesse" in md
    assert [p.name for p in pasta.iterdir()] == ["associacoes-setoriais.csv"]
    with open(pasta / "associacoes-setoriais.csv", encoding="utf-8-sig", newline="") as fh:
        linhas = list(csv.DictReader(fh))
    assert list(linhas[0]) == ["tier", "score", "empresa", "dominio", "decisor", "cargo", "persona", "linkedin",
                               "campanha", "quente", "respondeu"]
    assert linhas[0]["dominio"] == "assoc.org" and linhas[0]["tier"] == "A" and linhas[0]["quente"] == "sim"


def test_resumo_md_tem_totais_e_cortes():
    b = Base()
    b.add("a.org")
    md = resumo_md(b.rodar())
    assert "**Total**" in md and "score ≥" in md and "outra oferta" in md

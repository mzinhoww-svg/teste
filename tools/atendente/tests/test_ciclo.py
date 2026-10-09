"""Prospecção: o ciclo (uma rodada por vez, numa thread) de empresa → pessoa → contato → qualificado → promovido.

Nada aqui usa a rede nem gasta dinheiro: o treg é um transporte falso no formato real (`{output, raw, _treg}`, custo
em `X-Treg-Cost-Micro`, "não achou" = 200 com `phone: null`) e o WA-AKG é falso. CNPJs, nomes e domínios
fictícios; telefones 55659999000NN."""
import json
import threading
from datetime import datetime, timedelta, timezone

import pytest

from atendente.db import Repo
from atendente.prospeccao import ciclo as cic

AGORA = datetime(2026, 10, 7, 14, 0, tzinfo=timezone.utc)      # 10h em Cuiabá
TOKEN = "tok-de-teste-inventado"
NOMES = ["ANA", "BRUNO", "CARLA", "DIEGO", "ELISA", "FABIO", "GABRIELA", "HUGO", "IARA", "JOAO"]


def cel(i):
    return f"55659999000{i:02d}"


def ok(output, provedor="aiark", custo=0):
    return 200, {"X-Treg-Cost-Micro": str(custo), "X-Treg-Served-By": provedor, "X-Treg-Call-Id": "call-teste"}, \
        {"output": output, "raw": {}, "_treg": {"served_by": provedor, "tried": [provedor]}}


class Treg:
    """Transporte falso do treg. Celular por nome da pessoa: `celulares[nome] = número | None`.
    `erro_em` (nomes) responde 500; `saldo_em` (nomes) responde 402 sem saldo; `antes(nome)` roda antes de responder."""

    def __init__(self, celulares=None, erro_em=(), saldo_em=(), antes=None, custo=26_000, lugares=None, decisores=None):
        self.celulares = celulares or {}
        self.lugares, self.decisores = lugares or [], decisores or []
        self.erro_em, self.saldo_em, self.antes, self.custo = set(erro_em), set(saldo_em), antes, custo
        self.chamadas = []

    def __call__(self, metodo, url, headers, corpo):
        ep = url.rsplit("/", 1)[-1]
        dados = json.loads(corpo) if corpo else {}
        nome = dados.get("full_name") or ""
        self.chamadas.append({"endpoint": ep, "nome": nome, "chave": headers.get("Idempotency-Key")})
        if self.antes:
            self.antes(ep, nome)
        if nome in self.saldo_em:
            st, hs, body = 402, {}, {"error": "insufficient_balance", "balance_micro": 0, "topup_url": "https://x"}
        elif nome in self.erro_em:
            st, hs, body = 500, {}, {"error": "provider_failed"}
        elif ep == "treg.people.phone.find":
            tel = self.celulares.get(nome)
            st, hs, body = ok({"phone": tel}, "aiark", self.custo if tel else 0)
        elif ep == "treg.people.email.find":
            st, hs, body = ok({"email": None}, "trykitt", 0)
        elif ep == "treg.google.serp.maps":
            st, hs, body = ok({"places": self.lugares}, "serper", 2_000)
        else:
            st, hs, body = ok({"people": self.decisores}, "pdl", 0)
        return st, hs, json.dumps(body).encode()

    def de(self, endpoint):
        return [c for c in self.chamadas if c["endpoint"] == endpoint]


class Wa:
    def __init__(self, sem=(), fora=False):
        self.sem, self.fora, self.chamadas = set(sem), fora, []

    def verificar(self, numeros):
        self.chamadas.append(list(numeros))
        if self.fora:
            raise OSError("WA-AKG fora do ar")
        return {n: (None if n in self.sem else f"{n}@s.whatsapp.net") for n in numeros}


def socio(nome, **extra):
    s = {"nome": nome, "qualificacao": "Sócio-Administrador", "faixa_etaria": "31-40", "tipo": "pf"}
    s.update(extra)
    return s


def empresa(i, **extra):
    d = {"cnpj": f"000000000001{i:02d}", "razao": f"MERCADO FICTICIO {i} LTDA", "fantasia": f"MERCADO FICTICIO {i}",
         "cnae": "4711302", "municipio": "CUIABA", "uf": "MT", "porte": "micro", "situacao": "02",
         "telefone": f"(65) 3322-11{i:02d}", "telefones": [f"(65) 3322-11{i:02d}"], "email": "",
         "site": f"https://mercado-ficticio-{i}.com.br", "dominio": f"mercado-ficticio-{i}.com.br",
         "socios": [socio(f"{NOMES[i - 1]} EXEMPLO DE SOUZA")], "fonte": "receita"}
    d.update(extra)
    return d


def nome_de(i):
    return f"{NOMES[i - 1].capitalize()} Exemplo de Souza"


def todos_celulares(n=10):
    return {nome_de(i): cel(i) for i in range(1, n + 1)}


@pytest.fixture
def repo():
    r = Repo(":memory:", sal="sal-de-teste")
    for i in range(1, 6):
        r.cnpj_put(empresa(i))
    return r


def novo_ciclo(repo, treg=None, wa=None, token=TOKEN, relogio=None):
    return cic.Ciclo(repo, wa or Wa(), token, relogio or (lambda: AGORA), transporte=treg or Treg(todos_celulares()))


def criar(c, **extra):
    dados = {"nome": "Mercados de Cuiabá", "segmento": "Empresas B2B médias", "cidades": ["Cuiabá"],
             "cnaes": ["4711-3/02"], "porte": "pequena", "oferta": "marketing", "tetoDiaUsd": 10,
             "tetoCampanhaUsd": 30, "metaPorDia": 50}
    dados.update(extra)
    return c.criar(dados, "ana")


def rodar(c, cid, usuario="ana"):
    c.iniciar(usuario, cid, True)
    assert c.esperar(10)
    return c.estado()


def camp_de(est, cid):
    return next(x for x in est["campanhas"] if x["id"] == cid)


# ---------------------------------------------------------------- funil

def test_funil_conta_cada_etapa(repo):
    repo.cnpj_put(empresa(6, situacao="08"))                                   # baixada: nem entra
    repo.cnpj_put(empresa(7, socios=[socio("SOCIA EMPRESA LTDA", tipo="pj")]))  # só sócia PJ: sem pessoa
    treg = Treg(dict(todos_celulares(), **{nome_de(2): None, nome_de(3): "+55 65 3322-1103"}))   # 2 não acha, 3 é fixo
    wa = Wa(sem={cel(4)})                                                       # 4 sem WhatsApp
    c = novo_ciclo(repo, treg, wa)
    cid = criar(c)["id"]
    est = rodar(c, cid)
    f = camp_de(est, cid)["funil"]
    assert f == {"empresas": 6, "pessoas": 5, "comContato": 3, "qualificados": 2, "promovidos": 2,
                 "descartados": 4}
    assert camp_de(est, cid)["status"] == "concluida" and est["rodando"] is False and est["progresso"] is None
    assert len(repo.leads_todos()) == 2
    # custo: "não achou" não cobra; o fixo o provedor cobra (achou um número), mas não vira contato
    assert camp_de(est, cid)["gastoTotalUsd"] == pytest.approx(4 * 0.026)
    det = c.funil(cid)
    assert [e["n"] for e in det["etapas"]] == [6, 5, 3, 2, 2]
    motivos = {d["motivo"]: d["n"] for d in det["descartes"]}
    assert motivos["Sem WhatsApp"] == 1 and motivos["Nenhum decisor pessoa física"] == 1
    assert motivos["Sem celular"] == 2
    assert det["custoUsd"] == pytest.approx(0.104) and det["custoPorLeadUsd"] == pytest.approx(0.052)
    # nada de telefone nos motivos nem no histórico da rodada
    assert "55659999" not in json.dumps(det) and "55659999" not in json.dumps(repo.config_get("prospeccao"))


def test_mesmo_dono_em_varios_cnpjs_e_contatado_uma_vez(repo):
    for i in (2, 3, 4):
        repo.cnpj_put(empresa(i, socios=[socio("ANA EXEMPLO DE SOUZA")]))
    treg = Treg(todos_celulares())
    c = novo_ciclo(repo, treg)
    cid = criar(c)["id"]
    f = camp_de(rodar(c, cid), cid)["funil"]
    assert f["empresas"] == 5 and f["pessoas"] == 2 and f["promovidos"] == 2
    assert [x["nome"] for x in treg.de("treg.people.phone.find")] == [nome_de(1), nome_de(5)]
    # em outra campanha, a mesma pessoa também não é contatada de novo
    cid2 = criar(c, nome="Outra")["id"]
    rodar(c, cid2)
    assert len(treg.de("treg.people.phone.find")) == 2 and len(repo.leads_todos()) == 2


def test_celular_do_cadastro_gratis_e_sem_linkedin_nem_site_nao_paga(repo):
    repo.cnpj_put(empresa(1, telefones=["(65) 99990-0011"], telefone="(65) 99990-0011"))   # celular no cadastro
    repo.cnpj_put(empresa(2, site="", dominio="", mapsEm="2026-10-01T00:00:00+00:00"))     # sem site
    treg = Treg(todos_celulares())
    c = novo_ciclo(repo, treg)
    cid = criar(c)["id"]
    rodar(c, cid)
    nomes = [x["nome"] for x in treg.de("treg.people.phone.find")]
    assert nome_de(1) not in nomes and nome_de(2) not in nomes
    p2 = [p for p in repo.prospectos(cid) if p.get("nome") == nome_de(2)][0]
    assert p2["estado"] == "descartado" and "LinkedIn" in p2["motivo"]


# ---------------------------------------------------------------- teto e meta

def test_para_no_teto_diario(repo):
    for i in range(6, 11):
        repo.cnpj_put(empresa(i))
    treg = Treg(todos_celulares(), custo=100_000)
    c = novo_ciclo(repo, treg)
    cid = criar(c, tetoDiaUsd=0.4, tetoCampanhaUsd=5)["id"]
    est = rodar(c, cid)
    camp = camp_de(est, cid)
    assert camp["status"] == "teto" and est["motivoParada"] == "teto do dia"
    assert camp["gastoHojeUsd"] <= 0.4 and camp["gastoHojeUsd"] == pytest.approx(0.3)
    assert "teto do dia" in est["motivoTexto"].lower()
    # no mesmo dia não começa de novo
    with pytest.raises(cic.Recusado) as e:
        c.iniciar("ana", cid, True)
    assert e.value.status == 409 and "teto" in str(e.value).lower()
    # no dia seguinte continua de onde parou, sem pagar de novo quem já foi buscado
    c.relogio = lambda: AGORA + timedelta(days=1)
    rodar(c, cid)
    assert len(repo.leads_todos()) == 6
    chaves = [x["chave"] for x in treg.de("treg.people.phone.find")]
    assert len(chaves) == len(set(chaves))


def test_teto_da_campanha_vale_mesmo_em_outro_dia(repo):
    c = novo_ciclo(repo, Treg(todos_celulares(), custo=100_000))
    cid = criar(c, tetoDiaUsd=0.3, tetoCampanhaUsd=0.3)["id"]
    rodar(c, cid)
    c.relogio = lambda: AGORA + timedelta(days=1)
    with pytest.raises(cic.Recusado) as e:
        c.iniciar("ana", cid, True)
    assert e.value.status == 409 and "teto da campanha" in str(e.value)
    c.teto(cid, 1, 2)
    est = rodar(c, cid)
    assert camp_de(est, cid)["status"] == "concluida"


def test_meta_por_dia(repo):
    c = novo_ciclo(repo)
    cid = criar(c, metaPorDia=2)["id"]
    est = rodar(c, cid)
    assert est["motivoParada"] == "meta do dia" and len(repo.leads_todos()) == 2
    assert camp_de(est, cid)["status"] == "parada"


# ---------------------------------------------------------------- estabilidade

def test_retoma_de_onde_parou(repo):
    """Para no meio (Parar), depois "reinicia" o serviço no meio de outra rodada: a seguinte termina sem pagar duas
    vezes nem duplicar lead."""
    c = None

    def antes(ep, nome):
        if ep == "treg.people.phone.find" and nome == nome_de(2):
            c._parar.set()
    treg = Treg(todos_celulares(), antes=antes)
    c = novo_ciclo(repo, treg)
    cid = criar(c)["id"]
    est = rodar(c, cid)
    assert est["motivoParada"] == "parado pela equipe" and camp_de(est, cid)["status"] == "parada"
    assert len(repo.leads_todos()) == 2       # a pessoa em andamento termina antes de parar

    # serviço caiu no meio de uma rodada: estado no banco diz "rodando"
    cfg = repo.config_get("prospeccao")
    repo.config_set("prospeccao", dict(cfg, status="executando", campanhaId=cid))
    camp = repo.campanha_get(cid)
    repo.campanha_put(dict(camp, status="rodando"))
    treg2 = Treg(todos_celulares())
    c2 = novo_ciclo(repo, treg2)                                     # o "reinício"
    est = c2.estado()
    assert camp_de(est, cid)["status"] == "parada" and est["motivoParada"] == "interrompida"
    assert repo.campanha_get(cid)["status"] == "parada"
    est = rodar(c2, cid)
    assert camp_de(est, cid)["status"] == "concluida"
    assert len(repo.leads_todos()) == 5
    pagos = {x["nome"] for x in treg.de("treg.people.phone.find")} & {x["nome"] for x in treg2.de("treg.people.phone.find")}
    assert pagos == set()                                            # ninguém buscado duas vezes


def test_falha_de_uma_empresa_nao_derruba(repo):
    treg = Treg(todos_celulares(), erro_em={nome_de(2)})
    c = novo_ciclo(repo, treg)
    cid = criar(c)["id"]
    est = rodar(c, cid)
    assert camp_de(est, cid)["status"] == "concluida" and len(repo.leads_todos()) == 4
    falhou = [p for p in repo.prospectos(cid) if p.get("nome") == nome_de(2)][0]
    assert falhou["estado"] == "pessoa" and falhou["erros"] == 1     # fica para a próxima rodada
    assert est["historico"][-1]["erros"] == 1
    # na próxima rodada o treg voltou: termina
    treg.erro_em = set()
    rodar(c, cid)
    assert len(repo.leads_todos()) == 5


def test_saldo_402_para_com_mensagem(repo):
    treg = Treg(todos_celulares(), saldo_em={nome_de(3)})
    c = novo_ciclo(repo, treg)
    cid = criar(c)["id"]
    est = rodar(c, cid)
    assert est["motivoParada"] == "saldo insuficiente" and camp_de(est, cid)["status"] == "erro"
    assert "Recarregue" in est["motivoTexto"] and "Traceback" not in est["motivoTexto"]
    assert len(repo.leads_todos()) == 2
    assert len(treg.de("treg.people.phone.find")) == 3                # parou na hora, não tentou os outros
    # logo em seguida, iniciar responde 402 com a mesma mensagem
    with pytest.raises(cic.Recusado) as e:
        c.iniciar("ana", cid, True)
    assert e.value.status == 402 and "Recarregue" in str(e.value)
    # passado um tempo (recarregou), deixa tentar de novo
    c.relogio = lambda: AGORA + timedelta(minutes=10)
    treg.saldo_em = set()
    rodar(c, cid)
    assert len(repo.leads_todos()) == 5


def test_status_parado_nao_roda(repo):
    treg = Treg(todos_celulares())
    c = novo_ciclo(repo, treg)
    cid = criar(c)["id"]
    repo.config_set("status", "parado")
    with pytest.raises(cic.Recusado) as e:
        c.iniciar("ana", cid, True)
    assert e.value.status == 409 and "Parar tudo" in str(e.value)
    assert treg.chamadas == [] and c.estado()["rodando"] is False
    # "Parar tudo" no meio da rodada também para
    repo.config_set("status", "ativo")

    def antes(ep, nome):
        if nome == nome_de(2):
            repo.config_set("status", "parado")
    treg.antes = antes
    est = rodar(c, cid)
    assert est["motivoParada"] == "atendente parado (Parar tudo)" and len(repo.leads_todos()) == 2


def test_rodada_dupla_409(repo):
    liberar, entrou = threading.Event(), threading.Event()

    def antes(ep, nome):
        entrou.set()
        liberar.wait(5)
    c = novo_ciclo(repo, Treg(todos_celulares(), antes=antes))
    cid = criar(c)["id"]
    cid2 = criar(c, nome="Outra")["id"]
    c.iniciar("ana", cid, True)
    assert entrou.wait(5)
    for alvo in (cid, cid2):
        with pytest.raises(cic.Recusado) as e:
            c.iniciar("ana", alvo, True)
        assert e.value.status == 409
    est = c.estado()
    assert est["rodando"] is True and est["progresso"]["campanhaId"] == cid
    assert camp_de(est, cid)["status"] == "rodando"
    c.parar("ana")
    liberar.set()
    assert c.esperar(5)
    assert c.estado()["motivoParada"] == "parado pela equipe"


def test_iniciar_exige_confirmacao_token_e_campanha(repo):
    c = novo_ciclo(repo)
    cid = criar(c)["id"]
    with pytest.raises(cic.Recusado) as e:
        c.iniciar("ana", cid, False)
    assert e.value.status == 400
    with pytest.raises(cic.Recusado) as e:
        c.iniciar("ana", "nao-existe", True)
    assert e.value.status == 404
    sem = novo_ciclo(repo, token=None)
    assert sem.estado()["disponivel"] is False and "TREG_TOKEN" in sem.estado()["semToken"]
    with pytest.raises(cic.Recusado):
        sem.iniciar("ana", cid, True)
    with pytest.raises(cic.Recusado) as e:
        c.parar("ana")
    assert e.value.status == 409


def test_pausar_e_retomar(repo):
    c = novo_ciclo(repo)
    cid = criar(c)["id"]
    assert c.pausar(cid, "ana")["status"] == "pausada"
    with pytest.raises(cic.Recusado) as e:
        c.iniciar("ana", cid, True)
    assert e.value.status == 409 and "pausada" in str(e.value)
    assert c.retomar(cid, "ana")["status"] == "parada"
    rodar(c, cid)
    assert len(repo.leads_todos()) == 5


def test_criar_valida(repo):
    c = novo_ciclo(repo)
    for ruim in ({"cidades": ["Goiânia - GO"]}, {"tetoDiaUsd": 0}, {"tetoDiaUsd": 50, "tetoCampanhaUsd": 30},
                 {"nome": ""}, {"cidades": []}):
        with pytest.raises(ValueError):
            criar(c, **ruim)
    # sem CNAE, o segmento conhecido decide
    camp = criar(c, cnaes=[], segmento="Restaurantes")
    assert camp["cnaes"] and camp["nome"] == "Mercados de Cuiabá" and camp["status"] == "nova"
    # segmento sem CNAE conhecido não trava mais: a campanha vai direto ao Google Maps
    assert criar(c, cnaes=[], segmento="Coisa que ninguém sabe")["cnaes"] == [cic.SO_MAPS]
    assert repo.campanha_get(camp["id"])["criadaPor"] == "ana"


def test_token_nunca_vai_para_o_banco(repo):
    c = novo_ciclo(repo)
    cid = criar(c)["id"]
    rodar(c, cid)
    tudo = json.dumps([repo.config_get("prospeccao"), repo.campanhas(), repo.prospectos()])
    assert TOKEN not in tudo


# ---------------------------------------------------------------- base de CNPJ sem o segmento: Google Maps

LUGARES = [
    {"title": "Contábil Exemplo", "placeId": "p1", "website": "https://contabil-exemplo.com.br",
     "phoneNumber": "(65) 3322-1190", "category": "Escritório de contabilidade", "address": "Rua A, Cuiabá"},
    {"title": "Escritório Fechado", "placeId": "p2", "category": "Permanentemente fechado"},
    {"title": "Sem Identificação"},
]


def test_sem_empresa_na_base_busca_no_maps_uma_vez(repo):
    treg = Treg(todos_celulares(), lugares=LUGARES,
                decisores=[{"full_name": "Ana Exemplo de Souza", "job_title": "Sócia"}])
    c = novo_ciclo(repo, treg)
    camp = criar(c, cnaes=[], segmento="Escritório de contabilidade", nome="Contábeis")
    assert camp["cnaes"][0] == "6920601"                     # contabilidade agora tem CNAE
    est = rodar(c, camp["id"])
    salvo = repo.cnpj_get("maps-p1")
    assert salvo and salvo["fonte"] == "maps" and salvo["dominio"] == "contabil-exemplo.com.br"
    assert repo.cnpj_get("maps-p2") is None                   # fechado não entra
    assert len(treg.de("treg.google.serp.maps")) == 1         # uma busca: só Cuiabá
    assert camp_de(est, camp["id"])["funil"]["empresas"] == 1
    assert repo.campanha_get(camp["id"])["mapsAchadas"] == 1
    rodar(c, camp["id"])                                      # de novo: não busca no Maps outra vez
    assert len(treg.de("treg.google.serp.maps")) == 1


def test_sem_empresa_nem_no_maps_para_com_motivo_claro(repo):
    c = novo_ciclo(repo, Treg(todos_celulares()))
    camp = criar(c, cnaes=[], segmento="Advocacia", nome="Advogados")
    est = rodar(c, camp["id"])
    r = camp_de(est, camp["id"])
    assert r["status"] == "parada" and "Google Maps" in r["motivoTexto"]


def test_segmentos_profissionais_tem_cnae():
    for seg, cnae in (("Contabilidade", "6920601"), ("Advocacia", "6911701"), ("Escritório de advogados", "6911701"),
                      ("Arquitetura", "7111100"), ("Clínicas de fisioterapia", "8650004"),
                      ("Consultoria empresarial", "7020400")):
        assert cnae in cic.cnaes_do_segmento(seg), seg

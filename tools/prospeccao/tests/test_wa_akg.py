import json
import random
from datetime import datetime, timedelta, timezone

import pytest

from scripts import wa_akg
from scripts.wa_akg import (WaAkgCliente, caixa, responder_lead, distribuir_ritmo, ritmo_atual, WaAkgErro, agendar_plano, atualizacoes_agendados, cancelar_agendados, conferir, distribuir, ler_config,
                            main, mensagem_do_toque, numero_whatsapp, planejar, primeiro_nome, vence_hoje)

# terça-feira, 10h em Cuiabá (14h UTC)
AGORA = datetime(2026, 10, 6, 14, 0, tzinfo=timezone.utc)
FOTO = "Te mandei uma foto do nosso cenário Mesa de reunião, para bate-papo com até quatro pessoas."
MSG1 = f"Oi, pessoal da Clínica, tudo bem?\n\n{FOTO}\n\nQue dia fica bom?"


def lead(id="R0001", **kw):
    base = {"id": id, "nome": "Clínica Modelo", "canal": "WhatsApp", "situacao": "ativo", "etapa": 0, "enviado1": None,
            "telefone": "65992345678", "saudacao": "pessoal da Clínica", "foto": "mesa-pessoa-02", "fotoEscolhida": None,
            "contatos": [], "contatoAtivo": None, "historico": [],
            "toques": [{"n": 1, "mensagem": MSG1}, {"n": 2, "mensagem": "Oi, tudo bem? Toque 2."},
                       {"n": 3, "mensagem": "Toque 3."}]}
    base.update(kw)
    return base


def jid(tel="5565992345678"):
    return f"{tel}@s.whatsapp.net"


class Fake:
    """WA-AKG de mentira: guarda o que recebe e responde como o real."""

    def __init__(self, conectado="Connected", existem=None, agendadas=None, historico=None, mensagens=None, falhar_post=None):
        self.chamadas, self.conectado, self.agendadas_ = [], conectado, agendadas or []
        self.existem, self.historico, self.msgs, self.falhar_post, self.seq = existem, historico or [], mensagens or {}, falhar_post, 0

    def __call__(self, metodo, url, headers, corpo=None):
        self.chamadas.append((metodo, url, headers, json.loads(corpo) if corpo else None))
        corpo = json.loads(corpo) if corpo else {}
        if url.endswith("/sessions"):
            return 200, {}, json.dumps([{"sessionId": "reiners", "status": self.conectado}]).encode()
        if url.endswith("/check"):
            res = [{"number": n, "exists": (self.existem is None or n in self.existem), "jid": jid(n)} for n in corpo["numbers"]]
            return 200, {}, json.dumps({"status": True, "message": "Operation successful", "data": {"results": res}}).encode()
        if metodo == "POST" and url.endswith("/send"):
            if self.falhar_post:
                return self.falhar_post, {}, b""
            return 200, {}, json.dumps({"status": True, "data": {"key": {"id": "m1"}}}).encode()
        if metodo == "DELETE":
            return 200, {}, b"{}"
        if metodo == "POST" and "/scheduler/" in url:
            if self.falhar_post:
                return self.falhar_post, {}, b""
            self.seq += 1
            return 200, {}, json.dumps({"status": True, "data": {"id": f"s{self.seq}"}}).encode()
        if "/scheduler/" in url and "tab=history" in url:
            return 200, {}, json.dumps({"data": self.historico}).encode()
        if "/scheduler/" in url:
            return 200, {}, json.dumps({"data": self.agendadas_}).encode()
        if "/chat/reiners/" in url:
            chave = url.rsplit("/", 1)[1].replace("%40", "@")
            return 200, {}, json.dumps(self.msgs.get(chave, [])).encode()
        return 404, {}, b""


def cliente(fake):
    return WaAkgCliente("http://wa/api", "wag_segredo", "reiners", transporte=fake, dormir=lambda s: None)


# --------------------------------------------------------------------------- regras

def test_numero_whatsapp():
    assert numero_whatsapp("(65) 99234-5678") == "5565992345678"
    assert numero_whatsapp("556530523535") == "556530523535"
    assert numero_whatsapp("12345") == ""
    assert numero_whatsapp("") == ""


def test_primeiro_nome_como_a_central():
    assert primeiro_nome("ANA PAULA") == "Ana"
    assert primeiro_nome("dra. Marta Souza") == "dra. Marta"
    assert primeiro_nome("") == ""


def test_vence_hoje_segue_a_espera_dos_toques():
    assert vence_hoje(lead(), AGORA)
    l = lead(etapa=1, enviado1="2026-10-02T14:00:00Z")                      # 4 dias antes: vence
    assert vence_hoje(l, AGORA)
    assert not vence_hoje(lead(etapa=1, enviado1="2026-10-03T14:00:00Z"), AGORA)
    assert not vence_hoje(lead(etapa=3, enviado3="2026-10-01T14:00:00Z"), AGORA)
    assert vence_hoje(lead(etapa=2, enviado2="2026-09-30T14:00:00Z"), AGORA)  # 6 dias


def test_mensagem_usa_saudacao_do_contato_e_a_foto_escolhida():
    l = lead(contatoAtivo="k1", contatos=[{"id": "k1", "nome": "JOÃO SILVA", "telefone": "65981112222"}],
             fotoEscolhida="estante-pessoa-01")
    msg = mensagem_do_toque(l, 1)
    assert msg.startswith("Oi, João, tudo bem?")
    assert "cenário Estante" in msg and "Mesa de reunião" not in msg
    assert mensagem_do_toque(l, 2) == "Oi, tudo bem? Toque 2."


# --------------------------------------------------------------------------- horários

def test_horarios_em_dia_util_na_janela_e_com_limite_por_dia():
    hs = distribuir(70, AGORA, limite_dia=30, rng=random.Random(1), intervalo=(60, 120))
    locais = [h.astimezone(wa_akg.FUSO) for h in hs]
    assert all(h.weekday() < 5 and 9 <= h.hour < 17 for h in locais)
    assert hs == sorted(hs) and len(set(hs)) == 70
    por_dia = {}
    for h in locais:
        por_dia[h.date()] = por_dia.get(h.date(), 0) + 1
    assert max(por_dia.values()) <= 30 and len(por_dia) == 3
    assert all(b - a >= timedelta(seconds=60) for a, b in zip(hs, hs[1:]))


def test_horarios_pulam_fim_de_semana_e_madrugada():
    sabado_noite = datetime(2026, 10, 10, 2, 0, tzinfo=timezone.utc)  # sexta 22h em Cuiabá
    h = distribuir(1, sabado_noite, rng=random.Random(1))[0].astimezone(wa_akg.FUSO)
    assert (h.weekday(), h.hour) == (0, 9)                           # segunda, 9h


def test_horarios_respeitam_o_que_ja_esta_agendado_no_dia():
    hoje = AGORA.astimezone(wa_akg.FUSO).date()
    h = distribuir(1, AGORA, limite_dia=30, ocupados={hoje: 30}, rng=random.Random(1))[0].astimezone(wa_akg.FUSO)
    assert h.date() == hoje + timedelta(days=1)


# --------------------------------------------------------------------------- plano

def plano_de(leads, existem=None, **kw):
    existem = {"5565992345678": jid()} if existem is None else existem
    return planejar(leads, AGORA, existem=existem, rng=random.Random(1), fotos_url="https://fotos.exemplo/f", **kw)


def test_plano_monta_foto_texto_e_horario_utc_com_z():
    p = plano_de([lead()])["planos"][0]
    assert p["jid"] == jid() and p["n"] == 1
    assert p["midiaUrl"] == "https://fotos.exemplo/f/mesa-pessoa-02.jpg"
    assert p["texto"] == MSG1
    assert p["sendAt"].endswith("Z")           # sem o Z o WA-AKG lê no fuso dele (Jakarta)


def test_plano_pula_com_motivo_e_ignora_o_que_nao_e_do_whatsapp():
    leads = [lead("R1"), lead("R2", telefone=""), lead("R3", telefone="65988887777"), lead("R4", canal="E-mail"),
             lead("R5", situacao="sair"), lead("R6", etapa=1, enviado1="2026-10-06T10:00:00Z"), lead("TESTE"),
             lead("R7", agendamento={"n": 1, "id": "s9"}), lead("R8", toques=[])]
    r = plano_de(leads)
    assert [p["leadId"] for p in r["planos"]] == ["R1"]
    motivos = {x["leadId"]: x["motivo"] for x in r["pulados"]}
    assert motivos == {"R2": "sem telefone com DDD", "R3": "número não verificado", "R7": "já agendado no WhatsApp",
                       "R8": "toque sem mensagem"}


def test_plano_pula_numero_sem_whatsapp_e_quem_ja_respondeu():
    r = plano_de([lead("R1"), lead("R2", telefone="65988887777")],
                 existem={"5565992345678": None, "5565988887777": jid("5565988887777")}, respondidas={"R2"})
    assert r["planos"] == []
    assert {x["leadId"]: x["motivo"] for x in r["pulados"]}["R1"] == "o número não tem WhatsApp"
    assert r["pulados"][1]["motivo"].startswith("já respondeu no WhatsApp")


def test_toque_1_sem_foto_hospedada_nao_sai_com_a_promessa_da_foto():
    r = planejar([lead()], AGORA, existem={"5565992345678": jid()}, rng=random.Random(1))
    assert r["planos"] == [] and "foto" in r["pulados"][0]["motivo"]


def test_continuacao_sai_antes_do_primeiro_contato():
    leads = [lead("R1"), lead("R2", etapa=1, enviado1="2026-10-01T14:00:00Z", telefone="65988887777")]
    r = plano_de(leads, existem={"5565992345678": jid(), "5565988887777": jid("5565988887777")})
    assert [(p["leadId"], p["n"]) for p in r["planos"]] == [("R2", 2), ("R1", 1)]
    assert r["planos"][1]["midiaUrl"] and r["planos"][0]["midiaUrl"] is None


def test_max_limita_o_lote():
    leads = [lead(f"R{i}", telefone=f"6599234{i:04d}") for i in range(1, 6)]
    existem = {numero_whatsapp(l["telefone"]): jid(numero_whatsapp(l["telefone"])) for l in leads}
    assert len(plano_de(leads, existem=existem, max_leads=2)["planos"]) == 2


# --------------------------------------------------------------------------- cliente

def test_config_vem_do_ambiente_e_acrescenta_api(tmp_path):
    c = ler_config({"WA_AKG_URL": "https://wa.exemplo/", "WA_AKG_KEY": "wag_x", "WA_AKG_SESSION": "reiners"}, str(tmp_path))
    assert c == {"url": "https://wa.exemplo/api", "chave": "wag_x", "sessao": "reiners"}
    with pytest.raises(WaAkgErro, match="WA_AKG_KEY"):
        ler_config({"WA_AKG_URL": "https://wa.exemplo", "WA_AKG_SESSION": "r"}, str(tmp_path))


def test_cliente_manda_chave_em_cabecalho_e_confere_a_sessao():
    f = Fake()
    assert cliente(f).conectado() is True
    assert f.chamadas[0][2]["X-API-Key"] == "wag_segredo" and "User-Agent" in f.chamadas[0][2]
    assert cliente(Fake(conectado="SCAN_QR")).conectado() is False


def test_verificar_divide_em_lotes_de_50():
    f = Fake(existem={"5565000000001"})
    achados = cliente(f).verificar([f"55650000{i:05d}" for i in range(1, 121)])
    assert len(achados) == 120 and sum(1 for c in f.chamadas if c[1].endswith("/check")) == 3
    assert achados["5565000000001"] and achados["5565000000002"] is None


def test_agendar_manda_sendat_com_z_e_a_foto_como_imagem():
    f = Fake()
    id_ = cliente(f).agendar(jid(), "oi", "2026-10-06T14:05:00Z", "https://f/x.jpg")
    corpo = f.chamadas[-1][3]
    assert id_ == "s1" and corpo == {"jid": jid(), "content": "oi", "sendAt": "2026-10-06T14:05:00Z",
                                     "mediaUrl": "https://f/x.jpg", "mediaType": "image"}


def test_post_de_agendamento_nunca_repete_para_nao_mandar_duas_vezes():
    f = Fake(falhar_post=503)
    with pytest.raises(WaAkgErro):
        cliente(f).agendar(jid(), "oi", "2026-10-06T14:05:00Z")
    assert sum(1 for c in f.chamadas if c[0] == "POST") == 1


def test_erro_nao_vaza_a_chave():
    f = Fake(falhar_post=401)
    with pytest.raises(WaAkgErro) as e:
        cliente(f).agendar(jid(), "oi", "2026-10-06T14:05:00Z")
    assert "wag_segredo" not in str(e.value)


def test_agendar_plano_para_no_primeiro_erro_de_acesso():
    plano = plano_de([lead("R1"), lead("R2", telefone="65988887777")],
                     existem={"5565992345678": jid(), "5565988887777": jid("5565988887777")})["planos"]
    r = agendar_plano(cliente(Fake(falhar_post=401)), plano)
    assert r["agendados"] == [] and len(r["erros"]) == 1
    r = agendar_plano(cliente(Fake()), plano)
    assert [a["scheduleId"] for a in r["agendados"]] == ["s1", "s2"] and r["erros"] == []


def test_respostas_so_contam_depois_do_primeiro_toque():
    from scripts.wa_akg import detectar_respostas
    l = lead(etapa=1, enviado1="2026-10-01T14:00:00Z")
    antiga = [{"fromMe": False, "timestamp": "2026-09-01T10:00:00Z"}, {"fromMe": True, "timestamp": "2026-10-01T14:00:00Z"}]
    assert detectar_respostas(cliente(Fake(mensagens={jid(): antiga})), [l], {"5565992345678": jid()}) == set()
    nova = antiga + [{"fromMe": False, "timestamp": "2026-10-02T09:00:00Z"}]
    assert detectar_respostas(cliente(Fake(mensagens={jid(): nova})), [l], {"5565992345678": jid()}) == {"R0001"}


# --------------------------------------------------------------------------- gravação nos leads

def test_atualizacoes_de_agendados_guardam_o_agendamento_e_o_historico():
    r = {"agendados": [{"leadId": "R0001", "n": 1, "scheduleId": "s1", "sendAt": "2026-10-06T14:05:00Z", "jid": jid()}], "erros": []}
    u = atualizacoes_agendados([lead()], r, AGORA)[0]
    assert u["data"]["agendamento"] == {"n": 1, "id": "s1", "sendAt": "2026-10-06T14:05:00Z", "jid": jid()}
    assert u["data"]["historico"][-1]["texto"] == "Toque 1 agendado no WhatsApp para 06/10 10:05"


def test_conferir_marca_enviado_falha_sumiu_e_deixa_pendente():
    ag = lambda n, i: {"n": n, "id": i, "sendAt": "2026-10-06T14:05:00Z", "jid": jid()}
    leads = [lead("A", agendamento=ag(1, "s1")), lead("B", agendamento=ag(1, "s2")), lead("C", agendamento=ag(1, "s3")),
             lead("D", agendamento=ag(1, "s4")), lead("E", etapa=1, enviado1="2026-10-01T10:00:00Z", agendamento=ag(1, "s5")),
             lead("F")]
    hist = [{"id": "s1", "status": "SENT", "sendAt": "2026-10-06T14:06:30.000Z"}, {"id": "s2", "status": "FAILED"},
            {"id": "s5", "status": "SENT", "sendAt": "2026-10-06T14:07:00.000Z"}]
    r = conferir(leads, [{"id": "s3", "status": "PENDING"}], hist, AGORA)
    assert r["resumo"] == {"enviados": 2, "falhas": 1, "pendentes": 1, "sumiram": 1}
    por_id = {u["id"]: u["data"] for u in r["updates"]}
    assert por_id["A"]["etapa"] == 1 and por_id["A"]["enviado1"] == "2026-10-06T14:06:30Z"
    assert por_id["A"]["agendamento"] == {"__delete__": True}
    assert "etapa" not in por_id["E"]                    # lead que já estava na etapa 1: nunca pula nem volta um toque
    assert "etapa" not in por_id["B"] and "falhou" in por_id["B"]["historico"][-1]["texto"]
    assert "C" not in por_id and "F" not in por_id and "não está mais agendado" in por_id["D"]["historico"][-1]["texto"]
    assert r["painel"] == {"naFila": 1, "enviadasHoje": 2}                      # s1 e s5 saíram hoje; s3 ainda está na fila


# --------------------------------------------------------------------------- linha de comando

def arquivos(tmp_path, leads):
    p = tmp_path / "leads.json"
    p.write_text(json.dumps(leads), encoding="utf-8")
    return str(p), str(tmp_path / "saida.json")


def test_cli_planejar_nao_agenda_nada(tmp_path, capsys):
    f = Fake()
    leads, saida = arquivos(tmp_path, [lead()])
    assert main(["planejar", "--leads", leads, "--saida", saida, "--fotos-url", "https://f", "--agora", "2026-10-06T14:00:00Z"],
                cliente=cliente(f)) == 0
    assert not any(c[0] == "POST" and "/scheduler/" in c[1] for c in f.chamadas)
    assert json.load(open(saida))["resumo"]["agendar"] == 1
    assert "wag_segredo" not in capsys.readouterr().out


def test_cli_agendar_exige_confirmo(tmp_path, capsys):
    f = Fake()
    plano = tmp_path / "plano.json"
    plano.write_text(json.dumps({"planos": [{"leadId": "R1", "n": 1, "jid": jid(), "texto": "oi", "midiaUrl": None,
                                             "sendAt": "2026-10-06T14:05:00Z"}]}), encoding="utf-8")
    leads, _ = arquivos(tmp_path, [lead("R1")])
    args = ["agendar", "--plano", str(plano), "--leads", leads, "--saida", str(tmp_path / "ag.json")]
    assert main(args, cliente=cliente(f)) == 2 and f.chamadas == []
    assert main(args + ["--confirmo"], cliente=cliente(f)) == 0
    saida = json.load(open(tmp_path / "ag.json"))
    assert saida["agendados"][0]["scheduleId"] == "s1" and saida["updates"][0]["id"] == "R1"


def test_cli_planejar_para_quando_a_sessao_caiu(tmp_path):
    leads, saida = arquivos(tmp_path, [lead()])
    assert main(["planejar", "--leads", leads, "--saida", saida], cliente=cliente(Fake(conectado="SCAN_QR"))) == 3


def test_so_deixa_o_card_teste_entrar_e_nada_alem_dele():
    leads = [lead("TESTE"), lead("R1", telefone="65988887777")]
    existem = {"5565992345678": jid(), "5565988887777": jid("5565988887777")}
    assert [p["leadId"] for p in plano_de(leads, existem=existem)["planos"]] == ["R1"]                     # sem --so: TESTE fica de fora
    assert [p["leadId"] for p in plano_de(leads, existem=existem, so_ids={"TESTE"})["planos"]] == ["TESTE"]


def test_cancelar_so_o_que_ainda_esta_pendente():
    ag = lambda i: {"n": 1, "id": i, "sendAt": "2026-10-06T14:05:00Z", "jid": jid()}
    leads = [lead("A", agendamento=ag("s1")), lead("B", agendamento=ag("s2")), lead("C")]
    f = Fake()
    r = cancelar_agendados(cliente(f), leads, [{"id": "s1"}], AGORA)
    assert r["resumo"] == {"cancelados": 1, "naoPendentes": 1, "erros": 0} and r["naoPendentes"] == ["B"]
    assert r["updates"][0]["data"]["agendamento"] == {"__delete__": True}
    assert [c[0] for c in f.chamadas] == ["DELETE"] and f.chamadas[0][1].endswith("/scheduler/reiners/s1")


def test_janela_livre_so_com_so_e_so_para_o_lead_escolhido(tmp_path):
    leads, saida = arquivos(tmp_path, [lead("TESTE")])
    base = ["planejar", "--leads", leads, "--saida", saida, "--fotos-url", "https://f", "--agora", "2026-10-06T02:00:00Z"]
    assert main(base + ["--janela", "0-24"], cliente=cliente(Fake())) == 2                      # sem --so: recusa
    assert main(base + ["--so", "TESTE", "--janela", "25-30"], cliente=cliente(Fake())) == 2     # janela inválida
    assert main(base + ["--so", "TESTE", "--janela", "0-24", "--todos-os-dias"], cliente=cliente(Fake())) == 0
    h = json.load(open(saida))["planos"][0]["sendAt"]
    assert h == "2026-10-06T02:02:00Z"                                                         # em 2 minutos, mesmo de madrugada
    assert main(base, cliente=cliente(Fake())) == 0                                              # sem --so, o TESTE nunca entra
    assert json.load(open(saida))["planos"] == []


def test_verificar_aceita_a_resposta_da_doc_e_a_real_e_usa_o_jid_devolvido():
    def transporte(corpo):
        return lambda m, url, h, c=None: (200, {}, json.dumps(corpo).encode())
    item = {"number": "5565996227110", "exists": True, "jid": "556596227110@s.whatsapp.net"}   # conta sem o nono dígito
    for resposta in ({"status": True, "data": {"results": [item]}}, {"success": True, "results": [item]}):
        c = WaAkgCliente("http://wa/api", "k", "reiners", transporte=transporte(resposta), dormir=lambda s: None)
        assert c.verificar(["5565996227110"]) == {"5565996227110": "556596227110@s.whatsapp.net"}


# --------------------------------------------------------------------------- ritmo: X a cada 30 minutos

@pytest.mark.parametrize("por_lote", [1, 3, 5, 10])
@pytest.mark.parametrize("semente", [1, 2, 3])
def test_ritmo_nunca_passa_de_x_em_qualquer_intervalo_de_30_minutos(por_lote, semente):
    hs = distribuir_ritmo(120, AGORA, por_lote=por_lote, limite_dia=60, rng=random.Random(semente))
    assert hs == sorted(hs) and len(hs) == 120
    for i, h in enumerate(hs):  # janela deslizante: a partir de qualquer mensagem, no máximo X nos 30 minutos seguintes
        assert sum(1 for x in hs if h <= x < h + timedelta(minutes=30)) <= por_lote
    assert all(b - a >= timedelta(seconds=60) for a, b in zip(hs, hs[1:]))
    locais = [h.astimezone(wa_akg.FUSO) for h in hs]
    assert all(l.weekday() < 5 and 9 <= l.hour < 17 for l in locais)


def test_ritmo_respeita_o_limite_do_dia_e_passa_para_o_dia_seguinte():
    hs = distribuir_ritmo(50, AGORA, por_lote=10, limite_dia=20, rng=random.Random(1))
    por_dia = {}
    for h in hs:
        d = h.astimezone(wa_akg.FUSO).date()
        por_dia[d] = por_dia.get(d, 0) + 1
    assert max(por_dia.values()) <= 20 and len(por_dia) == 3
    hoje = AGORA.astimezone(wa_akg.FUSO).date()
    hs = distribuir_ritmo(3, AGORA, por_lote=5, limite_dia=20, ocupados={hoje: 20}, rng=random.Random(1))
    assert all(h.astimezone(wa_akg.FUSO).date() > hoje for h in hs)


def test_ritmo_conta_o_que_ja_esta_agendado():
    ja = [AGORA + timedelta(minutes=m) for m in (1, 2, 3, 4, 5)]            # 5 já na fila
    primeiro = distribuir_ritmo(1, AGORA, por_lote=5, recentes=ja, rng=random.Random(1))[0]
    assert primeiro >= ja[0] + timedelta(minutes=30)                         # a 5ª mensagem de trás saiu há pelo menos 30 min
    livre = distribuir_ritmo(1, AGORA, por_lote=5, recentes=ja[:3], rng=random.Random(1))[0]
    assert livre < primeiro                                                  # com vaga na janela, não espera


def test_ritmo_horizonte_deixa_o_resto_para_a_proxima_rodada():
    hs = distribuir_ritmo(100, AGORA, por_lote=5, horizonte_min=60, rng=random.Random(1))
    assert 5 <= len(hs) <= 11 and all(h <= AGORA + timedelta(minutes=60) for h in hs)


def test_ritmo_recusa_x_e_limite_fora_do_seguro():
    for ruim in (0, 11, -1):
        with pytest.raises(ValueError, match="por_lote"):
            distribuir_ritmo(1, AGORA, por_lote=ruim)
    with pytest.raises(ValueError, match="limite_dia"):
        distribuir_ritmo(1, AGORA, por_lote=5, limite_dia=61)


def test_ritmo_atual_conta_pendentes_e_enviados_de_hoje_em_diante_e_ignora_falhas():
    pend = [{"id": "p1", "sendAt": "2026-10-06T15:00:00.000Z"}]
    hist = [{"id": "h1", "status": "SENT", "sendAt": "2026-10-06T13:30:00.000Z"},
            {"id": "h2", "status": "FAILED", "sendAt": "2026-10-06T13:40:00.000Z"},
            {"id": "h3", "status": "SENT", "sendAt": "2026-10-05T13:30:00.000Z"}]      # ontem: não conta no dia
    recentes, ocupados = ritmo_atual(pend, hist, AGORA)
    assert len(recentes) == 2                                                           # h1 (há 30 min) e p1; ontem e falha ficam fora
    assert ocupados == {AGORA.astimezone(wa_akg.FUSO).date(): 2}


def test_planejar_em_fila_adia_o_que_nao_cabe_no_horizonte():
    leads = [lead(f"R{i}", telefone=f"6599234{i:04d}") for i in range(1, 21)]
    existem = {numero_whatsapp(l["telefone"]): jid(numero_whatsapp(l["telefone"])) for l in leads}
    r = plano_de(leads, existem=existem, por_lote=5, horizonte_min=60)
    assert r["resumo"]["agendar"] == len(r["planos"]) <= 11
    assert r["resumo"]["adiados"] == 20 - len(r["planos"])
    assert all(p["sendAt"] > "2026-10-06T14:00:00Z" for p in r["planos"])


def test_cli_fila_conta_o_agendador_e_recusa_x_fora_do_limite(tmp_path):
    leads, saida = arquivos(tmp_path, [lead("R1")])
    base = ["planejar", "--leads", leads, "--saida", saida, "--fotos-url", "https://f", "--agora", "2026-10-06T14:00:00Z"]
    cheio = [{"id": f"p{i}", "sendAt": f"2026-10-06T14:0{i}:00.000Z", "status": "PENDING"} for i in range(1, 6)]
    assert main(base + ["--por-lote", "5"], cliente=cliente(Fake(agendadas=cheio))) == 0
    com_fila = json.load(open(saida))["planos"][0]["sendAt"]
    assert main(base + ["--por-lote", "5"], cliente=cliente(Fake())) == 0
    sem_fila = json.load(open(saida))["planos"][0]["sendAt"]
    assert com_fila > sem_fila and com_fila >= "2026-10-06T14:31:00Z"                    # espera os 30 minutos da fila existente
    assert main(base + ["--por-lote", "11"], cliente=cliente(Fake())) == 2


# --------------------------------------------------------------------------- caixa: respostas dos leads

def msg(de_mim, texto, quando, tipo="TEXT"):
    return {"fromMe": de_mim, "content": texto, "timestamp": quando, "type": tipo}


def test_caixa_traz_so_o_que_o_lead_mandou_depois_do_toque_1_e_o_fim_da_conversa():
    l = lead(etapa=1, enviado1="2026-10-01T14:00:00Z")
    conversa = [msg(False, "oi, tudo bem", "2026-09-20T10:00:00Z"),          # antes do toque 1: não conta
                msg(True, "Oi, Letícia da Reiners...", "2026-10-01T14:00:00Z"),
                msg(False, "Oi! Pode ser terça?", "2026-10-02T09:00:00Z"),
                msg(False, "", "2026-10-02T09:01:00Z", tipo="AUDIO")]
    r = caixa(cliente(Fake(mensagens={jid(): conversa})), [l], {"5565992345678": jid()}, AGORA)
    c = r["conversas"][0]
    assert [n["texto"] for n in c["novas"]] == ["Oi! Pode ser terça?", "[audio]"]
    assert c["conversa"][-1]["de"] == "lead" and c["conversa"][1]["de"] == "nós" and len(c["conversa"]) == 4
    assert c["vistasAte"] == "2026-10-02T09:01:00Z" and r["resumo"] == {"monitorados": 1, "comRespostaNova": 1, "semJid": 0, "erros": 0}


def test_caixa_nao_repete_o_que_a_central_ja_viu_e_ignora_quem_nao_e_acompanhavel():
    visto = lead("A", etapa=1, enviado1="2026-10-01T14:00:00Z", respostasVistasAte="2026-10-02T09:01:00Z")
    sai = lead("B", etapa=1, enviado1="2026-10-01T14:00:00Z", situacao="sair", telefone="65988887777")
    novo = lead("C", enviado1=None, telefone="65977776666")
    conv = [msg(False, "ok", "2026-10-02T09:01:00Z")]
    existem = {"5565992345678": jid(), "5565988887777": jid("5565988887777"), "5565977776666": jid("5565977776666")}
    r = caixa(cliente(Fake(mensagens={jid(): conv})), [visto, sai, novo], existem, AGORA)
    assert r["conversas"] == [] and r["resumo"]["monitorados"] == 1


def test_caixa_registra_erro_de_um_lead_sem_parar_os_outros():
    a = lead("A", etapa=1, enviado1="2026-10-01T14:00:00Z")
    b = lead("B", etapa=1, enviado1="2026-10-01T14:00:00Z", telefone="65988887777")
    class Quebra(Fake):
        def __call__(self, metodo, url, headers, corpo=None):
            if "5565992345678" in url:
                return 500, {}, b""
            return super().__call__(metodo, url, headers, corpo)
    f = Quebra(mensagens={jid("5565988887777"): [msg(False, "oi", "2026-10-02T09:00:00Z")]})
    c = WaAkgCliente("http://wa/api", "k", "reiners", transporte=f, dormir=lambda s: None, tentativas=1)
    r = caixa(c, [a, b], {"5565992345678": jid(), "5565988887777": jid("5565988887777")}, AGORA)
    assert [x["leadId"] for x in r["conversas"]] == ["B"] and r["resumo"]["erros"] == 1


# --------------------------------------------------------------------------- responder

def test_responder_envia_na_hora_e_anota_no_historico_sem_vazar_nada():
    f = Fake()
    l = lead(etapa=1, situacao="respondeu", respostaSugerida={"texto": "x"})
    u = responder_lead(cliente(f), l, jid(), "Combinado! Terça às 15h no estúdio.", AGORA)
    envio = [c for c in f.chamadas if c[1].endswith("/send")]
    assert len(envio) == 1 and envio[0][3] == {"message": {"text": "Combinado! Terça às 15h no estúdio."}}
    assert "5565992345678%40s.whatsapp.net/send" in envio[0][1]
    assert u["data"]["respostaSugerida"] == {"__delete__": True}
    assert u["data"]["historico"][-1]["tipo"] == "resposta" and "Combinado" in u["data"]["historico"][-1]["texto"]


@pytest.mark.parametrize("lead_kw,texto,quebra", [({"situacao": "sair"}, "oi", "não se escreve mais"), ({"situacao": "fechou"}, "oi", "não se escreve mais"),
                                                  ({}, "  ", "vazio"), ({}, "a" * 1001, "1000 caracteres")])
def test_responder_recusa_lead_que_saiu_texto_vazio_ou_longo(lead_kw, texto, quebra):
    f = Fake()
    with pytest.raises(ValueError, match=quebra):
        responder_lead(cliente(f), lead(**lead_kw), jid(), texto, AGORA)
    assert not [c for c in f.chamadas if c[1].endswith("/send")]


def test_cli_responder_exige_confirmo_e_o_envio_nao_repete(tmp_path):
    leads, saida = arquivos(tmp_path, [lead("R1", etapa=1)])
    txt = tmp_path / "t.txt"
    txt.write_text("Combinado!", encoding="utf-8")
    args = ["responder", "--leads", leads, "--lead", "R1", "--texto-arquivo", str(txt), "--saida", saida]
    f = Fake()
    assert main(args, cliente=cliente(f)) == 2 and f.chamadas == []
    assert main(args + ["--confirmo"], cliente=cliente(f)) == 0
    assert sum(1 for c in f.chamadas if c[1].endswith("/send")) == 1 and json.load(open(saida))["updates"][0]["id"] == "R1"
    ruim = Fake(falhar_post=503)
    assert main(args + ["--confirmo"], cliente=cliente(ruim)) == 1
    assert sum(1 for c in ruim.chamadas if c[1].endswith("/send")) == 1                 # falhou e não tentou de novo


# --------------------------------------------------------------------------- poucas consultas ao WhatsApp

def consultados(f):
    """Todos os números que o Fake recebeu em /check."""
    return [n for c in f.chamadas if c[1].endswith("/check") for n in c[3]["numbers"]]


def test_conferir_guarda_o_jid_do_whatsapp_no_lead_depois_do_envio():
    ag = {"n": 1, "id": "s1", "sendAt": "2026-10-06T14:05:00Z", "jid": "556596227110@s.whatsapp.net"}
    r = conferir([lead("A", agendamento=ag)], [], [{"id": "s1", "status": "SENT", "sendAt": "2026-10-06T14:06:00.000Z"}], AGORA)
    assert r["updates"][0]["data"]["jidWa"] == "556596227110@s.whatsapp.net"


def test_cli_planejar_so_consulta_o_whatsapp_de_quem_pode_sair_agora(tmp_path):
    pode = lead("A", telefone="65992345678")
    email = lead("B", canal="E-mail", telefone="65988887777")
    saiu = lead("C", situacao="sair", telefone="65977776666")
    cedo = lead("D", etapa=1, enviado1="2026-10-06T13:00:00Z", telefone="65966665555")        # toque 2 só daqui a 4 dias
    ja = lead("E", telefone="65955554444", agendamento={"n": 1, "id": "s9", "sendAt": "2026-10-06T15:00:00Z"})
    leads, saida = arquivos(tmp_path, [pode, email, saiu, cedo, ja])
    f = Fake()
    assert main(["planejar", "--leads", leads, "--saida", saida, "--fotos-url", "https://f", "--agora", "2026-10-06T14:00:00Z"], cliente=cliente(f)) == 0
    assert consultados(f) == ["5565992345678"]


def test_cli_fila_limita_quantos_numeros_consulta_por_rodada(tmp_path):
    todos = [lead(f"R{i:03d}", telefone=f"6599{i:07d}", ordem=i) for i in range(1, 51)]
    leads, saida = arquivos(tmp_path, todos)
    f = Fake()
    assert main(["planejar", "--leads", leads, "--saida", saida, "--fotos-url", "https://f", "--agora", "2026-10-06T14:00:00Z",
                 "--por-lote", "1", "--horizonte-min", "60"], cliente=cliente(f)) == 0
    # no mínimo 20 (ou 6 por mensagem de X): exatamente os 20 de maior prioridade, na ordem do lead
    assert sorted(consultados(f)) == ["55" + f"6599{i:07d}" for i in range(1, 21)]
    assert json.load(open(saida))["resumo"]["aguardandoVez"] == 30                              # o resto espera a próxima rodada


def test_caixa_e_responder_usam_o_jid_guardado_sem_consultar_o_whatsapp(tmp_path):
    l = lead("R1", etapa=1, enviado1="2026-10-01T14:00:00Z", jidWa=jid())
    leads, saida = arquivos(tmp_path, [l])
    f = Fake(mensagens={jid(): [msg(False, "oi!", "2026-10-02T09:00:00Z")]})
    assert main(["caixa", "--leads", leads, "--saida", saida], cliente=cliente(f)) == 0
    assert json.load(open(saida))["resumo"]["comRespostaNova"] == 1 and consultados(f) == []
    txt = tmp_path / "t.txt"
    txt.write_text("Combinado!", encoding="utf-8")
    assert main(["responder", "--leads", leads, "--lead", "R1", "--texto-arquivo", str(txt), "--saida", saida, "--confirmo"], cliente=cliente(f)) == 0
    assert consultados(f) == []

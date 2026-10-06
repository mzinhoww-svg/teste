import json
import random
from datetime import datetime, timedelta, timezone

import pytest

from scripts import wa_akg
from scripts.wa_akg import (WaAkgCliente, WaAkgErro, agendar_plano, atualizacoes_agendados, cancelar_agendados, conferir, distribuir, ler_config,
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
            return 200, {}, json.dumps({"success": True, "results": res}).encode()
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

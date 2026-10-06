import hashlib
import hmac
import json

from atendente.webhook import Mensagem, interpretar, verificar_assinatura

SEGREDO = "segredo-de-teste"


def assinar(corpo: bytes, segredo: str = SEGREDO) -> str:
    return "sha256=" + hmac.new(segredo.encode(), corpo, hashlib.sha256).hexdigest()


def payload(**data):
    base = {
        "key": {"remoteJid": "5565999900011@s.whatsapp.net", "fromMe": False, "id": "3EB0B78AA"},
        "from": "5565999900011@s.whatsapp.net",
        "type": "TEXT",
        "content": "  Oi, tenho interesse  ",
        "isGroup": False,
    }
    base.update(data)
    return {"event": "message.received", "sessionId": "xgj7d9",
            "timestamp": "2026-01-17T05:33:08.545Z", "data": base}


def test_assinatura_valida():
    corpo = json.dumps(payload()).encode()
    assert verificar_assinatura(SEGREDO, corpo, assinar(corpo)) is True


def test_assinatura_errada_ausente_ou_sem_prefixo():
    corpo = b'{"a":1}'
    boa = assinar(corpo)
    assert verificar_assinatura(SEGREDO, corpo, None) is False
    assert verificar_assinatura(SEGREDO, corpo, "") is False
    assert verificar_assinatura(SEGREDO, corpo, boa.replace("sha256=", "")) is False
    assert verificar_assinatura(SEGREDO, corpo, assinar(corpo, "outro")) is False
    assert verificar_assinatura(SEGREDO, corpo, "sha256=zzzz") is False
    assert verificar_assinatura("", corpo, assinar(corpo, "")) is False


def test_corpo_adulterado_falha():
    corpo = b'{"valor":1}'
    assert verificar_assinatura(SEGREDO, b'{"valor":2}', assinar(corpo)) is False


def test_interpreta_mensagem_recebida():
    m = interpretar(payload())
    assert m == Mensagem(wa_id="3EB0B78AA", jid="5565999900011@s.whatsapp.net",
                         numero="5565999900011", de_mim=False, tipo="TEXT",
                         texto="Oi, tenho interesse", em="2026-01-17T05:33:08Z", grupo=False)


def test_ignora_grupo_e_evento_de_conexao():
    assert interpretar(payload(isGroup=True)) is None
    assert interpretar(payload(key={"remoteJid": "120363000000000001@g.us", "fromMe": False, "id": "X"})) is None
    p = payload()
    p["event"] = "connection.update"
    assert interpretar(p) is None
    assert interpretar(payload(key={"remoteJid": "5565999900011@s.whatsapp.net", "fromMe": False})) is None
    for lixo in (None, [], "x", {}, {"event": "message.received"}, {"event": "message.received", "data": []},
                 {"event": "message.received", "data": {"key": "x"}}):
        assert interpretar(lixo) is None


def test_lid_usa_o_alt_quando_tem_e_numero_vazio_quando_nao():
    lid = {"remoteJid": "100429287395370@lid", "fromMe": False, "id": "A1"}
    m = interpretar(payload(key=lid, remoteJidAlt="5565999900012@s.whatsapp.net"))
    assert m.numero == "5565999900012" and m.jid == "100429287395370@lid"
    m = interpretar(payload(key=lid, remoteJidAlt="100429287395370@lid"))
    assert m.numero == ""
    m = interpretar(payload(key=lid))
    assert m.numero == ""


def test_mensagem_enviada_por_nos_vira_de_mim():
    p = payload(key={"remoteJid": "5565999900011@s.whatsapp.net", "fromMe": True, "id": "S1"})
    assert interpretar(p).de_mim is True
    p = payload(key={"remoteJid": "5565999900011@s.whatsapp.net", "fromMe": False, "id": "S2"})
    p["event"] = "message.sent"
    assert interpretar(p).de_mim is True


def test_tipo_texto_e_horario():
    p = payload(type="audio", content=None)
    m = interpretar(p)
    assert m.tipo == "AUDIO" and m.texto == ""
    p = payload()
    del p["data"]["type"]
    assert interpretar(p).tipo == "TEXT"
    assert len(interpretar(payload(content="a" * 2000)).texto) == 1000
    p = payload()
    del p["timestamp"]
    assert interpretar(p).em == ""
    p["data"]["messageTimestamp"] = 1768627988
    assert interpretar(p).em == "2026-01-17T05:33:08Z"
    p["data"]["messageTimestamp"] = 1768627988545
    assert interpretar(p).em == "2026-01-17T05:33:08Z"
    p = payload()
    p["timestamp"] = "lixo"
    assert interpretar(p).em == ""

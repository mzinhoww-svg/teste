"""Webhook do WA-AKG: verificação de assinatura e interpretação do evento."""
import hashlib
import hmac
from dataclasses import dataclass
from datetime import datetime, timezone

EVENTOS = ("message.received", "message.sent")


@dataclass(frozen=True)
class Mensagem:
    wa_id: str
    jid: str
    numero: str
    de_mim: bool
    tipo: str
    texto: str
    em: str
    grupo: bool


def verificar_assinatura(segredo: str, corpo: bytes, cabecalho: str | None) -> bool:
    """Cabeçalho X-Webhook-Signature: 'sha256=<hex>' = HMAC-SHA256(segredo, corpo)."""
    if not segredo or not cabecalho or not isinstance(cabecalho, str):
        return False
    if not cabecalho.startswith("sha256="):
        return False
    recebido = cabecalho[len("sha256="):].strip().lower()
    esperado = hmac.new(segredo.encode("utf-8"), corpo, hashlib.sha256).hexdigest()
    return hmac.compare_digest(recebido.encode("utf-8"), esperado.encode("utf-8"))


def _iso(valor) -> str:
    """Converte string ISO ou inteiro (s ou ms) para UTC 'AAAA-MM-DDTHH:MM:SSZ'; '' se inválido."""
    try:
        if isinstance(valor, bool) or valor is None:
            return ""
        if isinstance(valor, (int, float)):
            seg = valor / 1000 if valor > 1e11 else valor
            dt = datetime.fromtimestamp(seg, tz=timezone.utc)
        elif isinstance(valor, str) and valor.strip():
            v = valor.strip()
            if v.lstrip("-").isdigit():
                return _iso(int(v))
            dt = datetime.fromisoformat(v.replace("Z", "+00:00").replace("z", "+00:00"))
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
        else:
            return ""
        return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    except (ValueError, OverflowError, OSError):
        return ""


def _digitos(jid: str) -> str:
    return "".join(c for c in jid.split("@")[0] if c.isdigit())


def interpretar(payload: dict) -> Mensagem | None:
    try:
        if not isinstance(payload, dict) or payload.get("event") not in EVENTOS:
            return None
        data = payload.get("data")
        if not isinstance(data, dict):
            return None
        key = data.get("key")
        if not isinstance(key, dict):
            return None
        wa_id = key.get("id")
        jid = key.get("remoteJid")
        if not isinstance(wa_id, str) or not wa_id or not isinstance(jid, str) or not jid:
            return None
        if data.get("isGroup") is True or jid.endswith("@g.us"):
            return None
        numero = ""
        if jid.endswith("@s.whatsapp.net"):
            numero = _digitos(jid)
        elif jid.endswith("@lid"):
            alt = data.get("remoteJidAlt")
            if isinstance(alt, str) and alt.endswith("@s.whatsapp.net"):
                numero = _digitos(alt)
        tipo = data.get("type")
        tipo = tipo.strip().upper() if isinstance(tipo, str) and tipo.strip() else "TEXT"
        conteudo = data.get("content")
        texto = conteudo.strip()[:1000] if isinstance(conteudo, str) else ""
        em = ""
        for bruto in (payload.get("timestamp"), data.get("timestamp"), data.get("messageTimestamp")):
            em = _iso(bruto)
            if em:
                break
        de_mim = key.get("fromMe") is True or payload.get("event") == "message.sent"
        return Mensagem(wa_id=wa_id, jid=jid, numero=numero, de_mim=de_mim, tipo=tipo,
                        texto=texto, em=em, grupo=False)
    except Exception:
        return None

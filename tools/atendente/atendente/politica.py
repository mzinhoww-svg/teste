"""Política de resposta do atendente: código puro, sem rede, sem banco, sem relógio.

A IA só classifica; quem decide se algo sai para o lead é este módulo.
"""
import re
import unicodedata
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

LINK_AGENDA = "https://cal.com/leticiareiners/30min"
MAX_TEXTO = 400
MAX_AUTO_DIA = 20
ESPERA_AUTO_H = 24


@dataclass(frozen=True)
class Decisao:
    acao: str            # "sair" | "ignorar" | "responder" | "avisar"
    motivo: str
    texto: str | None


# URL com esquema, www., ou domínio "nu" (exemplo.com.br/x).
_URL = re.compile(
    r"(?:https?://|www\.)\S+"
    r"|\b[\w-]+(?:\.[\w-]+)*\.(?:com|net|org|br|io|me|app|link|ly|co|info|biz|dev|xyz|site|online|store|shop)\b\S*",
    re.IGNORECASE,
)
# 8+ dígitos, tolerando separadores comuns de telefone entre eles.
_TELEFONE = re.compile(r"\d(?:[\s.\-()+]{0,2}\d){7,}")
_PRECO = re.compile(r"r\s*\$|\$|\breais\b|\breal\b", re.IGNORECASE)
_LINHA_INSTRUCAO = re.compile(
    r"^\W*(?:ignore|ignora|ignorar|desconsidere|esque[cç]a|system|sistema|assistant|assistente|developer)\b",
    re.IGNORECASE,
)
_COMANDO_NO_MEIO = re.compile(
    r"\b(?:ignore|ignora|ignorar|desconsidere|esque[cç]a|disregard|forget)\b.{0,40}"
    r"\b(?:regras?|instru\w*|anterior\w*|acima|prompt|rules|instructions|previous)\b",
    re.IGNORECASE,
)
# Modo restrito do texto automático: vale para o que sobra depois de tirar LINK_AGENDA.
_CHARS_PROIBIDOS = re.compile(r"[%@/\\$]")
_SEP_ENTRE_DIGITOS = re.compile(r"(?<=\d)[\s.\-/\\()+,_]+(?=\d)")
_DOMINIO = re.compile(r"\w+(?:\s+\.\s+|\.)\w+")
_NUMERO_K = re.compile(r"\d\s*k\b")
_PALAVRAS_PROIBIDAS = re.compile(
    r"\b(?:arroba|ponto\s+com|mil|milhao|milhoes|reais|real|r|brl|usd|dolar|dolares|conto|contos|k"
    r"|cem|duzentos|trezentos|quatrocentos|quinhentos|desconto\w*|promocao|promocoes"
    r"|garant\w*|gratis|gratuito|gratuita|sem\s+multa|multa|contrato\w*|parcel\w*|pix|boleto\w*"
    r"|orcamento\w*|proposta\w*)\b"
)
_PONTUACAO_FINAL = ".,;:!?)]}\"'"


def _url_permitida(token: str) -> bool:
    return token.rstrip(_PONTUACAO_FINAL) == LINK_AGENDA


def texto_seguro(texto: str) -> str | None:
    """Devolve o texto limpo ou None se violar alguma trava."""
    if not isinstance(texto, str):
        return None
    limpo = texto.strip()
    if not limpo or len(limpo) > MAX_TEXTO:
        return None
    # NFKC derruba disfarces como "ＲＳ", "１３５０" ou "ｈｔｔｐ".
    norm = unicodedata.normalize("NFKC", limpo)
    if _PRECO.search(norm):
        return None
    if _TELEFONE.search(norm):
        return None
    for m in _URL.finditer(norm):
        if not _url_permitida(m.group(0)):
            return None
    for linha in norm.splitlines():
        if _LINHA_INSTRUCAO.match(linha):
            return None
    if _COMANDO_NO_MEIO.search(norm):
        return None
    resto = norm.replace(LINK_AGENDA, " ")
    if _CHARS_PROIBIDOS.search(resto) or _DOMINIO.search(resto) or _NUMERO_K.search(resto.lower()):
        return None
    if re.search(r"\d{3,}", _SEP_ENTRE_DIGITOS.sub("", resto)):
        return None
    sem_acento = "".join(c for c in unicodedata.normalize("NFD", resto) if not unicodedata.combining(c))
    if _PALAVRAS_PROIBIDAS.search(sem_acento.lower()):
        return None
    return limpo


def _utc(dt: datetime) -> datetime:
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt


def decidir(lead: dict, classificacao: dict | None, cfg: dict, auto_hoje: int, ultima_auto: datetime | None,
            agora: datetime, tipo_msg: str = "TEXT") -> Decisao:
    if tipo_msg != "TEXT":
        return Decisao("avisar", "mídia", None)
    if (cfg or {}).get("status") == "parado":
        return Decisao("avisar", "parado", None)
    situacao = lead.get("situacao")
    if situacao == "sair":
        return Decisao("ignorar", "lead já saiu", None)
    if classificacao is None:
        return Decisao("avisar", "IA indisponível", None)
    intencao = classificacao.get("intencao")
    if intencao == "sair":
        return Decisao("sair", "lead pediu para sair", None)
    if intencao == "automatica":
        return Decisao("ignorar", "mensagem automática", None)
    if situacao == "fechou":
        return Decisao("avisar", "lead já fechou", None)
    if intencao not in ("neutra", "interesse", "duvida") or classificacao.get("simples") is not True:
        motivo = str(classificacao.get("motivo") or "").strip() or "caso complexo ou incerto"
        return Decisao("avisar", motivo, None)
    if (cfg or {}).get("status") == "aguardando":
        return Decisao("avisar", "atendente aguardando liberação", None)
    if not (cfg or {}).get("auto_resposta"):
        return Decisao("avisar", "respostas automáticas desligadas", None)
    if auto_hoje >= MAX_AUTO_DIA:
        return Decisao("avisar", f"limite de {MAX_AUTO_DIA} respostas automáticas no dia", None)
    if ultima_auto is not None and _utc(agora) - _utc(ultima_auto) < timedelta(hours=ESPERA_AUTO_H):
        return Decisao("avisar", f"já houve resposta automática nas últimas {ESPERA_AUTO_H} h", None)
    texto = texto_seguro(classificacao.get("resposta"))
    if texto is None:
        return Decisao("avisar", "texto bloqueado", None)
    return Decisao("responder", str(intencao), texto)

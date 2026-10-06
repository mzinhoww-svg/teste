"""Busca geral da Central.

    GET /api/buscar?q=texto  -> {q, total, resultados:[{tipo, id, nome, segmento, cidade, uf, situacao, coluna, status,
                                                          motivo, final}]}  (até 30)

Acha lead, empresa da Base e cliente por nome, sócio/decisor, cidade, segmento, CNPJ, e-mail, site e TELEFONE
(inteiro, com formatação, sem o 55 ou sem o nono dígito, ou só o final com 4+ dígitos). O telefone nunca volta inteiro:
só os 4 últimos dígitos em `final`. Texto simples: sem acento, sem diferenciar maiúscula, todas as palavras precisam
aparecer (ordem livre)."""
import re
import unicodedata
from urllib.parse import parse_qs, urlsplit

from .rotas import rota

LIMITE = 30
MIN_TEXTO = 2
MIN_DIGITOS = 4
CHAVES_TELEFONE = ("telefone", "telefones", "celular", "celularWa", "telefoneMaps", "jidWa", "whatsapp")
IGNORAR = {"historico", "toques", "mensagens", "foto", "fotoEscolhida", "perfil", "sinais", "flags", "alertas",
           "pendencias", "enriquecimento", "fraseUnica", "agendamento", "baseExplee", "versaoCopy", "ordem"}


def _sem_acento(t) -> str:
    return unicodedata.normalize("NFD", str(t or "")).encode("ascii", "ignore").decode().lower()


def _digitos(t) -> str:
    return re.sub(r"\D", "", str(t or ""))


def _chave8(digs: str) -> str:
    """Últimos 8 dígitos: igual com ou sem o 55, com ou sem o nono dígito."""
    return digs[-8:] if len(digs) >= 8 else ""


def _coletar(obj, texto: list, telefones: list, chave="", nivel=0) -> None:
    if nivel > 5 or chave in IGNORAR:
        return
    if isinstance(obj, dict):
        for k, v in obj.items():
            _coletar(v, texto, telefones, k, nivel + 1)
    elif isinstance(obj, list):
        for v in obj[:40]:
            _coletar(v, texto, telefones, chave, nivel + 1)
    elif isinstance(obj, (str, int)) and not isinstance(obj, bool):
        s = str(obj)
        if chave in CHAVES_TELEFONE:
            d = _digitos(s)
            if len(d) >= 8:
                telefones.append(d)
        elif len(s) <= 300:
            texto.append(s)


def _indice(doc: dict) -> tuple[str, list[str], str]:
    texto, tels = [], []
    _coletar(doc, texto, tels)
    blob = _sem_acento(" ".join(texto))
    cnpjs = " ".join(_digitos(t) for t in texto if len(_digitos(t)) in (8, 12, 14))
    return blob, tels, cnpjs


def _casa(q_texto: str, q_dig: str, blob: str, tels: list[str], cnpjs: str, nome: str):
    """Devolve (motivo, final4) ou None."""
    if q_dig and len(q_dig) >= MIN_DIGITOS and re.fullmatch(r"[\d\s().+/\-]+", q_texto):
        sem55 = q_dig[2:] if q_dig.startswith("55") and len(q_dig) > 10 else q_dig
        for t in tels:
            if (len(q_dig) >= 8 and _chave8(t) == _chave8(q_dig)) or (len(q_dig) < 8 and t.endswith(sem55)):
                return "telefone", t[-4:]
        if len(q_dig) >= 8 and q_dig in cnpjs:
            return "cnpj", ""
        return None
    palavras = [p for p in _sem_acento(q_texto).split() if p]
    if palavras and all(p in blob for p in palavras):
        n = _sem_acento(nome)
        return ("nome" if all(p in n for p in palavras) else "contato"), ""
    return None


@rota("GET", r"/api/buscar")
def buscar(h, usuario, agora, m):
    from . import servidor          # import tardio: servidor importa rotas, que importa este módulo
    srv = h.server
    q = (parse_qs(urlsplit(h.path).query).get("q") or [""])[0].strip()[:80]
    q_dig = _digitos(q)
    if len(q) < MIN_TEXTO or (q_dig == q.replace(" ", "") and len(q_dig) < MIN_DIGITOS):
        return h._json(200, {"q": q, "total": 0, "resultados": []})
    achados = []
    fontes = (("lead", srv.repo.leads_todos()), ("base", srv.repo.base_todos()), ("cliente", srv.repo.clientes_todos()))
    for tipo, docs in fontes:
        for d in docs:
            blob, tels, cnpjs = _indice(d)
            nome = servidor.nome_da_empresa(d) if tipo == "lead" else str(d.get("nome") or d.get("razao") or "Sem nome")
            r = _casa(q, q_dig, blob, tels, cnpjs, nome)
            if r is None:
                continue
            item = {"tipo": tipo, "id": str(d.get("id")), "nome": nome, "segmento": d.get("segmento") or "",
                    "cidade": d.get("cidade") or "", "uf": d.get("uf") or "", "motivo": r[0], "final": r[1],
                    "situacao": d.get("situacao") or "", "status": d.get("status") or "", "coluna": ""}
            if tipo == "lead":
                item["coluna"] = servidor.coluna_do_lead(d, agora)
            achados.append((0 if r[0] == "nome" else 1, {"lead": 0, "base": 1, "cliente": 2}[tipo], item))
    achados.sort(key=lambda t: (t[0], t[1], t[2]["nome"].lower()))
    h._json(200, {"q": q, "total": len(achados), "resultados": [t[2] for t in achados[:LIMITE]]})

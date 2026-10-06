"""Leva 1: dados do card, detalhe do lead para o painel e as visões rápidas do quadro.

Os dados vêm no formato da Central antiga: `nome` é o nome da empresa, `empresa` é um objeto do CNPJ (ou vazio), e o
lead traz `decisores`, `contatos`, `perfil`, `toques`, `enviado1..3`, `historico`... Tudo aqui é tolerante a campo
faltando ou com tipo inesperado (dado migrado de várias fontes).

As regras de etapa seguem `central/regras.js` (grupo, vencimento) e `scripts/wa_akg.py` (vence_hoje, mensagem do toque).
"""
import re
import unicodedata
from datetime import datetime, timedelta

from scripts import wa_akg

from .rotas import rota

NOMES_TOQUE = {1: "Visita", 2: "Diagnóstico", 3: "Piloto"}
ATIVAS = (None, "", "ativo")
VISOES = ("nao_enviados", "hoje", "enviado1", "enviado2", "enviado3", "responderam", "sem_contato")


# --------------------------------------------------------------------------- pequenos ajudantes

def _txt(v) -> str:
    return v.strip() if isinstance(v, str) else ""


def _lista(v) -> list:
    return [x for x in v if isinstance(x, dict)] if isinstance(v, list) else []


def _dict(v) -> dict:
    return v if isinstance(v, dict) else {}


def sem_acento(t) -> str:
    t = unicodedata.normalize("NFD", str(t if t is not None else ""))
    return "".join(c for c in t if unicodedata.category(c) != "Mn").lower()


def geo(l: dict) -> tuple[str, str, str]:
    """(país, UF, cidade). Lead sem cidade própria cai na cidade do perfil (igual a Regras.geoDe)."""
    return _txt(l.get("pais")), _txt(l.get("uf")).upper(), _txt(l.get("cidade")) or _txt(_dict(l.get("perfil")).get("cidade"))


def rotulo_geo(l: dict) -> str:
    pais, uf, cidade = geo(l)
    if cidade and uf:
        return f"{cidade}/{uf}"
    if cidade or uf:
        return cidade or uf
    return pais if pais and pais != "Brasil" else ""


def _digitos(v) -> str:
    return re.sub(r"\D", "", str(v or ""))


def telefone_formatado(tel) -> str:
    n = wa_akg.numero_whatsapp(tel)
    m = re.fullmatch(r"55(\d{2})(\d{4,5})(\d{4})", n)
    return f"+55 ({m[1]}) {m[2]}-{m[3]}" if m else _digitos(tel)


def mascarar(tel) -> str:
    """Para o resumo (que vai para a lista inteira): só o DDD e os 4 últimos dígitos."""
    n = wa_akg.numero_whatsapp(tel)
    m = re.fullmatch(r"55(\d{2})(\d{4,5})(\d{4})", n)
    if m:
        return f"+55 ({m[1]}) {'•' * len(m[2])}-{m[3]}"
    d = _digitos(tel)
    return f"•••• {d[-4:]}" if len(d) >= 4 else ""


def link_seguro(url) -> str | None:
    """Só http(s): nada de javascript:, data: e afins num href."""
    u = _txt(url)
    return u if re.match(r"(?i)^https?://[^\s]+$", u) else None


def links(l: dict) -> list[dict]:
    redes = _dict(l.get("redes"))
    pares = [("Site", l.get("site")), ("Instagram", redes.get("instagram") or l.get("instagram")),
             ("LinkedIn", redes.get("linkedinEmpresa")), ("YouTube", redes.get("youtube"))]
    out = []
    for rotulo, bruto in pares:
        v = _txt(bruto)
        if not v:
            continue
        if not re.match(r"(?i)^[a-z][a-z0-9+.-]*:", v):
            v = ("https://instagram.com/" + v.lstrip("@")) if rotulo == "Instagram" else "https://" + v.lstrip("/")
        url = link_seguro(v)
        if url:
            out.append({"rotulo": rotulo, "url": url})
    return out


# --------------------------------------------------------------------------- cadência

def etapa(l: dict) -> int:
    return max(0, min(3, wa_akg._etapa(l)))


def toque_enviado(l: dict) -> int:
    """Número do último toque que saiu: o maior enviadoN marcado, ou a etapa (dado antigo sem a data)."""
    n = max((i for i in (1, 2, 3) if l.get(f"enviado{i}")), default=0)
    return max(n, etapa(l))


def _toque(l: dict, n: int) -> dict:
    for t in _lista(l.get("toques")):
        try:
            if int(t.get("n") or 0) == n:
                return t
        except (TypeError, ValueError):
            continue
    return {}


def proximo_n(l: dict) -> int | None:
    """O próximo toque da cadência, ou None (respondeu, saiu, fechou ou já foram os três)."""
    if l.get("situacao") not in ATIVAS:
        return None
    e = etapa(l)
    return e + 1 if e < 3 else None


def vencimento(l: dict) -> datetime | None:
    """Início do dia (Cuiabá) em que o próximo toque vence; None quando não há próximo. Igual a Regras.vencimento."""
    e = etapa(l)
    if e >= 3:
        return None
    ultimo = wa_akg._data(l.get(f"enviado{e}")) if e else None
    if not ultimo:
        return datetime(1970, 1, 1, tzinfo=wa_akg.FUSO)
    return wa_akg._inicio_do_dia(ultimo) + timedelta(days=int(wa_akg.ESPERA_DIAS.get(e + 1, 0)))


def proxima_em(l: dict, agora: datetime) -> str | None:
    """Dia local (AAAA-MM-DD) em que o próximo toque pode sair: hoje se já venceu."""
    if proximo_n(l) is None:
        return None
    v = vencimento(l)
    if v is None:
        return None
    return max(v, wa_akg._inicio_do_dia(agora)).strftime("%Y-%m-%d")


def grupo(l: dict, coluna: str) -> str:
    """Etapa como a Central antiga mostrava: hoje, aguardando, semcontato, respondeu, fechou, sair ou encerrado."""
    sit = l.get("situacao")
    if sit in ("fechou", "respondeu", "sair"):
        return sit
    if etapa(l) >= 3:
        return "encerrado"
    if coluna == "Sem contato":
        return "semcontato"
    return "hoje" if coluna == "Para hoje" else "aguardando"


def visoes(l: dict, coluna: str, agora: datetime) -> list[str]:
    """Atalhos do quadro em que o lead aparece. Não enviados, Para hoje e Enviado N são de quem está na cadência."""
    out = []
    ativo = l.get("situacao") in ATIVAS
    n = toque_enviado(l)
    if ativo and n == 0:
        out.append("nao_enviados")
    if coluna == "Para hoje":
        out.append("hoje")
    if ativo and n:
        out.append(f"enviado{n}")
    if coluna == "Responderam":
        out.append("responderam")
        if _txt(_dict(l.get("explee")).get("resposta")):
            out.append("resp_explee")                       # respondeu o e-mail da Explee
        if l.get("respostasVistasAte") or (l.get("canal") == "WhatsApp" and not _dict(l.get("explee")).get("resposta")):
            out.append("resp_wa")                           # respondeu pelo WhatsApp
    if coluna == "Sem contato":
        out.append("sem_contato")
    return out


# --------------------------------------------------------------------------- quem decide

def _decisor_com_contato(l: dict) -> dict | None:
    for c in _lista(l.get("contatos")):
        if c.get("papel") == "decisor" and not c.get("invalido") and (_txt(c.get("telefone")) or _txt(c.get("email"))):
            return c
    return None


def quem_decide(l: dict) -> str | None:
    c = _decisor_com_contato(l)
    if c and _txt(c.get("nome")):
        return _txt(c["nome"])
    for d in _lista(l.get("decisores")):
        if _txt(d.get("nome")):
            return _txt(d["nome"])
    return None


def tipo_decisor(l: dict) -> str:
    """contato: temos o contato direto de quem decide; nome: sabemos quem é, sem contato direto; sem: não sabemos."""
    if _decisor_com_contato(l):
        return "contato"
    return "nome" if quem_decide(l) else "sem"


# --------------------------------------------------------------------------- busca

def texto_busca(l: dict) -> str:
    """Tudo o que a busca da tela procura, sem acento e em minúsculas. Sem telefone (o resumo não espalha números)."""
    emp = _dict(l.get("empresa"))
    _, uf, cidade = geo(l)
    partes = [l.get("nome"), l.get("id"), l.get("saudacao"), l.get("email"), l.get("cnpj"), emp.get("cnpj"),
              emp.get("razaoSocial"), emp.get("nomeFantasia"), cidade, uf, l.get("segmento"), l.get("categoria")]
    partes += [d.get("nome") for d in _lista(l.get("decisores"))]
    for c in _lista(l.get("contatos")):
        partes += [c.get("nome"), c.get("email")]
    if isinstance(l.get("empresa"), str):
        partes.append(l["empresa"])
    return " | ".join(sem_acento(p) for p in partes if isinstance(p, (str, int)) and str(p).strip())


# --------------------------------------------------------------------------- resumo e detalhe

def _numero(v):
    if isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        return v
    try:
        return float(v) if "." in str(v) else int(v)
    except (TypeError, ValueError):
        return None


def resumo_extra(l: dict, coluna: str, agora: datetime) -> dict:
    """Campos que o card precisa além do que o servidor já manda (servidor.resumo_do_lead)."""
    pais, uf, cidade = geo(l)
    ag = _dict(l.get("agendamento"))
    return {
        "segmento": _txt(l.get("segmento")), "faixa": _txt(l.get("faixa")), "canal": _txt(l.get("canal")),
        "categoria": _txt(l.get("categoria")), "pais": pais, "uf": uf, "cidade": cidade, "local": rotulo_geo(l),
        "score": _numero(l.get("score")), "icp": _txt(l.get("icp")),
        "toque": toque_enviado(l), "proximoToque": proximo_n(l), "proximaEm": proxima_em(l, agora),
        "agendadoPara": ag.get("sendAt") if ag.get("id") else None,
        "temFoto": bool(wa_akg.foto_do_toque(l)), "quemDecide": quem_decide(l), "decisor": tipo_decisor(l),
        "telefoneMascarado": mascarar(wa_akg.telefone_destino(l)),
        "grupo": grupo(l, coluna), "visoes": visoes(l, coluna, agora), "busca": texto_busca(l),
    }


def _foto(l: dict, fotos_url: str) -> dict | None:
    from msg import fotos as catalogo
    fid = wa_akg.foto_do_toque(l)
    if not isinstance(fid, str) or not fid:
        return None
    try:
        cenario = catalogo.CENARIOS[catalogo.cenario(fid)]["nome"]
    except KeyError:
        cenario = ""
    url = f"{fotos_url.rstrip('/')}/{fid}.jpg" if fotos_url and re.fullmatch(r"[a-z0-9-]+", fid) else None
    return {"id": fid, "cenario": cenario, "url": link_seguro(url) if url else None}


def proximo_toque(l: dict, agora: datetime, fotos_url: str = "") -> dict | None:
    """A mensagem do próximo toque já montada como o planejador monta (saudação do contato ativo, linha da foto)."""
    n = proximo_n(l)
    if n is None:
        return None
    try:
        texto = wa_akg.mensagem_do_toque(l, n)
    except (AttributeError, TypeError, ValueError):
        texto = _txt(_toque(l, n).get("mensagem"))
    if not _txt(texto):
        return None
    foto = _foto(l, fotos_url) if n == 1 and "Te mandei uma foto" in texto else None
    quando = proxima_em(l, agora)
    hoje = wa_akg._inicio_do_dia(agora).strftime("%Y-%m-%d")
    ag = _dict(l.get("agendamento"))
    contato = wa_akg.contato_ativo(l) if isinstance(l.get("contatos"), list) else None
    return {"n": n, "nome": NOMES_TOQUE[n], "texto": texto, "foto": foto,
            "quando": "hoje" if quando == hoje else quando,
            "agendadoPara": ag.get("sendAt") if ag.get("id") and ag.get("n") == n else None,
            "para": _txt((contato or {}).get("nome")) or None}


def detalhe(lead: dict, repo, agora: datetime, fotos_url: str = "") -> dict:
    from .servidor import nome_da_empresa
    d = dict(lead, empresa=nome_da_empresa(lead), empresaDados=lead.get("empresa"),
             mensagens=repo.msgs_do_lead(str(lead["id"]), 100))
    d.update({"proximo": proximo_toque(lead, agora, fotos_url), "links": links(lead),
              "telefoneFormatado": telefone_formatado(wa_akg.telefone_destino(lead)) if _txt(wa_akg.telefone_destino(lead)) else "",
              "local": rotulo_geo(lead), "quemDecide": quem_decide(lead), "decisor": tipo_decisor(lead)})
    return d


# --------------------------------------------------------------------------- rotas

@rota("GET", r"/api/leads/(?P<id>[^/]+)")
def ver_lead(h, usuario, agora, m):
    from urllib.parse import unquote
    srv = h.server
    lead = srv.repo.lead_get(unquote(m["id"]))
    if lead is None:
        return h._erro(404, "Lead não encontrado.")
    return h._json(200, detalhe(lead, srv.repo, agora, srv.cfg.get("fotos_url") or ""))

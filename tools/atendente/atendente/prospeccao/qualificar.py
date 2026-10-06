"""Qualificação do prospecto antes da cadência: celular normalizado, duplicidade, lista de saída e WhatsApp.

Campos do prospecto que esta peça lê (os demais passam intactos):
    id, chavePessoa, celular (texto como veio), email, linkedin, dominio (ou site), estado.
Ao qualificar ou descartar, grava no próprio prospecto (se ele estiver no banco): estado, motivo, celularWa, jidWa,
qualificadoEm. Com o WA-AKG fora do ar o prospecto não muda de estado e a resposta é `pendente`.

Telefone nunca vai para o motivo nem para log.
"""
import hashlib
import re
import unicodedata

from scripts import wa_akg
from scripts.classificar_base import HOSTS_GENERICOS
from scripts.enriquecer_leads import _dominio

# DDDs válidos do Brasil (Anatel).
DDDS = frozenset({
    11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24, 27, 28, 31, 32, 33, 34, 35, 37, 38,
    41, 42, 43, 44, 45, 46, 47, 48, 49, 51, 53, 54, 55, 61, 62, 63, 64, 65, 66, 67, 68, 69,
    71, 73, 74, 75, 77, 79, 81, 82, 83, 84, 85, 86, 87, 88, 89, 91, 92, 93, 94, 95, 96, 97, 98, 99})
_SEPARADORES = re.compile(r"[/;,|]|\s+(?:e|ou)\s+", re.I)
ESTADOS_OCUPAM = ("qualificado", "promovido")   # outro prospecto nesses estados já "tem" a pessoa


def _um_celular(texto: str) -> str | None:
    d = re.sub(r"\D", "", texto).lstrip("0")
    if len(d) == 13 and d.startswith("55"):
        d = d[2:]
    if len(d) != 11:
        return None                       # fixo (10 dígitos), sem DDD, curto ou longo demais
    if int(d[:2]) not in DDDS or d[2] != "9":
        return None
    return "55" + d


def normalizar_celular(texto) -> str | None:
    """55 + DDD + 9 + 8 dígitos, ou None (fixo sem o 9, DDD inválido, vazio, lixo). Campo com mais de um número
    ("fixo / celular") devolve o primeiro celular."""
    t = str(texto or "").strip()
    if not t:
        return None
    n = _um_celular(t)
    if n:
        return n
    for parte in _SEPARADORES.split(t):
        n = _um_celular(parte)
        if n:
            return n
    return None


def _nome_normalizado(nome) -> str:
    t = unicodedata.normalize("NFKD", str(nome or "")).encode("ascii", "ignore").decode().lower()
    return " ".join(re.sub(r"[^a-z ]", " ", t).split())


def chave_pessoa(nome, empresa_ids, faixa_etaria) -> str:
    """Chave estável da pessoa: nome normalizado + faixa etária da Receita. O mesmo sócio em vários CNPJs dá a mesma
    chave (é contatado uma vez). Com nome de uma palavra só a chave inclui as raízes dos CNPJs (8 dígitos), para não
    juntar pessoas diferentes; filiais da mesma raiz continuam juntas. A chave é um hash: não expõe o nome."""
    n = _nome_normalizado(nome)
    partes = [n, str(faixa_etaria or "").strip()]
    if len(n.split()) < 2:
        raizes = sorted({re.sub(r"\D", "", str(c))[:8] for c in (empresa_ids or []) if str(c).strip()})
        partes.append(",".join(raizes))
    return "p_" + hashlib.sha256("|".join(partes).encode("utf-8")).hexdigest()[:24]


# ---------------------------------------------------------------- duplicidade

def _linkedin(url) -> str:
    u = str(url or "").strip().lower()
    m = re.search(r"linkedin\.com/(in|company)/([^/?#\s]+)", u)
    return f"{m.group(1)}/{m.group(2)}" if m else ""


def _dom(valor) -> str:
    v = str(valor or "").strip().lower()
    d = v.rsplit("@", 1)[1] if "@" in v and "/" not in v else _dominio(v)
    return d if d and "." in d and d not in HOSTS_GENERICOS else ""


def _numeros(doc: dict) -> set[str]:
    cands = [doc.get("telefone"), doc.get("celular"), doc.get("celularWa"), wa_akg.telefone_destino(doc)]
    for c in doc.get("contatos") or []:
        if isinstance(c, dict):
            cands.append(c.get("telefone"))
    if isinstance(doc.get("decisor"), dict):
        cands.append(doc["decisor"].get("telefone"))
    out = set()
    for c in cands:
        n = wa_akg.numero_whatsapp(c)
        if n:
            out.add(n[:4] + n[-8:])       # com e sem o nono dígito
    return out


def _dominios(doc: dict) -> set[str]:
    cands = [doc.get("site"), doc.get("dominio"), doc.get("email")]
    for c in doc.get("contatos") or []:
        if isinstance(c, dict):
            cands += [c.get("email"), c.get("site")]
    for chave in ("baseExplee", "explee"):
        if isinstance(doc.get(chave), dict):
            cands.append(doc[chave].get("dominio"))
    return {d for d in (_dom(c) for c in cands) if d}


def _linkedins(doc: dict) -> set[str]:
    cands = [doc.get("linkedin")]
    if isinstance(doc.get("decisor"), dict):
        cands.append(doc["decisor"].get("linkedin"))
    for c in (doc.get("contatos") or []) + (doc.get("pessoas") if isinstance(doc.get("pessoas"), list) else []):
        if isinstance(c, dict):
            cands.append(c.get("linkedin"))
    return {l for l in (_linkedin(c) for c in cands) if l}


def _bate(alvo: dict, doc: dict) -> bool:
    return bool(alvo["numeros"] & _numeros(doc) or alvo["dominios"] & _dominios(doc)
                or alvo["linkedins"] & _linkedins(doc))


def _duplicado(repo, p: dict, numero: str) -> str | None:
    pid = p.get("id")
    alvo = {"numeros": {numero[:4] + numero[-8:]}, "dominios": _dominios(p), "linkedins": _linkedins(p)}
    for l in repo.leads_todos():
        if pid and l.get("prospectoId") == pid:
            continue
        if _bate(alvo, l):
            return f"já é lead ({l.get('id')})"
    for c in repo.clientes_todos():
        if _bate(alvo, c):
            return "já é cliente"
    for b in repo.base_todos():
        if pid and b.get("prospectoId") == pid:
            continue
        if _bate(alvo, b):
            return f"já está na Base ({b.get('id')})"
    so_numero = {"numeros": alvo["numeros"], "dominios": set(), "linkedins": set()}
    chave = p.get("chavePessoa")
    for o in repo.prospectos():
        if o.get("id") == pid or o.get("estado") not in ESTADOS_OCUPAM:
            continue
        if (chave and o.get("chavePessoa") == chave) or _bate(so_numero, o):
            return f"mesma pessoa já qualificada ({o.get('id')})"
    return None


# ---------------------------------------------------------------- qualificar

def _gravar(repo, p: dict, dados: dict) -> None:
    if p.get("id") and repo.prospecto_get(p["id"]) is not None:
        atual = repo.prospecto_get(p["id"])
        atual.update(dados)
        repo.prospecto_put(atual)


def _descartar(repo, p: dict, motivo: str, agora) -> dict:
    _gravar(repo, p, {"estado": "descartado", "motivo": motivo, "descartadoEm": wa_akg._iso(agora)})
    return {"estado": "descartado", "motivo": motivo}


def qualificar(repo, wa, prospecto: dict, agora) -> dict:
    """{estado: qualificado | descartado | pendente, motivo, [numero, jid]}. Ordem: celular válido, lista de saída
    (o WA-AKG nem é consultado), duplicidade contra leads, clientes, Base e outros prospectos, e o WhatsApp."""
    p = prospecto or {}
    numero = normalizar_celular(p.get("celular"))
    if numero is None:
        return _descartar(repo, p, "sem celular válido (fixo ou formato inválido)", agora)
    if repo.sair_tem(numero) or (p.get("email") and repo.sair_tem(p["email"])):
        return _descartar(repo, p, "pediu para sair", agora)
    dup = _duplicado(repo, p, numero)
    if dup:
        return _descartar(repo, p, dup, agora)
    try:
        jid = (wa.verificar([numero]) or {}).get(numero)
    except Exception as e:  # WA-AKG fora do ar, rede, resposta ruim: não descarta, tenta depois
        return {"estado": "pendente", "motivo": "WhatsApp não respondeu: " + wa_akg.sem_numeros(str(e))[:200]}
    if not jid:
        return _descartar(repo, p, "sem WhatsApp", agora)
    _gravar(repo, p, {"estado": "qualificado", "motivo": "", "celularWa": numero, "jidWa": jid,
                      "qualificadoEm": wa_akg._iso(agora)})
    return {"estado": "qualificado", "motivo": "", "numero": numero, "jid": jid}

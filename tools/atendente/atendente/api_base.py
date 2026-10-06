"""Aba Base: as empresas das faixas B e C da Explee (tabela `base`), com busca, filtros, contagens e Promover.

Promover usa a mesma regra da Central antiga (`scripts/base_explee.processar`, que monta o lead com
`scripts/promover_base.doc_promovido`, segmentos ampliados): o lead novo ganha o próximo id B livre, os três toques e
`enriquecimento.fila`, e o documento da base vira `na_cadencia` com o `leadId`. Empresa cujo domínio já está em leads
não gera lead (só aponta para ele); empresa sem cadência vira `sem_cadencia` com o motivo. Uma promoção por vez.
"""
import math
import threading
import unicodedata
from urllib.parse import parse_qs, unquote, urlsplit

from msg.copy_v1 import ICPS
from scripts import base_explee, wa_akg
from scripts.promover_base import perfil_segmento

from .rotas import rota

LOTE = 50                       # teto do Promover vários (o mesmo da Central antiga)
POR_PADRAO, POR_MAXIMO = 50, 200
STATUS = ("base", "pedido", "na_cadencia", "sem_cadencia")
SEM = "sem"                     # filtro "sem informação" (UF vazia, segmento sem cadência)
_TRAVA = threading.Lock()


def _sem_acento(t) -> str:
    return unicodedata.normalize("NFD", str(t or "")).encode("ascii", "ignore").decode().lower()


def status_de(d: dict) -> str:
    return d.get("status") if d.get("status") in STATUS else "base"


def icp_de(d: dict) -> str:
    p = perfil_segmento({"segmento": d.get("segmento"), "nome": d.get("nome")}, ampliado=True)
    return p[0] if p else ""


def _casa_busca(d: dict, q: str) -> bool:
    if not q:
        return True
    dec = d.get("decisor") or {}
    campos = [d.get("nome"), d.get("dominio"), d.get("id"), d.get("segmento"), dec.get("nome"), dec.get("cargo"),
              d.get("cidade")]
    return q in " | ".join(_sem_acento(x) for x in campos) or q == _sem_acento(d.get("uf"))


def _ordem(d: dict):
    return (str(d.get("tier") or ""), -(d.get("score") or 0), _sem_acento(d.get("nome")))


def item(d: dict) -> dict:
    """O que a lista mostra de cada empresa."""
    dec = d.get("decisor") or {}
    return {"id": d.get("id"), "nome": d.get("nome") or d.get("dominio") or d.get("id"), "dominio": d.get("dominio") or "",
            "site": d.get("site") or "", "segmento": d.get("segmento") or "", "tier": d.get("tier") or "",
            "score": d.get("score"), "icp": icp_de(d), "uf": (d.get("uf") or "").upper(), "cidade": d.get("cidade") or "",
            "decisor": {k: dec.get(k) or "" for k in ("nome", "cargo", "persona", "linkedin")},
            "pessoas": d.get("pessoas") or 0, "contatoEmpresa": d.get("contatoEmpresa"),
            "status": status_de(d), "leadId": d.get("leadId"), "motivo": d.get("motivo") or ""}


def _opcoes(itens: list[dict], campo: str) -> list:
    c = {}
    for x in itens:
        v = x[campo]
        if v:
            c[v] = c.get(v, 0) + 1
    return [[k, c[k]] for k in sorted(c, key=_sem_acento)]


def listar(docs: list[dict], filtros: dict, pagina: int, por: int) -> dict:
    itens = sorted((item(d) for d in docs), key=lambda x: _ordem(x))
    q = _sem_acento(filtros.get("busca")).strip()

    def casa(x):
        for campo in ("segmento", "tier", "icp", "uf"):
            f = filtros.get(campo) or ""
            if f and (bool(x[campo]) if f == SEM else x[campo] != f):
                return False
        return _casa_busca(x, q)

    recorte = [x for x in itens if casa(x)]
    contagens = {"todas": len(recorte), **{s: 0 for s in STATUS}}
    for x in recorte:
        contagens[x["status"]] += 1
    st = filtros.get("status") or ""
    filtrados = [x for x in recorte if not st or st == "todas" or x["status"] == st]
    icps = _opcoes(itens, "icp")
    return {
        "itens": filtrados[(pagina - 1) * por: pagina * por], "total": len(filtrados), "pagina": pagina, "por": por,
        "paginas": max(1, math.ceil(len(filtrados) / por)), "totalBase": len(itens), "contagens": contagens,
        "opcoes": {"segmento": _opcoes(itens, "segmento"), "tier": _opcoes(itens, "tier"), "uf": _opcoes(itens, "uf"),
                   "icp": [[k, ICPS.get(k, k), n] for k, n in icps],
                   "semUf": sum(1 for x in itens if not x["uf"]), "semIcp": sum(1 for x in itens if not x["icp"])},
    }


def _iso(agora) -> str:
    return wa_akg._iso(agora)


def promover(repo, ids: list[str], usuario: str, agora) -> dict:
    """{promovidos: [{id, leadId}], jaNaCentral: [{id, leadId}], pulados: [{id, motivo}], naoEncontrados: [id]}."""
    out = {"promovidos": [], "jaNaCentral": [], "pulados": [], "naoEncontrados": []}
    quando = _iso(agora)
    with _TRAVA:
        pedidos = []
        for bid in dict.fromkeys(ids):
            d = repo.base_get(bid)
            if d is None:
                out["naoEncontrados"].append(bid)
            elif status_de(d) == "na_cadencia" and d.get("leadId"):
                out["jaNaCentral"].append({"id": bid, "leadId": d["leadId"]})
            elif status_de(d) == "sem_cadencia":
                out["pulados"].append({"id": bid, "motivo": d.get("motivo") or "sem cadência"})
            else:
                pedidos.append(dict(d, id=bid, status="pedido", pedidoEm=d.get("pedidoEm") or quando))
        if not pedidos:
            return out
        leads = repo.leads_todos()
        # ids que a base já aponta contam como ocupados: o B novo nunca colide com eles
        reservados = [{"id": d["leadId"]} for d in repo.base_todos() if d.get("leadId")]
        r = base_explee.processar(pedidos, leads + reservados, agora=quando)
        novos = {}
        for n in r["novosLeads"]:
            lead = dict(n["data"], id=n["id"])
            lead["historico"] = wa_akg.registrar(lead.get("historico"), f"Promovido da Base por {usuario}", agora)
            repo.lead_put(lead)
            novos[n["id"]] = True
        motivos = {p["id"]: p["motivo"] for p in r["pulados"]}
        for u in r["baseUpdates"]:
            repo.base_aplicar(u["id"], u["data"])
            if u["id"] in motivos:
                out["pulados"].append({"id": u["id"], "motivo": motivos[u["id"]]})
            elif u["data"].get("leadId") in novos:
                out["promovidos"].append({"id": u["id"], "leadId": u["data"]["leadId"]})
            else:
                out["jaNaCentral"].append({"id": u["id"], "leadId": u["data"].get("leadId")})
    return out


def _motivo_legivel(m: str) -> str:
    if m.startswith("segmento sem cadência"):
        return f"Esta empresa não tem cadência ({m})."
    return f"Não deu para promover: {m}."


# --------------------------------------------------------------------------- rotas

def _inteiro(consulta, nome, padrao):
    v = (consulta.get(nome) or [str(padrao)])[0]
    return int(v)


@rota("GET", r"/api/base")
def _listar(h, usuario, agora, m):
    consulta = parse_qs(urlsplit(h.path).query)
    try:
        pagina = _inteiro(consulta, "pagina", 1)
        por = _inteiro(consulta, "por", POR_PADRAO)
    except ValueError:
        return h._erro(400, "Página e tamanho da página precisam ser números.")
    if pagina < 1 or not 1 <= por <= POR_MAXIMO:
        return h._erro(400, f"A página começa em 1 e cada página tem de 1 a {POR_MAXIMO} empresas.")
    filtros = {k: (consulta.get(k) or [""])[0].strip() for k in ("busca", "segmento", "tier", "icp", "uf", "status")}
    return h._json(200, listar(h.server.repo.base_todos(), filtros, pagina, por))


@rota("POST", r"/api/base/promover")
def _promover_varios(h, usuario, agora, m):
    dados, falhou = h._json_do_corpo()
    if falhou:
        return
    ids = dados.get("ids") if isinstance(dados, dict) else None
    if not isinstance(ids, list) or not ids or not all(isinstance(i, str) and i for i in ids):
        return h._erro(400, "Escolha ao menos uma empresa.")
    if len(ids) > LOTE:
        return h._erro(400, f"Dá para promover até {LOTE} empresas por vez.")
    return h._json(200, promover(h.server.repo, ids, usuario, agora))


@rota("POST", r"/api/base/(?P<id>[^/]+)/promover")
def _promover_uma(h, usuario, agora, m):
    dados, falhou = h._json_do_corpo()
    if falhou:
        return
    bid = unquote(m.group("id"))
    r = promover(h.server.repo, [bid], usuario, agora)
    if r["naoEncontrados"]:
        return h._erro(404, "Essa empresa não está na Base.")
    if r["pulados"]:
        return h._erro(409, _motivo_legivel(r["pulados"][0]["motivo"]))
    if r["promovidos"]:
        return h._json(200, {"ok": True, "leadId": r["promovidos"][0]["leadId"], "novo": True})
    return h._json(200, {"ok": True, "leadId": r["jaNaCentral"][0]["leadId"], "novo": False})

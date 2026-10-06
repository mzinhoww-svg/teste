"""Prospecto qualificado → lead na cadência, pela mesma porta da aba Base (`api_base.promover`).

Monta um documento no formato da Base (nome, dominio, segmento, uf, cidade, decisor, pessoas, contatos, site...),
grava em `base` com id `prosp-<id do prospecto>` e chama `api_base.promover`, que cria o lead B com os três toques e
a saudação pelo primeiro nome da pessoa. Depois ajusta o lead novo ao que a prospecção já sabe: o contato ativo é a
pessoa, com o celular que o WA-AKG confirmou; sai da fila do enriquecimento (o celular já veio); fonte e data em
`prospeccao`; histórico sem a origem Explee. Telefone não vai para o histórico.

Idempotente: prospecto que já tem lead (ou lead que já aponta para ele) devolve o mesmo id sem criar nada. Empresa
cujo domínio já é lead não ganha outro: devolve o lead existente (`novo: False`) sem mexer nele. Sem domínio ou com
segmento sem cadência, o documento fica na Base como `sem_cadencia` com o motivo e o prospecto continua guardado.
"""
from scripts import wa_akg
from scripts.promover_base import FLAG, FLAG_MIGRADO, PENDENCIA

from .. import api_base

FLAG_PROSPECCAO = "prospecção"


def _iso(agora) -> str:
    return wa_akg._iso(agora)


def _fonte_legivel(fonte: str) -> str:
    f = str(fonte or "")
    if f == "receita:cadastro":
        return "cadastro da Receita"
    if f.startswith("treg:"):
        return f"treg ({f[5:]})"
    return f or "fonte não informada"


def _segmento(repo, p: dict) -> str:
    c = repo.campanha_get(p["campanhaId"]) if p.get("campanhaId") else None
    return (c or {}).get("segmento") or p.get("segmento") or ""


def doc_base(repo, p: dict, agora) -> dict:
    """O prospecto no formato dos documentos da Base (scripts/base_explee.doc_base)."""
    segmento = _segmento(repo, p)
    dominio = str(p.get("dominio") or "").strip().lower()
    pessoa = {"nome": p.get("nome") or "", "cargo": p.get("cargo") or "", "persona": p.get("persona") or "decisor",
              "linkedin": p.get("linkedin") or ""}
    return {
        "id": f"prosp-{p['id']}", "dominio": dominio, "nome": p.get("empresa") or dominio, "segmento": segmento,
        "tier": "P", "score": None, "regiao": "MT", "decisor": pessoa, "pessoas": 1,
        "comLinkedin": 1 if pessoa["linkedin"] else 0, "campanhas": [segmento] if segmento else [],
        "site": p.get("site") or (f"https://{dominio}" if dominio else ""), "contatos": [dict(pessoa)],
        "status": "base", "pedidoEm": None, "leadId": None, "migradoEm": None,
        "pais": "Brasil", "uf": "MT", "cidade": p.get("cidade") or "",
        "prospectoId": p["id"], "campanhaId": p.get("campanhaId"), "fonte": "prospecção", "fonteEm": _iso(agora),
    }


def _ajustar_lead(repo, lid: str, p: dict, segmento: str, usuario: str, agora) -> None:
    lead = repo.lead_get(lid)
    quando = _iso(agora)
    contatos = [c for c in lead.get("contatos") or [] if isinstance(c, dict)]
    ns = [int(str(c.get("id"))[1:]) for c in contatos if str(c.get("id") or "")[1:].isdigit()]
    kid = f"k{max(ns, default=0) + 1}"
    contatos.insert(0, {"id": kid, "papel": "decisor", "nome": p.get("nome") or "", "cargo": p.get("cargo") or "",
                        "telefone": p["celularWa"], "whatsapp": "sim", "email": p.get("email") or "",
                        "fonte": f"prospecção · {_fonte_legivel(p.get('fonte'))} · {quando[:10]}",
                        "confianca": "alta"})
    enr = {k: v for k, v in (lead.get("enriquecimento") or {}).items() if k not in ("fila", "migradoSemEnriquecer")}
    enr.update(status="completo", atualizadoEm=quando[:10], fonte="prospecção")
    perfil = dict(lead.get("perfil") or {}, fonteDados="Receita e treg (prospecção)")
    if p.get("cidade"):
        perfil["cidade"] = p["cidade"]
    texto = (f"Entrou pela Prospecção (campanha {segmento}): {p.get('nome')}, {p.get('cargo') or 'sem cargo'} "
             f"de {p.get('empresa') or lead.get('nome')}. Celular do {_fonte_legivel(p.get('fonte'))}, com WhatsApp "
             f"confirmado. Promovido por {usuario}.")
    lead.update({
        "contatos": contatos, "contatoAtivo": kid, "jidWa": p.get("jidWa") or "", "prospectoId": p["id"],
        "prospeccao": {"prospectoId": p["id"], "campanhaId": p.get("campanhaId"), "cnpj": p.get("empresaId") or "",
                       "fonteCelular": p.get("fonte") or "", "fonteEmail": p.get("fonteEmail") or "",
                       "custoMicro": int(p.get("custoMicro") or 0), "em": quando},
        "flags": [f for f in lead.get("flags") or [] if f not in (FLAG, FLAG_MIGRADO)] + [FLAG_PROSPECCAO],
        "pendencias": [x for x in lead.get("pendencias") or [] if x != PENDENCIA],
        "enriquecimento": enr, "perfil": perfil,
        "decisores": [{"nome": p.get("nome") or "", "cargo": p.get("cargo") or "", "linkedin": p.get("linkedin") or "",
                       "fonte": f"Prospecção · {_fonte_legivel(p.get('fonte'))}"}],
        "historico": [{"em": quando, "tipo": "prospeccao", "texto": texto}],
    })
    repo.lead_put(lead)


def _marcar(repo, pid: str, dados: dict) -> None:
    atual = repo.prospecto_get(pid)
    if atual is not None:
        atual.update(dados)
        repo.prospecto_put(atual)


def promover(repo, prospecto: dict, usuario: str, agora) -> dict:
    """{leadId, novo} ou {leadId: None, motivo}."""
    pid = (prospecto or {}).get("id")
    if not pid:
        raise ValueError('prospecto sem "id"')
    p = dict(prospecto, **(repo.prospecto_get(pid) or {}))   # o banco manda: a cópia de quem chamou pode ser velha
    if p.get("leadId"):
        return {"leadId": p["leadId"], "novo": False}
    ja = next((l for l in repo.leads_todos() if l.get("prospectoId") == pid), None)
    if ja:
        _marcar(repo, pid, {"estado": "promovido", "leadId": ja["id"]})
        return {"leadId": ja["id"], "novo": False}
    if p.get("estado") != "qualificado" or not p.get("celularWa"):
        return {"leadId": None, "motivo": "só prospecto qualificado (com WhatsApp confirmado) entra na cadência"}

    doc = doc_base(repo, p, agora)
    antigo = repo.base_get(doc["id"])
    if antigo and antigo.get("leadId"):
        return {"leadId": antigo["leadId"], "novo": False}
    repo.base_put(doc)
    r = api_base.promover(repo, [doc["id"]], usuario, agora)
    if r["promovidos"]:
        lid = r["promovidos"][0]["leadId"]
        _ajustar_lead(repo, lid, p, doc["segmento"], usuario, agora)
        _marcar(repo, pid, {"estado": "promovido", "leadId": lid, "promovidoEm": _iso(agora)})
        return {"leadId": lid, "novo": True}
    if r["jaNaCentral"]:
        lid = r["jaNaCentral"][0]["leadId"]
        _marcar(repo, pid, {"estado": "descartado", "motivo": f"já é lead ({lid})", "descartadoEm": _iso(agora)})
        return {"leadId": lid, "novo": False}
    motivo = r["pulados"][0]["motivo"] if r["pulados"] else "não encontrado na Base"
    return {"leadId": None, "motivo": motivo}

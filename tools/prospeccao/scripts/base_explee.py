"""Base Explee na Central de disparo: a lista leve das faixas B e C e o processamento dos pedidos da Letícia.

A faixa A virou leads completos (`scripts/promover_base.py`). As faixas B e C (2.274 empresas) ficam numa coleção
separada, `base`, com um documento enxuto por empresa. Na página (funil Base) a Letícia escolhe quem entra:
o botão grava só `status: "pedido"` e `pedidoEm` no documento da base. O Claude, na conversa, lê os pedidos e
roda `processar`, que monta os leads completos (mesmo mapeamento do promover) e diz o que gravar na base.
Só biblioteca padrão; não acessa o banco: lê JSON e grava JSON.

    python3 -m scripts.base_explee base --entrada dados/explee/base.json --tiers B,C \\
        --existentes dados/explee/existentes_docs.json --existentes dados/explee/promover.json \\
        --saida dados/explee/base_docs.json [--anteriores base_docs_antigo.json]
    python3 -m scripts.base_explee processar --pedidos pedidos.json --existentes leads.json \\
        --saida processar.json [--base dados/explee/base.json]
    python3 -m scripts.base_explee site-leads --leads leads_a.json --site-contatos dados/explee/site_contatos.json \\
        --saida site_leads.json

Decisões:
- Id `D` + 5 dígitos, estável pelo domínio: sha1 do domínio módulo 100000; colisão anda para o próximo número
  livre, na ordem dos domínios. `--anteriores` (base_docs de uma rodada anterior, ou a coleção lida do banco)
  reserva os ids que já existem, então uma base nova nunca troca o id de quem já está lá.
- Quem já está em `leads` (domínio do site, `baseExplee.dominio`, `explee.dominio` ou e-mails dos contatos) fica
  fora da base. `--existentes` pode vir mais de uma vez; aceita lista de leads ou `{novos: [{id, data}]}`.
- O documento guarda só o que a lista mostra e filtra: decisor (a primeira pessoa na ordem do promover, que é
  quem a saudação usa), contagens de pessoas e de LinkedIn e as campanhas. Teto de ~1 KB por documento.
- `processar` usa os segmentos ampliados do promover (agro, cooperativas, gestão pública, revendas, B2B,
  indústrias), porque a Letícia pediu aquela empresa. Ids `B` continuam depois do maior B existente. Cada lead
  novo leva `enriquecimento.fila: true`, que põe ele na frente do próximo "Enriquecer base".
- Pedido pulado (sem domínio, segmento sem cadência ou copy reprovada) não fica "pedido" para sempre: entra em
  `baseUpdates` com `status: "sem_cadencia"` e o `motivo`, que a página mostra.
- Pedido cuja empresa já virou lead (rodar de novo, ou o lead entrou por outro caminho) não gera lead: só a
  atualização da base, com o `leadId` que já existe.
"""
import argparse
import hashlib
import json
import os
import re
import sys
from datetime import datetime, timezone

from msg.regiao import regiao as regiao_do_lead
from scripts.classificar_base import dominios_central
from scripts.enriquecer_leads import _dominio
from scripts.promover_base import (_achatar, _dominios_existentes, _proximo_b, checar, doc_promovido,
                                   pessoas_ordenadas, perfil_segmento)

PREFIXO = "D"
ESPACO = 100000
STATUS_BASE, STATUS_PEDIDO, STATUS_CADENCIA, STATUS_SEM = "base", "pedido", "na_cadencia", "sem_cadencia"
MAX_CONTATOS = 6
LIMITE_DOC = 2048  # bytes do JSON do documento


def _agora() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _itens(x) -> list[dict]:
    """Lista de documentos ({id, ...} ou {id, data}) a partir de lista, {novos: [...]} ou {docs: [...]}."""
    if isinstance(x, dict):
        x = x.get("novos") or x.get("docs") or []
    return [_achatar(i) for i in x or []]


# --------------------------------------------------------------------------- ids

def _hash(dominio: str) -> int:
    return int(hashlib.sha1(dominio.encode("utf-8")).hexdigest(), 16) % ESPACO


def atribuir_ids(dominios: list[str], anteriores: dict | None = None) -> dict:
    """{dominio: id}. Os de `anteriores` ({dominio: id}) ficam; os novos pegam o hash ou o próximo livre."""
    usados, ids = set(), {}
    for d, i in (anteriores or {}).items():
        if d in dominios:
            ids[d] = i
            usados.add(i)
    for d in sorted(set(dominios)):
        if d in ids:
            continue
        n = _hash(d)
        while f"{PREFIXO}{n:05d}" in usados:
            n = (n + 1) % ESPACO
        ids[d] = f"{PREFIXO}{n:05d}"
        usados.add(ids[d])
    return ids


# --------------------------------------------------------------------------- base

def _texto(v, limite: int) -> str:
    t = " ".join(str(v or "").split())
    return t if len(t) <= limite else t[: limite - 1].rstrip() + "…"


def contato_empresa(achado: dict | None, dominio: str = "") -> dict | None:
    """O contato público do site para o documento da base: um de cada (o primeiro da lista), ou None se não achou nada.

    `achado` é a entrada de site_contatos.json: {whatsapp: [dígitos], telefones: [dígitos], emails: [...], fonte}."""
    achado = achado or {}
    wa = next((str(x) for x in achado.get("whatsapp") or [] if str(x).strip()), "")
    tel = next((str(x) for x in achado.get("telefones") or [] if str(x).strip()), "")
    mail = next((str(x).strip().lower() for x in achado.get("emails") or [] if str(x).strip()), "")
    if not (wa or tel or mail):
        return None
    fonte = (achado.get("fonte") or "").strip() or ("https://" + dominio if dominio else "")
    return {"whatsapp": wa, "telefone": tel, "email": mail, "fonte": fonte[:200]}


def _digitos(x) -> str:
    """Só os dígitos, sem o 55 do país (o lead guarda o telefone com ou sem ele)."""
    d = "".join(c for c in str(x or "") if c.isdigit())
    return d[2:] if len(d) in (12, 13) and d.startswith("55") else d


def contato_do_lead(ce: dict | None, existentes: list[dict] | None = None, extras: tuple = ()) -> dict | None:
    """O contato `geral` da empresa (site) no formato dos `contatos` do lead, ou None se não há o que guardar ou se o
    telefone ou o e-mail já estão no lead (`existentes` são os contatos; `extras`, telefone/e-mail soltos do lead)."""
    if not ce:
        return None
    wa, tel = "".join(c for c in str(ce.get("whatsapp") or "") if c.isdigit()), \
        "".join(c for c in str(ce.get("telefone") or "") if c.isdigit())
    mail = str(ce.get("email") or "").strip().lower()
    fone = wa or tel
    if not (fone or mail):
        return None
    tem_fone = {_digitos(c.get("telefone")) for c in existentes or []} | {_digitos(x) for x in extras}
    tem_mail = {str(c.get("email") or "").strip().lower() for c in existentes or []} | {str(x or "").strip().lower() for x in extras}
    if (fone and _digitos(fone) in tem_fone) or (mail and mail in tem_mail):
        return None
    ns = [int(m.group(1)) for c in existentes or [] if (m := re.fullmatch(r"k(\d+)", str(c.get("id"))))]
    return {"id": f"k{max(ns, default=0) + 1}", "papel": "geral", "nome": "", "cargo": "Contato da empresa (site)",
            "telefone": fone, "whatsapp": "sim" if wa else "?", "email": mail, "fonte": ce.get("fonte") or "",
            "confianca": "média"}


def doc_base(emp: dict, achado: dict | None = None) -> dict:
    """Documento enxuto da coleção `base` para uma empresa classificada. `achado` é o contato do site (opcional)."""
    pessoas = pessoas_ordenadas(emp)
    p = pessoas[0] if pessoas else (emp.get("decisor") or {})
    nome = (emp.get("nome") or "").strip() or emp["dominio"]
    doc = {
        "dominio": emp["dominio"], "nome": _texto(nome, 120), "segmento": emp.get("segmento") or "",
        "tier": emp.get("tier") or "", "score": emp.get("score"),
        "regiao": regiao_do_lead({"nome": nome, "site": emp["dominio"]}),
        "decisor": {"nome": _texto(p.get("nome"), 80), "cargo": _texto(p.get("cargo"), 90),
                    "persona": p.get("persona") or "", "linkedin": (p.get("linkedin") or "").strip()[:200]},
        "pessoas": len(emp.get("pessoas") or []),
        "comLinkedin": sum(1 for x in emp.get("pessoas") or [] if (x.get("linkedin") or "").strip()),
        "campanhas": list(emp.get("campanhas") or [])[:6],
        "site": "https://" + emp["dominio"],
        "contatos": [{"nome": _texto(x.get("nome"), 80), "cargo": _texto(x.get("cargo"), 90),
                      "persona": x.get("persona") or "", "linkedin": (x.get("linkedin") or "").strip()[:200]}
                     for x in pessoas[:MAX_CONTATOS] if (x.get("nome") or "").strip()],
        "status": STATUS_BASE, "pedidoEm": None, "leadId": None, "migradoEm": None,
    }
    ce = contato_empresa(achado, emp["dominio"])
    if ce:
        doc["contatoEmpresa"] = ce
    while doc["contatos"] and len(json.dumps(doc, ensure_ascii=False).encode("utf-8")) > LIMITE_DOC:
        doc["contatos"].pop()
    if len(json.dumps(doc, ensure_ascii=False).encode("utf-8")) > LIMITE_DOC:
        doc["campanhas"] = doc["campanhas"][:2]
        doc["decisor"]["linkedin"] = doc["decisor"]["linkedin"][:120]
    return doc


def _dominios_na_central(existentes: list[dict]) -> dict:
    """{dominio: id do lead} pelo site, baseExplee/explee e e-mails (os mesmos critérios do classificar e do promover)."""
    doms = _dominios_existentes(existentes)
    for x in existentes:
        for d in dominios_central([x]):
            doms.setdefault(d, x.get("id"))
    return doms


def montar_base(base: dict, existentes: list[dict], tiers=("B", "C"), anteriores: list[dict] | None = None,
                site_contatos: dict | None = None) -> dict:
    """{docs: [{id, data}], pulados: [{dominio, nome, motivo, id?}]}, na ordem faixa, score desc, domínio."""
    na_central = _dominios_na_central(existentes)
    empresas, pulados, vistos = [], [], set()
    for emp in base.get("empresas") or []:
        if emp.get("tier") not in tiers:
            continue
        dom = _dominio(emp.get("dominio") or "")
        ref = {"dominio": emp.get("dominio") or "", "nome": emp.get("nome") or ""}
        if not dom:
            pulados.append({**ref, "motivo": "sem domínio"})
        elif dom in na_central:
            pulados.append({**ref, "id": na_central[dom], "motivo": "já na central"})
        elif dom in vistos:
            pulados.append({**ref, "motivo": "domínio repetido"})
        else:
            vistos.add(dom)
            empresas.append({**emp, "dominio": dom})
    ant = {_dominio(d.get("dominio") or ""): d["id"] for d in _itens(anteriores or []) if d.get("id")}
    ids = atribuir_ids([e["dominio"] for e in empresas], ant)
    empresas.sort(key=lambda e: (e.get("tier") or "", -(e.get("score") or 0), e["dominio"]))
    return {"docs": [{"id": ids[e["dominio"]], "data": doc_base(e, (site_contatos or {}).get(e["dominio"]))} for e in empresas], "pulados": pulados}


# --------------------------------------------------------------------------- processar

def _empresa_do_pedido(doc: dict, completas: dict) -> dict:
    """A empresa completa da base.json (se veio) ou uma reconstruída do documento enxuto, só com o decisor."""
    dom = _dominio(doc.get("dominio") or "")
    if dom in completas:
        return {**completas[dom], "dominio": dom}
    campanha = (doc.get("campanhas") or [doc.get("segmento")])[0]
    def _p(d):
        return {"person_id": None, "nome": d.get("nome") or "", "cargo": d.get("cargo") or "",
                "persona": d.get("persona") or "operacional", "linkedin": d.get("linkedin") or "", "campanha": campanha}
    pessoas = [_p(x) for x in (doc.get("contatos") or []) if x.get("nome")] or \
        ([_p(doc.get("decisor") or {})] if (doc.get("decisor") or {}).get("nome") else [])
    return {"dominio": dom, "nome": doc.get("nome") or dom, "segmento": doc.get("segmento"),
            "campanhas": list(doc.get("campanhas") or []), "tier": doc.get("tier"), "score": doc.get("score"),
            "pessoas": pessoas, "decisor": pessoas[0] if pessoas else {}}


def processar(pedidos, existentes, base: dict | None = None, agora: str | None = None) -> dict:
    """{novosLeads: [{id, data}], baseUpdates: [{id, data}], pulados: [{id, dominio, motivo}]}. Cada pulado também
    vira uma atualização `{status: "sem_cadencia", motivo}` em baseUpdates.

    Só olha documentos com status "pedido". Não gera lead que já está na central."""
    agora = agora or _agora()
    exist = _itens(existentes)
    doms = _dominios_na_central(exist)
    num = _proximo_b(exist)
    completas = {_dominio(e.get("dominio") or ""): e for e in (base or {}).get("empresas") or []}
    lista = sorted(_itens(pedidos), key=lambda d: (str(d.get("pedidoEm") or ""), str(d.get("id"))))
    novos, updates, pulados = [], [], []
    for doc in lista:
        if doc.get("status") != STATUS_PEDIDO:
            continue
        bid, dom = doc.get("id"), _dominio(doc.get("dominio") or "")
        if not dom:
            pulados.append({"id": bid, "dominio": "", "motivo": "sem domínio"})
            continue
        if dom in doms:
            updates.append({"id": bid, "data": {"status": STATUS_CADENCIA, "leadId": doms[dom], "migradoEm": agora}})
            continue
        emp = _empresa_do_pedido(doc, completas)
        if perfil_segmento(emp, ampliado=True) is None:
            pulados.append({"id": bid, "dominio": dom, "motivo": f"segmento sem cadência: {emp.get('segmento')}"})
            continue
        lid = f"B{num:04d}"
        dados = doc_promovido(emp, num, agora, ampliado=True)
        erros = checar(lid, dados)
        if erros:
            pulados.append({"id": bid, "dominio": dom, "motivo": "copy reprovada: " + "; ".join(erros)})
            continue
        dados["enriquecimento"] = {**dados["enriquecimento"], "fila": True}
        extra = contato_do_lead(doc.get("contatoEmpresa"), dados.get("contatos"))
        if extra:  # depois dos contatos dos decisores; nunca vira contatoAtivo (a escolha é da Letícia)
            dados["contatos"] = list(dados.get("contatos") or []) + [extra]
        dados["baseExplee"] = {**dados["baseExplee"], "baseId": bid, "pedidoEm": doc.get("pedidoEm")}
        campanha = (emp.get("decisor") or {}).get("campanha") or (emp.get("campanhas") or [emp.get("segmento")])[0]
        dados["historico"] = [{"em": agora, "tipo": "explee",
                               "texto": f"Entrou pela Base, a pedido da Letícia (faixa {emp.get('tier')}, campanha "
                                        f"{campanha}): já recebeu e-mail da Explee sem responder. Na fila do "
                                        "enriquecimento."}]
        novos.append({"id": lid, "data": dados})
        updates.append({"id": bid, "data": {"status": STATUS_CADENCIA, "leadId": lid, "migradoEm": agora}})
        doms[dom] = lid
        num += 1
    # Pulado não fica "pedido" para sempre: ganha o status terminal com o motivo, que a página mostra.
    for p in pulados:
        updates.append({"id": p["id"], "data": {"status": STATUS_SEM, "motivo": p["motivo"]}})
    return {"novosLeads": novos, "baseUpdates": updates, "pulados": pulados}


def site_leads(leads, site_contatos: dict) -> list[dict]:
    """[{id, if_version, data: {contatos: [...existentes, novo]}}] para os leads cujo `baseExplee.dominio` tem contato
    público no site e ainda não o têm (por telefone ou e-mail). `leads` traz {id, version, data} ou {id, version, ...}."""
    saida = []
    for item in leads or []:
        d = item["data"] if isinstance(item.get("data"), dict) else item
        dom = _dominio((d.get("baseExplee") or {}).get("dominio") or "")
        ce = contato_empresa((site_contatos or {}).get(dom), dom) if dom else None
        contatos = list(d.get("contatos") or [])
        novo = contato_do_lead(ce, contatos, (d.get("telefone"), d.get("email")))
        if novo:
            saida.append({"id": item["id"], "if_version": item.get("version"), "data": {"contatos": contatos + [novo]}})
    return saida


# --------------------------------------------------------------------------- CLI

def _ler(caminho):
    with open(caminho, encoding="utf-8") as fh:
        return json.load(fh)


def _gravar(caminho, dados):
    os.makedirs(os.path.dirname(os.path.abspath(caminho)), exist_ok=True)
    with open(caminho, "w", encoding="utf-8") as fh:
        json.dump(dados, fh, ensure_ascii=False, indent=1)


def _contar(itens, chave):
    c = {}
    for x in itens:
        c[x[chave]] = c.get(x[chave], 0) + 1
    return dict(sorted(c.items(), key=lambda kv: (-kv[1], str(kv[0]))))


def main(argv=None):
    ap = argparse.ArgumentParser(prog="base_explee")
    sub = ap.add_subparsers(dest="cmd", required=True)
    b = sub.add_parser("base", help="documentos da coleção base (faixas B e C), fora quem já está em leads")
    b.add_argument("--entrada", required=True, help="base.json do classificar_base")
    b.add_argument("--tiers", default="B,C")
    b.add_argument("--existentes", action="append", default=[], help="leads da central (pode repetir)")
    b.add_argument("--anteriores", help="base_docs de antes, para manter os ids")
    b.add_argument("--site-contatos", help="site_contatos.json do scripts.site_contatos: põe contatoEmpresa em cada doc")
    b.add_argument("--saida", required=True)
    p = sub.add_parser("processar", help="leads completos dos pedidos da Base e as atualizações da base")
    p.add_argument("--pedidos", required=True, help="documentos da base com status pedido ({id, data} ou {id, ...})")
    p.add_argument("--existentes", action="append", default=[], help="leads da central (pode repetir)")
    p.add_argument("--base", help="base.json completo (opcional): traz todas as pessoas da empresa")
    p.add_argument("--saida", required=True)
    sl = sub.add_parser("site-leads", help="acrescenta o contato da empresa (site) aos leads que já existem")
    sl.add_argument("--leads", required=True, help="JSON com a lista de leads ({id, version, data})")
    sl.add_argument("--site-contatos", required=True)
    sl.add_argument("--saida", required=True)
    a = ap.parse_args(argv)
    if a.cmd == "site-leads":
        leads = _ler(a.leads)
        res = site_leads(leads, _ler(a.site_contatos))
        _gravar(a.saida, res)
        print(json.dumps({"leads": len(leads), "comContatoNovo": len(res), "ids": [r["id"] for r in res]}, ensure_ascii=False))
        return 0
    exist = [x for c in a.existentes for x in _itens(_ler(c))]
    if a.cmd == "base":
        tiers = tuple(t.strip() for t in a.tiers.split(",") if t.strip())
        res = montar_base(_ler(a.entrada), exist, tiers, _ler(a.anteriores) if a.anteriores else None,
                          _ler(a.site_contatos) if a.site_contatos else None)
        _gravar(a.saida, res["docs"])
        tamanhos = [len(json.dumps(d["data"], ensure_ascii=False).encode("utf-8")) for d in res["docs"]]
        print(json.dumps({"docs": len(res["docs"]), "porFaixa": _contar([d["data"] for d in res["docs"]], "tier"),
                          "porSegmento": _contar([d["data"] for d in res["docs"]], "segmento"),
                          "comContatoEmpresa": sum(1 for d in res["docs"] if d["data"].get("contatoEmpresa")),
                          "maiorDocBytes": max(tamanhos, default=0), "totalBytes": sum(tamanhos),
                          "pulados": _contar(res["pulados"], "motivo")}, ensure_ascii=False))
        return 0
    res = processar(_ler(a.pedidos), exist, _ler(a.base) if a.base else None)
    _gravar(a.saida, res)
    print(json.dumps({"novosLeads": len(res["novosLeads"]), "baseUpdates": len(res["baseUpdates"]),
                      "ids": [n["id"] for n in res["novosLeads"]], "pulados": res["pulados"]}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())

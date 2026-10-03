"""Promove empresas da base classificada da Explee a leads da Central de disparo, com a cadência de 3 toques.

A base (`scripts/classificar_base.py`) tem as empresas que receberam o cold e-mail da Explee e não responderam,
com segmento, pessoas, persona e faixa. Este passo transforma as da faixa pedida em documentos `leads` B0001…,
no formato que a página lê (`central/seed.py`), com os três toques prontos para a Letícia aquecer quando o
celular do decisor aparecer (`scripts/enriquecer_leads.py`). Só biblioteca padrão; não acessa o banco: lê JSON
e grava JSON, e quem grava na central é o Claude (ArtifactData).

    python3 -m scripts.promover_base promover --base dados/explee/base.json \
        --existentes dados/explee/existentes_docs.json --tier A --saida dados/explee/promover.json
    python3 -m scripts.promover_base recompor --entrada dados/explee/promover.json --saida dados/explee/promover.json

Decisões:
- Id `B` + 4 dígitos, depois do maior B dos existentes. A ordem é score desc e domínio, então rodar de novo com a
  mesma entrada dá os mesmos ids; empresa cujo domínio já está na central (`baseExplee.dominio` ou o domínio do `site`)
  é pulada, o que torna o passo idempotente.
- Segmento -> ICP da copy: associações vão no ICP3 (entidades), produtores de evento no ICP6 (eventos e feiras) e
  conselhos e advocacia no ICP2 (jurídico), ou no ICP3 se o nome é de conselho ou ordem. Segmento sem ICP é pulado.
- Canal WhatsApp sem telefone: `waLink` fica vazio, e a página só monta o link quando há destino (o contato que o
  enriquecimento achar e a Letícia escolher em "Usar na cadência"). Até lá o Enviar fica desativado.
- Migração sem enriquecer (decisão da Letícia, pelo custo): os docs entram sem telefone, com a flag
  "migrado sem enriquecer", `enriquecimento.migradoSemEnriquecer` e a pendência de achar o celular quando houver
  verba. Na central eles ficam na aba "Sem contato" até aparecer um destino.
- `fraseUnica` é uma linha por segmento, sem nenhum fato sobre a empresa: a base não traz pesquisa do lead.
- Região (msg/regiao.py): a copy de cada lead sai na versão da região ("MT", "fora" ou "?"), gravada em `regiao`.
  Sem telefone, a região vem do nome e do domínio; quando o enriquecimento acha o celular, o DDD passa a decidir, e
  `recompor` refaz os toques de quem ainda não recebeu nada (etapa 0 e nenhum `enviadoN`).
- Saudação: primeiro nome do decisor escolhido pela classificação (com "Dr."/"Dra." como no resto da central). Conta
  institucional no lugar de pessoa ("ANEAC Oficial", "CDL Anápolis") não serve: vale a próxima pessoa e, sem
  nenhuma, "pessoal da <empresa>".
"""
import argparse
import json
import os
import re
import sys
import unicodedata
from datetime import datetime, timezone

from central.seed import CAMPOS, ESTADO_INICIAL
from msg.checks import SAUDACAO, SEO_NOME, Personal, check_personal, check_toque, tem_emoji
from msg.compose import compose_whatsapp, wa_link
from msg.copy_v1 import TOQUES, VERSAO
from msg.enriquecimento import primeiro_nome
from msg.fotos import foto_para, linha_foto
from msg.prep import Lead
from msg.regiao import regiao as regiao_do_lead
from scripts.classificar_base import peso_pessoa
from scripts.enriquecer_leads import _dominio

ORDEM_BASE = 5000
FLAG = "base Explee"
FLAG_MIGRADO = "migrado sem enriquecer"
PENDENCIA = "Sem telefone: achar o celular do decisor quando houver verba"
TIPO_HIST = "explee"
CANAL = "WhatsApp"

# segmento da base: (ICP da copy, categoria, especialidade do perfil, frase do toque 1)
SEGMENTOS = {
    "Associações setoriais": (
        "ICP3", "Associação setorial", "Associação ou entidade que representa um setor",
        "Uma entidade que representa um setor tem pauta e vozes de sobra, e isso rende conversa o ano inteiro."),
    "produtores de evento e feiras": (
        "ICP6", "Eventos e feiras", "Produção de eventos e feiras",
        "Quem produz evento sabe o quanto se conversa nos bastidores, e boa parte disso merece ser gravada."),
    "Conselhos e advocacia": (
        "ICP2", "Advocacia", "Escritório de advocacia",
        "Tema jurídico técnico fica mais claro quando o próprio advogado explica, numa conversa sem pressa."),
}
# Dentro de "Conselhos e advocacia", o que é conselho ou ordem fala como entidade (ICP3).
CONSELHO = re.compile(r"(?i)\b(conselho|ordem|oab|cr[a-z]{1,3})\b")
SEGMENTO_CONSELHO = ("ICP3", "Conselho profissional", "Conselho profissional",
                     "Um conselho profissional recebe muita dúvida da categoria, e cada resposta pode virar conversa gravada.")
# Segmentos que a faixa A deixou de fora ("segmento sem cadência") e que entram quando a Letícia pede pela Base
# (scripts/base_explee.py processar): agro, cooperativas e gestão pública falam como entidade (ICP3); revendas,
# empresas médias e indústrias, como empresa de médio porte (ICP5).
SEGMENTOS_AMPLIADOS = {
    "Entidades do agro": (
        "ICP3", "Entidade do agro", "Entidade que representa produtores do agro",
        "Uma entidade do agro acompanha de perto o que muda no campo, e quem vive isso explica melhor numa conversa."),
    "Cooperativas agro": (
        "ICP3", "Cooperativa agro", "Cooperativa do agro",
        "Uma cooperativa tem muita história de cooperado para contar, e cada uma rende uma boa conversa gravada."),
    "Gestão pública": (
        "ICP3", "Gestão pública", "Órgão ou entidade de gestão pública",
        "Quem cuida de gestão pública tem muito a explicar para a população, e uma conversa gravada deixa isso mais claro."),
    "Revendas e agtechs": (
        "ICP5", "Revenda e agtech", "Revenda de insumos ou empresa de tecnologia para o agro",
        "Quem vende para o produtor sabe o valor de uma explicação bem feita, e ela fica melhor numa conversa gravada."),
    "Empresas B2B médias": (
        "ICP5", "Empresa B2B", "Empresa que vende para outras empresas",
        "Empresa que vende para outras empresas ganha confiança quando os próprios líderes explicam o que fazem."),
    "Indústrias regionais": (
        "ICP5", "Indústria regional", "Indústria regional",
        "Uma indústria regional tem processo e gente que pouca gente conhece, e isso rende conversa gravada."),
}

_UF = {"AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI",
       "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"}
_MASCULINOS = ("instituto", "conselho", "sindicato", "servico", "sistema", "grupo", "centro", "clube", "nucleo",
               "forum", "comite", "escritorio", "observatorio", "movimento", "colegio", "sebrae", "senai", "senac",
               "sesc", "sesi", "senar", "sindi")


# --------------------------------------------------------------------------- texto

def _norm(s) -> str:
    t = unicodedata.normalize("NFKD", str(s or "")).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", " ", t).strip()


def nome_curto(nome: str) -> str:
    """Nome da empresa sem sufixo de razão social, separadores de título nem emoji."""
    n = re.split(r"\s[-|–—]\s|\s*[|–—]\s*", nome or "")[0]
    n = re.sub(r"(?i)[\s,]+(ltda\.?|s/?a\.?|eireli|me|epp|oficial)$", "", n.strip())
    n = re.sub(r"(?i)\s+(e região|em (cuiabá|várzea grande|mato grosso))$", "", n)
    n = "".join(c for c in n if not tem_emoji(c)).strip(" ,.-")
    return re.sub(r"\s+", " ", n)


def _institucional(nome: str, empresa: str, dominio: str) -> bool:
    """A "pessoa" é a conta da própria instituição: o primeiro nome é palavra do nome ou do domínio da empresa,
    ou o nome termina numa UF ("Atratur Bonito MS")."""
    ps = (nome or "").split()
    if not ps:
        return True
    if ps[-1] in _UF and len(ps) > 1:
        return True
    primeiro = _norm(ps[0])
    marcas = set(_norm(empresa).split()) | set(_norm(dominio.split(".")[0]).split())
    return bool(primeiro) and primeiro in marcas


def _saudacao_pessoa(nome: str) -> str:
    s = primeiro_nome(re.sub(r"[^\wÀ-ÿ.\s'-]", " ", nome or ""))
    return s if s and SAUDACAO.match(s) and not SEO_NOME.search(s) else ""


def saudacao_empresa(nome: str) -> str:
    curto = nome_curto(nome)
    if not curto:
        return "Pessoal"
    artigo = "do" if _norm(curto).split()[0].startswith(_MASCULINOS) else "da"
    s = f"pessoal {artigo} {curto}"
    return s if SAUDACAO.match(s) and not SEO_NOME.search(s) else "Pessoal"


def pessoas_ordenadas(emp: dict) -> list[dict]:
    """Pessoas da empresa pela persona (o peso da classificação), com o decisor escolhido na frente e as contas
    institucionais no fim."""
    dec = (emp.get("decisor") or {}).get("person_id")
    return sorted(emp.get("pessoas") or [], key=lambda p: (
        _institucional(p.get("nome"), emp.get("nome"), emp.get("dominio") or ""), p.get("person_id") != dec,
        -peso_pessoa({"persona": p.get("persona") or "operacional", "cargo": p.get("cargo")}),
        not p.get("linkedin"), str(p.get("person_id"))))


def escolher_saudacao(emp: dict, pessoas: list[dict]) -> str:
    for p in pessoas:
        if _institucional(p.get("nome"), emp.get("nome"), emp.get("dominio") or ""):
            continue
        s = _saudacao_pessoa(p.get("nome"))
        if s:
            return s
    return saudacao_empresa(emp.get("nome") or emp.get("dominio") or "")


def perfil_segmento(emp: dict, ampliado: bool = False):
    """(ICP, categoria, especialidade, frase) do segmento; None se ele não tem cadência. `ampliado` inclui os
    segmentos que só entram a pedido, pela Base."""
    seg = emp.get("segmento") or ""
    if ampliado and seg in SEGMENTOS_AMPLIADOS:
        return SEGMENTOS_AMPLIADOS[seg]
    if seg not in SEGMENTOS:
        return None
    if seg == "Conselhos e advocacia" and CONSELHO.search(emp.get("nome") or ""):
        return SEGMENTO_CONSELHO
    return SEGMENTOS[seg]


# --------------------------------------------------------------------------- documento

def toques(icp: str, saudacao: str, curto: str, frase: str, foto: str, regiao: str = "MT") -> list[dict]:
    """Os três toques de WhatsApp na versão da região, sem link: o telefone vem do enriquecimento."""
    out = []
    for t in TOQUES:
        lf = linha_foto(foto) if t == 1 else ""
        out.append({"n": t, "mensagem": compose_whatsapp(t, icp, saudacao, curto, frase, lf, regiao), "waLink": "",
                    "assunto": "", "corpo": ""})
    return out


def checar(lid: str, doc: dict) -> list[str]:
    """Rubrica de tom e de forma da copy (msg.checks) aplicada ao lead promovido."""
    l = Lead(id=lid, icp=doc["icp"], nome=doc["nome"], categoria=doc["categoria"],
             especialidade=doc["perfil"]["especialidade"])
    p = Personal(id=lid, saudacao=doc["saudacao"], nome_curto=nome_curto(doc["nome"]) or doc["nome"],
                 frase=doc["fraseUnica"], fonte="Neutra")
    erros = check_personal(l, p)
    reg = doc.get("regiao") or "MT"
    for t in doc["toques"]:
        lf = linha_foto(doc["foto"]) if t["n"] == 1 else ""
        erros += check_toque(l, p, t["n"], t["mensagem"], t["waLink"], lf, reg)
    return erros


def doc_promovido(emp: dict, num: int, agora: str, ampliado: bool = False) -> dict:
    icp, categoria, especialidade, frase = perfil_segmento(emp, ampliado)
    pessoas = pessoas_ordenadas(emp)
    saudacao = escolher_saudacao(emp, pessoas)
    nome = (emp.get("nome") or "").strip() or emp["dominio"]
    curto = nome_curto(nome) or nome
    foto = foto_para(icp, nome, categoria, especialidade)
    campanhas = list(emp.get("campanhas") or [])
    principal = (emp.get("decisor") or {}).get("campanha") or (campanhas[0] if campanhas else emp.get("segmento"))
    decisores = [{"nome": (p.get("nome") or "").strip(), "cargo": (p.get("cargo") or "").strip(),
                  "linkedin": p.get("linkedin") or "", "fonte": f"Explee · campanha {p.get('campanha') or principal}"}
                 for p in pessoas if (p.get("nome") or "").strip()]
    reg = regiao_do_lead({"nome": nome, "site": emp["dominio"]})
    dados = {k: "" for k in CAMPOS}
    dados.update({
        "ordem": ORDEM_BASE + num, "nome": nome, "saudacao": saudacao, "icp": icp, "segmento": emp.get("segmento"),
        "categoria": categoria, "faixa": emp.get("tier") or "", "score": emp.get("score"), "bairro": "",
        "canal": CANAL, "telefone": "", "email": "", "site": emp["dominio"], "instagram": "",
        "fraseUnica": frase, "flags": [FLAG, FLAG_MIGRADO], "versaoCopy": VERSAO, "regiao": reg,
        "toques": toques(icp, saudacao, curto, frase, foto, reg), "foto": foto,
    })
    dados.update(ESTADO_INICIAL)
    dados.update({
        "contatoAtivo": None,
        "perfil": {"especialidade": especialidade, "porte": "", "cidade": "", "nota": None, "avaliacoes": None,
                   "fonteDados": "Explee", "fonteFrase": "Segmento"},
        "empresa": {}, "socios": [], "redes": {"linkedinEmpresa": "", "instagram": "", "youtube": ""},
        "decisores": decisores, "contatos": [], "sinais": [], "alertas": [], "pendencias": [PENDENCIA],
        "enriquecimento": {"status": "bruto", "migradoSemEnriquecer": True},
        "historico": [{"em": agora, "texto": f"Entrou da base Explee (faixa {emp.get('tier')}, campanha {principal}): "
                                             "já recebeu e-mail da Explee sem responder", "tipo": TIPO_HIST}],
        "baseExplee": {"dominio": emp["dominio"], "campanhas": campanhas,
                   "personIds": [p.get("person_id") for p in pessoas if p.get("person_id")],
                   "tier": emp.get("tier"), "score": emp.get("score")},
    })
    return dados


# --------------------------------------------------------------------------- promover

def _achatar(item: dict) -> dict:
    if isinstance(item.get("data"), dict) and "nome" not in item:
        return {"id": item["id"], **item["data"]}
    return item


def _dominios_existentes(existentes: list[dict]) -> dict:
    doms = {}
    for x in existentes or []:
        x = _achatar(x)
        for d in (_dominio(((x.get("baseExplee") or x.get("explee") or {}).get("dominio")) or ""), _dominio(x.get("site") or "")):
            if d:
                doms.setdefault(d, x.get("id"))
    return doms


def _proximo_b(existentes: list[dict]) -> int:
    nums = [int(m.group(1)) for x in existentes or [] if (m := re.fullmatch(r"B(\d+)", str(_achatar(x).get("id"))))]
    return max(nums, default=0) + 1


def promover(base: dict, existentes: list[dict], tier: str = "A", agora: str | None = None) -> dict:
    """{novos: [{id, data}], pulados: [{dominio, nome, motivo, id?}]}. Não gera nada que já esteja na central."""
    agora = agora or datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    doms = _dominios_existentes(existentes)
    num = _proximo_b(existentes)
    empresas = [e for e in base.get("empresas") or [] if e.get("tier") == tier]
    empresas.sort(key=lambda e: (-(e.get("score") or 0), _dominio(e.get("dominio") or "")))
    novos, pulados = [], []
    for emp in empresas:
        dom = _dominio(emp.get("dominio") or "")
        ref = {"dominio": emp.get("dominio") or "", "nome": emp.get("nome") or ""}
        if not dom:
            pulados.append({**ref, "motivo": "sem domínio"})
            continue
        if dom in doms:
            pulados.append({**ref, "id": doms[dom], "motivo": "já na central"})
            continue
        if perfil_segmento(emp) is None:
            pulados.append({**ref, "motivo": f"segmento sem cadência: {emp.get('segmento')}"})
            continue
        lid = f"B{num:04d}"
        dados = doc_promovido({**emp, "dominio": dom}, num, agora)
        erros = checar(lid, dados)
        if erros:
            pulados.append({**ref, "motivo": "copy reprovada: " + "; ".join(erros)})
            continue
        novos.append({"id": lid, "data": dados})
        doms[dom] = lid
        num += 1
    return {"novos": novos, "pulados": pulados}


# --------------------------------------------------------------------------- recompor

_LINK_TEL = re.compile(r"^https://wa\.me/(\d+)\?")


def motivo_travado(doc: dict) -> str:
    """Por que os toques do lead não podem mais mudar ("" se podem): algo já saiu ou ele não é da base Explee."""
    if not (doc.get("baseExplee") or FLAG in (doc.get("flags") or [])):
        return "não é da base Explee"
    if (doc.get("etapa") or 0) != 0:
        return f"etapa {doc.get('etapa')}"
    if any(doc.get(f"enviado{t}") for t in TOQUES):
        return "já teve envio"
    return ""


def recompor_doc(lid: str, doc: dict, agora: str) -> tuple[dict, str]:
    """(doc, motivo). Refaz os toques na versão da região atual (o DDD dos telefones, se já houver). Devolve o
    próprio doc, sem mudança, quando ele está travado (motivo) ou quando a região não mudou nada (motivo "")."""
    travado = motivo_travado(doc)
    if travado:
        return doc, travado
    reg = regiao_do_lead(doc)
    curto = nome_curto(doc["nome"]) or doc["nome"]
    novos = toques(doc["icp"], doc["saudacao"], curto, doc["fraseUnica"], doc["foto"], reg)
    antigos = {t.get("n"): t for t in doc.get("toques") or []}
    for t in novos:
        m = _LINK_TEL.match((antigos.get(t["n"]) or {}).get("waLink") or "")
        if m:
            t["waLink"] = wa_link(m.group(1), t["mensagem"])
    if reg == doc.get("regiao") and [t["mensagem"] for t in novos] == [t.get("mensagem") for t in doc.get("toques") or []]:
        return doc, ""
    novo = {**doc, "regiao": reg, "toques": novos}
    erros = checar(lid, novo)
    if erros:
        return doc, "copy reprovada: " + "; ".join(erros)
    novo["historico"] = (list(doc.get("historico") or []) + [
        {"em": agora, "texto": f"Toques refeitos para a região {reg} (antes {doc.get('regiao') or 'MT'})",
         "tipo": TIPO_HIST}])[-100:]
    return novo, ""


def recompor(entrada, agora: str | None = None):
    """Refaz os toques dos docs ({novos: [{id, data}]} do promover ou lista de leads da central), na mesma forma
    da entrada. Devolve (saida, relatorio)."""
    agora = agora or datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    itens = entrada["novos"] if isinstance(entrada, dict) else entrada
    rel = {"recompostos": [], "iguais": [], "travados": []}
    saida_itens = []
    for item in itens:
        embrulhado = isinstance(item.get("data"), dict) and "nome" not in item
        lid, doc = item["id"], (item["data"] if embrulhado else {k: v for k, v in item.items() if k != "id"})
        novo, motivo = recompor_doc(lid, doc, agora)
        if novo is not doc:
            rel["recompostos"].append({"id": lid, "de": doc.get("regiao") or "MT", "para": novo["regiao"]})
        elif motivo:
            rel["travados"].append({"id": lid, "motivo": motivo})
        else:
            rel["iguais"].append(lid)
        saida_itens.append({"id": lid, "data": novo} if embrulhado else {"id": lid, **novo})
    saida = {**entrada, "novos": saida_itens} if isinstance(entrada, dict) else saida_itens
    return saida, rel


# --------------------------------------------------------------------------- CLI

def _ler(caminho):
    with open(caminho, encoding="utf-8") as fh:
        return json.load(fh)


def _gravar(caminho, dados):
    os.makedirs(os.path.dirname(os.path.abspath(caminho)), exist_ok=True)
    with open(caminho, "w", encoding="utf-8") as fh:
        json.dump(dados, fh, ensure_ascii=False, indent=1)


def main(argv=None):
    ap = argparse.ArgumentParser(prog="promover_base")
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("promover")
    p.add_argument("--base", required=True)
    p.add_argument("--existentes", required=True, help="JSON com os leads da central ({id, ...} ou {id, data})")
    p.add_argument("--tier", default="A")
    p.add_argument("--saida", required=True)
    r = sub.add_parser("recompor", help="refaz os toques pela região depois do enriquecimento (só etapa 0, sem envio)")
    r.add_argument("--entrada", required=True, help="promover.json ou lista de leads da central")
    r.add_argument("--saida", required=True)
    a = ap.parse_args(argv)
    if a.cmd == "recompor":
        saida, rel = recompor(_ler(a.entrada))
        _gravar(a.saida, saida)
        print(json.dumps({"recompostos": len(rel["recompostos"]), "iguais": len(rel["iguais"]),
                          "travados": rel["travados"], "mudancas": rel["recompostos"]}, ensure_ascii=False))
        return 0
    res = promover(_ler(a.base), _ler(a.existentes), a.tier)
    _gravar(a.saida, res)
    por_seg, por_reg = {}, {}
    for n in res["novos"]:
        por_seg[n["data"]["segmento"]] = por_seg.get(n["data"]["segmento"], 0) + 1
        por_reg[n["data"]["regiao"]] = por_reg.get(n["data"]["regiao"], 0) + 1
    motivos = {}
    for x in res["pulados"]:
        m = x["motivo"].split(":")[0]
        motivos[m] = motivos.get(m, 0) + 1
    print(json.dumps({"novos": len(res["novos"]), "porSegmento": por_seg, "porRegiao": por_reg, "pulados": motivos},
                     ensure_ascii=False))


if __name__ == "__main__":
    sys.exit(main())

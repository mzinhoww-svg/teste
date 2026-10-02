"""Promove empresas da base classificada da Explee a leads da Central de disparo, com a cadência de 3 toques.

A base (`scripts/classificar_base.py`) tem as empresas que receberam o cold e-mail da Explee e não responderam,
com segmento, pessoas, persona e faixa. Este passo transforma as da faixa pedida em documentos `leads` B0001…,
no formato que a página lê (`central/seed.py`), com os três toques prontos para a Letícia aquecer quando o
celular do decisor aparecer (`scripts/enriquecer_leads.py`). Só biblioteca padrão; não acessa o banco: lê JSON
e grava JSON, e quem grava na central é o Claude (ArtifactData).

    python3 -m scripts.promover_base promover --base dados/explee/base.json \
        --existentes dados/explee/existentes_docs.json --tier A --saida dados/explee/promover.json

Decisões:
- Id `B` + 4 dígitos, depois do maior B dos existentes. A ordem é score desc e domínio, então rodar de novo com a
  mesma entrada dá os mesmos ids; empresa cujo domínio já está na central (`explee.dominio` ou o domínio do `site`)
  é pulada, o que torna o passo idempotente.
- Segmento -> ICP da copy: associações vão no ICP3 (entidades), produtores de evento no ICP6 (eventos e feiras) e
  conselhos e advocacia no ICP2 (jurídico), ou no ICP3 se o nome é de conselho ou ordem. Segmento sem ICP é pulado.
- Canal WhatsApp sem telefone: `waLink` fica vazio, e a página só monta o link quando há destino (o contato que o
  enriquecimento achar e a Letícia escolher em "Usar na cadência"). Até lá o Enviar fica desativado.
- `fraseUnica` é uma linha por segmento, sem nenhum fato sobre a empresa: a base não traz pesquisa do lead.
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
from msg.compose import compose_whatsapp
from msg.copy_v1 import TOQUES, VERSAO
from msg.enriquecimento import primeiro_nome
from msg.fotos import foto_para, linha_foto
from msg.prep import Lead
from scripts.classificar_base import peso_pessoa
from scripts.enriquecer_leads import _dominio

ORDEM_BASE = 5000
FLAG = "base Explee"
PENDENCIA = "Achar celular do decisor"
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


def perfil_segmento(emp: dict):
    seg = emp.get("segmento") or ""
    if seg not in SEGMENTOS:
        return None
    if seg == "Conselhos e advocacia" and CONSELHO.search(emp.get("nome") or ""):
        return SEGMENTO_CONSELHO
    return SEGMENTOS[seg]


# --------------------------------------------------------------------------- documento

def toques(icp: str, saudacao: str, curto: str, frase: str, foto: str) -> list[dict]:
    """Os três toques de WhatsApp, sem link: o telefone vem do enriquecimento."""
    out = []
    for t in TOQUES:
        lf = linha_foto(foto) if t == 1 else ""
        out.append({"n": t, "mensagem": compose_whatsapp(t, icp, saudacao, curto, frase, lf), "waLink": "",
                    "assunto": "", "corpo": ""})
    return out


def checar(lid: str, doc: dict) -> list[str]:
    """Rubrica de tom e de forma da copy (msg.checks) aplicada ao lead promovido."""
    l = Lead(id=lid, icp=doc["icp"], nome=doc["nome"], categoria=doc["categoria"],
             especialidade=doc["perfil"]["especialidade"])
    p = Personal(id=lid, saudacao=doc["saudacao"], nome_curto=nome_curto(doc["nome"]) or doc["nome"],
                 frase=doc["fraseUnica"], fonte="Neutra")
    erros = check_personal(l, p)
    for t in doc["toques"]:
        lf = linha_foto(doc["foto"]) if t["n"] == 1 else ""
        erros += check_toque(l, p, t["n"], t["mensagem"], t["waLink"], lf)
    return erros


def doc_promovido(emp: dict, num: int, agora: str) -> dict:
    icp, categoria, especialidade, frase = perfil_segmento(emp)
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
    dados = {k: "" for k in CAMPOS}
    dados.update({
        "ordem": ORDEM_BASE + num, "nome": nome, "saudacao": saudacao, "icp": icp, "segmento": emp.get("segmento"),
        "categoria": categoria, "faixa": emp.get("tier") or "", "score": emp.get("score"), "bairro": "",
        "canal": CANAL, "telefone": "", "email": "", "site": emp["dominio"], "instagram": "",
        "fraseUnica": frase, "flags": [FLAG], "versaoCopy": VERSAO,
        "toques": toques(icp, saudacao, curto, frase, foto), "foto": foto,
    })
    dados.update(ESTADO_INICIAL)
    dados.update({
        "contatoAtivo": None,
        "perfil": {"especialidade": especialidade, "porte": "", "cidade": "", "nota": None, "avaliacoes": None,
                   "fonteDados": "Explee", "fonteFrase": "Segmento"},
        "empresa": {}, "socios": [], "redes": {"linkedinEmpresa": "", "instagram": "", "youtube": ""},
        "decisores": decisores, "contatos": [], "sinais": [], "alertas": [], "pendencias": [PENDENCIA],
        "enriquecimento": {"status": "bruto"},
        "historico": [{"em": agora, "texto": f"Entrou da base Explee (faixa {emp.get('tier')}, campanha {principal}): "
                                             "já recebeu e-mail da Explee sem responder", "tipo": TIPO_HIST}],
        "explee": {"dominio": emp["dominio"], "campanhas": campanhas,
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
        for d in (_dominio((x.get("explee") or {}).get("dominio") or ""), _dominio(x.get("site") or "")):
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
    a = ap.parse_args(argv)
    res = promover(_ler(a.base), _ler(a.existentes), a.tier)
    _gravar(a.saida, res)
    por_seg = {}
    for n in res["novos"]:
        por_seg[n["data"]["segmento"]] = por_seg.get(n["data"]["segmento"], 0) + 1
    motivos = {}
    for x in res["pulados"]:
        m = x["motivo"].split(":")[0]
        motivos[m] = motivos.get(m, 0) + 1
    print(json.dumps({"novos": len(res["novos"]), "porSegmento": por_seg, "pulados": motivos}, ensure_ascii=False))


if __name__ == "__main__":
    sys.exit(main())

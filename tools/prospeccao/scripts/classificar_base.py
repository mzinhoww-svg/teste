"""Classificação da base da Explee por segmento, persona e faixa (Central de disparo da Reiners).

A Explee mandou o cold e-mail para ~5,8 mil pessoas. Este script transforma essa base num mapa por empresa para a
Letícia escolher quem entra na cadência de 3 toques (WhatsApp/e-mail ao decisor). Só biblioteca padrão. Não acessa
o banco da central: lê JSON e grava JSON, Markdown e CSV. Os arquivos de `dados/` têm dados pessoais e ficam fora
do git.

    python3 -m scripts.classificar_base classificar --inbox dados/explee/inbox.json \
        --pessoas dados/explee/pessoas.json [--existentes dados/explee/leads.json] \
        --saida dados/explee/base.json --resumo dados/explee/resumo.md --csv-dir dados/explee/segmentos/

Entradas:
- inbox: {campanhas: {id: {nome, projeto}}, contatos: [{person_id, campaign_id, campanha, projeto, latest_intent,
  sent_count, reply_count, ..., email, name}]}
- pessoas: {person_id: {lead: {name, email, job_title, company_name, company_domain, linkedin_url, country}, intent}}
- existentes (opcional): [{id, site, email, contatos}] da central; serve só para excluir quem já está lá.

Decisões (na ordem em que são aplicadas):
1. Empresa = `company_domain` normalizado (minúsculo, sem www). Sem domínio, vale o domínio do e-mail (se não for
   provedor genérico), depois o nome da empresa, depois a própria pessoa.
2. Empresa já na central (domínio do site, do e-mail ou dos e-mails dos contatos de um lead existente, ignorando
   provedores e redes sociais) sai inteira: motivo "já na central".
3. Intenção da pessoa: vale `latest_intent` do inbox e, se vazio, o `intent` de pessoas.json; uma negativa em
   qualquer um dos dois basta.
   - `not_interested` ou intenção de descadastro (unsubscribe, opt-out, do not contact, remover) tira a EMPRESA
     inteira: alguém de lá já recusou e insistir com colegas queima a marca. Motivos "não tem interesse" e
     "pediu descadastro".
   - `recipient_gone` e `email_changed` tiram só a pessoa ("saiu da empresa", "e-mail mudou"); a empresa segue se
     sobrar alguém.
   - `out_of_office`, `auto_acknowledgement` e `self_reply` são neutros: não excluem e não contam como resposta.
4. País: BR ou vazio passa; outro país tira a pessoa ("fora do Brasil").
   Se uma empresa fica sem nenhuma pessoa pelos itens 3 e 4, ela sai com o motivo da primeira pessoa excluída.
5. Projeto 36223 (inglês, oferta de automação de vendas/CRM) é outra oferta: essas pessoas, já filtradas pelos
   itens 2 a 4, vão para `outraOferta`, agrupadas por empresa, sem score nem faixa. Uma empresa que também tem
   pessoas do projeto 36217 aparece nas duas listas, cada uma com as suas pessoas.
6. Persona pelo cargo (português e inglês, sem acento e sem caixa), testada nesta ordem:
   - "operacional" se o cargo é júnior (analista, assistente, auxiliar, estagiário, trainee, intern, secretária
     sem "executiva"), mesmo que fale de marketing: o score quer quem decide ou patrocina a pauta;
   - "comunicacao": marketing, comunicação, imprensa, jornalista, relações públicas/institucionais, assessoria,
     porta-voz, eventos, criação, CMO. Vem antes de "decisor": a diretora de marketing é a melhor porta;
   - "decisor": sócio, fundador, dono, CEO/chief, presidente (e vice), diretor, superintendente, owner, partner,
     head, gerente geral, managing, conselheiro, secretário executivo, chefe de gabinete;
   - "gestao": gerente, coordenador, supervisor, manager, lead, encarregado;
   - "operacional": o resto (inclusive cargo vazio).
   Peso no score: decisor 18 (20 se é o dono da casa: sócio, fundador, dono, CEO, presidente, sem "vice"),
   comunicacao 19 (≈ decisor), gestao 11, operacional 4.
7. Melhor pessoa da empresa (`decisor`): quente > respondeu > peso da persona > tem LinkedIn > menor person_id.
   Quem respondeu é o canal quente, mesmo sem ser o cargo mais alto. A campanha dessa pessoa é a campanha
   principal e dá o `segmento`; `campanhas` guarda todas as campanhas em que a empresa apareceu. O nome da
   pessoa vem da lista da Explee; se quem respondeu assinou com outro nome, ele fica em `nome_resposta`.
8. Score 0–100 = engajamento (0–35) + encaixe da campanha (0–25) + persona do decisor (0–20) + LinkedIn (0–10)
   + cobertura (0–10).
   - Engajamento: quente 35, respondeu 25, neutro/sem resposta 0.
   - Encaixe: taxa de resposta da campanha principal no projeto 36217, normalizada pela melhor (Associações 2,8%
     = 25). Empresas B2B médias e Indústrias regionais não têm taxa informada e amostra pequena: usam 1,1%.
   - LinkedIn: 10 se o decisor tem (o enriquecimento de telefone precisa dele), 5 se só outra pessoa tem.
   - Cobertura: 5 se a empresa tem mais de uma pessoa (mais portas), 5 se tem um decisor e alguém de comunicação
     (quem assina e quem toca a pauta). Também desempata: sem ela os scores empilham em poucos valores e não dá
     para cortar a faixa A perto de 12%.
9. Faixas: quente ou respondeu é sempre A (`quente: true` para hot lead). Os cortes saem da distribuição real:
   o corte A é o score que deixa a faixa A (já contando as forçadas) mais perto de 12,5% das empresas; o corte B,
   o que deixa a B mais perto de 30%. Os cortes e as contagens vão para o resumo e para a saída do comando.
"""
import argparse
import csv
import json
import os
import re
import sys
import unicodedata
from collections import Counter, defaultdict

from scripts.enriquecer_leads import _dominio
from scripts.explee_hot_leads import DOMINIOS_GENERICOS

PROJETO_REINERS = 36217
PROJETO_OUTRA_OFERTA = 36223

INTENCAO_QUENTE = "hot_lead"
INTENCOES_NEUTRAS = {"out_of_office", "auto_acknowledgement", "self_reply"}
MOTIVO_POR_INTENCAO = {"not_interested": "não tem interesse", "recipient_gone": "saiu da empresa",
                       "email_changed": "e-mail mudou"}
MOTIVO_DESCADASTRO = "pediu descadastro"
MOTIVO_CENTRAL = "já na central"
MOTIVO_PAIS = "fora do Brasil"
# Estas recusas valem para a empresa toda; as outras intenções negativas só tiram a pessoa.
MOTIVOS_DA_EMPRESA = {"não tem interesse", MOTIVO_DESCADASTRO}
_DESCADASTRO = re.compile(r"unsub|opt.?out|do.?not.?contact|dont.?contact|remov|descadastr|stop")

PAISES_OK = {"", "br", "bra", "brazil", "brasil"}
# Hosts que não identificam a empresa num lead da central.
HOSTS_GENERICOS = DOMINIOS_GENERICOS | {"instagram.com", "facebook.com", "fb.com", "linkedin.com", "linktr.ee",
                                        "wa.me", "api.whatsapp.com", "whatsapp.com", "google.com", "goo.gl",
                                        "maps.google.com", "youtube.com", "tiktok.com", "twitter.com", "x.com",
                                        "sites.google.com", "wixsite.com", "blogspot.com"}

# Taxa de resposta (%) por campanha do projeto 36217, chave sem acento e minúscula.
TAXA_PADRAO = 1.1
TAXA_RESPOSTA = {"associacoes setoriais": 2.8, "produtores de evento e feiras": 2.4, "conselhos e advocacia": 2.1,
                 "entidades do agro": 1.1, "revendas e agtechs": 1.1, "cooperativas agro": 0.5,
                 "gestao publica": 0.0, "empresas b2b medias": TAXA_PADRAO, "industrias regionais": TAXA_PADRAO}

PESO_PERSONA = {"decisor": 18, "comunicacao": 19, "gestao": 11, "operacional": 4}
PONTOS_TOPO = 2  # decisor dono da casa (sócio, fundador, dono, CEO, presidente): 20
PONTOS_QUENTE, PONTOS_RESPONDEU = 35, 25
PONTOS_ENCAIXE = 25
PONTOS_LINKEDIN_DECISOR, PONTOS_LINKEDIN_OUTRO = 10, 5
PONTOS_VARIAS_PESSOAS, PONTOS_PAR = 5, 5
ALVO_A, ALVO_B = 0.125, 0.30
FAIXAS = ("A", "B", "C")
COLUNAS_CSV = ["tier", "score", "empresa", "dominio", "decisor", "cargo", "persona", "linkedin", "campanha",
               "quente", "respondeu"]


# --------------------------------------------------------------------------- texto

def _norm(s) -> str:
    """Minúsculo, sem acento, só letras/números separados por um espaço."""
    t = unicodedata.normalize("NFKD", str(s or "")).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", " ", t).strip()


def _slug(s) -> str:
    return _norm(s).replace(" ", "-") or "sem-segmento"


# --------------------------------------------------------------------------- persona

_JUNIOR = re.compile(r"\b(analista|analyst|assistente|assistant|auxiliar|estagiari[oa]|estagio|intern|internship|"
                     r"trainee|aprendiz|junior|jr|recepcionista|receptionist|atendente)\b")
_SECRETARIA = re.compile(r"\b(secretari[oa]|secretary)\b")
_SECRETARIO_EXEC = re.compile(r"\b(secretari[oa] execut|executive secretary|secretari[oa] (geral|municipal|estadual|"
                              r"adjunt|de estado|da |do |de )|general secretary|secretary general|first secretary)")
_COMUNICACAO = re.compile(r"\b(marketing|mkt|comunica\w*|communication\w*|imprensa|press|jornalist\w*|journalist|"
                          r"relacoes (publicas|institucionais|governamentais)|public relations|pr|"
                          r"institutional relations|assessoria|assessor[a]? de (imprensa|comunicacao|marketing)|porta voz|spokes\w*|"
                          r"eventos?|events?|"
                          r"criacao|creative|branding|brand|conteudo|content|cmo|midias? sociais|social media|public affairs|"
                          r"government relations|cerimonial\w*|ceremonial\w*|editor[a]?|produtor[a]? cultural|"
                          r"cultural producer)\b")
_DECISOR = re.compile(r"\b(soci[oa]s?|fundador[a]?|co ?fundador[a]?|founder|co ?founder|don[oa]|owner|co ?owner|"
                      r"propriet\w*|ceo|cfo|coo|cto|cio|chief|president\w*|vice|vp|diretor[a]?|diretoria|director|"
                      r"superintendent\w*|partner|head|gerente geral|general manager|managing|administrador[a]?|"
                      r"conselheir[oa]|board|chefe de gabinete|chief of staff|prefeit[oa]|mayor|empresari[oa]|reitor[a]?|"
                      r"pro reitor[a]?|rector|pro rector)\b")
_GESTAO = re.compile(r"\b(gerente|gestor[a]?|coordenador[a]?|coordinator|supervisor[a]?|manager|lead|lider|"
                     r"leader|encarregad[oa]|chefe|executiv[oa]|executive)\b")


_TOPO = re.compile(r"\b(soci[oa]s?|fundador[a]?|founder|don[oa]|owner|propriet\w*|ceo|chief executive|"
                   r"president[ea]?|presidency|managing partner|empresari[oa]|prefeit[oa]|mayor|reitor[a]?|rector)\b")
_VICE = re.compile(r"\b(vice|vp|assistant|adjunt[oa]|deputy|substitut[oa])\b")


def persona(cargo: str) -> str:
    """Classe do cargo: decisor, comunicacao, gestao ou operacional (ordem e motivos no docstring do módulo)."""
    c = _norm(cargo)
    if not c:
        return "operacional"
    if _JUNIOR.search(c):
        return "operacional"
    if _COMUNICACAO.search(c):
        return "comunicacao"
    if _SECRETARIO_EXEC.search(c) or _DECISOR.search(c):
        return "decisor"
    if _SECRETARIA.search(c):
        return "operacional"
    if _GESTAO.search(c):
        return "gestao"
    return "operacional"


# --------------------------------------------------------------------------- pessoas

def _host(v) -> str:
    return _dominio(str(v or "")).strip(".")


def _dominio_email(email) -> str:
    e = str(email or "").strip().lower()
    return e.rsplit("@", 1)[1].strip(".") if "@" in e else ""


def _email_visivel(*emails) -> str:
    for e in emails:
        e = str(e or "").strip().lower()
        if "@" in e and "*" not in e:
            return e
    return ""


def _intencao(contato: dict, pessoa: dict) -> str:
    a = (contato.get("latest_intent") or "").strip()
    b = (pessoa.get("intent") or "").strip()
    for i in (a, b):
        if motivo_intencao(i):
            return i
    return a or b


def motivo_intencao(intent) -> str | None:
    """Motivo de exclusão de uma intenção, ou None se ela não exclui."""
    i = (intent or "").strip().lower()
    if not i:
        return None
    if i in MOTIVO_POR_INTENCAO:
        return MOTIVO_POR_INTENCAO[i]
    if _DESCADASTRO.search(i):
        return MOTIVO_DESCADASTRO
    return None


def _chave_empresa(lead: dict, pid: str) -> str:
    d = _host(lead.get("company_domain"))
    if d:
        return d
    de = _dominio_email(lead.get("email"))
    if de and de not in DOMINIOS_GENERICOS:
        return de
    nome = _norm(lead.get("company_name"))
    return f"nome:{nome.replace(' ', '-')}" if nome else f"pessoa:{pid}"


def montar_pessoas(inbox: dict, pessoas: dict) -> list[dict]:
    """Uma linha por pessoa, juntando o contato do inbox com o lead de pessoas.json."""
    campanhas = inbox.get("campanhas") or {}
    saida = []
    for c in inbox.get("contatos") or []:
        pid = str(c.get("person_id"))
        p = pessoas.get(pid) or {}
        lead = p.get("lead") or {}
        cid = c.get("campaign_id")
        info = campanhas.get(str(cid)) or {}
        intent = _intencao(c, p)
        replies = c.get("reply_count") or 0
        quente = intent == INTENCAO_QUENTE
        saida.append({
            "person_id": pid,
            "nome": (lead.get("name") or c.get("name") or "").strip(),
            "nome_resposta": (c.get("name") or "").strip(),
            "cargo": (lead.get("job_title") or "").strip(),
            "persona": persona(lead.get("job_title")),
            "linkedin": (lead.get("linkedin_url") or "").strip(),
            "email_visivel": _email_visivel(c.get("email"), lead.get("email")),
            "intent": intent or None,
            "quente": quente,
            "respondeu": quente or (replies > 0 and intent not in INTENCOES_NEUTRAS and not motivo_intencao(intent)),
            "pais": (lead.get("country") or "").strip(),
            "empresa": (lead.get("company_name") or "").strip(),
            "dominio": _chave_empresa(lead, pid),
            "campaign_id": cid,
            "campanha": c.get("campanha") or info.get("nome") or (f"#{cid}" if cid is not None else ""),
            "projeto": c.get("projeto") if c.get("projeto") is not None else info.get("projeto"),
        })
    return saida


# --------------------------------------------------------------------------- central

def dominios_central(existentes: list[dict] | None) -> set[str]:
    """Domínios das empresas que já estão na central (site, e-mail e e-mails dos contatos)."""
    doms = set()
    for l in existentes or []:
        cands = [_host(l.get("site")), _dominio_email(l.get("email"))]
        for c in l.get("contatos") or []:
            cands += [_dominio_email(c.get("email")), _host(c.get("site"))]
        for d in cands:
            if d and d not in HOSTS_GENERICOS and "." in d:
                doms.add(d)
    return doms


# --------------------------------------------------------------------------- empresa e score

def peso_pessoa(p: dict) -> int:
    """Pontos de persona (0–20): o peso da classe, +2 para o decisor dono da casa (não vice)."""
    peso = PESO_PERSONA[p["persona"]]
    c = _norm(p.get("cargo"))
    if p["persona"] == "decisor" and _TOPO.search(c) and not _VICE.search(c):
        peso += PONTOS_TOPO
    return peso


def _ordem_pessoa(p: dict):
    return (-int(p["quente"]), -int(p["respondeu"]), -peso_pessoa(p), -int(bool(p["linkedin"])),
            p["person_id"])


def encaixe(campanha: str) -> int:
    taxa = TAXA_RESPOSTA.get(_norm(campanha), TAXA_PADRAO)
    return round(PONTOS_ENCAIXE * taxa / max(TAXA_RESPOSTA.values()))


def score_empresa(decisor: dict, pessoas: list[dict]) -> int:
    eng = PONTOS_QUENTE if any(p["quente"] for p in pessoas) else (
        PONTOS_RESPONDEU if any(p["respondeu"] for p in pessoas) else 0)
    li = PONTOS_LINKEDIN_DECISOR if decisor["linkedin"] else (
        PONTOS_LINKEDIN_OUTRO if any(p["linkedin"] for p in pessoas) else 0)
    classes = {p["persona"] for p in pessoas}
    cobertura = (PONTOS_VARIAS_PESSOAS if len(pessoas) > 1 else 0) + (
        PONTOS_PAR if {"decisor", "comunicacao"} <= classes else 0)
    return min(100, eng + encaixe(decisor["campanha"]) + peso_pessoa(decisor) + li + cobertura)


def _pessoa_saida(p: dict) -> dict:
    d = {k: p[k] for k in ("person_id", "nome", "cargo", "persona", "linkedin")}
    if p["email_visivel"]:
        d["email_visivel"] = p["email_visivel"]
    if p["nome_resposta"] and _norm(p["nome_resposta"]) != _norm(p["nome"]):
        d["nome_resposta"] = p["nome_resposta"]  # quem respondeu o e-mail não é a pessoa da lista
    d["intent"] = p["intent"]
    d["campanha"] = p["campanha"]
    return d


def montar_empresa(dominio: str, pessoas: list[dict], com_score=True) -> dict:
    pessoas = sorted(pessoas, key=_ordem_pessoa)
    dec = pessoas[0]
    nomes = Counter(p["empresa"] for p in pessoas if p["empresa"])
    campanhas = []
    for p in pessoas:
        if p["campanha"] not in campanhas:
            campanhas.append(p["campanha"])
    emp = {"dominio": dominio, "nome": nomes.most_common(1)[0][0] if nomes else dominio,
           "segmento": dec["campanha"], "campanhas": campanhas, "tier": None, "score": None,
           "quente": any(p["quente"] for p in pessoas), "respondeu": any(p["respondeu"] for p in pessoas),
           "pessoas": [_pessoa_saida(p) for p in pessoas], "decisor": _pessoa_saida(dec)}
    if com_score:
        emp["score"] = score_empresa(dec, pessoas)
    return emp


def _corte(scores: list[int], forcadas: int, alvo: float, total: int) -> int:
    """Score mínimo que deixa (forcadas + scores >= corte) mais perto de alvo * total; 101 se nenhum ajuda."""
    melhor, erro = 101, abs(forcadas - alvo * total)
    for s in sorted(set(scores), reverse=True):
        n = forcadas + sum(1 for x in scores if x >= s)
        if abs(n - alvo * total) < erro:
            melhor, erro = s, abs(n - alvo * total)
    return melhor


def atribuir_faixas(empresas: list[dict]) -> dict:
    """Preenche `tier` (A/B/C) e devolve {A: corte, B: corte}."""
    total = len(empresas)
    forcadas = [e for e in empresas if e["quente"] or e["respondeu"]]
    livres = [e for e in empresas if not (e["quente"] or e["respondeu"])]
    corte_a = _corte([e["score"] for e in livres], len(forcadas), ALVO_A, total)
    resto = [e["score"] for e in livres if e["score"] < corte_a]
    corte_b = _corte(resto, 0, ALVO_B, total)
    for e in empresas:
        if e["quente"] or e["respondeu"] or e["score"] >= corte_a:
            e["tier"] = "A"
        elif e["score"] >= corte_b:
            e["tier"] = "B"
        else:
            e["tier"] = "C"
    return {"A": corte_a, "B": corte_b}


# --------------------------------------------------------------------------- classificar

def _excluido(nivel, motivo, dominio, nome, pessoas, person_id=None) -> dict:
    d = {"nivel": nivel, "motivo": motivo, "dominio": dominio, "nome": nome, "pessoas": pessoas}
    if person_id is not None:
        d["person_id"] = person_id
    return d


def classificar(inbox: dict, pessoas: dict, existentes: list[dict] | None = None) -> dict:
    linhas = montar_pessoas(inbox, pessoas)
    na_central = dominios_central(existentes)
    por_empresa = defaultdict(list)
    for p in linhas:
        por_empresa[p["dominio"]].append(p)

    excluidos, empresas, outra = [], [], []
    for dominio, ps in por_empresa.items():
        nome = Counter(p["empresa"] for p in ps if p["empresa"]).most_common(1)
        nome = nome[0][0] if nome else dominio
        if dominio in na_central or _dominio_email_central(ps, na_central):
            excluidos.append(_excluido("empresa", MOTIVO_CENTRAL, dominio, nome, len(ps)))
            continue
        recusa = next((motivo_intencao(p["intent"]) for p in ps
                       if motivo_intencao(p["intent"]) in MOTIVOS_DA_EMPRESA), None)
        if recusa:
            excluidos.append(_excluido("empresa", recusa, dominio, nome, len(ps)))
            continue
        vivas, motivos = [], []
        for p in ps:
            m = motivo_intencao(p["intent"]) or (MOTIVO_PAIS if _norm(p["pais"]) not in PAISES_OK else None)
            if m:
                motivos.append((m, p))
            else:
                vivas.append(p)
        if not vivas:
            excluidos.append(_excluido("empresa", motivos[0][0], dominio, nome, len(ps)))
            continue
        for m, p in motivos:
            excluidos.append(_excluido("pessoa", m, dominio, nome, 1, p["person_id"]))
        reiners = [p for p in vivas if p["projeto"] != PROJETO_OUTRA_OFERTA]
        outras = [p for p in vivas if p["projeto"] == PROJETO_OUTRA_OFERTA]
        if reiners:
            emp = montar_empresa(dominio, reiners)
            todas = emp["campanhas"] + [p["campanha"] for p in outras]
            emp["campanhas"] = list(dict.fromkeys(todas))
            empresas.append(emp)
        if outras:
            outra.append(montar_empresa(dominio, outras, com_score=False))

    cortes = atribuir_faixas(empresas)
    ordem = {f: i for i, f in enumerate(FAIXAS)}
    empresas.sort(key=lambda e: (ordem[e["tier"]], -e["score"], e["nome"].lower()))
    outra.sort(key=lambda e: (-int(e["quente"]), e["nome"].lower()))
    return {"empresas": empresas, "excluidos": excluidos, "outraOferta": outra,
            "resumo": resumir(empresas, excluidos, outra, cortes)}


def _dominio_email_central(ps: list[dict], na_central: set[str]) -> bool:
    return any(_dominio_email(p["email_visivel"]) in na_central for p in ps if p["email_visivel"])


# --------------------------------------------------------------------------- resumo

def _ordem_segmento(seg: str):
    return (-TAXA_RESPOSTA.get(_norm(seg), -1), _norm(seg))


def resumir(empresas, excluidos, outra, cortes) -> dict:
    por_seg = {}
    for e in empresas:
        s = por_seg.setdefault(e["segmento"], {"empresas": 0, "pessoas": 0, "A": 0, "B": 0, "C": 0, "quentes": 0,
                                               "responderam": 0, "decisorComLinkedin": 0})
        s["empresas"] += 1
        s["pessoas"] += len(e["pessoas"])
        s[e["tier"]] += 1
        s["quentes"] += int(e["quente"])
        s["responderam"] += int(e["respondeu"])
        s["decisorComLinkedin"] += int(bool(e["decisor"]["linkedin"]))
    por_seg = {k: por_seg[k] for k in sorted(por_seg, key=_ordem_segmento)}
    totais = {k: sum(s[k] for s in por_seg.values()) for k in
              ("empresas", "pessoas", "A", "B", "C", "quentes", "responderam", "decisorComLinkedin")}
    exc = {}
    for x in excluidos:
        m = exc.setdefault(x["motivo"], {"empresas": 0, "pessoas": 0})
        m["empresas"] += int(x["nivel"] == "empresa")
        m["pessoas"] += x["pessoas"]
    exc = dict(sorted(exc.items(), key=lambda kv: -kv[1]["pessoas"]))
    personas = Counter(e["decisor"]["persona"] for e in empresas)
    return {"porSegmento": por_seg, "totais": totais, "cortes": cortes, "exclusoes": exc,
            "personaDecisor": dict(personas.most_common()),
            "outraOferta": {"empresas": len(outra), "pessoas": sum(len(e["pessoas"]) for e in outra),
                            "quentes": sum(int(e["quente"]) for e in outra)}}


def _pct(n, total) -> str:
    return f"{100 * n / total:.1f}%".replace(".", ",") if total else "0%"


def resumo_md(res: dict) -> str:
    r = res["resumo"]
    t = r["totais"]
    linhas = ["# Base Explee: classificação por segmento, persona e faixa", "",
              "Projeto 36217 (Reiners, Brasil/MT). Uma linha por empresa (domínio); a faixa vale para a empresa.", "",
              "| Segmento | Empresas | Pessoas | A | B | C | Quentes | Responderam | Decisor c/ LinkedIn |",
              "|---|---:|---:|---:|---:|---:|---:|---:|---:|"]
    for seg, s in r["porSegmento"].items():
        linhas.append(f"| {seg} | {s['empresas']} | {s['pessoas']} | {s['A']} | {s['B']} | {s['C']} | "
                      f"{s['quentes']} | {s['responderam']} | {s['decisorComLinkedin']} |")
    linhas.append(f"| **Total** | **{t['empresas']}** | **{t['pessoas']}** | **{t['A']}** | **{t['B']}** | "
                  f"**{t['C']}** | **{t['quentes']}** | **{t['responderam']}** | **{t['decisorComLinkedin']}** |")
    c = r["cortes"]
    linhas += ["", "## Faixas", "",
               f"- A: {t['A']} empresas ({_pct(t['A'], t['empresas'])}): quente ou respondeu, ou score ≥ {c['A']}.",
               f"- B: {t['B']} empresas ({_pct(t['B'], t['empresas'])}): score ≥ {c['B']}.",
               f"- C: {t['C']} empresas ({_pct(t['C'], t['empresas'])}): o resto.", "",
               f"Score (0–100) = engajamento (quente {PONTOS_QUENTE}, respondeu {PONTOS_RESPONDEU}) + encaixe da "
               f"campanha pela taxa de resposta (até {PONTOS_ENCAIXE}) + persona do decisor (dono da casa "
               f"{PESO_PERSONA['decisor'] + PONTOS_TOPO}, outro decisor {PESO_PERSONA['decisor']}, comunicação "
               f"{PESO_PERSONA['comunicacao']}, gestão {PESO_PERSONA['gestao']}, operacional "
               f"{PESO_PERSONA['operacional']}) + LinkedIn ({PONTOS_LINKEDIN_DECISOR} do decisor, "
               f"{PONTOS_LINKEDIN_OUTRO} de outra pessoa) + cobertura ({PONTOS_VARIAS_PESSOAS} com mais de uma "
               f"pessoa, {PONTOS_PAR} com decisor e comunicação juntos).", "",
               "Persona do decisor escolhido: " + ", ".join(f"{k} {v}" for k, v in r["personaDecisor"].items()) + ".",
               "", "## Fora da base", "", "| Motivo | Empresas inteiras | Pessoas |", "|---|---:|---:|"]
    for m, x in r["exclusoes"].items():
        linhas.append(f"| {m} | {x['empresas']} | {x['pessoas']} |")
    o = r["outraOferta"]
    linhas.append(f"| outra oferta (projeto 36223, sem faixa) | {o['empresas']} | {o['pessoas']} |")
    linhas += ["", "\"Empresas inteiras\" conta empresas que saíram por completo; \"Pessoas\" conta todas as pessoas "
               "tiradas, inclusive as de empresas que seguem na base. Recusa (não tem interesse ou descadastro) tira "
               "a empresa toda; saiu da empresa, e-mail mudou e fora do Brasil tiram só a pessoa.", ""]
    return "\n".join(linhas)


# --------------------------------------------------------------------------- CSV

def linha_csv(e: dict) -> dict:
    d = e["decisor"]
    return {"tier": e["tier"], "score": e["score"], "empresa": e["nome"], "dominio": e["dominio"],
            "decisor": d["nome"], "cargo": d["cargo"], "persona": d["persona"], "linkedin": d["linkedin"],
            "campanha": e["segmento"], "quente": "sim" if e["quente"] else "não",
            "respondeu": "sim" if e["respondeu"] else "não"}


def gravar_csvs(empresas: list[dict], pasta: str) -> list[str]:
    """Um CSV por segmento (UTF-8 com BOM, abre certo no Excel), ordenado por faixa e score."""
    os.makedirs(pasta, exist_ok=True)
    ordem = {f: i for i, f in enumerate(FAIXAS)}
    por_seg = defaultdict(list)
    for e in empresas:
        por_seg[e["segmento"]].append(e)
    caminhos = []
    for seg, es in sorted(por_seg.items()):
        es = sorted(es, key=lambda e: (ordem[e["tier"]], -e["score"], e["nome"].lower()))
        caminho = os.path.join(pasta, f"{_slug(seg)}.csv")
        with open(caminho, "w", encoding="utf-8-sig", newline="") as fh:
            w = csv.DictWriter(fh, fieldnames=COLUNAS_CSV)
            w.writeheader()
            for e in es:
                w.writerow(linha_csv(e))
        caminhos.append(caminho)
    return caminhos


# --------------------------------------------------------------------------- CLI

def _ler(caminho):
    with open(caminho, encoding="utf-8") as fh:
        return json.load(fh)


def _gravar_texto(caminho, texto):
    os.makedirs(os.path.dirname(os.path.abspath(caminho)), exist_ok=True)
    with open(caminho, "w", encoding="utf-8") as fh:
        fh.write(texto)


def main(argv=None):
    ap = argparse.ArgumentParser(prog="classificar_base")
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("classificar")
    p.add_argument("--inbox", required=True)
    p.add_argument("--pessoas", required=True)
    p.add_argument("--existentes", help="JSON [{id, site, email, contatos}] dos leads que já estão na central")
    p.add_argument("--saida", required=True)
    p.add_argument("--resumo", required=True)
    p.add_argument("--csv-dir", required=True)
    a = ap.parse_args(argv)

    existentes = _ler(a.existentes) if a.existentes else []
    if not isinstance(existentes, list):
        sys.exit("--existentes precisa ser uma lista JSON [{id, site, email, contatos}]")
    res = classificar(_ler(a.inbox), _ler(a.pessoas), existentes)
    _gravar_texto(a.saida, json.dumps(res, ensure_ascii=False, indent=1))
    _gravar_texto(a.resumo, resumo_md(res))
    csvs = gravar_csvs(res["empresas"], a.csv_dir)
    t, c = res["resumo"]["totais"], res["resumo"]["cortes"]
    print(json.dumps({"empresas": t["empresas"], "A": t["A"], "B": t["B"], "C": t["C"],
                      "pctA": _pct(t["A"], t["empresas"]), "pctB": _pct(t["B"], t["empresas"]),
                      "corteA": c["A"], "corteB": c["B"], "quentes": t["quentes"],
                      "excluidos": len(res["excluidos"]), "outraOferta": res["resumo"]["outraOferta"]["empresas"],
                      "csvs": len(csvs)}, ensure_ascii=False))


if __name__ == "__main__":
    main()

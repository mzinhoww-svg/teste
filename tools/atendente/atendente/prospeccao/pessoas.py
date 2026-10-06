"""Quem procurar em cada empresa: cargos pela regra de porte e as pessoas (sócios da Receita primeiro, treg depois).

Porte da Receita (cnpj_mt.PORTE): `micro` e vazio = pequena, `epp` = média, `demais` = grande.
Regra (spec 3): pequena fala com dono ou sócio; média com marketing ou comunicação, e o dono de reserva; grande com
marketing, e com RH só quando a oferta é de pessoas.

Pessoa devolvida: {nome, cargo, persona, linkedin, fonte, faixaEtaria, chavePessoa, empresaId, empresa, dominio}.
Sócio pessoa jurídica não é pessoa: sobe um nível (os administradores da sócia, se ela estiver no cadastro) ou fica de
fora. Procurador (quase sempre o contador) e sócio menor de idade nunca entram.
"""
import re
import unicodedata

from . import treg_ops
from .qualificar import chave_pessoa

DECISORES_MAX = 5_000          # teto por chamada do people.search (busca; a maioria não cobra)
DONO = ("dono", "sócio")
_PORTE = {"micro": "pequena", "": "pequena", "pequena": "pequena", "epp": "media", "media": "media",
          "demais": "grande", "grande": "grande"}
ADMIN = ("socio-administrador", "administrador", "empresario", "titular pessoa fisica", "socio-gerente",
         "socio gerente", "diretor", "presidente")
FORA = ("procurador", "incapaz")
MENOR = ("0-12", "13-20")
_MINUSCULAS = {"da", "de", "do", "das", "dos", "e"}


def _sem_acento(t) -> str:
    t = unicodedata.normalize("NFKD", str(t or "")).encode("ascii", "ignore").decode().lower()
    return " ".join(t.split())


def classe_porte(porte) -> str:
    """pequena | media | grande a partir do porte da Receita (ou já em classe). ValueError se desconhecido."""
    p = _sem_acento(porte)
    if p not in _PORTE:
        raise ValueError(f"Porte desconhecido: {porte}")
    return _PORTE[p]


def regra_por_porte(porte: str, oferta: str) -> list[str]:
    classe = classe_porte(porte)
    if classe == "pequena":
        return list(DONO)
    if classe == "media":
        return ["marketing", "comunicação", "dono"]
    return (["RH"] if _sem_acento(oferta) == "pessoas" else []) + ["marketing"]


def nome_bonito(nome) -> str:
    """"MARIA DA SILVA" -> "Maria da Silva" (a Receita grava tudo em maiúsculas)."""
    partes = " ".join(str(nome or "").split()).split(" ")
    out = []
    for i, p in enumerate(partes):
        b = p.lower()
        out.append(b if i and b in _MINUSCULAS else b[:1].upper() + b[1:])
    return " ".join(out).strip()


def persona_do_cargo(cargo) -> str:
    c = _sem_acento(cargo)
    if re.search(r"marketing|comunica|mkt|midia|social", c):
        return "comunicacao"
    if re.search(r"\brh\b|recursos humanos|pessoas|people|talent", c):
        return "gestao"
    if re.search(r"socio|dono|propriet|fundador|ceo|presidente|diretor|administrador|empresario|titular", c):
        return "decisor"
    return "gestao"


def _admin(s: dict) -> bool:
    q = _sem_acento(s.get("qualificacao"))
    return any(q.startswith(a) for a in ADMIN)


def _vale(s: dict) -> bool:
    q = _sem_acento(s.get("qualificacao"))
    return (bool(str(s.get("nome") or "").strip()) and not any(f in q for f in FORA)
            and s.get("faixa_etaria") not in MENOR)


def _socios_pessoas(repo, empresa: dict) -> list[tuple[dict, str]]:
    """[(sócio pessoa física, fonte)], administradores primeiro; sócio PJ sobe um nível."""
    saida = []
    for s in empresa.get("socios") or []:
        if not isinstance(s, dict) or not _vale(s):
            continue
        if s.get("tipo") == "pj":
            socia = repo.cnpj_get(s["cnpj"]) if s.get("cnpj") and hasattr(repo, "cnpj_get") else None
            for s2 in (socia or {}).get("socios") or []:
                if isinstance(s2, dict) and s2.get("tipo") != "pj" and _vale(s2) and _admin(s2):
                    saida.append((s2, "receita (sócio da sócia)"))
            continue
        saida.append((s, "receita"))
    return sorted(saida, key=lambda x: (not _admin(x[0]), x[1] != "receita"))


def _pessoa(nome, cargo, linkedin, fonte, faixa, empresa: dict) -> dict:
    eid = empresa.get("cnpj") or empresa.get("id") or ""
    return {"nome": nome_bonito(nome), "cargo": " ".join(str(cargo or "").split()), "persona": persona_do_cargo(cargo),
            "linkedin": linkedin or "", "fonte": fonte, "faixaEtaria": faixa or "",
            "chavePessoa": chave_pessoa(nome, [eid] if eid else [], faixa),
            "empresaId": eid, "empresa": empresa.get("nome") or "", "dominio": empresa.get("dominio") or ""}


def achar(repo, cli, empresa: dict, regra: list[str], orcamento, registro=None) -> list[dict]:
    """Pessoas a procurar nesta empresa, na ordem de preferência. Sócios-administradores da Receita (grátis) primeiro;
    o `treg.people.search` só entra para os cargos que os sócios não cobrem (marketing, RH...) ou quando não há sócio,
    e só com domínio e orçamento."""
    saida, vistos = [], {}
    for s, fonte in _socios_pessoas(repo, empresa):
        p = _pessoa(s["nome"], s.get("qualificacao"), "", fonte, s.get("faixa_etaria"), empresa)
        if p["chavePessoa"] not in vistos:
            vistos[_sem_acento(p["nome"])] = p
            vistos[p["chavePessoa"]] = p
            saida.append(p)
    cargos = [c for c in regra or [] if not (saida and c in DONO)]
    dominio = empresa.get("dominio") or ""
    if not cargos or not dominio or not orcamento.cabe(DECISORES_MAX * len(cargos)):
        return saida

    provedores = []

    def reg(evento):
        orcamento.registrar(evento)
        if evento.get("achou"):
            provedores.append(evento.get("provedor") or "desconhecido")
        if registro:
            registro(evento)
    eid = empresa.get("cnpj") or empresa.get("id") or dominio
    achados = treg_ops.decisores(cli, dominio, cargos, DECISORES_MAX, f"prosp-dec-{eid}", registro=reg)
    fonte = "treg:" + (provedores[-1] if provedores else "desconhecido")
    for d in achados:
        ja = vistos.get(_sem_acento(nome_bonito(d["nome"])))
        if ja:
            if d.get("linkedin") and not ja["linkedin"]:
                ja["linkedin"] = d["linkedin"]
            continue
        p = _pessoa(d["nome"], d.get("cargo"), d.get("linkedin"), fonte, "", empresa)
        vistos[_sem_acento(p["nome"])] = p
        saida.append(p)
    return saida

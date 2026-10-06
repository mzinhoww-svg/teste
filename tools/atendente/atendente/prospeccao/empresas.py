"""Empresas de uma campanha: CNPJ aberto de MT primeiro (grátis), Google Maps do treg para completar site e telefone.

Do CNPJ só entram as de MT, ativas, do CNAE, da cidade e do porte da campanha. O Maps (≈ US$ 0,002 por busca) só é
consultado para quem ainda não tem site, uma vez por empresa (`mapsEm` fica gravado no documento do CNPJ, então
repetir a rodada não paga de novo) e só se couber no orçamento. Lugar que o Maps marca como fechado vira
`fechado: true` no CNPJ e a empresa nunca entra. O telefone do Maps fica em `telefoneMaps`; o do cadastro não muda.
"""
import re
import unicodedata
from datetime import datetime, timezone

from scripts.classificar_base import HOSTS_GENERICOS
from scripts.enriquecer_leads import _dominio

from . import treg_ops
from .campanha import portes_da_campanha
from .pessoas import classe_porte, nome_bonito

MAPS_MAX = 5_000
ATIVA = ("", "2", "02", "ativa")
_FECHADO = re.compile(r"(?i)fechad[oa] (permanentemente|definitivamente)|(permanentemente|definitivamente) fechad|"
                      r"permanently closed|closed permanently")
_VAZIAS = {"ltda", "me", "epp", "eireli", "sa", "s", "a", "de", "da", "do", "das", "dos", "e", "cia", "comercio"}


def _sem_acento(t) -> str:
    t = unicodedata.normalize("NFKD", str(t or "")).encode("ascii", "ignore").decode().lower()
    return " ".join(t.split())


def _tokens(nome) -> set[str]:
    return {w for w in re.split(r"[^a-z0-9]+", _sem_acento(nome)) if w and w not in _VAZIAS}


def _parecido(nome_empresa, nome_lugar) -> bool:
    a, b = _tokens(nome_empresa), _tokens(nome_lugar)
    if not a or not b:
        return False
    return a <= b or b <= a or len(a & b) / len(a | b) >= 0.6


def _fechado(lugar: dict) -> bool:
    return bool(_FECHADO.search(f"{lugar.get('nome')} {lugar.get('categoria')}"))


def _ativa(d: dict) -> bool:
    return (str(d.get("uf") or "MT").upper() == "MT" and _sem_acento(d.get("situacao")).lstrip("0") in
            {s.lstrip("0") for s in ATIVA} and not d.get("fechado"))


def _empresa(d: dict) -> dict:
    site = d.get("site") or ""
    dom = d.get("dominio") or (_dominio(site) if site else "")
    return {**d, "id": d["cnpj"], "nome": nome_bonito(d.get("fantasia") or d.get("razao") or d["cnpj"]),
            "classePorte": classe_porte(d.get("porte")), "site": site,
            "dominio": "" if dom in HOSTS_GENERICOS else dom}


def _completar(repo, cli, d: dict, orcamento, registro) -> dict:
    """Consulta o Maps uma vez e grava o resultado no CNPJ. Devolve o documento atualizado."""
    consulta = d.get("fantasia") or d.get("razao") or ""
    if not consulta:
        return d

    def reg(evento):
        orcamento.registrar(evento)
        if registro:
            registro(evento)
    lugares = treg_ops.maps(cli, consulta, nome_bonito(d.get("municipio")), MAPS_MAX, f"prosp-maps-{d['cnpj']}",
                            registro=reg)
    novo = dict(d, mapsEm=datetime.now(timezone.utc).isoformat(timespec="seconds"))
    nomes = [n for n in (d.get("fantasia"), d.get("razao")) if n]
    lugar = next((p for p in lugares if any(_parecido(n, p["nome"]) for n in nomes)), None)
    if lugar:
        if _fechado(lugar):
            novo["fechado"] = True
        else:
            novo.update({k: v for k, v in (("site", lugar.get("site")), ("telefoneMaps", lugar.get("telefone")),
                                           ("placeId", lugar.get("place_id"))) if v})
            if lugar.get("site"):
                novo["dominio"] = _dominio(lugar["site"])
    repo.cnpj_put(novo)
    return novo


def achar(repo, cli, campanha: dict, orcamento, registro=None, limite: int | None = None) -> list[dict]:
    cidades = {_sem_acento(c) for c in campanha.get("cidades") or []}
    portes = portes_da_campanha(campanha)
    saida = []
    for d in repo.cnpjs(cnaes=list(campanha.get("cnaes") or [])):
        if limite is not None and len(saida) >= limite:
            break
        if not _ativa(d) or (cidades and _sem_acento(d.get("municipio")) not in cidades):
            continue
        try:
            if classe_porte(d.get("porte")) not in portes:
                continue
        except ValueError:
            continue
        if not d.get("site") and not d.get("mapsEm") and orcamento.cabe(MAPS_MAX):
            d = _completar(repo, cli, d, orcamento, registro)
            if d.get("fechado"):
                continue
        saida.append(_empresa(d))
    return saida


def completar(repo, cli, empresa: dict, orcamento, registro=None) -> dict | None:
    """Uma empresa só (no formato que `achar` devolve): consulta o Maps se ela ainda não tem site, nunca foi
    consultada e a busca cabe no orçamento. None se a empresa não vale mais (o Maps disse que fechou)."""
    d = repo.cnpj_get(empresa.get("cnpj") or empresa.get("id") or "")
    if d is None:
        return empresa
    if not d.get("site") and not d.get("mapsEm") and orcamento.cabe(MAPS_MAX):
        d = _completar(repo, cli, d, orcamento, registro)
    return _empresa(d) if _ativa(d) else None

"""Campanha de prospecção (segmento, cidades de MT, CNAEs, porte, oferta e tetos) e o orçamento de cada rodada.

`Orcamento` conta micro-dólares (1 US$ = 1.000.000): as peças perguntam `cabe(max_micro)` antes de uma chamada paga
e passam `orcamento.registrar` como `registro` do `treg_ops`, que informa o custo real de cada chamada (inclusive
das que não acharam). Passou do teto, a peça não chama e devolve o que já tem.
"""
import re
import secrets
import unicodedata

from msg.regiao import LUGARES_FORA

MICRO = 1_000_000
PORTES = ("pequena", "media", "grande")
_UF = {"AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ",
       "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"}
_SUFIXO_UF = re.compile(r"\s*(?:[-/,]|\s)\s*([A-Za-z]{2})\s*$")


def _sem_acento(t) -> str:
    t = unicodedata.normalize("NFKD", str(t or "")).encode("ascii", "ignore").decode().lower()
    return " ".join(t.split())


def _cidade_mt(c) -> str:
    """A cidade sem o sufixo "- MT"; ValueError se for de outro estado ou vazia."""
    nome = " ".join(str(c or "").split())
    m = _SUFIXO_UF.search(nome)
    if m and m.group(1).upper() in _UF | {"MT"}:
        if m.group(1).upper() != "MT":
            raise ValueError(f"Só cidades de Mato Grosso: {nome}")
        nome = nome[: m.start()].strip()
    if not nome:
        raise ValueError("Cidade vazia.")
    if _sem_acento(nome) in LUGARES_FORA:
        raise ValueError(f"Só cidades de Mato Grosso: {nome}")
    return nome


def _porte(p):
    def um(x):
        v = _sem_acento(x)
        if v not in PORTES:
            raise ValueError(f"Porte inválido: {x} (use pequena, média, grande ou todas).")
        return v
    if isinstance(p, (list, tuple)):
        if not p:
            raise ValueError("Escolha ao menos um porte.")
        return [um(x) for x in dict.fromkeys(p)]
    if _sem_acento(p) in ("todas", "todos", ""):
        return "todas"
    return um(p)


def portes_da_campanha(c: dict) -> set[str]:
    p = c.get("porte")
    if p in (None, "", "todas"):
        return set(PORTES)
    return set(p) if isinstance(p, list) else {p}


def nova(segmento, cidades_mt, cnaes, porte, oferta, teto_dia_usd=10, teto_campanha_usd=30, meta_por_dia=50) -> dict:
    """Documento da campanha (status "nova"). ValueError com mensagem legível se algo não vale."""
    segmento = " ".join(str(segmento or "").split())
    if not segmento:
        raise ValueError("Informe o segmento.")
    oferta = " ".join(str(oferta or "").split()).lower()
    if not oferta:
        raise ValueError("Informe a oferta.")
    if not isinstance(cidades_mt, (list, tuple)) or not cidades_mt:
        raise ValueError("Escolha ao menos uma cidade de Mato Grosso.")
    cidades = list(dict.fromkeys(_cidade_mt(c) for c in cidades_mt))
    lista = [re.sub(r"\D", "", str(c)) for c in (cnaes or [])]
    if not lista or any(len(c) != 7 for c in lista):
        raise ValueError("Informe os CNAEs no formato 0000-0/00.")
    try:
        dia, total, meta = float(teto_dia_usd), float(teto_campanha_usd), int(meta_por_dia)
    except (TypeError, ValueError):
        raise ValueError("Tetos e meta precisam ser números.") from None
    if dia <= 0 or total <= 0 or meta <= 0:
        raise ValueError("Tetos e meta precisam ser maiores que zero.")
    if dia > total:
        raise ValueError("O teto do dia não pode passar do teto da campanha.")
    return {"id": "C" + secrets.token_hex(5), "segmento": segmento, "uf": "MT", "cidades": cidades,
            "cnaes": list(dict.fromkeys(lista)), "porte": _porte(porte), "oferta": oferta,
            "tetoDiaUsd": teto_dia_usd, "tetoCampanhaUsd": teto_campanha_usd, "metaPorDia": meta,
            "status": "nova"}


class Orcamento:
    """Teto em micro-dólares de uma rodada. `registrar` é o `registro` do treg_ops."""

    def __init__(self, teto_micro: int, gasto_micro: int = 0):
        self.teto_micro = max(0, int(teto_micro))
        self.gasto_micro = max(0, int(gasto_micro))
        self.estourou = False

    @property
    def restante_micro(self) -> int:
        return max(0, self.teto_micro - self.gasto_micro)

    def cabe(self, max_micro: int) -> bool:
        ok = self.gasto_micro + int(max_micro) <= self.teto_micro
        if not ok:
            self.estourou = True
        return ok

    def gastar(self, micro: int) -> None:
        self.gasto_micro += max(0, int(micro or 0))

    def registrar(self, evento: dict) -> None:
        self.gastar((evento or {}).get("custoMicro") or 0)


def orcamento(c: dict, gasto_dia_micro: int = 0, gasto_campanha_micro: int = 0) -> Orcamento:
    """O que ainda dá para gastar hoje nesta campanha: o menor entre o resto do dia e o resto da campanha."""
    dia = int(float(c.get("tetoDiaUsd") or 0) * MICRO) - int(gasto_dia_micro)
    total = int(float(c.get("tetoCampanhaUsd") or 0) * MICRO) - int(gasto_campanha_micro)
    return Orcamento(max(0, min(dia, total)))

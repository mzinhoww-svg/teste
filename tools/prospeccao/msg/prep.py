"""Junta as listas de pesquisa, normaliza, deduplica, pontua e numera os leads.

Uso: python3 -m msg.prep dados/brutos/*.json --out dados/leads.json
"""
import argparse
import json
import re
import unicodedata
from dataclasses import asdict, dataclass, field

from msg.copy_v1 import ICPS

DDDS_MT = ("65", "66")


@dataclass
class Lead:
    id: str
    icp: str
    nome: str
    categoria: str = ""
    bairro: str = ""
    cidade: str = ""
    telefone: str = ""
    celular: bool = False
    whatsapp_fixo: bool = False
    site: str = ""
    instagram: str = ""
    email: str = ""
    nota: float | None = None
    avaliacoes: int | None = None
    responsavel: str = ""
    especialidade: str = ""
    porte: str = ""
    obs: str = ""
    fonte: str = ""
    score: int = 0
    faixa: str = ""
    flags: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return asdict(self)


def limpar_telefone(valor) -> str:
    """Só dígitos, com DDI 55. Devolve "" quando não é um número de MT válido."""
    d = re.sub(r"\D", "", str(valor or "")).lstrip("0")
    if d.startswith("55") and len(d) in (12, 13):
        d = d[2:]
    if len(d) not in (10, 11) or d[:2] not in DDDS_MT:
        return ""
    if len(d) == 11 and d[2] != "9":
        return ""
    return "55" + d


def eh_celular(tel: str) -> bool:
    return len(tel) == 13 and tel[4] == "9"


def canal(l: Lead) -> str:
    if l.telefone and (l.celular or l.whatsapp_fixo):
        return "WhatsApp"
    if l.email:
        return "E-mail"
    return "Sem canal"


def pontuar(l: Lead) -> tuple[int, str]:
    s = 0
    s += 40 if canal(l) == "WhatsApp" else 20 if canal(l) == "E-mail" else 0
    s += 10 if l.site else 0
    s += 10 if l.instagram else 0
    s += 5 if l.email else 0
    s += {"médio": 20, "grande": 15, "pequeno": 5}.get(l.porte, 0)
    s += 10 if l.especialidade else 0
    s += 5 if l.responsavel else 0
    faixa = "A" if s >= 80 else "B" if s >= 60 else "C"
    return s, faixa


def _flags(l: Lead) -> list[str]:
    out = []
    if l.whatsapp_fixo and not l.celular:
        out.append("WhatsApp em fixo")
    if re.search(r"confirm|incomplet|dígito a menos|não reivindicad|via busca|resultado de busca|quero bolsa", l.obs, re.IGNORECASE):
        out.append("confirmar número")
    if re.search(r"certificado digital|\bRH\b|\bSAC\b|e-commerce|inscriç|televendas|graduação",
                 l.obs, re.IGNORECASE):
        out.append("número de setor")
    if l.cidade and "cuiab" not in l.cidade.lower():
        out.append(l.cidade)
    return out


def _txt(v) -> str:
    return "" if v is None else str(v).strip()


def _num(v, tipo):
    if v in (None, ""):
        return None
    try:
        return tipo(float(str(v).replace(",", ".")))
    except ValueError:
        return None


def _whatsapp_no_fixo(obs: str) -> bool:
    """O site diz que o fixo também atende no WhatsApp (e não que o WhatsApp está truncado)."""
    baixo = obs.lower()
    return "whatsapp" in baixo and not re.search(r"truncad|incomplet|sem ddd|sem o 9|não normaliz", baixo)


def normalizar(bruto: dict) -> Lead:
    tel = limpar_telefone(bruto.get("telefone"))
    obs = _txt(bruto.get("obs"))
    celular = eh_celular(tel)
    return Lead(
        id="", icp=_txt(bruto.get("icp")).split()[0] if _txt(bruto.get("icp")) else "",
        nome=_txt(bruto.get("nome")), categoria=_txt(bruto.get("categoria")),
        bairro=_txt(bruto.get("bairro")), cidade=_txt(bruto.get("cidade")) or "Cuiabá",
        telefone=tel, celular=celular,
        whatsapp_fixo=bool(tel) and not celular and _whatsapp_no_fixo(obs),
        site=_txt(bruto.get("site")), instagram=_txt(bruto.get("instagram")),
        email=_txt(bruto.get("email")).lower(), nota=_num(bruto.get("nota"), float),
        avaliacoes=_num(bruto.get("avaliacoes"), int), responsavel=_txt(bruto.get("responsavel")),
        especialidade=_txt(bruto.get("especialidade")), porte=_txt(bruto.get("porte")).lower(),
        obs=obs, fonte=_txt(bruto.get("fonte")),
    )


def _chave_nome(nome: str) -> str:
    sem_acento = unicodedata.normalize("NFKD", nome).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]", "", sem_acento.lower())


def montar(brutos: list[dict]) -> tuple[list[Lead], list[Lead]]:
    """Devolve (leads, descartados). Descarta ICP desconhecido, nome vazio e duplicados
    (mesmo telefone, e-mail ou nome); fica o de maior score. Numera R0001... na ordem final."""
    candidatos = []
    descartados = []
    for b in brutos:
        l = normalizar(b)
        if l.icp not in ICPS or not l.nome:
            l.obs = (l.obs + " · descartado: ICP ou nome inválido").strip(" ·")
            descartados.append(l)
            continue
        l.score, l.faixa = pontuar(l)
        l.flags = _flags(l)
        candidatos.append(l)

    candidatos.sort(key=lambda l: -l.score)
    vistos: set[str] = set()
    leads = []
    for l in candidatos:
        chaves = {"n:" + _chave_nome(l.nome)}
        if l.telefone:
            chaves.add("t:" + l.telefone)
        if l.email:
            chaves.add("e:" + l.email)
        if chaves & vistos:
            l.obs = (l.obs + " · descartado: duplicado").strip(" ·")
            descartados.append(l)
            continue
        vistos |= chaves
        leads.append(l)

    leads.sort(key=lambda l: (canal(l) == "Sem canal", -l.score, l.icp, l.nome))
    for i, l in enumerate(leads, start=1):
        l.id = f"R{i:04d}"
    return leads, descartados


def carregar(caminho: str) -> list[Lead]:
    with open(caminho, encoding="utf-8") as fh:
        return [Lead(**d) for d in json.load(fh)]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("brutos", nargs="+")
    ap.add_argument("--out", default="dados/leads.json")
    a = ap.parse_args()
    brutos = []
    for p in a.brutos:
        with open(p, encoding="utf-8") as fh:
            brutos += json.load(fh)
    leads, desc = montar(brutos)
    with open(a.out, "w", encoding="utf-8") as fh:
        json.dump([l.to_dict() for l in leads], fh, ensure_ascii=False, indent=1)
    from collections import Counter
    print(f"{len(leads)} leads ({len(desc)} descartados) em {a.out}")
    print("Canais:", dict(Counter(canal(l) for l in leads)))
    print("ICP:", dict(Counter(l.icp for l in leads)))
    print("Faixa:", dict(Counter(l.faixa for l in leads)))


if __name__ == "__main__":
    main()

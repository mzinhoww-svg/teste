"""Checagem automática e rubrica de tom das mensagens dos três toques."""
import re
import unicodedata
import urllib.parse
from dataclasses import dataclass

from msg.copy_v1 import O_QUE_FAZEMOS, SEPARADOR, TERMOS_PROIBIDOS, blocos
from msg.prep import Lead

FONTES = ("Especialidade", "Instagram", "Reputação", "Trajetória", "Neutra")
LIMITE_WHATS = 800  # vai como legenda da foto, que aceita até 1024
LIMITE_FRASE = 150
PRECO = re.compile(r"R\$|\breais\b|\bgrátis\b|\bgratuit[oa]\b|\bdesconto\b", re.IGNORECASE)
SUPERLATIVOS = ("incrível", "incrivel", "revolucionári", "melhor do mercado", "sensacional")
# Cuiabá e MT fazem parte de muitos nomes oficiais (Sinduscon-MT, CDL Cuiabá); o que se barra
# é o resto de título de SEO: separadores, "em Cuiabá", razão social.
SEO_NOME = re.compile(
    r"[|–—]|\s-\s|\bem cuiab|\bem várzea grande\b|\bem mato grosso\b|\be região\b|\bltda\b|\beireli\b",
    re.IGNORECASE,
)
SAUDACAO = re.compile(
    r"^(pessoal d[aoe]s? \S.*|(Dr\.|Dra\.) [A-ZÀ-Ý][\wÀ-ÿ]+|[A-ZÀ-Ý][\wÀ-ÿ]+( [A-ZÀ-Ý][\wÀ-ÿ]+)?)$")
LINK = re.compile(r"^https://wa\.me/(\d+)\?text=(.*)$")


@dataclass
class Personal:
    id: str
    saudacao: str
    nome_curto: str
    frase: str
    fonte: str


def tem_emoji(texto: str) -> bool:
    return any(unicodedata.category(c) == "So" or 0x1F000 <= ord(c) <= 0x1FAFF for c in texto)


def _termo_proibido(texto: str) -> str | None:
    baixo = texto.lower()
    for t in TERMOS_PROIBIDOS:
        if re.search(rf"\b{re.escape(t)}\b", baixo):
            return t
    return None


def check_personal(l: Lead, p: Personal) -> list[str]:
    erros: list[str] = []
    e = lambda msg: erros.append(f"{l.id}: {msg}")  # noqa: E731
    for nome, t in (("frase", p.frase), ("saudação", p.saudacao), ("nome curto", p.nome_curto)):
        if "—" in t:
            e(f"travessão na {nome}")
        if tem_emoji(t):
            e(f"emoji na {nome}")
    if not p.frase.strip():
        e("frase vazia")
    if len(p.frase) > LIMITE_FRASE:
        e(f"frase com {len(p.frase)} caracteres (máximo {LIMITE_FRASE})")
    if "!" in p.frase:
        e("frase com ponto de exclamação")
    if PRECO.search(p.frase):
        e("frase cita preço ou desconto")
    if any(s in p.frase.lower() for s in SUPERLATIVOS):
        e("superlativo vazio na frase")
    t = _termo_proibido(p.frase)
    if t:
        e(f"termo proibido na frase: {t!r}")

    # Números da frase precisam existir nos dados do lead
    validos = set()
    if l.nota is not None:
        validos |= {f"{l.nota:.1f}".replace(".", ","), str(int(l.nota)) if l.nota == int(l.nota) else ""}
    if l.avaliacoes is not None:
        validos.add(str(l.avaliacoes))
    fonte_txt = " ".join([l.especialidade, l.obs, l.categoria, l.nome])
    for n in re.findall(r"\d+(?:[.,]\d+)?", p.frase):
        if n not in validos and n not in fonte_txt:
            e(f"número {n} não confere com os dados do lead")

    if p.fonte not in FONTES:
        e(f"fonte desconhecida: {p.fonte!r}")
    elif p.fonte == "Reputação" and not (l.nota is not None and l.nota >= 4.7 and (l.avaliacoes or 0) >= 20):
        e("fonte Reputação exige nota >= 4,7 e 20 avaliações")
    elif p.fonte == "Instagram" and not l.instagram:
        e("fonte Instagram sem perfil nos dados")
    elif p.fonte in ("Especialidade", "Trajetória") and not l.especialidade:
        e(f"fonte {p.fonte} sem especialidade nos dados")

    if not p.nome_curto.strip():
        e("nome curto vazio")
    if SEO_NOME.search(p.nome_curto):
        e(f"nome curto com sufixo de SEO: {p.nome_curto!r}")
    if SEO_NOME.search(p.saudacao) or not SAUDACAO.match(p.saudacao):
        e(f"saudação fora do formato: {p.saudacao!r}")
    return erros


def check_toque(l: Lead, p: Personal, toque: int, texto: str, link: str, linha_foto: str = "",
                regiao: str = "MT") -> list[str]:
    erros: list[str] = []
    e = lambda msg: erros.append(f"{l.id} toque {toque}: {msg}")  # noqa: E731
    if "—" in texto:
        e("travessão na mensagem")
    if tem_emoji(texto):
        e("emoji na mensagem")
    if len(texto) > LIMITE_WHATS:
        e(f"mensagem com {len(texto)} caracteres (máximo {LIMITE_WHATS})")
    t = _termo_proibido(texto)
    if t:
        e(f"termo proibido: {t!r}")
    if "{" in texto or "}" in texto:
        e("placeholder sem preencher")

    esperado = [b.format(saudacao=p.saudacao, nome_curto=p.nome_curto, frase=p.frase, linha_foto=linha_foto)
                for b in blocos(toque, l.icp, foto=bool(linha_foto), regiao=regiao)]
    if texto.split(SEPARADOR) != esperado:
        e("mensagem difere dos blocos da copy")
    if "\n\n\n" in texto:
        e("linha em branco dupla")
    if toque == 1 and O_QUE_FAZEMOS.get(l.icp, "") not in texto:
        e(f"ICP sem bloco do que fazemos: {l.icp!r}")

    m = LINK.match(link)
    if link == "":
        pass
    elif not m:
        e("link wa.me mal formado")
    else:
        tel, txt = m.groups()
        if not (tel.startswith("55") and len(tel) in (12, 13)):
            e(f"telefone inválido no link: {tel}")
        if urllib.parse.unquote(txt) != texto:
            e("link decodificado difere da mensagem")
    return erros


def check_lote(pares: list[tuple[Lead, Personal]]) -> list[str]:
    erros = []
    frases: dict[str, str] = {}
    for l, p in pares:
        if p.frase in frases:
            erros.append(f"{l.id}: frase repetida de {frases[p.frase]}")
        frases.setdefault(p.frase, l.id)
    return erros

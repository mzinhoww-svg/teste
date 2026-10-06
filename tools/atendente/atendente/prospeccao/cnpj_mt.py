"""CNPJ aberto da Receita, só Mato Grosso, e o filtro de contabilidade (spec 5.1).

Lê os ZIPs mensais da Receita (Estabelecimentos*.zip, Empresas*.zip, Socios*.zip e, se houver,
Municipios*.zip) em fluxo: CSV sem cabeçalho, separador ';', latin-1, linha a linha. Do país inteiro
só guarda estabelecimentos de MT, situação ativa (02) e CNAE principal da lista. Empresas e sócios
são lidos depois, só para os CNPJs básicos que ficaram.

Filtro de contabilidade: durante a leitura conta quantos CNPJs ativos de MT (qualquer CNAE) usam cada
telefone e cada domínio de e-mail (ou o endereço inteiro, nos webmails). A contagem guarda só o hash
do valor. Enquanto a tabela `contatos_compartilhados` não existir no repo, ela fica num dicionário
deste módulo, por repo; `contagem_compartilhada(repo)` grava na tabela quando o repo tiver
`compartilhado_set(chave_hash, empresas, cnaes, primeira, ultima)`.

    python -m atendente.prospeccao.cnpj_mt --pasta /data/receita --cnaes 4711-3/02,5611-2/01 --municipios CUIABA,"VARZEA GRANDE"
"""
import argparse
import csv
import glob
import hashlib
import io
import os
import sys
import unicodedata
import weakref
import zipfile
from datetime import datetime

LIMITE = 3                       # CNPJs com o mesmo contato a partir dos quais é contador
CNAE_CONTABILIDADE = "6920601"
PALAVRAS_DOMINIO = ("contab", "assessoria", "escritorio")
WEBMAIL = {
    "gmail.com", "googlemail.com", "hotmail.com", "hotmail.com.br", "outlook.com", "outlook.com.br",
    "live.com", "msn.com", "yahoo.com", "yahoo.com.br", "ymail.com", "bol.com.br", "uol.com.br",
    "terra.com.br", "ig.com.br", "icloud.com", "me.com", "globo.com", "globomail.com", "r7.com",
    "zipmail.com.br", "protonmail.com", "proton.me", "aol.com",
}

PORTE = {"00": "", "01": "micro", "03": "epp", "05": "demais"}
TIPO_SOCIO = {"1": "pj", "2": "pf", "3": "estrangeiro"}
FAIXA = {"1": "0-12", "2": "13-20", "3": "21-30", "4": "31-40", "5": "41-50", "6": "51-60",
         "7": "61-70", "8": "71-80", "9": "80+"}
QUALIFICACAO = {
    "05": "Administrador", "08": "Conselheiro de Administração", "10": "Diretor", "16": "Presidente",
    "17": "Procurador", "22": "Sócio", "24": "Sócio Comanditado", "25": "Sócio Comanditário",
    "28": "Sócio-Gerente", "29": "Sócio Incapaz ou Relat.Incapaz", "30": "Sócio Gerente",
    "37": "Sócio Pessoa Jurídica Domiciliado no Exterior", "38": "Sócio Pessoa Física Residente no Exterior",
    "49": "Sócio-Administrador", "50": "Empresário", "54": "Fundador", "65": "Titular Pessoa Física",
}

# Colunas do layout da Receita.
E_BASICO, E_ORDEM, E_DV, E_MATRIZ, E_FANTASIA, E_SITUACAO = 0, 1, 2, 3, 4, 5
E_CNAE, E_UF, E_MUNICIPIO, E_DDD1, E_TEL1, E_DDD2, E_TEL2, E_EMAIL = 11, 19, 20, 21, 22, 23, 24, 27
E_MIN = 28
S_BASICO, S_TIPO, S_NOME, S_DOC, S_QUALIF, S_FAIXA = 0, 1, 2, 3, 4, 10


# ---------- normalização ----------

def _digitos(texto) -> str:
    return "".join(ch for ch in str(texto or "") if ch.isdigit())


def normalizar_cnae(cnae) -> str:
    return _digitos(cnae)


def normalizar_telefone(texto, ddd="") -> str | None:
    """'55' + DDD + número (8 dígitos = fixo, 9 = celular). Não decide se é celular: isso é do qualificar."""
    numero = _digitos(texto)
    ddd = _digitos(ddd).lstrip("0")
    if ddd and len(numero) in (8, 9):
        numero = ddd + numero
    numero = numero.lstrip("0")                   # 0 de longa distância ("065...")
    if len(numero) in (10, 11):                   # DDD + número, sem o país
        numero = "55" + numero
    if len(numero) in (12, 13) and numero.startswith("55"):
        return numero
    return None


def _sem_acento(texto: str) -> str:
    t = unicodedata.normalize("NFKD", str(texto or ""))
    t = "".join(ch for ch in t if not unicodedata.combining(ch))
    return " ".join(t.upper().replace("-", " ").split())


def _email(texto) -> str:
    e = str(texto or "").strip().lower()
    return e if e.count("@") == 1 and "." in e.split("@")[1] and " " not in e else ""


def _iso(agora) -> str:
    return agora.isoformat() if isinstance(agora, datetime) else str(agora or "")


# ---------- leitura em fluxo ----------

def _linhas(pasta: str, prefixo: str):
    """Cada linha (lista de campos) de todos os ZIPs `prefixo*.zip`, sem abrir nada inteiro na memória."""
    for caminho in sorted(glob.glob(os.path.join(pasta, prefixo + "*.zip"))):
        with zipfile.ZipFile(caminho) as z:
            for info in z.infolist():
                if info.is_dir():
                    continue
                with z.open(info) as bruto:
                    texto = io.TextIOWrapper(bruto, encoding="latin-1", newline="")
                    yield from csv.reader((l.replace("\0", "") for l in texto), delimiter=";", quotechar='"')


def _municipios(pasta: str) -> dict:
    return {c[0].strip(): c[1].strip() for c in _linhas(pasta, "Municipios") if len(c) >= 2}


# ---------- contagem de contatos compartilhados ----------

def chave_hash(tipo: str, valor: str) -> str:
    """Hash do contato, com sal do ambiente. `tipo` 'telefone' ou 'email' (vira domínio, ou o endereço se for webmail)."""
    tipo_real, valor = _chave_valor(tipo, valor)
    if not valor:
        return ""
    sal = os.environ.get("PROSPECCAO_SAL") or os.environ.get("HASH_SAL", "")
    return hashlib.sha256(f"{sal}|{tipo_real}|{valor}".encode("utf-8")).hexdigest()


def _chave_valor(tipo: str, valor) -> tuple[str, str]:
    if tipo == "telefone":
        return "telefone", normalizar_telefone(valor) or ""
    e = _email(valor)
    if not e:
        return "email", ""
    dominio = e.split("@")[1]
    return ("email", e) if dominio in WEBMAIL else ("dominio", dominio)


class Contagem:
    """chave (hash) -> quantos CNPJs, quais CNAEs, primeira e última vez visto. Sem o valor em claro."""

    def __init__(self):
        self._d: dict[str, list] = {}

    def adicionar(self, telefones, email, cnae, quando: str) -> None:
        chaves = {}
        for t in telefones:
            chaves[chave_hash("telefone", t)] = "telefone"
        if email:
            chaves[chave_hash("email", email)] = _chave_valor("email", email)[0]
        for chave, tipo in chaves.items():
            if not chave:
                continue
            r = self._d.get(chave)
            if r is None:
                self._d[chave] = [tipo, 1, {cnae} if cnae else set(), quando, quando]
            else:
                r[1] += 1
                if cnae and len(r[2]) < 50:
                    r[2].add(cnae)
                r[4] = quando

    def herdar(self, anterior: "Contagem | None") -> None:
        """Mantém a primeira vez vista de uma importação anterior."""
        if anterior is None:
            return
        for chave, r in self._d.items():
            velho = anterior._d.get(chave)
            if velho and velho[3] < r[3]:
                r[3] = velho[3]

    def empresas(self, chave: str) -> int:
        r = self._d.get(chave)
        return r[1] if r else 0

    def registros(self) -> list[dict]:
        return [{"chave": k, "tipo": r[0], "empresas": r[1], "cnaes": sorted(r[2]), "primeira_vez": r[3],
                 "ultima_vez": r[4]} for k, r in self._d.items()]


_CONTAGENS = weakref.WeakKeyDictionary()
_CONTAGENS_POR_ID: dict[int, Contagem] = {}


def _contagem(repo) -> Contagem | None:
    try:
        return _CONTAGENS.get(repo)
    except TypeError:
        return _CONTAGENS_POR_ID.get(id(repo))


def _guardar_contagem(repo, c: Contagem) -> None:
    try:
        _CONTAGENS[repo] = c
    except TypeError:
        _CONTAGENS_POR_ID[id(repo)] = c


def _contagem_do_repo(repo, agora=None) -> Contagem:
    """Reconstrói a contagem a partir do que já está gravado (só os CNAEs importados)."""
    c = Contagem()
    quando = _iso(agora or datetime.now().astimezone())
    for doc in (repo.cnpjs() if hasattr(repo, "cnpjs") else []):
        tels = doc.get("telefones") or ([doc["telefone"]] if doc.get("telefone") else [])
        c.adicionar(tels, doc.get("email"), normalizar_cnae(doc.get("cnae")), doc.get("importadoEm") or quando)
    return c


def contagem_compartilhada(repo) -> None:
    """Garante a contagem deste repo e grava em `contatos_compartilhados` se o repo já tiver a tabela."""
    c = _contagem(repo)
    if c is None:
        c = _contagem_do_repo(repo)
        _guardar_contagem(repo, c)
    gravar = getattr(repo, "compartilhado_set", None)
    if gravar:
        for r in c.registros():
            gravar(r["chave"], r["empresas"], r["cnaes"], r["primeira_vez"], r["ultima_vez"])


def registros_compartilhados(repo) -> list[dict]:
    c = _contagem(repo)
    return c.registros() if c else []


def _empresas_com(repo, chave: str) -> int:
    ler = getattr(repo, "compartilhado_get", None)
    if ler:
        doc = ler(chave)
        if doc:
            return int(doc.get("empresas") or 0)
    c = _contagem(repo)
    if c is None:
        c = _contagem_do_repo(repo)
        _guardar_contagem(repo, c)
    return c.empresas(chave)


def provavel_contabilidade(repo, telefone=None, email=None, cnae_da_empresa=None, limite: int = LIMITE) -> bool:
    """True se o contato do cadastro é provavelmente do contador (spec 5.1) e não deve valer como do dono."""
    if cnae_da_empresa and normalizar_cnae(cnae_da_empresa) == CNAE_CONTABILIDADE:
        return True
    e = _email(email)
    if e:
        local, dominio = e.split("@")
        if any(p in _sem_acento(dominio).lower() for p in PALAVRAS_DOMINIO) or "contab" in local:
            return True
        if _empresas_com(repo, chave_hash("email", e)) >= limite:
            return True
    if telefone:
        chave = chave_hash("telefone", telefone)
        if chave and _empresas_com(repo, chave) >= limite:
            return True
    return False


# ---------- importação ----------

def importar(pasta_zips: str, repo, cnaes: list[str], municipios: list[str] | None, agora) -> dict:
    """Importa MT, ativas e dos CNAEs pedidos para `repo.cnpj_put(doc)`. Devolve {lidos, mantidos, ignorados}."""
    alvo_cnae = {normalizar_cnae(c) for c in cnaes if normalizar_cnae(c)}
    if not alvo_cnae:
        raise ValueError("Informe ao menos um CNAE (ex.: 4711-3/02).")
    nomes = _municipios(pasta_zips)
    alvo_mun = None
    if municipios:
        alvo_mun = set()
        for m in municipios:
            m = str(m).strip()
            if m.isdigit():
                alvo_mun.add(m)
            else:
                codigos = {cod for cod, nome in nomes.items() if _sem_acento(nome) == _sem_acento(m)}
                if not codigos:
                    raise ValueError(f"Município não encontrado nos arquivos da Receita: {m}")
                alvo_mun |= codigos
    quando = _iso(agora)
    contagem = Contagem()
    lidos = 0
    mantidos: dict[str, list[dict]] = {}

    for c in _linhas(pasta_zips, "Estabelecimentos"):
        lidos += 1
        if len(c) < E_MIN or c[E_UF].strip().upper() != "MT" or c[E_SITUACAO].strip().lstrip("0") != "2":
            continue
        cnae = normalizar_cnae(c[E_CNAE])
        tels = [t for t in (normalizar_telefone(c[E_TEL1], c[E_DDD1]), normalizar_telefone(c[E_TEL2], c[E_DDD2])) if t]
        tels = list(dict.fromkeys(tels))
        email = _email(c[E_EMAIL])
        contagem.adicionar(tels, email, cnae, quando)
        mun = c[E_MUNICIPIO].strip()
        if cnae not in alvo_cnae or (alvo_mun is not None and mun not in alvo_mun):
            continue
        basico = _digitos(c[E_BASICO]).zfill(8)
        cnpj = basico + _digitos(c[E_ORDEM]).zfill(4) + _digitos(c[E_DV]).zfill(2)
        mantidos.setdefault(basico, []).append({
            "cnpj": cnpj, "razao": "", "fantasia": c[E_FANTASIA].strip(), "cnae": cnae,
            "municipio": nomes.get(mun, mun), "uf": "MT", "porte": "", "matriz": c[E_MATRIZ].strip() == "1",
            "telefone": tels[0] if tels else "", "telefones": tels, "email": email, "socios": [],
            "fonte": "receita", "importadoEm": quando,
        })

    contagem.herdar(_contagem(repo))
    _guardar_contagem(repo, contagem)

    if mantidos:
        for c in _linhas(pasta_zips, "Empresas"):
            docs = mantidos.get(_digitos(c[0]).zfill(8)) if c else None
            if docs and len(c) >= 6:
                for d in docs:
                    d["razao"] = c[1].strip()
                    d["porte"] = PORTE.get(c[5].strip().zfill(2), "")
        for c in _linhas(pasta_zips, "Socios"):
            docs = mantidos.get(_digitos(c[0]).zfill(8)) if c else None
            if docs and len(c) > S_FAIXA:
                s = _socio(c)
                for d in docs:
                    d["socios"].append(dict(s))

    n = 0
    for docs in mantidos.values():
        for d in docs:
            repo.cnpj_put(d)
            n += 1
    return {"lidos": lidos, "mantidos": n, "ignorados": lidos - n}


def _socio(c: list[str]) -> dict:
    """Nome, qualificação, faixa etária e tipo. O CPF (mascarado) nunca é guardado; o CNPJ de sócio PJ sim."""
    tipo = TIPO_SOCIO.get(c[S_TIPO].strip(), "pf")
    cod = c[S_QUALIF].strip().zfill(2)
    s = {"nome": c[S_NOME].strip(), "qualificacao": QUALIFICACAO.get(cod, cod),
         "faixa_etaria": FAIXA.get(c[S_FAIXA].strip(), ""), "tipo": tipo}
    if tipo == "pj":
        doc = _digitos(c[S_DOC])
        if len(doc) == 14:
            s["cnpj"] = doc
    return s


# ---------- CLI ----------

def _abrir_repo():
    from ..db import Repo
    return Repo(os.environ.get("DB_CAMINHO", "/data/atendente.db"))


def _lista(texto) -> list[str]:
    return [p.strip() for p in str(texto or "").split(",") if p.strip()]


def main(argv=None) -> int:
    p = argparse.ArgumentParser(prog="python -m atendente.prospeccao.cnpj_mt",
                                description="Importa o CNPJ aberto da Receita (só MT, ativas, CNAEs pedidos).")
    p.add_argument("--pasta", default="/data/receita")
    p.add_argument("--cnaes", default="")
    p.add_argument("--municipios", default="")
    a = p.parse_args(argv)
    cnaes = _lista(a.cnaes)
    if not cnaes:
        print("Informe --cnaes (ex.: --cnaes 4711-3/02,5611-2/01).", file=sys.stderr)
        return 2
    if not os.path.isdir(a.pasta):
        print(f"Pasta não encontrada: {a.pasta}", file=sys.stderr)
        return 2
    repo = _abrir_repo()
    try:
        r = importar(a.pasta, repo, cnaes, _lista(a.municipios) or None, datetime.now().astimezone())
    except ValueError as e:
        print(str(e), file=sys.stderr)
        return 2
    contagem_compartilhada(repo)
    print(f"lidos={r['lidos']} mantidos={r['mantidos']} ignorados={r['ignorados']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

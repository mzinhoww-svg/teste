"""Onde fica cada empresa: país, estado (UF) e cidade, por domínio.

Primeira regra que funcionar:
1. CEP publicado no site da empresa (`ceps` do site_contatos.json), consultado na BrasilAPI (grátis):
   `GET https://brasilapi.com.br/api/cep/v2/<cep>` devolve `{state, city}`. Com mais de um CEP, vale o que tem a UF do
   DDD dos telefones. fonteGeo "CEP no site".
2. DDD de um telefone (do site, ou do próprio lead e dos contatos dele): só a UF. fonteGeo "DDD".
3. Dicas no nome e no domínio (sigla de estado colada ou separada, nome de estado ou capital), com as ideias do
   `msg/regiao.py`. MT só com dica forte (sigla MT ou cidade de MT). fonteGeo "nome ou domínio".
4. País: "Brasil" se o domínio termina em `.br`, se achou CEP ou DDD, ou se a Explee diz BR; senão o código de país da
   Explee por extenso; senão "?".

O resultado é `{pais, uf, cidade, fonteGeo}`; o que não se sabe fica "" (e o país, "?"). Os CEPs ficam em
`dados/explee/cep_cache.json` (inclusive os que a API não conhece), no máximo 4 consultas ao mesmo tempo, com nova
tentativa em 429 e 5xx. Só biblioteca padrão.

    python3 -m scripts.geo resolver --dominios dados/explee/base_docs.json \\
        --site-contatos dados/explee/site_contatos.json --explee-pessoas dados/explee/pessoas.json \\
        --saida dados/explee/geo.json
"""
import argparse
import concurrent.futures as cf
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request

from msg.regiao import CIDADES_MT, UFS, _sem_acento, _tem, _ufs_do_dominio, _ufs_do_nome

URL_CEP = "https://brasilapi.com.br/api/cep/v2/{}"
PARALELO = 4
TENTATIVAS = 4
UA = "reiners-central/1.0 (+geo)"

DDD_UF = {}
for _uf, _ddds in {
    "SP": "11 12 13 14 15 16 17 18 19", "RJ": "21 22 24", "ES": "27 28", "MG": "31 32 33 34 35 37 38",
    "PR": "41 42 43 44 45 46", "SC": "47 48 49", "RS": "51 53 54 55", "DF": "61", "GO": "62 64", "TO": "63",
    "MT": "65 66", "MS": "67", "AC": "68", "RO": "69", "BA": "71 73 74 75 77", "SE": "79", "PE": "81 87", "AL": "82",
    "PB": "83", "RN": "84", "CE": "85 88", "PI": "86 89", "PA": "91 93 94", "AM": "92 97", "RR": "95", "AP": "96",
    "MA": "98 99",
}.items():
    for _d in _ddds.split():
        DDD_UF[_d] = _uf

# Nome de estado ou capital (sem acento, minúsculas) -> UF. MT fica à parte: precisa de dica forte.
LUGAR_UF = {
    "mato grosso do sul": "MS", "campo grande": "MS", "dourados": "MS", "goias": "GO", "goiania": "GO", "anapolis": "GO",
    "brasilia": "DF", "distrito federal": "DF", "minas gerais": "MG", "belo horizonte": "MG", "sao paulo": "SP",
    "rio de janeiro": "RJ", "parana": "PR", "curitiba": "PR", "santa catarina": "SC", "florianopolis": "SC",
    "camboriu": "SC", "rio grande do sul": "RS", "porto alegre": "RS", "bahia": "BA", "salvador": "BA",
    "pernambuco": "PE", "recife": "PE", "ceara": "CE", "fortaleza": "CE", "espirito santo": "ES", "rondonia": "RO",
    "porto velho": "RO", "tocantins": "TO", "amazonas": "AM", "manaus": "AM", "belem": "PA", "maranhao": "MA",
    "piaui": "PI", "alagoas": "AL", "sergipe": "SE", "paraiba": "PB", "rio grande do norte": "RN",
}
_COMPACTOS = {k.replace(" ", ""): v for k, v in LUGAR_UF.items() if " " in k and len(k.replace(" ", "")) >= 7}

PAISES = {
    "BR": "Brasil", "PT": "Portugal", "IN": "Índia", "GB": "Reino Unido", "US": "Estados Unidos", "ES": "Espanha",
    "ZA": "África do Sul", "VE": "Venezuela", "UY": "Uruguai", "DE": "Alemanha", "PY": "Paraguai", "BO": "Bolívia",
    "AO": "Angola", "CH": "Suíça", "NL": "Países Baixos", "CU": "Cuba", "IT": "Itália", "CA": "Canadá",
    "SG": "Singapura", "TH": "Tailândia", "TR": "Turquia", "IL": "Israel", "AR": "Argentina", "CL": "Chile",
    "CO": "Colômbia", "PE": "Peru", "EC": "Equador", "MX": "México", "FR": "França", "CN": "China", "JP": "Japão",
    "AU": "Austrália", "MZ": "Moçambique", "IE": "Irlanda", "BE": "Bélgica", "SE": "Suécia", "AE": "Emirados Árabes",
}


# --------------------------------------------------------------------------- telefone e DDD

def ddd_de(tel) -> str:
    """DDD (de um número brasileiro, com ou sem o 55) ou ""."""
    d = "".join(c for c in str(tel or "") if c.isdigit())
    if len(d) in (12, 13) and d.startswith("55"):
        d = d[2:]
    return d[:2] if len(d) in (10, 11) and d[:2] in DDD_UF else ""


def ufs_dos_telefones(telefones) -> list[str]:
    """UFs dos telefones, na ordem e sem repetir."""
    ufs = []
    for t in telefones or []:
        uf = DDD_UF.get(ddd_de(t))
        if uf and uf not in ufs:
            ufs.append(uf)
    return ufs


# --------------------------------------------------------------------------- CEP (BrasilAPI) e cache

def _http_get(url: str, timeout: int = 15):
    """(status, texto). Erro de rede levanta; HTTP de erro volta como status."""
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, r.read().decode("utf-8", "ignore")
    except urllib.error.HTTPError as e:
        return e.code, ""


def _cep_limpo(cep) -> str:
    d = "".join(c for c in str(cep or "") if c.isdigit())
    return d if len(d) == 8 else ""


class ConsultaCep:
    """Consulta de CEP com cache em arquivo, no máximo `paralelo` consultas ao mesmo tempo e novas tentativas.

    O cache guarda `{state, city}` por CEP; um CEP que a API não conhece (404) fica como `null` e não é consultado de
    novo. Falha de rede ou 429/5xx esgotando as tentativas não vai para o cache (da próxima vez tenta outra vez)."""

    def __init__(self, caminho: str | None = None, http=None, dormir=time.sleep, paralelo: int = PARALELO,
                 tentativas: int = TENTATIVAS):
        self.caminho, self.http, self.dormir = caminho, http or _http_get, dormir
        self.paralelo, self.tentativas = paralelo, tentativas
        self.cache = {}
        self.consultas = 0  # chamadas feitas à API (não conta o cache)
        if caminho and os.path.exists(caminho):
            with open(caminho, encoding="utf-8") as fh:
                self.cache = json.load(fh)

    def _buscar(self, cep: str):
        for n in range(self.tentativas):
            try:
                self.consultas += 1
                status, texto = self.http(URL_CEP.format(cep))
            except Exception:
                status, texto = 599, ""
            if status == 200:
                try:
                    j = json.loads(texto)
                except ValueError:
                    return "erro"
                uf, cidade = str(j.get("state") or "").upper(), str(j.get("city") or "").strip()
                return {"state": uf, "city": cidade} if uf in UFS else None
            if status in (400, 404):
                return None
            if status == 429 or status >= 500:
                if n + 1 < self.tentativas:
                    self.dormir(min(2 ** n, 8))
                continue
            return "erro"
        return "erro"

    def uma(self, cep) -> dict | None:
        """{state, city} do CEP, ou None se não existe ou não deu para consultar."""
        c = _cep_limpo(cep)
        if not c:
            return None
        if c in self.cache:
            return self.cache[c]
        r = self._buscar(c)
        if r == "erro":
            return None
        self.cache[c] = r
        return r

    def varias(self, ceps) -> dict:
        """{cep: {state, city} | None} para vários CEPs, `paralelo` por vez."""
        unicos = sorted({_cep_limpo(c) for c in ceps if _cep_limpo(c)})
        falta = [c for c in unicos if c not in self.cache]
        if falta:
            with cf.ThreadPoolExecutor(self.paralelo) as ex:
                list(ex.map(self.uma, falta))
        return {c: self.cache.get(c) for c in unicos}

    def salvar(self):
        if not self.caminho:
            return
        os.makedirs(os.path.dirname(os.path.abspath(self.caminho)), exist_ok=True)
        with open(self.caminho, "w", encoding="utf-8") as fh:
            json.dump(self.cache, fh, ensure_ascii=False, sort_keys=True)


# --------------------------------------------------------------------------- dicas no nome e no domínio

def uf_por_dicas(nome: str, dominio: str) -> str:
    """UF pelo nome e pelo domínio, ou "". MT só com dica forte (sigla MT, "Mato Grosso", cidade de MT); dicas de
    estados diferentes juntas não dão resposta."""
    dom = re.sub(r"^(https?://)?(www\.)?", "", str(dominio or "").strip().lower()).split("/")[0]
    rotulos = " ".join(_sem_acento(x) for x in dom.split(".")[:-1])
    alvo = f"{_sem_acento(nome)} {rotulos}"
    sem_ms = re.sub(r"\bmato ?grosso ?do ?sul\b|matogrossodosul", " ", alvo)
    achados = set()
    siglas = _ufs_do_dominio(dom) | _ufs_do_nome(nome or "")
    achados |= siglas
    if _tem(sem_ms, CIDADES_MT) or re.search(r"cuiaba|matogrosso|rondonopolis|tangaradaserra|primaveradoleste|"
                                             r"lucasdorioverde|novamutum|barradogarcas|sinop\b", sem_ms):
        achados.add("MT")
    for termo, uf in LUGAR_UF.items():
        if _tem(alvo, [termo]):
            achados.add(uf)
    for termo, uf in _COMPACTOS.items():
        if termo in rotulos.replace(" ", ""):
            achados.add(uf)
    return next(iter(achados)) if len(achados) == 1 else ""


# --------------------------------------------------------------------------- resolver

def pais_da_explee(codigo) -> str:
    c = str(codigo or "").strip().upper()
    return PAISES.get(c, c) if c else ""


def resolver_empresa(dominio: str, nome: str = "", site: dict | None = None, telefones=(), pais_explee=None,
                     consulta: ConsultaCep | None = None) -> dict:
    """{pais, uf, cidade, fonteGeo} de uma empresa. `site` é a entrada de site_contatos.json do domínio; `telefones`,
    os do próprio lead e dos contatos dele; `pais_explee`, o código de país da Explee (BR ou outro)."""
    site = site or {}
    fones = list(site.get("whatsapp") or []) + list(site.get("telefones") or []) + list(telefones or [])
    ufs_ddd = ufs_dos_telefones(fones)
    uf, cidade, fonte = "", "", ""
    if consulta is not None and site.get("ceps"):
        achados = [r for r in consulta.varias(site["ceps"]).values() if r]
        escolhido = next((r for r in achados if r["state"] in ufs_ddd), None) or (achados[0] if achados else None)
        if escolhido:
            uf, cidade, fonte = escolhido["state"], escolhido["city"], "CEP no site"
    if not uf and ufs_ddd:
        uf, fonte = ufs_ddd[0], "DDD"
    if not uf:
        uf = uf_por_dicas(nome, dominio)
        fonte = "nome ou domínio" if uf else ""
    dom = str(dominio or "").strip().lower().rstrip("/")
    explee = str(pais_explee or "").strip().upper()
    if dom.endswith(".br") or uf or explee == "BR":
        pais = "Brasil"
    else:
        pais = pais_da_explee(explee) or "?"
    return {"pais": pais, "uf": uf, "cidade": cidade, "fonteGeo": fonte}


# --------------------------------------------------------------------------- entradas

def _dominio_de(texto) -> str:
    return re.sub(r"^(https?://)?(www\.)?", "", str(texto or "").strip().lower()).split("/")[0]


def _telefones_de(d: dict) -> list:
    """Telefones do lead ou do documento da base: o do lead, os dos contatos válidos e o contato da empresa."""
    fones = [d.get("telefone")]
    fones += [c.get("telefone") for c in d.get("contatos") or [] if isinstance(c, dict) and not c.get("invalido")]
    ce = d.get("contatoEmpresa") or {}
    fones += [ce.get("whatsapp"), ce.get("telefone")]
    return [f for f in fones if f]


def itens_da_entrada(x) -> list[dict]:
    """[{dominio, nome, telefones}] de uma lista de domínios (texto), de documentos da base ({id, data}) ou de leads."""
    if isinstance(x, dict):
        x = x.get("docs") or x.get("novos") or []
    saida = []
    for i in x or []:
        if isinstance(i, str):
            saida.append({"dominio": _dominio_de(i), "nome": "", "telefones": []})
            continue
        d = i["data"] if isinstance(i.get("data"), dict) else i
        dom = next((_dominio_de(v) for v in (d.get("dominio"), (d.get("baseExplee") or {}).get("dominio"),
                                             (d.get("explee") or {}).get("dominio"), d.get("site")) if _dominio_de(v)), "")
        saida.append({"dominio": dom, "nome": str(d.get("nome") or ""), "telefones": _telefones_de(d)})
    return saida


def paises_da_explee(pessoas: dict | None) -> dict:
    """{dominio: código de país} do pessoas.json da Explee: o código mais frequente entre as pessoas da empresa."""
    cont = {}
    for v in (pessoas or {}).values():
        lead = (v or {}).get("lead") or {}
        dom, pais = _dominio_de(lead.get("company_domain")), str(lead.get("country") or "").strip().upper()
        if dom and pais:
            cont.setdefault(dom, {}).setdefault(pais, 0)
            cont[dom][pais] += 1
    return {d: max(c.items(), key=lambda kv: (kv[1], kv[0]))[0] for d, c in cont.items()}


def resolver(itens: list[dict], site_contatos: dict | None = None, pessoas: dict | None = None,
             consulta: ConsultaCep | None = None) -> dict:
    """{dominio: {pais, uf, cidade, fonteGeo}} para os itens com domínio."""
    paises = paises_da_explee(pessoas)
    site_contatos = site_contatos or {}
    if consulta is not None:  # as consultas de CEP de todos de uma vez, 4 por vez
        consulta.varias([c for i in itens for c in (site_contatos.get(i["dominio"]) or {}).get("ceps") or []])
    saida = {}
    for i in itens:
        dom = i["dominio"]
        if dom and dom not in saida:
            saida[dom] = resolver_empresa(dom, i.get("nome") or "", site_contatos.get(dom), i.get("telefones"),
                                          paises.get(dom), consulta)
    return saida


def resumo(geo: dict) -> dict:
    por_uf = {}
    for g in geo.values():
        if g.get("uf"):
            por_uf[g["uf"]] = por_uf.get(g["uf"], 0) + 1
    top = sorted(por_uf.items(), key=lambda kv: (-kv[1], kv[0]))[:10]
    return {"dominios": len(geo), "comUF": sum(1 for g in geo.values() if g.get("uf")),
            "comCidade": sum(1 for g in geo.values() if g.get("cidade")), "porUF": dict(top),
            "porFonte": {f or "sem": sum(1 for g in geo.values() if (g.get("fonteGeo") or "") == f)
                         for f in sorted({g.get("fonteGeo") or "" for g in geo.values()})}}


# --------------------------------------------------------------------------- CLI

def _ler(caminho):
    with open(caminho, encoding="utf-8") as fh:
        return json.load(fh)


def main(argv=None):
    ap = argparse.ArgumentParser(prog="geo")
    sub = ap.add_subparsers(dest="cmd", required=True)
    r = sub.add_parser("resolver", help="país, UF e cidade por domínio (CEP do site, DDD, dicas no nome)")
    r.add_argument("--dominios", required=True, help="JSON: lista de domínios, base_docs ou leads ({id, data})")
    r.add_argument("--site-contatos", required=True, help="site_contatos.json (traz telefones e ceps)")
    r.add_argument("--explee-pessoas", help="pessoas.json da Explee (país de cada empresa)")
    r.add_argument("--cep-cache", default="dados/explee/cep_cache.json")
    r.add_argument("--saida", required=True)
    a = ap.parse_args(argv)
    consulta = ConsultaCep(a.cep_cache)
    try:
        geo = resolver(itens_da_entrada(_ler(a.dominios)), _ler(a.site_contatos),
                       _ler(a.explee_pessoas) if a.explee_pessoas else None, consulta)
    finally:
        consulta.salvar()
    os.makedirs(os.path.dirname(os.path.abspath(a.saida)), exist_ok=True)
    with open(a.saida, "w", encoding="utf-8") as fh:
        json.dump(geo, fh, ensure_ascii=False, indent=1)
    print(json.dumps({**resumo(geo), "consultasCep": consulta.consultas}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())

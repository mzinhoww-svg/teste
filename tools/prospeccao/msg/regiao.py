"""Onde fica a empresa do lead: "MT", "fora" ou "?" (desconhecido), para escolher a versão da copy.

Ordem dos sinais:
1. Telefone. DDD 65 ou 66 é Mato Grosso; qualquer outro DDD é fora. Vale o `telefone` do lead e o de cada contato
   não marcado como inválido; basta um número de MT para o lead ser "MT" (alguém ali atende em Cuiabá ou no
   interior, e o convite para o café faz sentido).
2. Sinais baratos no nome, no domínio e na cidade: cidades de MT ("cuiaba", "sinop", "rondonopolis"…), "Mato
   Grosso", a sigla MT colada numa entidade federada ("oabmt", "sesimt", "crcmt") ou solta no nome ("OAB MT"); e o
   mesmo para os outros estados ("goias", "brasilia", "Mato Grosso do Sul", "CREA-MS", "sescgo"). Um sinal de
   estado ganha de um sinal nacional ("Serviço Nacional ... AR/MG" é MG); sinais de MT e de outro estado juntos dão
   "?".
3. Entidade nacional (confederação, conselho federal, "nacional", "brasileira", "Brasil", CNC/CNA/CNI/OCB…) é
   "fora": tem sede fora de MT, mesmo que tenha representação aqui.
4. Nada disso: "?".
"""
import re
import unicodedata

from msg.enriquecimento import telefone_valido

MT, FORA, INCERTA = "MT", "fora", "?"
DDD_MT = {"65", "66"}

UFS = {"AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI",
       "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"}
# Sigla de estado solta no nome ("OAB MT", "CREA-MS"). "SE" fica de fora: é palavra em nome todo em maiúsculas.
_UF_NO_NOME = UFS - {"SE"}

# Cidades e termos de MT, já sem acento e em minúsculas (as cidades das geografias da campanha e as maiores do estado).
CIDADES_MT = ("cuiaba", "varzea grande", "sinop", "rondonopolis", "tangara da serra", "primavera do leste",
              "lucas do rio verde", "nova mutum", "barra do garcas", "caceres", "alta floresta", "campo verde",
              "sorriso mt", "chapada dos guimaraes", "pontes e lacerda", "juina", "colider", "guaranta do norte",
              "mato grosso", "matogrosso", "famato", "fiemt", "fecomercio mt", "aprosoja mt", "ammt")
# Outros estados e capitais (só os que aparecem em nome de entidade ou empresa com frequência).
LUGARES_FORA = ("mato grosso do sul", "matogrossodosul", "campo grande", "dourados", "goias", "goiania", "anapolis",
                "brasilia", "distrito federal", "minas gerais", "minas", "belo horizonte", "sao paulo", "saopaulo",
                "rio de janeiro", "riodejaneiro", "parana", "curitiba", "santa catarina", "florianopolis", "camboriu",
                "rio grande do sul", "porto alegre", "bahia", "salvador", "pernambuco", "recife", "ceara",
                "fortaleza", "espirito santo", "rondonia", "porto velho", "tocantins",
                "amazonas", "manaus", "belem", "maranhao", "piaui", "alagoas", "sergipe", "paraiba",
                "rio grande do norte")
# Entidade de abrangência nacional.
NACIONAL = re.compile(
    r"\b(confederacao|nacional|federal|brasileira|brasileiro|brasileiros|brasileiras|brasil|brazil|do brasil|"
    r"cnc|cna|cni|cnt|cnm|cndl|cnsaude|cnabrasil|cbic|ocb|cfc|cfo|cfq|cft|cfm|conass|consed|brasscom)\b")
# Siglas de entidade nacional no domínio: AB… (Associação Brasileira: abrace, abimaq, abert), AN… (Associação
# Nacional: aneac, anabb, antf), FENA… (Federação Nacional), CN…/CF… (confederação, conselho federal).
_SIGLA_NACIONAL = re.compile(r"(^|\s)(ab[rei][a-z]{2,6}|an[aeiopt][a-z]{1,6}|fena[a-z]{1,8}|cn[a-z]{1,6}|cf[a-z]{1,3})(\s|$)")
# Entidades federadas que levam a sigla do estado colada no domínio ("oabmt", "sescgo", "creams", "fiems").
_FEDERADAS = ("sesc", "sesi", "senai", "senac", "senar", "sebrae", "sest", "senat", "fie", "fecomercio", "faep",
              "oab", "crc", "crea", "cro", "cra", "crm", "crf", "crefito", "coren", "cress", "crp", "crmv", "ocb",
              "cdl", "sinduscon", "aprosoja", "acie", "sindi", "abrasel")
_COLADA = re.compile(rf"^(?:{'|'.join(sorted(_FEDERADAS, key=len, reverse=True))})({'|'.join(u.lower() for u in UFS)})$")


def _sem_acento(s) -> str:
    t = unicodedata.normalize("NFKD", str(s or "")).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", " ", t).strip()


def _achatar(lead: dict) -> dict:
    if isinstance(lead.get("data"), dict) and "nome" not in lead:
        return {"id": lead.get("id"), **lead["data"]}
    return lead


def ddd(tel) -> str:
    """DDD de um telefone brasileiro válido, ou ""."""
    t = telefone_valido(str(tel or ""))
    return t[2:4] if t else ""


def _ddds(lead: dict) -> list[str]:
    nums = [lead.get("telefone")] + [c.get("telefone") for c in lead.get("contatos") or [] if not c.get("invalido")]
    return [d for d in (ddd(n) for n in nums) if d]


def _dominio(lead: dict) -> str:
    for d in ((lead.get("baseExplee") or {}).get("dominio"), (lead.get("explee") or {}).get("dominio"), lead.get("site")):
        d = re.sub(r"^(https?://)?(www\.)?", "", str(d or "").strip().lower()).split("/")[0]
        if d:
            return d
    return ""


def _ufs_do_dominio(dom: str) -> set[str]:
    """Siglas de estado no domínio: rótulo `xx` ou `-xx`/`xx-` ("amhp-df"), ou colada numa entidade federada."""
    ufs = set()
    for rotulo in dom.split(".")[:-1]:
        if rotulo in ("com", "org", "net", "ind", "adv", "art", "arq", "gov", "edu", "etc", "pro", "ag"):
            continue
        partes = rotulo.split("-")
        for p in partes if len(partes) > 1 else []:
            if p.upper() in UFS:
                ufs.add(p.upper())
        m = _COLADA.match(rotulo)
        if m:
            ufs.add(m.group(1).upper())
    return ufs


def _ufs_do_nome(nome: str) -> set[str]:
    return {t for t in re.split(r"[^A-Za-z]+", nome or "") if t in _UF_NO_NOME}


def _tem(texto: str, termos) -> bool:
    return any(re.search(rf"\b{re.escape(t)}\b", texto) for t in termos)


def sinais(lead: dict) -> dict:
    """Os sinais de texto do lead: {"mt": bool, "fora": bool, "nacional": bool}."""
    lead = _achatar(lead)
    dom = _dominio(lead)
    perfil, empresa = lead.get("perfil") or {}, lead.get("empresa") or {}
    rotulos = " ".join(_sem_acento(x) for x in dom.split(".")[:-1])
    texto = " ".join(_sem_acento(x) for x in (lead.get("nome"), perfil.get("cidade"), empresa.get("municipio"),
                                               empresa.get("razaoSocial"), empresa.get("nomeFantasia")))
    alvo = f"{texto} {rotulos}"
    ufs = _ufs_do_dominio(dom) | _ufs_do_nome(lead.get("nome") or "")
    # "Mato Grosso do Sul" contém "Mato Grosso": tira antes de procurar MT.
    sem_ms = re.sub(r"\bmato ?grosso ?do ?sul\b|matogrossodosul", " ", alvo)
    mt = "MT" in ufs or _tem(sem_ms, CIDADES_MT) or bool(re.search(
        r"cuiaba|matogrosso|varzeagrande|rondonopolis|tangaradaserra|primaveradoleste|lucasdorioverde|novamutum|"
        r"barradogarcas|sinop\b", sem_ms))
    fora = bool(ufs - {"MT"}) or _tem(alvo, LUGARES_FORA) or bool(
        re.search(r"\S(goias|goiania|brasilia|minas|dourados|camboriu|matogrossodosul|saopaulo|riodejaneiro)\b|"
                  r"\S\Sdf\b|(^|\s)(\S*in)?rio\b", rotulos))
    nacional = bool(NACIONAL.search(alvo) or re.search(r"brasil|brazil", rotulos) or _SIGLA_NACIONAL.search(rotulos))
    return {"mt": mt, "fora": fora, "nacional": nacional}


def regiao(lead: dict) -> str:
    """"MT", "fora" ou "?" pelo DDD dos telefones e, sem telefone, pelos sinais do nome, domínio e cidade."""
    lead = _achatar(lead)
    ddds = _ddds(lead)
    if ddds:
        return MT if any(d in DDD_MT for d in ddds) else FORA
    s = sinais(lead)
    if s["mt"] and s["fora"]:
        return INCERTA
    if s["mt"]:
        return MT
    if s["fora"] or s["nacional"]:
        return FORA
    return INCERTA

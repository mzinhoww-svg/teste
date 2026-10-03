"""Estrutura e enriquecimento do lead: empresa, sócios, quem lidera e contatos por papel.

As pesquisas gravam um registro por lead (ver `REGISTRO`); este módulo valida cada
campo, descarta o que vier sem fonte ou fora do formato, classifica o lead
(bruto, parcial, completo) e sugere o contato da cadência.

Fontes, em ordem de confiança: Receita Federal via BrasilAPI (CNPJ e quadro de
sócios), site e Instagram da própria empresa, LinkedIn e notícias. Nada sem fonte.
"""
import re

PAPEIS = ("decisor", "comunicacao", "secretaria", "comercial", "geral", "setor")
ROTULO_PAPEL = {"decisor": "Decisor", "comunicacao": "Comunicação", "secretaria": "Secretaria",
                "comercial": "Comercial", "geral": "Geral", "setor": "Setor"}
CONFIANCAS = ("alta", "media", "baixa")
WHATS = ("sim", "nao", "?")
RISCO = re.compile(r"(?i)^aten[çc][ãa]o|acus|propina|denúncia|denuncia|investiga|assédio|assedio|processo judicial|"
                   r"propaganda enganosa|fraude|improbidade|operação policial|operacao policial")

REGISTRO = {
    "id": "", "empresa": {}, "socios": [], "decisores": [], "contatos": [], "redes": {},
    "sinais": [], "alertas": [], "pendencias": [], "observacao": "",
}


def cnpj_valido(cnpj: str) -> bool:
    d = re.sub(r"\D", "", cnpj or "")
    if len(d) != 14 or d == d[0] * 14:
        return False
    def dv(base: str, pesos: list[int]) -> int:
        r = sum(int(a) * b for a, b in zip(base, pesos)) % 11
        return 0 if r < 2 else 11 - r
    p1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    return dv(d[:12], p1) == int(d[12]) and dv(d[:13], [6] + p1) == int(d[13])


def telefone_valido(tel: str) -> str:
    """Devolve o telefone só com dígitos e DDI 55, ou "" se não for brasileiro com DDD."""
    d = re.sub(r"\D", "", tel or "")
    if len(d) in (10, 11):
        d = "55" + d
    if len(d) == 12 and d.startswith("55") and d[4] in "6789":
        d = d[:4] + "9" + d[4:]  # celular no formato antigo, sem o nono dígito
    if not re.fullmatch(r"55[1-9]\d(9\d{8}|[2-5]\d{7})", d):
        return ""
    return d


def telefones(texto) -> list[str]:
    """Todos os telefones válidos de uma célula de planilha ("x; y", "5565...0" que o Excel virou float)."""
    saida = []
    for parte in re.split(r"[;,/|]|\be\b|\bou\b", texto if isinstance(texto, str) else ""):
        t = telefone_valido(re.sub(r"\.0+\s*$", "", parte.strip()))
        if t and t not in saida:
            saida.append(t)
    return saida


def _txt(v) -> str:
    return "" if v is None else str(v).strip()


def normalizar(reg: dict) -> tuple[dict, list[str]]:
    """Valida um registro de pesquisa. Devolve (registro limpo, avisos)."""
    avisos: list[str] = []
    rid = _txt(reg.get("id"))
    a = lambda m: avisos.append(f"{rid}: {m}")  # noqa: E731

    emp = dict(reg.get("empresa") or {})
    cnpj = re.sub(r"\D", "", _txt(emp.get("cnpj")))
    if cnpj and not cnpj_valido(cnpj):
        a(f"CNPJ inválido descartado: {emp.get('cnpj')}")
        emp = {}
        cnpj = ""
    empresa = {k: _txt(emp.get(k)) for k in ("razaoSocial", "nomeFantasia", "situacao", "porte", "cnae",
                                               "abertura", "municipio", "fonte")}
    empresa["cnpj"] = cnpj
    empresa["capitalSocial"] = emp.get("capitalSocial") if isinstance(emp.get("capitalSocial"), (int, float)) else None
    if cnpj and not empresa["fonte"]:
        empresa["fonte"] = f"https://brasilapi.com.br/api/cnpj/v1/{cnpj}"

    socios = [{"nome": _txt(s.get("nome")), "qualificacao": _txt(s.get("qualificacao"))}
              for s in reg.get("socios") or [] if _txt(s.get("nome"))]
    if socios and not cnpj:
        a("sócios sem CNPJ confirmado descartados")
        socios = []

    decisores = []
    for d in reg.get("decisores") or []:
        nome, fonte = _txt(d.get("nome")), _txt(d.get("fonte"))
        if not nome or not fonte:
            a(f"decisor sem nome ou fonte descartado: {nome or '?'}")
            continue
        conf = _txt(d.get("confianca")).lower()
        decisores.append({"nome": nome, "cargo": _txt(d.get("cargo")), "linkedin": _txt(d.get("linkedin")),
                          "fonte": fonte, "confianca": conf if conf in CONFIANCAS else "baixa"})

    contatos, vistos = [], set()
    for c in reg.get("contatos") or []:
        tel = telefone_valido(_txt(c.get("telefone")))
        if _txt(c.get("telefone")) and not tel:
            a(f"telefone fora do formato descartado: {c.get('telefone')}")
        email = _txt(c.get("email")).lower()
        if email and not re.fullmatch(r"[^@\s]+@[^@\s]+\.[a-z]{2,}", email):
            a(f"e-mail inválido descartado: {email}")
            email = ""
        fonte = _txt(c.get("fonte"))
        if not (tel or email) or not fonte:
            continue
        chave = (tel, email)
        if chave in vistos:
            continue
        vistos.add(chave)
        papel = _txt(c.get("papel")).lower()
        whats = _txt(c.get("whatsapp")).lower().replace("não", "nao")
        conf = _txt(c.get("confianca")).lower()
        contatos.append({
            "id": f"k{len(contatos) + 1}", "papel": papel if papel in PAPEIS else "geral",
            "nome": _txt(c.get("nome")), "cargo": _txt(c.get("cargo")), "telefone": tel,
            "whatsapp": whats if whats in WHATS else "?", "email": email, "fonte": fonte,
            "confianca": conf if conf in CONFIANCAS else "baixa",
        })

    redes = {k: _txt((reg.get("redes") or {}).get(k)) for k in ("instagram", "linkedinEmpresa", "youtube")}
    sinais, alertas = [], []
    for s_ in reg.get("sinais") or []:
        if not (isinstance(s_, dict) and _txt(s_.get("texto"))):
            continue
        item = {"texto": re.sub(r"(?i)^aten[çc][ãa]o:\s*", "", _txt(s_.get("texto"))), "fonte": _txt(s_.get("fonte"))}
        # Notícia de risco não é gancho de conversa: vai para os alertas, que a central mostra à parte.
        if RISCO.search(_txt(s_.get("texto"))):
            alertas.append(item)
        elif item["fonte"]:
            sinais.append(item)
    pend = [_txt(p) for p in reg.get("pendencias") or [] if _txt(p)]
    limpo = {"id": rid, "empresa": empresa, "socios": socios, "decisores": decisores, "contatos": contatos,
             "redes": redes, "sinais": sinais, "alertas": alertas, "pendencias": pend,
             "observacao": _txt(reg.get("observacao"))}
    return limpo, avisos


def contato_direto(reg: dict) -> dict | None:
    """O melhor contato para a cadência entre decisor e comunicação.

    O canal pesa antes do papel, porque a cadência é por WhatsApp: WhatsApp, depois telefone, depois
    e-mail; no empate, comunicação antes do decisor (é quem cuida do assunto) e confiança maior antes.
    """
    def nota(c: dict) -> tuple:
        papel = {"comunicacao": 0, "decisor": 1, "comercial": 2, "secretaria": 3, "geral": 4, "setor": 5}[c["papel"]]
        canal = 0 if (c["telefone"] and c["whatsapp"] == "sim") else 1 if c["telefone"] else 2
        conf = {"alta": 0, "media": 1, "baixa": 2}[c["confianca"]]
        return (canal, papel, conf)
    candidatos = [c for c in reg.get("contatos", []) if c["papel"] in ("decisor", "comunicacao")]
    return min(candidatos, key=nota) if candidatos else None


def status(reg: dict) -> str:
    """completo: CNPJ (ou profissional sem PJ), quem lidera e contato direto; parcial: um dos dois; bruto: nada."""
    tem_decisor = bool(reg.get("decisores"))
    tem_direto = contato_direto(reg) is not None
    tem_cnpj = bool(reg.get("empresa", {}).get("cnpj"))
    if tem_decisor and tem_direto and (tem_cnpj or not reg.get("socios")):
        return "completo"
    if tem_decisor or tem_direto or tem_cnpj:
        return "parcial"
    return "bruto"


def doc_lead(reg: dict, hoje_iso: str) -> dict:
    """Campos de enriquecimento que vão para o documento do lead na central."""
    direto = contato_direto(reg)
    return {
        "empresa": reg["empresa"], "socios": reg["socios"], "decisores": reg["decisores"],
        "contatos": reg["contatos"], "redes": reg["redes"], "sinais": reg["sinais"], "alertas": reg.get("alertas", []),
        "pendencias": reg["pendencias"],
        "enriquecimento": {"status": status(reg), "atualizadoEm": hoje_iso, "observacao": reg["observacao"],
                           "contatoSugerido": direto["id"] if direto else None},
    }


_LIGA = {"de", "da", "do", "das", "dos", "e"}
_CARGO_ALTO = re.compile(r"(?i)s[oó]ci|diretor|ceo|fundador|presid|propriet|owner|partner")


def _tokens(nome: str) -> set[str]:
    import unicodedata
    s = unicodedata.normalize("NFKD", nome or "").encode("ascii", "ignore").decode().lower()
    return {t for t in re.findall(r"[a-z]+", s) if t not in _LIGA}


def contatos_hunter(reg: dict, hunter: dict) -> list[dict]:
    """E-mails do Hunter (domain-search) que valem como contato do lead, já no formato normalizado.

    Decisor: nome e sobrenome batem com um sócio da Receita ou com quem lidera. Cargo alto que não
    bate com ninguém conhecido entra como "geral", com confiança baixa, e não vira contato sugerido.
    O resto (júnior, sem cargo) fica de fora, assim como e-mail que o lead já tem.
    """
    nomes = [_tokens(p["nome"]) for p in reg.get("socios", []) + reg.get("decisores", [])]
    conhecidos = {c["email"] for c in reg.get("contatos", []) if c.get("email")}
    dominio = _txt(hunter.get("domain"))
    novos = []
    for e in hunter.get("emails") or []:
        email = _txt(e.get("value")).lower()
        if not email or email in conhecidos or not re.fullmatch(r"[^@\s]+@[^@\s]+\.[a-z]{2,}", email):
            continue
        pessoa = _tokens(f"{e.get('first_name') or ''} {e.get('last_name') or ''}")
        cargo = _txt(e.get("position"))
        if len(pessoa) >= 2 and any(pessoa <= n for n in nomes):
            nota, valido = e.get("confidence") or 0, (e.get("verification") or {}).get("status") == "valid"
            papel, conf = "decisor", "alta" if nota >= 90 and valido else "media" if nota >= 70 else "baixa"
        elif e.get("seniority") == "executive" or _CARGO_ALTO.search(cargo):
            papel, conf = "geral", "baixa"
        else:
            continue
        uri = next((_txt(s.get("uri")) for s in e.get("sources") or [] if _txt(s.get("uri"))), "")
        conhecidos.add(email)
        novos.append({"id": "", "papel": papel, "nome": f"{_txt(e.get('first_name'))} {_txt(e.get('last_name'))}".strip(),
                      "cargo": cargo, "telefone": "", "whatsapp": "?", "email": email,
                      "fonte": f"Hunter.io · {uri or dominio}", "confianca": conf})
    return novos


def contatos_planilha(reg: dict, linha: dict, ja_tem=()) -> list[dict]:
    """Telefones de uma linha da planilha enriquecida (Reiners_Leads_Apollo...csv), já normalizados.

    Pessoa (celular/WhatsApp de quem decide) vira Decisor; celular/WhatsApp da empresa vira Geral.
    Só entra com o link da fonte, e cadastro da Receita (Casa dos Dados) fica de fora: esses números
    dependem de decisão à parte.
    """
    vistos = {c["telefone"] for c in reg.get("contatos", []) if c.get("telefone")} | set(ja_tem)
    novos = []

    def somar(papel, nome, cargo, cel, whats, url):
        url = _txt(url)
        if not url.startswith("http") or "casadosdados" in url:
            return
        wl = telefones(whats)
        for t in telefones(cel) + wl:
            if t in vistos:
                continue
            vistos.add(t)
            novos.append({"id": "", "papel": papel, "nome": nome, "cargo": cargo, "telefone": t,
                          "whatsapp": "sim" if t in wl else "?", "email": "", "fonte": url, "confianca": "media"})

    nome = f"{_txt(linha.get('First Name'))} {_txt(linha.get('Last Name'))}".strip()
    somar("decisor", nome, _txt(linha.get("Title")), linha.get("Person Mobile Phone"),
          linha.get("Person WhatsApp"), linha.get("Person Contact Source URL"))
    somar("geral", "", "", linha.get("Company Mobile Phone"), linha.get("Company WhatsApp"),
          linha.get("Company Contact Source URL"))
    return novos


def _dominio(url: str) -> str:
    m = re.search(r"^(?:https?://)?(?:www\.)?([^/\s?#]+)", (url or "").strip().lower())
    return m.group(1) if m else ""


def somar_contatos(reg: dict, novos: list[dict]) -> dict:
    """Cópia do registro com os contatos novos no fim, renumerados k1, k2..."""
    contatos = [dict(c, id=f"k{i + 1}") for i, c in enumerate(reg.get("contatos", []) + novos)]
    return {**reg, "contatos": contatos}


def primeiro_nome(nome: str) -> str:
    """Como a Letícia chamaria a pessoa: "Dra. Lara", "Charles" (mesma regra da central)."""
    partes = (nome or "").split()
    if not partes:
        return ""
    if re.fullmatch(r"(?i)dra?\.?", partes[0]) and len(partes) > 1:
        return partes[0].rstrip(".").capitalize() + ". " + partes[1].capitalize()
    return partes[0].capitalize()


def carregar(caminho: str) -> dict[str, dict]:
    """Registros já normalizados (dados/enriquecimento.json), por id do lead."""
    import json
    import os
    if not os.path.exists(caminho):
        return {}
    with open(caminho, encoding="utf-8") as fh:
        return {r["id"]: r for r in json.load(fh)}


def main() -> None:
    """python3 -m msg.enriquecimento dados/enriq_brutos/*.json [--hunter dados/hunter] [--planilha x.csv]"""
    import argparse
    import json
    from collections import Counter
    ap = argparse.ArgumentParser()
    ap.add_argument("brutos", nargs="+")
    ap.add_argument("--out", default="dados/enriquecimento.json")
    ap.add_argument("--hunter", help="pasta com um domain-search do Hunter por domínio (dominio.json)")
    ap.add_argument("--leads", default="dados/leads.json", help="para ligar o domínio do site ao lead")
    ap.add_argument("--planilha", help="CSV enriquecido por fora (coluna Lead ID), ex. dados/apollo_enriquecido.csv")
    a = ap.parse_args()
    regs, avisos = [], []
    for caminho in a.brutos:
        with open(caminho, encoding="utf-8") as fh:
            for r in json.load(fh):
                limpo, av = normalizar(r)
                regs.append(limpo)
                avisos += av
    if a.hunter:
        import glob
        import os
        with open(a.leads, encoding="utf-8") as fh:
            site = {l["id"]: _dominio(l.get("site") or "") for l in json.load(fh)}
        por_dominio = {d: i for i, d in site.items() if d}
        ganhos = Counter()
        for caminho in sorted(glob.glob(os.path.join(a.hunter, "*.json"))):
            with open(caminho, encoding="utf-8") as fh:
                h = json.load(fh)
            lid = por_dominio.get(_dominio(h.get("domain") or os.path.basename(caminho)[:-5]))
            i = next((k for k, r in enumerate(regs) if r["id"] == lid), None)
            if i is None:
                continue
            novos = contatos_hunter(regs[i], h)
            if novos:
                regs[i] = somar_contatos(regs[i], novos)
                ganhos.update(c["papel"] for c in novos)
        print("Hunter:", dict(ganhos))
    if a.planilha:
        import csv
        with open(a.leads, encoding="utf-8") as fh:
            dos_leads = {l["id"]: set(telefones(l.get("telefone"))) for l in json.load(fh)}
        idx = {r["id"]: k for k, r in enumerate(regs)}
        ganhos = Counter()
        with open(a.planilha, encoding="utf-8-sig") as fh:
            for linha in csv.DictReader(fh):
                k = idx.get(_txt(linha.get("Lead ID")))
                if k is None:
                    continue
                novos = contatos_planilha(regs[k], linha, dos_leads.get(regs[k]["id"], set()))
                if novos:
                    regs[k] = somar_contatos(regs[k], novos)
                    ganhos.update(f"{c['papel']} {'WhatsApp' if c['whatsapp'] == 'sim' else 'telefone'}" for c in novos)
        print("Planilha:", dict(ganhos))
    with open(a.out, "w", encoding="utf-8") as fh:
        json.dump(regs, fh, ensure_ascii=False, indent=1)
    print(f"{len(regs)} registros em {a.out}")
    print("Status:", dict(Counter(status(r) for r in regs)))
    print("Com CNPJ:", sum(1 for r in regs if r["empresa"]["cnpj"]),
          "· com quem lidera:", sum(1 for r in regs if r["decisores"]),
          "· com contato direto:", sum(1 for r in regs if contato_direto(r)))
    print("Contato direto por canal:", dict(Counter(
        ("WhatsApp" if c["whatsapp"] == "sim" else "telefone" if c["telefone"] else "e-mail")
        for c in (contato_direto(r) for r in regs) if c)))
    print("\n".join(avisos) if avisos else "Sem avisos")


if __name__ == "__main__":
    main()

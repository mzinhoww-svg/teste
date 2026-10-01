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
    if not re.fullmatch(r"55[1-9]\d(9\d{8}|[2-5]\d{7})", d):
        return ""
    return d


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
    """python3 -m msg.enriquecimento dados/enriq_brutos/*.json --out dados/enriquecimento.json"""
    import argparse
    import json
    from collections import Counter
    ap = argparse.ArgumentParser()
    ap.add_argument("brutos", nargs="+")
    ap.add_argument("--out", default="dados/enriquecimento.json")
    a = ap.parse_args()
    regs, avisos = [], []
    for caminho in a.brutos:
        with open(caminho, encoding="utf-8") as fh:
            for r in json.load(fh):
                limpo, av = normalizar(r)
                regs.append(limpo)
                avisos += av
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

"""Contatos públicos da empresa tirados do próprio site, sem custo.

Lê a página inicial e as páginas de contato mais comuns e guarda o que a empresa publica:
telefone, WhatsApp (links wa.me / api.whatsapp) e e-mail. É contato institucional, não o celular
pessoal de quem decide; a fonte (URL) vai junto.

    python3 -m scripts.site_contatos coletar --base dados/explee/base_docs.json --saida dados/explee/site_contatos.json
"""
from __future__ import annotations

import argparse
import concurrent.futures as cf
import json
import os
import re
import urllib.request

CAMINHOS = ("", "/contato", "/contatos", "/fale-conosco", "/contact")
UA = "Mozilla/5.0 (compatible; reiners-central/1.0)"
RE_WA = re.compile(r"(?:wa\.me/|api\.whatsapp\.com/send\?phone=|whatsapp\.com/send/\?phone=)\+?(\d{10,13})")
RE_TEL_LINK = re.compile(r"tel:\+?(?:55)?\(?([1-9][1-9])\)?[\s.-]?(9?[2-9]\d{3})[\s.-]?(\d{4})\b")
RE_TEL = re.compile(r"\(\s*([1-9][1-9])\s*\)\s*(9?\s?[2-9]\d{3})[\s.-](\d{4})\b")
RE_CEP = re.compile(r"\b(\d{5})-(\d{3})\b")
RE_MAIL = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
LIXO_MAIL = ("sentry", "wixpress", "example", "domain.com", "email.com", "seuemail", ".png", ".jpg", ".webp", ".svg")


def normalizar(ddd: str, a: str, b: str) -> str:
    num = ddd + a + b
    return "55" + num if len(num) in (10, 11) else ""


def extrair(html: str, dominio: str) -> dict:
    wa = []
    for m in RE_WA.finditer(html):
        d = m.group(1)
        d = d if d.startswith("55") else "55" + d
        if len(d) in (12, 13) and d not in wa:
            wa.append(d)
    tel = []
    for m in list(RE_TEL_LINK.finditer(html)) + list(RE_TEL.finditer(html)):
        ddd, a, b = m.groups()
        n = normalizar(ddd, a.replace(" ", ""), b)
        if n and n not in tel and n not in wa:
            tel.append(n)
    mails = []
    for m in RE_MAIL.findall(html):
        m = m.lower().strip(".")
        if any(x in m for x in LIXO_MAIL) or m in mails:
            continue
        mails.append(m)
    # e-mail do próprio domínio primeiro
    mails.sort(key=lambda m: 0 if m.endswith("@" + dominio) or m.endswith("." + dominio) else 1)
    ceps = []
    for a, b in RE_CEP.findall(html):
        c = a + b
        if c not in ceps and not c.startswith("00"):
            ceps.append(c)
    return {"whatsapp": wa[:2], "telefones": tel[:3], "emails": mails[:3], "ceps": ceps[:2]}


def baixar(url: str, timeout: int = 8) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "text/html"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        if "html" not in (r.headers.get("Content-Type") or "html"):
            return ""
        return r.read(600_000).decode("utf-8", "ignore")


def coletar_um(dominio: str) -> dict:
    achado = {"whatsapp": [], "telefones": [], "emails": [], "ceps": [], "fonte": None}
    for base in ("https://" + dominio, "https://www." + dominio):
        ok = False
        for c in CAMINHOS:
            url = base + c
            try:
                html = baixar(url)
            except Exception:
                continue
            ok = True
            r = extrair(html, dominio)
            mudou = False
            for k in ("whatsapp", "telefones", "emails", "ceps"):
                for v in r[k]:
                    if v not in achado[k]:
                        achado[k].append(v)
                        mudou = True
            if mudou and not achado["fonte"]:
                achado["fonte"] = url
            if achado["whatsapp"] and achado["emails"]:
                break
        if ok:
            break
    for k, n in (("whatsapp", 2), ("telefones", 3), ("emails", 3), ("ceps", 2)):
        achado[k] = achado[k][:n]
    return achado


def main(argv=None):
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    c = sub.add_parser("coletar")
    c.add_argument("--base", required=True)
    c.add_argument("--saida", required=True)
    c.add_argument("--paralelo", type=int, default=24)
    a = ap.parse_args(argv)
    docs = json.load(open(a.base))
    feito = json.load(open(a.saida)) if os.path.exists(a.saida) else {}
    doms = sorted({(d.get("data") or d)["dominio"] for d in docs} - set(feito))
    with cf.ThreadPoolExecutor(a.paralelo) as ex:
        for i, (dom, r) in enumerate(zip(doms, ex.map(coletar_um, doms))):
            feito[dom] = r
            if i % 200 == 0:
                json.dump(feito, open(a.saida, "w"), ensure_ascii=False)
                print(i, flush=True)
    json.dump(feito, open(a.saida, "w"), ensure_ascii=False)
    com = sum(1 for v in feito.values() if v["whatsapp"] or v["telefones"] or v["emails"])
    print(json.dumps({"dominios": len(feito), "comAlgo": com,
                      "whatsapp": sum(1 for v in feito.values() if v["whatsapp"]),
                      "telefone": sum(1 for v in feito.values() if v["telefones"]),
                      "email": sum(1 for v in feito.values() if v["emails"])}))


if __name__ == "__main__":
    main()

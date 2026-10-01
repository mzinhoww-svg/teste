"""Gera as mensagens dos três toques, checa tudo e exporta a planilha.

Uso:
  python3 -m msg.gerar                      # checagem; precisa dar "0 erros"
  python3 -m msg.gerar --planilha Reiners_Leads_Cuiaba.xlsx
"""
import argparse
import json
from collections import Counter

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill

from msg.checks import Personal, check_lote, check_personal, check_toque
from msg.compose import compose_email, compose_whatsapp, wa_link
from msg.copy_posvenda import linhas_copy as linhas_copy_pv
from msg.copy_v1 import ICPS, TOQUES, VERSAO, linhas_copy
from msg.prep import Lead, canal, carregar


def carregar_personal(caminho: str) -> dict[str, Personal]:
    with open(caminho, encoding="utf-8") as fh:
        return {d["id"]: Personal(**d) for d in json.load(fh)}


def montar(l: Lead, p: Personal, ordem: int) -> dict:
    c = canal(l)
    toques = []
    for t in TOQUES:
        texto = compose_whatsapp(t, l.icp, p.saudacao, p.nome_curto, p.frase)
        item = {"n": t, "mensagem": "", "waLink": "", "assunto": "", "corpo": "", "_texto": texto}
        if c == "WhatsApp":
            item["mensagem"] = texto
            item["waLink"] = wa_link(l.telefone, texto)
        else:
            item["assunto"], item["corpo"] = compose_email(t, l.icp, p.saudacao, p.nome_curto, p.frase)
        toques.append(item)
    return {
        "id": l.id, "ordem": ordem, "nome": l.nome, "icp": l.icp, "segmento": ICPS[l.icp],
        "categoria": l.categoria, "faixa": l.faixa, "score": l.score, "bairro": l.bairro,
        "canal": c, "telefone": l.telefone, "email": l.email, "site": l.site,
        "instagram": l.instagram, "saudacao": p.saudacao, "nomeCurto": p.nome_curto,
        "fraseUnica": p.frase, "fonte": p.fonte, "flags": list(l.flags), "versaoCopy": VERSAO,
        "toques": toques,
    }


def gerar(leads_path: str, personal_path: str) -> tuple[list[dict], list[str]]:
    """Devolve (linhas, erros) só para leads com canal."""
    leads = [l for l in carregar(leads_path) if canal(l) != "Sem canal"]
    personal = carregar_personal(personal_path)
    linhas, erros, pares = [], [], []
    for ordem, l in enumerate(leads, start=1):
        p = personal.get(l.id)
        if p is None:
            erros.append(f"{l.id}: sem entrada em personal.json")
            continue
        erros += check_personal(l, p)
        linha = montar(l, p, ordem)
        for t in linha["toques"]:
            erros += check_toque(l, p, t["n"], t.pop("_texto"), t["waLink"])
        linhas.append(linha)
        pares.append((l, p))
    erros += check_lote(pares)
    return linhas, erros


COLUNAS = [
    ("ID", "id", 8), ("ICP", "icp", 7), ("Segmento", "segmento", 18), ("Nome", "nome", 32),
    ("Categoria", "categoria", 22), ("Bairro", "bairro", 16), ("Cidade", "cidade", 12),
    ("Telefone", "telefone", 15), ("Celular", "celular", 8), ("Canal", "canal", 10),
    ("E-mail", "email", 26), ("Site", "site", 28), ("Instagram", "instagram", 22),
    ("Responsável", "responsavel", 18), ("Especialidade", "especialidade", 40),
    ("Porte", "porte", 9), ("Score", "score", 7), ("Faixa", "faixa", 6), ("Flags", "flags", 16),
    ("Fonte do dado", "fonte", 30), ("Observação", "obs", 30),
    ("Saudação", "saudacao", 22), ("Nome curto", "nomeCurto", 18), ("Frase única", "fraseUnica", 50),
    ("Toque 1", "t1", 60), ("Toque 2", "t2", 60), ("Toque 3", "t3", 60),
    ("Status", "status", 12),
]


def exportar_planilha(destino: str, leads: list[Lead], linhas: list[dict]) -> None:
    por_id = {x["id"]: x for x in linhas}
    wb = Workbook()
    ws = wb.active
    ws.title = "Leads"
    cab = Font(name="Arial", size=10, bold=True, color="FFFFFF")
    fundo = PatternFill("solid", fgColor="0F0F0F")
    corpo = Font(name="Arial", size=10)
    ws.append([c[0] for c in COLUNAS])
    for c in ws[1]:
        c.font, c.fill = cab, fundo
    for l in leads:
        d = l.to_dict()
        d["canal"] = canal(l)
        d["segmento"] = ICPS.get(l.icp, "")
        d["celular"] = "Sim" if l.celular else ("WhatsApp fixo" if l.whatsapp_fixo else "Não")
        d["flags"] = ", ".join(l.flags)
        x = por_id.get(l.id)
        if x:
            d.update(saudacao=x["saudacao"], nomeCurto=x["nomeCurto"], fraseUnica=x["fraseUnica"])
            for t in x["toques"]:
                d[f"t{t['n']}"] = t["mensagem"] or f"Assunto: {t['assunto']}\n\n{t['corpo']}"
            d["status"] = "Pendente"
        else:
            d["status"] = "Sem canal"
        ws.append([d.get(k, "") if d.get(k) is not None else "" for _, k, _ in COLUNAS])
    for i, (_, _, w) in enumerate(COLUNAS, start=1):
        ws.column_dimensions[ws.cell(1, i).column_letter].width = w
    for row in ws.iter_rows(min_row=2):
        for c in row:
            c.font = corpo
            c.alignment = Alignment(wrap_text=c.column_letter in ("O", "X", "Y", "Z", "AA"), vertical="top")
    ws.freeze_panes = "E2"

    cp = wb.create_sheet("Copy")
    cp.append(["Bloco", "ICP", "Texto"])
    for c in cp[1]:
        c.font, c.fill = cab, fundo
    for linha in linhas_copy():
        cp.append(list(linha))
    for row in cp.iter_rows(min_row=2):
        for c in row:
            c.font = corpo
            c.alignment = Alignment(wrap_text=True, vertical="top")
    cp.column_dimensions["A"].width = 30
    cp.column_dimensions["B"].width = 8
    cp.column_dimensions["C"].width = 100

    pv = wb.create_sheet("Copy pós-venda")
    pv.append(["Etapa", "Quando / variante", "Texto"])
    for c in pv[1]:
        c.font, c.fill = cab, fundo
    for linha in linhas_copy_pv():
        pv.append(list(linha))
    for row in pv.iter_rows(min_row=2):
        for c in row:
            c.font = corpo
            c.alignment = Alignment(wrap_text=True, vertical="top")
    pv.column_dimensions["A"].width = 24
    pv.column_dimensions["B"].width = 28
    pv.column_dimensions["C"].width = 100
    wb.save(destino)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--leads", default="dados/leads.json")
    ap.add_argument("--personal", default="msg/personal.json")
    ap.add_argument("--planilha", help="exporta a planilha .xlsx com leads, mensagens e copy")
    ap.add_argument("--out", help="grava as mensagens geradas neste JSON")
    a = ap.parse_args()
    linhas, erros = gerar(a.leads, a.personal)
    print("\n".join(erros) or "0 erros")
    print(f"{len(linhas)} leads com mensagem")
    print("Canais:", dict(Counter(x["canal"] for x in linhas)))
    print("Fontes:", dict(Counter(x["fonte"] for x in linhas)))
    maior = max((len(t["mensagem"]) for x in linhas for t in x["toques"]), default=0)
    print("Maior WhatsApp:", maior, "caracteres")
    if a.out:
        with open(a.out, "w", encoding="utf-8") as fh:
            json.dump(linhas, fh, ensure_ascii=False, indent=1)
    if a.planilha:
        exportar_planilha(a.planilha, carregar(a.leads), linhas)
        print("Planilha:", a.planilha)


if __name__ == "__main__":
    main()

from openpyxl import load_workbook

from central.seed import doc_lead, doc_teste, seed
from msg.gerar import exportar_planilha, gerar
from msg.prep import carregar


def test_gerar_monta_tres_toques_por_canal(arquivos):
    lp, pp = arquivos
    linhas, erros = gerar(lp, pp)
    assert erros == []
    assert [x["id"] for x in linhas] == ["R0001", "R0002"]  # sem canal fica de fora
    whats, email = linhas
    assert whats["canal"] == "WhatsApp" and email["canal"] == "E-mail"
    assert [t["n"] for t in whats["toques"]] == [1, 2, 3]
    assert all(t["waLink"] and not t["corpo"] for t in whats["toques"])
    assert all(t["assunto"] and t["corpo"] and not t["waLink"] for t in email["toques"])


def test_gerar_acusa_lead_sem_personal(arquivos, tmp_path):
    lp, _ = arquivos
    vazio = tmp_path / "vazio.json"
    vazio.write_text("[]", encoding="utf-8")
    _, erros = gerar(lp, str(vazio))
    assert "R0001: sem entrada em personal.json" in erros


def test_seed_estado_inicial_e_lotes(arquivos):
    linhas, _ = gerar(*arquivos)
    d = doc_lead(linhas[0])
    assert d["etapa"] == 0 and d["situacao"] == "ativo" and d["enviado1"] is None
    assert len(d["toques"]) == 3
    lotes = seed(linhas * 30)
    assert [len(x) for x in lotes] == [50, 10]
    assert doc_teste()["telefone"] == "5565999207108"


def test_planilha_tem_leads_e_copy(arquivos, tmp_path):
    lp, pp = arquivos
    linhas, _ = gerar(lp, pp)
    destino = tmp_path / "saida.xlsx"
    exportar_planilha(str(destino), carregar(lp), linhas)
    wb = load_workbook(destino)
    assert wb.sheetnames == ["Leads", "Copy"]
    ws = wb["Leads"]
    assert ws.max_row == 4
    status = [ws.cell(r, ws.max_column).value for r in range(2, 5)]
    assert status == ["Pendente", "Pendente", "Sem canal"]

"""Aba Funil: etapas com contagem, abrir o lead a partir do funil e marcar a etapa comercial no card."""
import os

import pytest

pytest.importorskip("playwright.sync_api")
from playwright.sync_api import expect  # noqa: E402

from e2e.test_tela import ctx, entrar, navegador, pagina  # noqa: F401,E402


def test_funil_mostra_etapas_e_marca_reuniao(ctx, pagina):
    ctx.repo.aplicar("L4", {"segmento": "Advocacia"})
    entrar(pagina, ctx.url)
    pagina.get_by_role("tab", name="Funil").click()
    col = pagina.get_by_role("region", name="Respondeu: 1")
    expect(col).to_be_visible()
    col.get_by_role("button", name="Empresa Teste 4").click()
    painel = pagina.get_by_role("dialog", name="Empresa Teste 4")
    painel.get_by_role("button", name="Reunião marcada").click()
    expect(painel.get_by_role("button", name="Reunião marcada")).to_have_attribute("aria-pressed", "true")
    expect(pagina.get_by_role("region", name="Reunião marcada: 1")).to_be_visible()
    assert ctx.repo.lead_get("L4")["funil"] == "reuniao"
    expect(pagina.locator("#funil-segmentos")).to_contain_text("Advocacia")
    if os.environ.get("PRINT_DIR"):
        painel.get_by_role("button", name="Fechar", exact=True).click()
        pagina.screenshot(path=os.path.join(os.environ["PRINT_DIR"], "funil.png"), full_page=True)

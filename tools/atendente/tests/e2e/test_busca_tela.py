"""Busca geral na tela: achar lead por nome e por telefone (só o final), abrir o card, Base, Ctrl+K e celular (390 px).

Rodar:  cd tools/atendente && PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers python3 -m pytest tests/e2e/test_busca_tela.py -q
"""
import threading

import pytest

pytest.importorskip("playwright.sync_api")
from playwright.sync_api import expect  # noqa: E402

from atendente import servidor  # noqa: E402
from atendente.db import Repo  # noqa: E402
from e2e.test_tela import (AGORA, USUARIO, SENHA, AtendenteFalso, Ctx, WaFalso, _popular, entrar,  # noqa: E402,F401
                           navegador, pagina)


@pytest.fixture
def ctx():
    c = Ctx()
    c.repo = Repo(":memory:")
    _popular(c.repo)
    c.repo.lead_put({"id": "R0037", "nome": "Contabilist Contabilidade <img src=x onerror=window.__xss=1>",
                     "segmento": "Jurídico e contábil", "cidade": "Cuiabá", "uf": "MT", "situacao": "respondeu", "etapa": 1,
                     "telefone": "65 99990-0037", "canal": "WhatsApp"})
    c.repo.base_put({"id": "D00001", "nome": "Supermercado Exemplo", "segmento": "Varejo", "cidade": "Cuiabá",
                    "uf": "MT", "status": "base", "dominio": "supermercadoexemplo.example"})
    c.wa = WaFalso()
    cfg = {"webhook_segredo": "segredo-de-teste-do-webhook", "segredo_sessao": "segredo-de-teste-da-sessao-bem-longo",
           "usuarios": {USUARIO: SENHA}, "relogio": lambda: AGORA}
    c.srv = servidor.criar_servidor(c.repo, AtendenteFalso(), c.wa, cfg, "127.0.0.1", 0)
    c.porta = c.srv.server_address[1]
    c.url = f"http://127.0.0.1:{c.porta}/"
    threading.Thread(target=lambda: c.srv.serve_forever(poll_interval=0.05), daemon=True).start()
    yield c
    c.srv.shutdown()
    c.srv.server_close()


def test_acha_pelo_final_do_telefone_e_abre_o_card(ctx, pagina):
    entrar(pagina, ctx.url)
    pagina.locator("#busca-geral").fill("9990-0037")
    item = pagina.get_by_role("option", name="Contabilist")
    expect(item).to_be_visible()
    expect(item).to_contain_text("telefone com final 0037")
    expect(item).to_contain_text("Responderam")
    item.click()
    expect(pagina.locator("#painel")).to_be_visible()
    expect(pagina.locator("#painel-titulo")).to_contain_text("Contabilist")


def test_texto_do_lead_com_html_nao_executa(ctx, pagina):
    entrar(pagina, ctx.url)
    pagina.locator("#busca-geral").fill("contabilist")
    expect(pagina.get_by_role("option", name="Contabilist")).to_be_visible()
    assert pagina.evaluate("window.__xss") is None


def test_acha_na_base_e_leva_para_a_aba_base(ctx, pagina):
    entrar(pagina, ctx.url)
    pagina.locator("#busca-geral").fill("supermercado")
    pagina.get_by_role("option", name="Supermercado Exemplo").click()
    expect(pagina.locator("#vista-base")).to_be_visible()
    expect(pagina.locator("#l3-base-busca")).to_have_value("Supermercado Exemplo")


def test_nada_achado_avisa_e_atalho_ctrl_k(ctx, pagina):
    entrar(pagina, ctx.url)
    pagina.keyboard.press("Control+k")
    expect(pagina.locator("#busca-geral")).to_be_focused()
    pagina.keyboard.type("zzzzzz")
    expect(pagina.locator("#busca-lista")).to_contain_text("Nada encontrado")
    pagina.keyboard.press("Escape")
    expect(pagina.locator("#busca-lista")).to_be_hidden()


def test_busca_em_390px_sem_rolagem_lateral(ctx, navegador):
    c = navegador.new_context(viewport={"width": 390, "height": 800}, locale="pt-BR")
    pg = c.new_page()
    pg.set_default_timeout(8000)
    entrar(pg, ctx.url)
    pg.locator("#busca-geral").fill("contabilist")
    expect(pg.get_by_role("option", name="Contabilist")).to_be_visible()
    larg = pg.evaluate("[document.documentElement.scrollWidth, document.documentElement.clientWidth]")
    assert larg[0] <= larg[1], larg
    c.close()

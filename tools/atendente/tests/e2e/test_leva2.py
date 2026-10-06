"""Leva 2 na tela: arrastar e mover card (com desfazer), atalhos de teclado e enviar o toque agora.

Rodar:  cd tools/atendente && PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers python3 -m pytest tests/e2e -q
"""
import threading

import pytest

pytest.importorskip("playwright.sync_api")
from playwright.sync_api import expect  # noqa: E402

from atendente import servidor  # noqa: E402
from atendente.db import Repo  # noqa: E402
from e2e.test_tela import (AGORA, USUARIO, SENHA, AtendenteFalso, Ctx, WaFalso, _popular, coluna, entrar,  # noqa: E402,F401
                           navegador, pagina)

FOTOS = "https://fotos.exemplo.invalid/fotos"
TOQUE1 = "Oi, Paulo, tudo bem? Aqui é a Letícia, da Reiners Media. Te mandei uma foto do nosso estúdio."


class WaComAgenda(WaFalso):
    def __init__(self):
        super().__init__()
        self.agendados_agora = []

    def agendar(self, jid, texto, send_at, midia_url=None):
        self.agendados_agora.append((jid, texto, send_at, midia_url))
        id_ = f"agora-{len(self.agendados_agora)}"
        self.pendentes.append({"id": id_, "status": "PENDING"})
        return id_


@pytest.fixture
def ctx():
    c = Ctx()
    c.repo = Repo(":memory:")
    _popular(c.repo)
    c.repo.aplicar("L1", {"canal": "WhatsApp", "foto": "estudio-a", "saudacao": "Paulo",
                          "toques": [{"n": 1, "mensagem": TOQUE1}, {"n": 2, "mensagem": "Oi, Paulo, de novo."}]})
    c.wa = WaComAgenda()
    cfg = {"webhook_segredo": "segredo-de-teste-do-webhook", "segredo_sessao": "segredo-de-teste-da-sessao-bem-longo",
           "usuarios": {USUARIO: SENHA}, "relogio": lambda: AGORA, "fotos_url": FOTOS}
    c.srv = servidor.criar_servidor(c.repo, AtendenteFalso(), c.wa, cfg, "127.0.0.1", 0)
    c.porta = c.srv.server_address[1]
    c.url = f"http://127.0.0.1:{c.porta}/"
    threading.Thread(target=lambda: c.srv.serve_forever(poll_interval=0.05), daemon=True).start()
    yield c
    c.srv.shutdown()
    c.srv.server_close()


def card(pg, lead_id):
    return pg.locator(f'.card[data-id="{lead_id}"]')


def test_arrastar_card_para_fecharam_e_desfazer(ctx, pagina):
    entrar(pagina, ctx.url)
    card(pagina, "L1").drag_to(coluna(pagina, "Fecharam"))
    expect(coluna(pagina, "Fecharam").locator(".card")).to_have_count(2)
    assert ctx.repo.lead_get("L1")["situacao"] == "fechou"
    desfazer = pagina.get_by_role("button", name="Desfazer")
    expect(desfazer).to_be_visible()
    desfazer.click()
    expect(coluna(pagina, "Para hoje").locator('.card[data-id="L1"]')).to_have_count(1)
    assert ctx.repo.lead_get("L1")["situacao"] == "ativo"


def test_arrastar_para_sem_contato_explica_e_nao_muda(ctx, pagina):
    entrar(pagina, ctx.url)
    card(pagina, "L1").drag_to(coluna(pagina, "Sem contato"))
    expect(pagina.locator("#avisos")).to_contain_text("Sem contato é automático")
    expect(coluna(pagina, "Para hoje").locator('.card[data-id="L1"]')).to_have_count(1)
    assert ctx.repo.lead_get("L1")["situacao"] == "ativo"


def test_menu_mover_para_pelo_teclado_no_card(ctx, pagina):
    entrar(pagina, ctx.url)
    botao = pagina.get_by_role("button", name="Mover Empresa Teste 2 para outra coluna")
    botao.focus()
    pagina.keyboard.press("Enter")
    menu = pagina.get_by_role("menu")
    expect(menu).to_be_visible()
    expect(menu.get_by_role("menuitem", name="Aguardando")).to_have_count(0)   # a coluna atual não aparece
    expect(menu.get_by_role("menuitem", name="Sem contato")).to_have_count(0)
    expect(menu.get_by_role("menuitem").first).to_be_focused()
    pagina.keyboard.press("Escape")
    expect(menu).to_be_hidden()
    expect(botao).to_be_focused()
    pagina.keyboard.press("Enter")
    menu.get_by_role("menuitem", name="Responderam").click()
    expect(coluna(pagina, "Responderam").locator('.card[data-id="L2"]')).to_have_count(1)
    assert ctx.repo.lead_get("L2")["situacao"] == "respondeu"


def test_mover_pelo_painel(ctx, pagina):
    entrar(pagina, ctx.url)
    card(pagina, "L4").click()
    painel = pagina.get_by_role("dialog", name="Empresa Teste 4")
    grupo = painel.get_by_role("group", name="Mover para")
    expect(grupo.get_by_role("button", name="Responderam")).to_have_count(0)
    grupo.get_by_role("button", name="Saíram").click()
    expect(coluna(pagina, "Saíram").locator('.card[data-id="L4"]')).to_have_count(1)
    assert ctx.repo.lead_get("L4")["situacao"] == "sair"


def test_atalhos_j_k_enter_r_e_ajuda(ctx, pagina):
    entrar(pagina, ctx.url)
    pagina.locator("body").click(position={"x": 5, "y": 400})
    pagina.keyboard.press("j")
    primeiro = pagina.locator("#quadro .card").first
    expect(primeiro).to_be_focused()
    pagina.keyboard.press("j")
    expect(pagina.locator("#quadro .card").nth(1)).to_be_focused()
    pagina.keyboard.press("k")
    expect(primeiro).to_be_focused()
    assert "selecionado" in (primeiro.get_attribute("class") or "")
    # r: o selecionado (L1, Para hoje) vai para Responderam
    pagina.keyboard.press("r")
    expect(coluna(pagina, "Responderam").locator('.card[data-id="L1"]')).to_have_count(1)
    assert ctx.repo.lead_get("L1")["situacao"] == "respondeu"
    # 1 volta para a cadência
    pagina.keyboard.press("1")
    expect(coluna(pagina, "Para hoje").locator('.card[data-id="L1"]')).to_have_count(1)
    # Enter abre o painel do selecionado
    card(pagina, "L1").focus()
    pagina.keyboard.press("Enter")
    expect(pagina.get_by_role("dialog", name="Empresa Teste 1")).to_be_visible()
    # dentro de um campo de texto nenhum atalho age
    pagina.get_by_label("Nota para a equipe").fill("")
    pagina.get_by_label("Nota para a equipe").press("r")
    expect(pagina.get_by_label("Nota para a equipe")).to_have_value("r")
    assert ctx.repo.lead_get("L1")["situacao"] == "ativo"
    pagina.keyboard.press("Escape")
    expect(pagina.get_by_role("dialog", name="Empresa Teste 1")).to_be_hidden()
    # ? mostra a ajuda; Esc fecha
    pagina.keyboard.press("?")
    ajuda = pagina.get_by_role("dialog", name="Atalhos do teclado")
    expect(ajuda).to_be_visible()
    expect(ajuda).to_contain_text("Copiar a mensagem do próximo toque")
    pagina.keyboard.press("Escape")
    expect(ajuda).to_be_hidden()


def test_atalho_c_copia_a_mensagem_do_proximo_toque(ctx, navegador):
    c = navegador.new_context(viewport={"width": 1280, "height": 800}, locale="pt-BR",
                              permissions=["clipboard-read", "clipboard-write"])
    pg = c.new_page()
    pg.set_default_timeout(8000)
    try:
        entrar(pg, ctx.url)
        card(pg, "L1").focus()
        pg.keyboard.press("c")
        expect(pg.locator("#avisos")).to_contain_text("copiada")
        assert pg.evaluate("navigator.clipboard.readText()") == TOQUE1
    finally:
        c.close()


def test_enviar_toque_agora_com_confirmacao(ctx, pagina):
    entrar(pagina, ctx.url)
    card(pagina, "L1").click()
    painel = pagina.get_by_role("dialog", name="Empresa Teste 1")
    painel.get_by_role("button", name="Enviar toque 1 agora").click()
    conf = pagina.get_by_role("dialog", name="Enviar o toque 1 agora?")
    expect(conf).to_be_visible()
    expect(conf).to_contain_text(TOQUE1)
    expect(conf).to_contain_text("foto")
    conf.get_by_role("button", name="Cancelar").click()
    assert ctx.wa.agendados_agora == []
    painel.get_by_role("button", name="Enviar toque 1 agora").click()
    conf.get_by_role("button", name="Sim, enviar agora").click()
    expect(pagina.locator("#avisos")).to_contain_text("Toque 1 enviado")
    assert len(ctx.wa.agendados_agora) == 1 and ctx.wa.agendados_agora[0][3] == FOTOS + "/estudio-a.jpg"
    expect(coluna(pagina, "Aguardando").locator('.card[data-id="L1"]')).to_have_count(1)
    assert ctx.repo.lead_get("L1")["enviado1"] == "2026-10-07T15:00:00Z"
    # o próximo toque ainda não vence: o botão fica desativado e diz por quê
    expect(painel.get_by_role("button", name="Enviar toque 2 agora")).to_be_disabled()
    expect(painel).to_contain_text("só vence em")


def test_lead_que_saiu_nao_tem_envio_de_toque(ctx, pagina):
    entrar(pagina, ctx.url)
    card(pagina, "L6").click()
    painel = pagina.get_by_role("dialog", name="Empresa Teste 6")
    expect(painel).to_contain_text("não se escreve mais")
    expect(painel.get_by_role("button", name="Enviar toque 1 agora")).to_be_disabled()


def test_390px_sem_rolagem_com_os_botoes_da_leva2(ctx, navegador):
    c = navegador.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, has_touch=True, is_mobile=True)
    pg = c.new_page()
    pg.set_default_timeout(8000)
    try:
        entrar(pg, ctx.url)
        card(pg, "L1").click()
        expect(pg.get_by_role("group", name="Mover para")).to_be_visible()
        dims = pg.evaluate("({sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth})")
        assert dims["sw"] <= dims["cw"], dims
    finally:
        c.close()

"""Leva 1 na tela (Playwright): dados no card, filtros, busca, visões rápidas e o painel com o próximo toque.
Leads no formato real da Central, dados 100% fictícios.

Rodar:  cd tools/atendente && PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers python3 -m pytest tests/e2e -q
"""
import os
import threading
from datetime import datetime, timezone

import pytest

pytest.importorskip("playwright.sync_api")
from playwright.sync_api import expect, sync_playwright  # noqa: E402

from atendente import servidor  # noqa: E402
from atendente.db import Repo  # noqa: E402

AGORA = datetime(2026, 10, 7, 15, 0, tzinfo=timezone.utc)
USUARIO, SENHA = "ana", "senha-inventada-ana"
XSS = "<img src=x onerror=window.__xss=1>"
CHROMIUM = os.environ.get("CHROMIUM_PATH") or next(
    (p for p in ("/opt/pw-browsers/chromium", "/usr/bin/chromium", "/usr/bin/chromium-browser") if os.path.exists(p)), None)
MSG1 = ("Oi, Antônio, tudo bem? Aqui é a Letícia, da Reiners Media.\n\n"
        "Te mandei uma foto do nosso cenário Mesa de reunião, para bate-papo com até quatro pessoas.\n\nQue dia fica bom?")


class WaFalso:
    pendentes = []

    def verificar(self, numeros):
        return {n: f"{n}@s.whatsapp.net" for n in numeros}

    def conectado(self):
        return True

    def agendadas(self, aba):
        return []

    def cancelar(self, id_):
        pass


class AtendenteFalso:
    def tratar_mensagem(self, m, agora):
        return "respondida"


def real(i, **extra):
    d = {"id": f"R{i:03d}", "nome": f"Empresa Fictícia {i}", "ordem": i,
         "empresa": {"cnpj": "12345678000190", "razaoSocial": f"Fictícia {i} Ltda", "porte": "ME", "cnae": "Serviços"},
         "canal": "WhatsApp", "categoria": "Advocacia", "segmento": "Jurídico e contábil", "faixa": "A", "icp": "ICP3",
         "score": 80, "pais": "Brasil", "uf": "MT", "cidade": "Cuiabá", "bairro": "Centro",
         "telefone": f"55659999000{i:02d}", "email": f"contato{i}@ficticia.example", "site": "https://ficticia.example",
         "instagram": "@ficticia", "redes": {"instagram": "", "linkedinEmpresa": "javascript:alert(1)", "youtube": ""},
         "saudacao": "Antônio", "situacao": "ativo", "etapa": 0, "foto": "mesa-pessoa-02",
         "toques": [{"n": 1, "mensagem": MSG1}, {"n": 2, "mensagem": "Oi, Antônio, toque dois."},
                    {"n": 3, "mensagem": "Oi, Antônio, toque três."}],
         "decisores": [{"nome": f"Antônio Fictício {i}", "cargo": "Sócio fundador", "fonte": "https://ficticia.example/",
                        "linkedin": ""}],
         "contatos": [{"id": "k1", "papel": "geral", "nome": "", "telefone": f"55659999000{i:02d}", "whatsapp": "sim",
                       "email": f"contato{i}@ficticia.example", "fonte": "site"}],
         "perfil": {"cidade": "Cuiabá", "especialidade": "advocacia cível", "porte": "médio", "nota": 4.7, "avaliacoes": 31},
         "socios": [{"nome": f"Antônio Fictício {i}", "qualificacao": "Sócio-Administrador"}],
         "sinais": [], "fraseUnica": "Um escritório que vai do cível ao trabalhista.", "alertas": [], "pendencias": [],
         "historico": []}
    d.update(extra)
    return d


def _popular(repo):
    repo.lead_put(real(1))                                                               # não enviado, para hoje
    repo.lead_put(real(2, etapa=1, enviado1="2026-10-07T13:00:00Z", segmento="Saúde", faixa="B",
                       cidade="Várzea Grande", decisores=[{"nome": "Bárbara Inventada", "cargo": "Diretora"}]))
    repo.lead_put(real(3, etapa=1, enviado1="2026-10-01T13:00:00Z", uf="SP", cidade="São Paulo"))  # enviado 1, hoje
    repo.lead_put(real(4, etapa=2, enviado1="2026-09-20T13:00:00Z", enviado2="2026-10-06T13:00:00Z", decisores=[]))
    repo.lead_put(real(5, situacao="respondeu", etapa=1, enviado1="2026-10-01T13:00:00Z"))
    repo.lead_put(real(6, telefone="", contatos=[], segmento="Saúde"))                   # sem contato
    repo.lead_put(real(7, situacao="sair"))


class Ctx:
    pass


@pytest.fixture
def ctx():
    c = Ctx()
    c.repo = Repo(":memory:")
    _popular(c.repo)
    cfg = {"webhook_segredo": "segredo-de-teste-do-webhook", "segredo_sessao": "segredo-de-teste-da-sessao-bem-longo",
           "usuarios": {USUARIO: SENHA}, "relogio": lambda: AGORA}
    c.srv = servidor.criar_servidor(c.repo, AtendenteFalso(), WaFalso(), cfg, "127.0.0.1", 0)
    c.url = f"http://127.0.0.1:{c.srv.server_address[1]}/"
    threading.Thread(target=lambda: c.srv.serve_forever(poll_interval=0.05), daemon=True).start()
    yield c
    c.srv.shutdown()
    c.srv.server_close()


@pytest.fixture(scope="module")
def navegador():
    if not CHROMIUM:
        pytest.skip("Chromium não encontrado (defina CHROMIUM_PATH)")
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=CHROMIUM, args=["--no-sandbox"])
        yield b
        b.close()


@pytest.fixture
def pagina(navegador):
    ctx = navegador.new_context(viewport={"width": 1280, "height": 900}, locale="pt-BR")
    pg = ctx.new_page()
    pg.set_default_timeout(8000)
    yield pg
    ctx.close()


def entrar(pg, url):
    pg.goto(url)
    pg.get_by_label("Usuário").fill(USUARIO)
    pg.get_by_label("Senha").fill(SENHA)
    pg.get_by_role("button", name="Entrar").click()
    expect(pg.locator(".card").first).to_be_visible()


def cards(pg):
    return pg.locator("#quadro .card")


def visao(pg, nome):
    return pg.locator("#filtros-quadro .l1-visoes").get_by_role("button", name=nome)


def test_card_mostra_segmento_faixa_canal_cidade_score_e_etiqueta(ctx, pagina):
    entrar(pagina, ctx.url)
    c1 = pagina.locator('.card[data-id="R001"]')
    expect(c1.locator(".l1-meta")).to_have_text("Jurídico e contábil · Faixa A · WhatsApp · Cuiabá/MT")
    expect(c1.locator(".l1-nums")).to_have_text("Score 80 · ICP3")
    expect(c1.locator(".l1-etiqueta")).to_have_text("Toque 1 hoje")
    expect(c1.locator(".l1-decide")).to_have_text("Decide: Antônio Fictício 1")
    expect(pagina.locator('.card[data-id="R002"] .l1-etiqueta')).to_have_text("Toque 2 a partir de 11/10")
    expect(pagina.locator('.card[data-id="R005"] .l1-etiqueta')).to_have_text("Respondeu")
    expect(pagina.locator('.card[data-id="R006"] .l1-etiqueta')).to_have_text("Sem telefone")
    expect(pagina.locator('.card[data-id="R004"] .l1-decide')).to_have_count(0)


def test_visoes_rapidas_com_contadores_e_combinadas_com_filtro(ctx, pagina):
    entrar(pagina, ctx.url)
    expect(cards(pagina)).to_have_count(7)
    for nome, n in [("Todos", 7), ("Não enviados", 2), ("Para hoje", 2), ("Enviado 1", 2), ("Enviado 2", 1),
                    ("Enviado 3", 0), ("Responderam", 1), ("Sem contato", 1)]:
        expect(visao(pagina, nome).locator(".l1-num")).to_have_text(str(n))
    visao(pagina, "Enviado 1").click()
    expect(visao(pagina, "Enviado 1")).to_have_attribute("aria-pressed", "true")
    expect(cards(pagina)).to_have_count(2)
    expect(pagina.locator("#l1-contagem")).to_have_text("Mostrando 2 de 7 leads")
    pagina.get_by_label("Segmento").select_option("Saúde")
    expect(cards(pagina)).to_have_count(1)
    expect(cards(pagina).first).to_have_attribute("data-id", "R002")
    # os contadores das visões passam a contar só o segmento escolhido
    expect(visao(pagina, "Não enviados").locator(".l1-num")).to_have_text("1")
    expect(visao(pagina, "Todos").locator(".l1-num")).to_have_text("2")
    pagina.get_by_role("button", name="Limpar filtros").click()
    expect(cards(pagina)).to_have_count(7)
    expect(visao(pagina, "Todos")).to_have_attribute("aria-pressed", "true")
    expect(pagina.get_by_label("Segmento")).to_have_value("")
    expect(pagina.locator("#busca-quadro")).to_be_focused()


def test_filtros_com_contagem_nas_opcoes(ctx, pagina):
    entrar(pagina, ctx.url)
    seg = pagina.get_by_label("Segmento")
    expect(seg.locator("option")).to_have_text(["Todos (7)", "Jurídico e contábil (5)", "Saúde (2)"])
    pagina.get_by_label("Estado").select_option("SP")
    expect(cards(pagina)).to_have_count(1)
    expect(pagina.get_by_label("Cidade").locator("option")).to_have_text(["Todas (1)", "São Paulo (1)"])
    pagina.get_by_label("Estado").select_option("")
    pagina.get_by_label("Quem decide").select_option("sem")
    expect(cards(pagina)).to_have_count(1)
    expect(cards(pagina).first).to_have_attribute("data-id", "R004")
    pagina.get_by_label("Quem decide").select_option("")
    pagina.get_by_label("Etapa").select_option("respondeu")
    expect(cards(pagina)).to_have_count(1)
    pagina.get_by_label("Etapa").select_option("")
    pagina.get_by_label("Faixa").select_option("B")
    expect(cards(pagina)).to_have_count(1)
    pagina.get_by_label("Canal").select_option("WhatsApp")
    expect(cards(pagina)).to_have_count(1)


def test_barra_busca_pelo_atalho_sem_acento_e_esc_limpa(ctx, pagina):
    entrar(pagina, ctx.url)
    pagina.locator("body").press("/")
    busca = pagina.locator("#busca-quadro")
    expect(busca).to_be_focused()
    pagina.keyboard.type("barbara")                        # sem acento acha a decisora "Bárbara"
    expect(cards(pagina)).to_have_count(1)
    expect(cards(pagina).first).to_have_attribute("data-id", "R002")
    busca.fill("varzea")
    expect(cards(pagina)).to_have_count(1)
    busca.fill("12345678000190")                           # CNPJ
    expect(cards(pagina)).to_have_count(7)
    busca.fill("ninguém tem isso")
    expect(cards(pagina)).to_have_count(0)
    expect(pagina.locator("#l1-contagem")).to_contain_text("Nenhum lead com esses filtros")
    busca.press("Escape")
    expect(busca).to_have_value("")
    expect(cards(pagina)).to_have_count(7)


def test_painel_mostra_proximo_toque_perfil_decisores_e_links(ctx, pagina):
    ctx.srv.cfg["fotos_url"] = "https://fotos.invalid/central"   # endereço que não existe: vale o texto alternativo
    entrar(pagina, ctx.url)
    pagina.locator('.card[data-id="R001"]').click()
    painel = pagina.get_by_role("dialog", name="Empresa Fictícia 1")
    expect(painel).to_be_visible()
    extra = painel.locator("#painel-leva1")
    prox = extra.get_by_role("region", name="Próximo toque")
    expect(prox).to_contain_text("Toque 1 · Visita · sai hoje")
    expect(prox.locator(".l1-msg")).to_have_text(MSG1)
    expect(prox.get_by_role("img")).to_have_attribute("alt", "Foto do cenário Mesa de reunião, que vai junto com o toque 1")
    expect(extra.get_by_role("region", name="Perfil")).to_contain_text("Advocacia cível.")
    expect(extra.get_by_role("region", name="Perfil")).to_contain_text("Google 4,7 (31 avaliações)")
    expect(extra.get_by_role("region", name="Quem decide")).to_contain_text("Antônio Fictício 1")
    expect(extra.get_by_role("region", name="Contatos")).to_contain_text("+55 (65) 99990-0001 · WhatsApp")
    expect(extra.get_by_role("region", name="Empresa na Receita")).to_contain_text("CNPJ 12.345.678/0001-90")
    links = extra.get_by_role("region", name="Links").get_by_role("link")
    expect(links).to_have_count(2)                      # Site e Instagram; o "javascript:" não vira link
    expect(links.nth(1)).to_have_attribute("href", "https://instagram.com/ficticia")
    # quem respondeu não tem próximo toque
    pagina.locator('.card[data-id="R005"]').click()
    expect(pagina.get_by_role("dialog", name="Empresa Fictícia 5").get_by_role("region", name="Próximo toque")).to_contain_text(
        "O lead respondeu")


def test_card_e_painel_com_html_nao_executam(ctx, pagina):
    ctx.repo.lead_put(real(9, segmento=XSS, cidade=XSS, decisores=[{"nome": XSS, "cargo": XSS, "fonte": XSS}],
                           perfil={"especialidade": XSS}, fraseUnica=XSS, foto=None,
                           toques=[{"n": 1, "mensagem": XSS}], site="javascript:window.__xss=1"))
    entrar(pagina, ctx.url)
    card = pagina.locator('.card[data-id="R009"]')
    expect(card.locator(".l1-decide")).to_contain_text(XSS)
    card.click()
    expect(pagina.locator("#painel-leva1 .l1-msg")).to_have_text(XSS)
    expect(pagina.locator("img")).to_have_count(0)
    pagina.wait_for_timeout(300)
    assert pagina.evaluate("typeof window.__xss") == "undefined"


def test_filtros_em_390px_sem_rolagem_da_pagina(ctx, navegador):
    c = navegador.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, has_touch=True, is_mobile=True)
    pg = c.new_page()
    pg.set_default_timeout(8000)
    try:
        entrar(pg, ctx.url)
        expect(pg.locator("#busca-quadro")).to_be_visible()
        expect(pg.locator("#l1-selects")).to_be_hidden()          # no telefone os selects ficam atrás do botão Filtros
        pg.get_by_role("button", name="Filtros").click()
        expect(pg.locator("#l1-selects")).to_be_visible()
        dims = pg.evaluate("({sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth})")
        assert dims["sw"] <= dims["cw"], dims
        pg.locator('.card[data-id="R001"]').click()
        expect(pg.locator("#painel-leva1")).to_be_visible()
        dims = pg.evaluate("({sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth})")
        assert dims["sw"] <= dims["cw"], dims
    finally:
        c.close()

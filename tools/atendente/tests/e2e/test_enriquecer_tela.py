"""Aba Enriquecer de ponta a ponta (Playwright + Chromium): plano, confirmação do teto, progresso ao vivo, Parar,
histórico e o resultado no painel do lead. Treg falso (nada de rede nem de dinheiro), dados fictícios."""
import json
import os
import threading
from datetime import datetime, timezone

import pytest

pytest.importorskip("playwright.sync_api")
from playwright.sync_api import expect, sync_playwright  # noqa: E402

from atendente import enriquecer, servidor  # noqa: E402
from atendente.db import Repo  # noqa: E402

AGORA = datetime(2026, 10, 7, 15, 0, tzinfo=timezone.utc)
USUARIO, SENHA = "ana", "senha-inventada-ana"
XSS = "<img src=x onerror=window.__xss=1>"
CHROMIUM = os.environ.get("CHROMIUM_PATH") or next(
    (p for p in ("/opt/pw-browsers/chromium", "/usr/bin/chromium", "/usr/bin/chromium-browser") if os.path.exists(p)), None)


class WaFalso:
    def conectado(self):
        return True

    def agendadas(self, aba):
        return []

    def cancelar(self, id_):
        pass


class AtendenteFalso:
    def tratar_mensagem(self, m, agora):
        return "respondida"


def _lead(i, **extra):
    d = {"id": f"R{i:04d}", "nome": f"Empresa Teste {i}", "empresa": {"cnpj": "", "municipio": "Cuiabá"},
         "situacao": "ativo", "faixa": "B", "score": 50, "etapa": 0, "canal": "whatsapp",
         "site": f"https://www.empresa{i}.com.br/", "telefone": f"55659999000{i:02d}", "saudacao": f"Pessoa{i}",
         "contatos": [], "historico": [], "pendencias": [],
         "decisores": [{"nome": f"Pessoa{i} {XSS}", "cargo": "Sócio", "linkedin": f"https://www.linkedin.com/in/p{i}"}],
         "enriquecimento": {"status": "parcial"}}
    d.update(extra)
    return d


class Treg:
    """Segura cada chamada até o teste liberar, para dar tempo de ver o progresso e clicar em Parar."""

    def __init__(self):
        self.liberar = threading.Semaphore(0)
        self.chamadas = 0

    def __call__(self, metodo, url, headers, corpo):
        self.chamadas += 1
        self.liberar.acquire(timeout=10)
        n = int(headers["Idempotency-Key"].split("-")[-2][1:])
        hs = {"X-Treg-Cost-Micro": "125000", "X-Treg-Call-Id": f"c{n}", "X-Treg-Served-By": "falso"}
        return 200, hs, json.dumps({"output": {"phone": f"55659999000{n + 40:02d}"}}).encode()


class Ctx:
    pass


def _ctx(token):
    c = Ctx()
    c.repo = Repo(":memory:")
    for i in range(1, 4):
        c.repo.lead_put(_lead(i))
    c.treg = Treg()
    c.enr = enriquecer.Enriquecedor(c.repo, token=token, transporte=c.treg, relogio=lambda: AGORA,
                                    coletar_site=lambda d: {})
    cfg = {"webhook_segredo": "segredo-de-teste-do-webhook", "segredo_sessao": "segredo-de-teste-da-sessao-bem-longo",
           "usuarios": {USUARIO: SENHA}, "relogio": lambda: AGORA, "enriquecedor": c.enr}
    c.srv = servidor.criar_servidor(c.repo, AtendenteFalso(), WaFalso(), cfg, "127.0.0.1", 0)
    c.url = f"http://127.0.0.1:{c.srv.server_address[1]}/"
    threading.Thread(target=lambda: c.srv.serve_forever(poll_interval=0.05), daemon=True).start()
    return c


@pytest.fixture
def ctx():
    c = _ctx("tok-inventado")
    yield c
    for _ in range(10):
        c.treg.liberar.release()
    c.enr.esperar(5)
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
    ctx = navegador.new_context(viewport={"width": 1280, "height": 800}, locale="pt-BR")
    pg = ctx.new_page()
    pg.set_default_timeout(8000)
    yield pg
    ctx.close()


def entrar(pg, url):
    pg.goto(url)
    pg.get_by_label("Usuário").fill(USUARIO)
    pg.get_by_label("Senha").fill(SENHA)
    pg.get_by_role("button", name="Entrar").click()
    expect(pg.locator("#interruptor")).to_be_visible()


def test_enriquecer_plano_confirmacao_progresso_parar_e_historico(ctx, pagina):
    entrar(pagina, ctx.url)
    pagina.get_by_role("tab", name="Enriquecer").click()
    secao = pagina.locator("#vista-enriquecer")
    expect(secao).to_be_visible()
    pagina.get_by_role("button", name="Enriquecer base").click()
    plano = pagina.locator("#enriq-plano")
    expect(plano).to_contain_text("Leads para buscar o celular de quem decide")
    expect(plano).to_contain_text("3")
    expect(plano).to_contain_text("US$ 10,00")
    comecar = pagina.get_by_role("button", name="Começar")
    expect(comecar).to_be_disabled()
    pagina.get_by_label("Confirmo que esta rodada pode gastar até US$ 10,00.").check()
    expect(comecar).to_be_enabled()
    comecar.click()
    andamento = pagina.locator("#enriq-andamento")
    expect(andamento).to_contain_text("Buscando telefones")
    expect(pagina.get_by_role("button", name="Enriquecer base")).to_be_disabled()
    ctx.treg.liberar.release()           # primeiro lead termina
    expect(andamento).to_contain_text("1 de 3")
    pagina.once("dialog", lambda d: d.accept())
    pagina.get_by_role("button", name="Parar rodada").click()
    for _ in range(3):
        ctx.treg.liberar.release()
    expect(andamento).to_contain_text("Parada por ana")
    hist = pagina.locator("#enriq-hist table")
    expect(hist).to_contain_text("Parada pela equipe")
    expect(hist).to_contain_text(USUARIO)
    assert ctx.treg.chamadas == 2        # o segundo já estava em andamento; o terceiro não começou
    # resultado no painel do lead, com o nome do decisor como texto (sem HTML)
    pagina.get_by_role("tab", name="Quadro").click()
    pagina.locator('.card[data-id="R0001"]').click()
    painel = pagina.locator("#enriq-painel")
    expect(painel).to_contain_text("Celular de quem decide achado")
    expect(painel).to_contain_text(XSS)
    assert pagina.evaluate("window.__xss") is None


def test_sem_token_botao_desligado_e_explicacao(navegador):
    c = _ctx(None)
    pg = navegador.new_context(viewport={"width": 390, "height": 800}, locale="pt-BR").new_page()
    pg.set_default_timeout(8000)
    try:
        entrar(pg, c.url)
        pg.get_by_role("tab", name="Enriquecer").click()
        expect(pg.get_by_role("button", name="Enriquecer base")).to_be_disabled()
        expect(pg.locator("#enriq-sem-token")).to_contain_text("TREG_TOKEN")
        largura = pg.evaluate("document.documentElement.scrollWidth")
        assert largura <= 390
    finally:
        pg.context.close()
        c.srv.shutdown()
        c.srv.server_close()

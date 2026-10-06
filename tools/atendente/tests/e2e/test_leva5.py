"""Aba Prospecção (leva 5) de ponta a ponta no Chromium. A página real sobe com o servidor de teste; a API da
prospecção (que ainda não existe no backend) é falsa, servida por interceptação de rede do Playwright no formato
combinado: GET api/prospeccao, POST api/prospeccao/campanhas, .../<id>/iniciar, api/prospeccao/parar e
GET .../<id>/funil. Dados fictícios."""
import copy
import json
import os
import threading
from datetime import datetime, timezone
from urllib.parse import urlparse

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

FUNIL_ZERO = {"empresas": 0, "pessoas": 0, "comContato": 0, "qualificados": 0, "promovidos": 0, "descartados": 0}


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


class ApiFalsa:
    """Backend da prospecção em memória, respondendo pelo page.route. Guarda os pedidos para o teste conferir."""

    def __init__(self, disponivel=True, campanhas=None):
        self.estado = {"disponivel": disponivel, "rodando": False, "campanhas": campanhas or [], "progresso": None}
        if not disponivel:
            self.estado["semToken"] = "Falta o TREG_TOKEN no .env da VPS."
        self.pedidos = []
        self.segurar_get = False
        self.presos = []
        self.resposta_iniciar = None     # (status, corpo) para forçar 402/409

    def _json(self, route, status, corpo):
        route.fulfill(status=status, content_type="application/json", body=json.dumps(corpo))

    def __call__(self, route, request):
        caminho = urlparse(request.url).path
        caminho = caminho[caminho.index("api/prospeccao"):]
        corpo = json.loads(request.post_data) if request.post_data else None
        self.pedidos.append((request.method, caminho, corpo))
        if request.method == "GET" and caminho == "api/prospeccao":
            if self.segurar_get:
                self.presos.append(route)
                return
            return self._json(route, 200, copy.deepcopy(self.estado))
        if request.method == "POST" and caminho == "api/prospeccao/campanhas":
            nova = {"id": "c" + str(len(self.estado["campanhas"]) + 1), "nome": corpo["nome"], "segmento": corpo["segmento"],
                    "cidades": corpo["cidades"], "status": "nova", "tetoDiaUsd": corpo["tetoDiaUsd"],
                    "tetoCampanhaUsd": corpo["tetoCampanhaUsd"], "gastoHojeUsd": 0, "gastoTotalUsd": 0,
                    "funil": dict(FUNIL_ZERO)}
            self.estado["campanhas"].append(nova)
            return self._json(route, 201, nova)
        if request.method == "POST" and caminho.endswith("/iniciar"):
            if self.resposta_iniciar:
                return self._json(route, *self.resposta_iniciar)
            cid = caminho.split("/")[-2]
            camp = next(c for c in self.estado["campanhas"] if c["id"] == cid)
            camp["status"] = "rodando"
            camp["funil"] = {"empresas": 120, "pessoas": 84, "comContato": 60, "qualificados": 51, "promovidos": 40,
                             "descartados": 33}
            camp["gastoHojeUsd"], camp["gastoTotalUsd"] = 4.2, 4.2
            self.estado["rodando"] = True
            self.estado["progresso"] = {"campanhaId": cid, "etapa": "contato", "feitos": 30, "total": 84}
            return self._json(route, 202, {"ok": True})
        if request.method == "POST" and caminho == "api/prospeccao/parar":
            self.estado["rodando"] = False
            self.estado["progresso"] = None
            for c in self.estado["campanhas"]:
                if c["status"] == "rodando":
                    c["status"] = "parada"
            return self._json(route, 200, {"ok": True})
        if request.method == "GET" and caminho.endswith("/funil"):
            return self._json(route, 200, {
                "etapas": [{"nome": "Empresas", "n": 120}, {"nome": "Donos " + XSS, "n": 84}, {"nome": "Com WhatsApp", "n": 51}],
                "descartes": [{"motivo": "Telefone fixo", "n": 20}, {"motivo": "Já é cliente", "n": 13}],
                "custoUsd": 4.2, "custoPorLeadUsd": 0.11})
        return self._json(route, 404, {"erro": "rota falsa não existe"})


def _campanha(**extra):
    c = {"id": "c1", "nome": "Restaurantes " + XSS, "segmento": "Restaurantes", "cidades": ["Cuiabá", "Várzea Grande"],
         "status": "nova", "tetoDiaUsd": 10, "tetoCampanhaUsd": 30, "gastoHojeUsd": 0, "gastoTotalUsd": 0,
         "funil": dict(FUNIL_ZERO)}
    c.update(extra)
    return c


@pytest.fixture
def srv():
    repo = Repo(":memory:")
    cfg = {"webhook_segredo": "segredo-de-teste-do-webhook", "segredo_sessao": "segredo-de-teste-da-sessao-bem-longo",
           "usuarios": {USUARIO: SENHA}, "relogio": lambda: AGORA}
    s = servidor.criar_servidor(repo, AtendenteFalso(), WaFalso(), cfg, "127.0.0.1", 0)
    threading.Thread(target=lambda: s.serve_forever(poll_interval=0.05), daemon=True).start()
    yield f"http://127.0.0.1:{s.server_address[1]}/"
    s.shutdown()
    s.server_close()


@pytest.fixture(scope="module")
def navegador():
    if not CHROMIUM:
        pytest.skip("Chromium não encontrado (defina CHROMIUM_PATH)")
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=CHROMIUM, args=["--no-sandbox"])
        yield b
        b.close()


def _pagina(navegador, largura, api):
    ctx = navegador.new_context(viewport={"width": largura, "height": 800}, locale="pt-BR")
    pg = ctx.new_page()
    pg.set_default_timeout(8000)
    pg.route("**/api/prospeccao**", api)
    return pg


@pytest.fixture
def abrir(navegador, srv):
    paginas = []

    def _abrir(api, largura=1280):
        pg = _pagina(navegador, largura, api)
        paginas.append(pg)
        pg.goto(srv)
        pg.get_by_label("Usuário").fill(USUARIO)
        pg.get_by_label("Senha").fill(SENHA)
        pg.get_by_role("button", name="Entrar").click()
        expect(pg.locator("#interruptor")).to_be_visible()
        pg.get_by_role("tab", name="Prospecção").click()
        expect(pg.locator("#vista-prospeccao")).to_be_visible()
        return pg

    yield _abrir
    for pg in paginas:
        pg.context.close()


def test_campanha_nova_iniciar_funil_ao_vivo_e_parar(abrir):
    api = ApiFalsa()
    pg = abrir(api)
    expect(pg.locator("#prosp-lista")).to_contain_text("Nenhuma campanha ainda")
    pg.get_by_role("button", name="Nova campanha").click()
    form = pg.locator("#prosp-form")
    expect(form).to_be_visible()
    # teto sugerido já preenchido
    expect(pg.get_by_label("Teto por dia (US$)")).to_have_value("10")
    expect(pg.get_by_label("Teto da campanha (US$)")).to_have_value("30")
    pg.get_by_label("Nome da campanha").fill("Restaurantes " + XSS)
    pg.locator("#prosp-form").get_by_label("Segmento").fill("Restaurantes")
    # cidade fora de MT é recusada no cliente
    cidade = pg.get_by_label("Cidade de Mato Grosso")
    cidade.fill("Goiânia")
    pg.get_by_role("button", name="Adicionar cidade").click()
    expect(pg.locator("#prosp-form-erro")).to_contain_text("Goiânia não é uma cidade de Mato Grosso")
    # sem acento e em minúsculas também vale, e entra com o nome certo
    cidade.fill("varzea grande")
    cidade.press("Enter")
    cidade.fill("Cuiabá")
    pg.get_by_role("button", name="Adicionar cidade").click()
    chips = pg.locator("#prosp-cidades li")
    expect(chips).to_have_count(2)
    expect(chips.first).to_contain_text("Várzea Grande")
    pg.get_by_role("button", name="Criar campanha").click()
    lista = pg.locator("#prosp-lista")
    expect(lista).to_contain_text("Restaurantes " + XSS)
    expect(form).to_be_hidden()
    post = next(p for p in api.pedidos if p[0] == "POST" and p[1] == "api/prospeccao/campanhas")[2]
    assert post["cidades"] == ["Várzea Grande", "Cuiabá"]
    assert post["tetoDiaUsd"] == 10 and post["tetoCampanhaUsd"] == 30
    assert post["porte"] == "pequena" and isinstance(post["cnaes"], list) and post["metaPorDia"] > 0
    # iniciar pede confirmação explícita do teto
    pg.get_by_role("button", name="Iniciar").click()
    comecar = pg.get_by_role("button", name="Começar")
    expect(comecar).to_be_disabled()
    pg.get_by_label("Confirmo que esta campanha pode gastar até US$ 10,00 por dia e US$ 30,00 no total.").check()
    comecar.click()
    assert ("POST", "api/prospeccao/campanhas/c1/iniciar", {"confirmo": True}) in api.pedidos
    # funil ao vivo, em texto simples
    expect(lista).to_contain_text("Achamos 120 empresas, 84 donos, 51 com WhatsApp")
    expect(lista).to_contain_text("40 entraram na cadência")
    andamento = pg.locator("#prosp-andamento")
    expect(andamento).to_contain_text("30 de 84")
    expect(pg.get_by_role("button", name="Nova campanha")).to_be_enabled()
    # detalhe do funil
    pg.get_by_role("button", name="Ver funil").click()
    det = pg.locator(".prosp-funil-det")
    expect(det).to_contain_text("Telefone fixo")
    expect(det).to_contain_text("US$ 0,11")
    expect(det).to_contain_text("Donos " + XSS)
    # parar
    pg.once("dialog", lambda d: d.accept())
    pg.get_by_role("button", name="Parar prospecção").click()
    expect(pg.get_by_role("button", name="Parar prospecção")).to_be_hidden()
    assert ("POST", "api/prospeccao/parar", {}) in api.pedidos
    expect(lista).to_contain_text("Parada")
    assert pg.evaluate("window.__xss") is None


def test_botao_principal_so_liga_depois_do_primeiro_get(abrir):
    api = ApiFalsa()
    api.segurar_get = True
    pg = _sem_esperar(abrir, api)
    nova = pg.get_by_role("button", name="Nova campanha")
    expect(nova).to_be_disabled()
    api.segurar_get = False
    for r in api.presos:
        r.fulfill(status=200, content_type="application/json", body=json.dumps(api.estado))
    expect(nova).to_be_enabled()


def _sem_esperar(abrir, api):
    pg = abrir(api)
    expect(pg.get_by_role("button", name="Nova campanha")).to_be_visible()
    for _ in range(50):
        if api.presos:
            break
        pg.wait_for_timeout(50)
    assert api.presos, "o GET da aba não saiu"
    return pg


def test_validacao_do_formulario(abrir):
    pg = abrir(ApiFalsa())
    pg.get_by_role("button", name="Nova campanha").click()
    pg.get_by_role("button", name="Criar campanha").click()
    erro = pg.locator("#prosp-form-erro")
    expect(erro).to_contain_text("Dê um nome")
    expect(pg.get_by_label("Nome da campanha")).to_be_focused()
    pg.get_by_label("Nome da campanha").fill("Teste")
    pg.locator("#prosp-form").get_by_label("Segmento").fill("Academias")
    pg.get_by_role("button", name="Criar campanha").click()
    expect(erro).to_contain_text("pelo menos uma cidade")
    pg.get_by_label("Cidade de Mato Grosso").fill("Sinop")
    pg.get_by_label("Teto por dia (US$)").fill("50")
    pg.get_by_role("button", name="Criar campanha").click()
    expect(erro).to_contain_text("teto da campanha")
    # a cidade digitada e não adicionada entrou sozinha no envio
    expect(pg.locator("#prosp-cidades li")).to_have_count(1)


def test_erro_402_ao_iniciar_mostra_mensagem(abrir):
    api = ApiFalsa(campanhas=[_campanha()])
    api.resposta_iniciar = (402, {"erro": "Sem saldo no treg. Peça a recarga ao Mazinho."})
    pg = abrir(api)
    pg.get_by_role("button", name="Iniciar").click()
    pg.get_by_label("Confirmo que esta campanha pode gastar até US$ 10,00 por dia e US$ 30,00 no total.").check()
    pg.get_by_role("button", name="Começar").click()
    expect(pg.locator("#avisos")).to_contain_text("Sem saldo no treg")
    expect(pg.get_by_role("button", name="Começar")).to_be_enabled()


def test_390px_sem_rolagem_e_sem_token(abrir):
    camp = _campanha(nome="Campanha com um nome bem comprido para ver se quebra a linha direitinho no celular",
                     cidades=["Vila Bela da Santíssima Trindade", "Nossa Senhora do Livramento"],
                     funil={"empresas": 1, "pessoas": 1, "comContato": 1, "qualificados": 1, "promovidos": 0, "descartados": 0})
    pg = abrir(ApiFalsa(disponivel=False, campanhas=[camp]), largura=390)
    expect(pg.locator("#prosp-sem-token")).to_contain_text("TREG_TOKEN")
    expect(pg.get_by_role("button", name="Iniciar")).to_be_disabled()
    expect(pg.locator("#prosp-lista")).to_contain_text("Achamos 1 empresa, 1 dono, 1 com WhatsApp")
    pg.get_by_role("button", name="Nova campanha").click()
    pg.get_by_label("Cidade de Mato Grosso").fill("Vila Bela da Santíssima Trindade")
    pg.get_by_role("button", name="Adicionar cidade").click()
    assert pg.evaluate("document.documentElement.scrollWidth") <= 390

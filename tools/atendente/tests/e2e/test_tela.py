"""Testes de ponta a ponta da tela (Playwright + Chromium). Servidor real em porta aleatória, banco em memória,
WhatsApp e atendente falsos, dados 100% fictícios.

Rodar:  cd tools/atendente && PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers python3 -m pytest tests/e2e -q
"""
import http.client
import os
import threading
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

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


class WaFalso:
    def __init__(self):
        self.pendentes = [{"id": "ag1", "status": "PENDING"}, {"id": "ag2", "status": "PENDING"}]
        self.cancelados = []
        self.enviados = []
        self.existem = None

    def verificar(self, numeros):
        return {n: f"{n}@s.whatsapp.net" for n in numeros}

    def enviar_texto(self, jid, texto):
        self.enviados.append((jid, texto))

    def conectado(self):
        return True

    def agendadas(self, aba):
        return list(self.pendentes) if aba == "pending" else []

    def cancelar(self, id_):
        self.cancelados.append(id_)
        self.pendentes = [p for p in self.pendentes if p["id"] != id_]


class AtendenteFalso:
    def tratar_mensagem(self, m, agora):
        return "respondida"


def _lead(i, **extra):
    d = {"id": f"L{i}", "nome": f"Empresa Teste {i}", "empresa": {"cnpj": "", "municipio": "Cuiabá"}, "canal": "whatsapp",
         "telefone": f"55659999000{i:02d}", "situacao": "ativo", "etapa": 0, "historico": []}
    d.update(extra)
    return d


def _popular(repo):
    repo.lead_put(_lead(1))  # sem toque ainda: vence hoje
    repo.lead_put(_lead(2, etapa=1, enviado1="2026-10-07T14:00:00Z"))  # enviou hoje: aguardando
    repo.lead_put(_lead(3, telefone=""))  # sem número de WhatsApp
    repo.lead_put(_lead(4, situacao="respondeu", etapa=1, enviado1="2026-10-01T15:00:00Z",
                        historico=[{"em": "2026-10-07T14:30:00Z", "texto": "ATENÇÃO: lead pediu orçamento"},
                                   {"em": "2026-10-07T14:31:00Z", "texto": "Respondeu: tenho interesse"}]))
    repo.lead_put(_lead(5, situacao="fechou", etapa=2))
    repo.lead_put(_lead(6, situacao="sair"))
    repo.msg_add("L4", "5565999900004@s.whatsapp.net", False, "Oi, quanto custa o piloto?", "TEXT", "w1", "2026-10-07T14:30:00Z")
    repo.msg_add("L4", "5565999900004@s.whatsapp.net", True, "Posso mandar uma proposta ainda hoje.", "TEXT", "w2", "2026-10-07T14:40:00Z")
    repo.atendimento_add(leadId="L4", empresa="Empresa Teste 4", em="2026-10-07T14:30:30Z", mensagemLead="Oi, quanto custa o piloto?",
                         acao="avisou", motivoAviso="Pergunta de preço")
    repo.atendimento_add(leadId="L2", empresa="Empresa Teste 2", em="2026-10-07T14:20:00Z", mensagemLead="Pode ser amanhã?",
                         acao="sozinha", respostaEnviada="Claro, amanhã às 10h.")
    repo.atendimento_add(leadId="L1", empresa="Empresa Teste 1", em="2026-10-07T14:10:00Z", mensagemLead="Obrigado!",
                         acao="humano", humanoRespondeu=True)


class Ctx:
    pass


@pytest.fixture
def ctx():
    c = Ctx()
    c.repo = Repo(":memory:")
    _popular(c.repo)
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
    expect(pg.locator(".card").first).to_be_visible()


def coluna(pg, nome):
    return pg.locator(f'.coluna[data-coluna="{nome}"]')


def test_interruptor_liga_e_desliga_e_grava(ctx, pagina):
    entrar(pagina, ctx.url)
    sw = pagina.get_by_role("switch", name="Respostas automáticas")
    expect(sw).to_have_attribute("aria-checked", "false")
    expect(pagina.locator("#interruptor-estado")).to_contain_text("Desligadas")
    sw.click()
    expect(sw).to_have_attribute("aria-checked", "true")
    expect(pagina.locator("#interruptor-estado")).to_contain_text("Ligadas")
    assert ctx.repo.config_get("auto_resposta") is True
    sw.click()
    expect(sw).to_have_attribute("aria-checked", "false")
    assert ctx.repo.config_get("auto_resposta") is False
    # a faixa mostra o resumo, o gasto contra o teto e o WhatsApp
    expect(pagina.locator("#r-fila")).to_have_text("2")
    expect(pagina.locator("#r-gasto")).to_contain_text("US$ 0,00 de US$ 5,00")
    expect(pagina.locator("#wa-estado")).to_have_text("WhatsApp conectado")


def test_parar_tudo_pede_confirmacao_e_vira_retomar(ctx, pagina):
    entrar(pagina, ctx.url)
    pagina.get_by_role("button", name="Parar tudo").click()
    dialogo = pagina.get_by_role("dialog", name="Parar tudo agora?")
    expect(dialogo).to_be_visible()
    dialogo.get_by_role("button", name="Cancelar").click()
    expect(dialogo).to_be_hidden()
    assert ctx.repo.config_get("status") != "parado" and ctx.wa.cancelados == []

    pagina.get_by_role("button", name="Parar tudo").click()
    pagina.get_by_role("button", name="Sim, parar tudo").click()
    expect(pagina.get_by_role("button", name="Retomar")).to_be_visible()
    expect(pagina.locator("#faixa-parado")).to_be_visible()
    assert ctx.repo.config_get("status") == "parado"
    assert sorted(ctx.wa.cancelados) == ["ag1", "ag2"]

    pagina.get_by_role("button", name="Retomar").click()
    expect(pagina.get_by_role("button", name="Parar tudo")).to_be_visible()
    expect(pagina.locator("#faixa-parado")).to_be_hidden()
    assert ctx.repo.config_get("status") == "ativo"


def test_cards_nas_colunas_certas(ctx, pagina):
    entrar(pagina, ctx.url)
    esperado = {"Para hoje": "Empresa Teste 1", "Aguardando": "Empresa Teste 2", "Sem contato": "Empresa Teste 3",
                "Responderam": "Empresa Teste 4", "Fecharam": "Empresa Teste 5", "Saíram": "Empresa Teste 6"}
    for nome, empresa in esperado.items():
        col = coluna(pagina, nome)
        expect(col.locator(".card")).to_have_count(1)
        expect(col.locator(".card-empresa")).to_have_text(empresa)
    card4 = coluna(pagina, "Responderam").locator(".card")
    expect(card4.locator(".marca-atencao")).to_have_text("ATENÇÃO")
    expect(card4).to_contain_text("Posso mandar uma proposta ainda hoje.")
    expect(coluna(pagina, "Para hoje").locator(".marca-atencao")).to_have_count(0)


def test_estado_vazio_da_coluna(ctx, pagina):
    ctx.repo.lead_put(_lead(6, situacao="ativo"))  # esvazia "Saíram"
    entrar(pagina, ctx.url)
    expect(coluna(pagina, "Saíram")).to_contain_text("Nenhum lead nesta coluna")


def test_abrir_card_mostra_historico(ctx, pagina):
    entrar(pagina, ctx.url)
    coluna(pagina, "Responderam").locator(".card").click()
    painel = pagina.get_by_role("dialog", name="Empresa Teste 4")
    expect(painel).to_be_visible()
    expect(painel.locator("#painel-conversa")).to_contain_text("Oi, quanto custa o piloto?")
    expect(painel.locator("#painel-conversa")).to_contain_text("Posso mandar uma proposta ainda hoje.")
    expect(painel.locator("#painel-historico")).to_contain_text("ATENÇÃO: lead pediu orçamento")
    # botões de situação, nota e Fechou
    painel.get_by_role("button", name="Fechou").click()
    expect(coluna(pagina, "Fecharam").locator(".card")).to_have_count(2)
    assert ctx.repo.lead_get("L4")["situacao"] == "fechou"
    painel.get_by_role("button", name="Voltar para a cadência").click()
    expect(coluna(pagina, "Responderam").locator(".card")).to_have_count(0)
    assert ctx.repo.lead_get("L4")["situacao"] == "ativo"
    painel.get_by_label("Nota para a equipe").fill("Ligar amanhã cedo")
    painel.get_by_role("button", name="Salvar nota").click()
    expect(painel.locator("#painel-historico")).to_contain_text("Ligar amanhã cedo")
    expect(painel.get_by_label("Nota para a equipe")).to_have_value("")
    pagina.keyboard.press("Escape")
    expect(painel).to_be_hidden()


def test_aba_atendimento_e_baixar_copia(ctx, pagina):
    entrar(pagina, ctx.url)
    pagina.get_by_role("tab", name="Atendimento").click()
    lista = pagina.locator("#lista-atend")
    expect(lista.locator("li")).to_have_count(3)
    expect(lista).to_contain_text("IA respondeu sozinha")
    expect(lista).to_contain_text("Claro, amanhã às 10h.")
    expect(lista).to_contain_text("Avisou a equipe")
    expect(lista).to_contain_text("Equipe escreveu")
    pagina.get_by_role("button", name="Avisou a equipe").click()
    expect(lista.locator("li")).to_have_count(1)
    with pagina.expect_download() as d:
        pagina.get_by_role("link", name="Baixar cópia").click()
    assert d.value.suggested_filename.startswith("atendente-") and d.value.suggested_filename.endswith(".db")


def test_atualiza_sozinha_sem_perder_painel_nem_nota(ctx, pagina):
    entrar(pagina, ctx.url + "?intervalo=400")
    coluna(pagina, "Responderam").locator(".card").click()
    nota = pagina.get_by_label("Nota para a equipe")
    nota.fill("rascunho que não pode sumir")
    ctx.repo.lead_put(_lead(7, nome="Empresa Teste 7"))  # chega um lead novo enquanto a tela está aberta
    expect(pagina.get_by_text("Empresa Teste 7")).to_be_visible()
    expect(pagina.get_by_role("dialog", name="Empresa Teste 4")).to_be_visible()
    expect(nota).to_have_value("rascunho que não pode sumir")


def test_erro_de_rede_avisa_em_portugues(ctx, pagina):
    entrar(pagina, ctx.url + "?intervalo=400")
    pagina.route("**/api/**", lambda r: r.abort())
    expect(pagina.locator("#avisos")).to_have_text("Não consegui falar com a VPS. Tentando de novo.")
    pagina.unroute("**/api/**")
    expect(pagina.locator("#avisos")).to_have_text("")


def test_login_errado_mostra_mensagem(ctx, pagina):
    pagina.goto(ctx.url)
    pagina.get_by_label("Usuário").fill(USUARIO)
    pagina.get_by_label("Senha").fill("errada")
    pagina.get_by_role("button", name="Entrar").click()
    expect(pagina.locator("#login-erro")).to_have_text("Usuário ou senha incorretos.")


def test_390px_sem_rolagem_da_pagina(ctx, navegador):
    c = navegador.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, has_touch=True, is_mobile=True)
    pg = c.new_page()
    pg.set_default_timeout(8000)
    try:
        entrar(pg, ctx.url)
        dims = pg.evaluate("({sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth})")
        assert dims["sw"] <= dims["cw"] == 390, dims
        # as colunas rolam de lado dentro do quadro
        q = pg.evaluate("({sw: document.querySelector('#quadro').scrollWidth, cw: document.querySelector('#quadro').clientWidth})")
        assert q["sw"] > q["cw"], q
        # a faixa do topo não toma a tela
        altura = pg.evaluate("document.querySelector('#faixa').getBoundingClientRect().height")
        assert altura < 844 * 0.25, altura
        for botao in ("#interruptor", "#btn-parar"):
            expect(pg.locator(botao)).to_be_in_viewport()
        # com o painel aberto também não aparece rolagem horizontal, e a faixa continua visível
        pg.locator(".card").first.click()
        expect(pg.locator("#painel")).to_be_visible()
        dims = pg.evaluate("({sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth})")
        assert dims["sw"] <= dims["cw"], dims
        expect(pg.locator("#btn-parar")).to_be_in_viewport()
        pg.get_by_role("button", name="Fechar").click()
        pg.get_by_role("tab", name="Atendimento").click()
        dims = pg.evaluate("({sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth})")
        assert dims["sw"] <= dims["cw"], dims
    finally:
        c.close()


def test_texto_do_lead_com_html_nao_executa(ctx, pagina):
    ctx.repo.lead_put(_lead(8, nome=XSS, empresa=XSS, historico=[{"em": "2026-10-07T14:00:00Z", "texto": "ATENÇÃO: " + XSS}]))
    ctx.repo.msg_add("L8", "5565999900008@s.whatsapp.net", False, XSS, "TEXT", "x1", "2026-10-07T14:00:00Z")
    ctx.repo.atendimento_add(leadId="L8", empresa=XSS, em="2026-10-07T14:01:00Z", mensagemLead=XSS, acao="avisou", motivoAviso=XSS)
    entrar(pagina, ctx.url)
    card = pagina.locator('.card[data-id="L8"]')
    expect(card).to_contain_text(XSS)  # aparece como texto, não vira elemento
    expect(pagina.locator("img")).to_have_count(0)
    card.click()
    expect(pagina.locator("#painel-conversa")).to_contain_text(XSS)
    expect(pagina.locator("#painel-historico")).to_contain_text(XSS)
    pagina.get_by_role("button", name="Fechar").click()
    pagina.get_by_role("tab", name="Atendimento").click()
    expect(pagina.locator("#lista-atend")).to_contain_text(XSS)
    expect(pagina.locator("img")).to_have_count(0)
    pagina.wait_for_timeout(300)
    assert pagina.evaluate("typeof window.__xss") == "undefined"


class _Proxy(BaseHTTPRequestHandler):
    """Faz o que o Caddy faz: só atende /central/..., corta o prefixo e preserva o Host."""
    destino = 0

    def _passar(self):
        if not (self.path == "/central" or self.path.startswith("/central/")):
            self.send_response(404)
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        caminho = self.path[len("/central"):] or "/"
        n = int(self.headers.get("Content-Length") or 0)
        corpo = self.rfile.read(n) if n else None
        con = http.client.HTTPConnection("127.0.0.1", self.destino, timeout=10)
        cab = {k: v for k, v in self.headers.items() if k.lower() not in ("connection", "keep-alive")}
        con.request(self.command, caminho, body=corpo, headers=cab)
        r = con.getresponse()
        dados = r.read()
        self.send_response(r.status)
        for k, v in r.getheaders():
            if k.lower() not in ("connection", "transfer-encoding", "server", "date"):
                self.send_header(k, v)
        self.end_headers()
        self.wfile.write(dados)
        con.close()

    do_GET = do_POST = _passar

    def log_message(self, *a):
        pass


def test_funciona_sob_prefixo_central(ctx, pagina):
    _Proxy.destino = ctx.porta
    proxy = ThreadingHTTPServer(("127.0.0.1", 0), _Proxy)
    threading.Thread(target=proxy.serve_forever, daemon=True).start()
    try:
        base = f"http://127.0.0.1:{proxy.server_address[1]}"
        pedidos_fora = []
        pagina.on("request", lambda r: pedidos_fora.append(r.url) if "/central/" not in r.url and r.url.startswith(base) else None)
        entrar(pagina, base + "/central/")
        expect(coluna(pagina, "Para hoje").locator(".card")).to_have_count(1)
        pagina.get_by_role("switch", name="Respostas automáticas").click()
        expect(pagina.get_by_role("switch", name="Respostas automáticas")).to_have_attribute("aria-checked", "true")
        assert ctx.repo.config_get("auto_resposta") is True
        pagina.get_by_role("tab", name="Atendimento").click()
        expect(pagina.locator("#lista-atend li")).to_have_count(3)
        assert pedidos_fora == [], pedidos_fora
    finally:
        proxy.shutdown()
        proxy.server_close()


def test_aguardando_mostra_ligar_atendente_e_liga(ctx, pagina):
    ctx.repo.config_set("status", "aguardando")
    ctx.repo.config_set("auto_resposta", False)
    entrar(pagina, ctx.url)
    aviso = pagina.locator("#faixa-aguardando")
    expect(aviso).to_be_visible()
    expect(aviso).to_contain_text("Instalado. O atendente ainda não está respondendo nem enviando")
    expect(aviso).to_contain_text("clique em Ligar atendente quando o Claude confirmar")
    expect(pagina.get_by_role("button", name="Parar tudo")).to_be_visible()
    pagina.get_by_role("button", name="Ligar atendente").click()
    expect(aviso).to_be_hidden()
    expect(pagina.get_by_role("button", name="Ligar atendente")).to_be_hidden()
    expect(pagina.get_by_role("switch", name="Respostas automáticas")).to_have_attribute("aria-checked", "true")
    assert ctx.repo.config_get("status") == "ativo"
    assert ctx.repo.config_get("auto_resposta") is True


def test_equipe_responde_pela_tela_com_confirmacao(ctx, pagina):
    ctx.wa.existem = None
    entrar(pagina, ctx.url)
    pagina.on("dialog", lambda d: d.accept())                        # "Enviar esta mensagem agora?"
    coluna(pagina, "Responderam").locator(".card").click()
    painel = pagina.get_by_role("dialog", name="Empresa Teste 4")
    painel.get_by_label("Responder pelo WhatsApp").fill("Combinado, te ligo às 15h.")
    painel.get_by_role("button", name="Enviar mensagem").click()
    expect(pagina.locator("#avisos, [aria-live]").first).to_contain_text("Mensagem enviada")
    assert ctx.wa.enviados and ctx.wa.enviados[-1][1] == "Combinado, te ligo às 15h."
    expect(painel.get_by_label("Responder pelo WhatsApp")).to_have_value("")


def test_enviar_vazio_nao_chama_o_servidor(ctx, pagina):
    entrar(pagina, ctx.url)
    coluna(pagina, "Responderam").locator(".card").click()
    painel = pagina.get_by_role("dialog", name="Empresa Teste 4")
    painel.get_by_role("button", name="Enviar mensagem").click()
    assert not ctx.wa.enviados

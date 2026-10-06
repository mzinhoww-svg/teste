"""E2E da leva 3: abas Base e Pós-venda, Novo cliente e Virar cliente. Dados 100% fictícios.

Rodar:  cd tools/atendente && PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers python3 -m pytest tests/e2e/test_leva3.py -q
"""
import threading

import pytest

pytest.importorskip("playwright.sync_api")
from playwright.sync_api import expect  # noqa: E402

from atendente import servidor  # noqa: E402
from atendente.db import Repo  # noqa: E402

from .test_tela import AGORA, XSS, AtendenteFalso, WaFalso, _lead, entrar, navegador, pagina  # noqa: E402,F401

PV = {
    "etapas": [
        {"n": 1, "nome": "Boas-vindas", "quando": "imediato", "texto": "Oi, {saudacao}, bem-vindos ao {produto}."},
        {"n": 2, "nome": "Kickoff", "quando": "data", "campoData": "dataKickoff", "vespera": False,
         "texto": "Oi, {saudacao}, confirmando o kickoff {quando}."},
        {"n": 3, "nome": "Entrega", "quando": "imediato", "texto": "Oi, {saudacao}, entrega feita."},
    ],
    "produtos": {"Hora de Estúdio": {"local": "aqui no estúdio"}, "Outro": {"local": "no local combinado"}},
    "preparo": {"estudio": "", "sede": ""}, "recorrencia": {"padrao": ""},
}


def doc_base(i, **extra):
    d = {"id": f"D{i:05d}", "dominio": f"entidade-ficticia-{i}.org.br", "nome": f"Associação Fictícia {i}",
         "segmento": "Entidades do agro", "tier": "B", "score": 60 - i, "regiao": "fora",
         "decisor": {"nome": "Maria Exemplo", "cargo": "Presidente", "persona": "decisor", "linkedin": ""},
         "pessoas": 1, "comLinkedin": 0, "campanhas": ["Entidades do agro"], "site": f"https://entidade-ficticia-{i}.org.br",
         "contatos": [{"nome": "Maria Exemplo", "cargo": "Presidente", "persona": "decisor", "linkedin": ""}],
         "status": "base", "pedidoEm": None, "leadId": None, "migradoEm": None, "pais": "Brasil", "uf": "SP",
         "cidade": "Campinas"}
    d.update(extra)
    return d


class Ctx:
    pass


def _subir(repo):
    c = Ctx()
    c.repo = repo
    c.wa = WaFalso()
    cfg = {"webhook_segredo": "segredo-de-teste-do-webhook", "segredo_sessao": "segredo-de-teste-da-sessao-bem-longo",
           "usuarios": {"ana": "senha-inventada-ana"}, "relogio": lambda: AGORA}
    c.srv = servidor.criar_servidor(repo, AtendenteFalso(), c.wa, cfg, "127.0.0.1", 0)
    c.url = f"http://127.0.0.1:{c.srv.server_address[1]}/"
    threading.Thread(target=lambda: c.srv.serve_forever(poll_interval=0.05), daemon=True).start()
    return c


@pytest.fixture
def ctx():
    repo = Repo(":memory:")
    repo.lead_put(_lead(1))
    repo.lead_put(_lead(5, situacao="fechou", etapa=2, saudacao="Maria"))
    repo.base_put(doc_base(1))
    repo.base_put(doc_base(2, uf="MT", cidade="Cuiabá", nome="Feiras Fictícias", segmento="produtores de evento e feiras"))
    repo.base_put(doc_base(3, tier="C", nome=XSS))
    repo.base_put(doc_base(4, status="na_cadencia", leadId="L1"))
    repo.config_set("posvenda", PV)
    c = _subir(repo)
    yield c
    c.srv.shutdown()
    c.srv.server_close()


def abrir_base(pg):
    pg.get_by_role("tab", name="Base").click()
    expect(pg.locator("#vista-base .l3-linha").first).to_be_visible()


def linha(pg, nome):
    return pg.locator("#vista-base .l3-linha", has_text=nome)


def test_base_lista_filtra_e_mostra_texto_sem_html(ctx, pagina):
    entrar(pagina, ctx.url)
    abrir_base(pagina)
    expect(pagina.locator("#vista-base .l3-linha")).to_have_count(4)
    expect(pagina.locator("#l3-base-resumo")).to_contain_text("4 empresas")
    expect(linha(pagina, XSS)).to_have_count(1)                      # o nome apareceu como texto
    assert pagina.evaluate("window.__xss") is None
    expect(linha(pagina, "Associação Fictícia 4")).to_contain_text("Na central")
    vista = pagina.locator("#vista-base")
    vista.get_by_label("Estado").select_option("MT")
    expect(pagina.locator("#vista-base .l3-linha")).to_have_count(1)
    expect(linha(pagina, "Feiras Fictícias")).to_contain_text("Cuiabá/MT")
    vista.get_by_role("button", name="Limpar filtros").click()
    vista.get_by_label("Buscar na Base").fill("feiras ficticias")
    expect(pagina.locator("#vista-base .l3-linha")).to_have_count(1)
    vista.get_by_label("Buscar na Base").fill("")
    expect(pagina.locator("#vista-base .l3-linha")).to_have_count(4)
    vista.get_by_role("button", name="Na central 1").click()
    expect(pagina.locator("#vista-base .l3-linha")).to_have_count(1)


def test_promover_uma_vira_lead_e_abre_no_quadro(ctx, pagina):
    entrar(pagina, ctx.url)
    abrir_base(pagina)
    linha(pagina, "Associação Fictícia 1").get_by_role("button", name="Promover").click()
    expect(pagina.locator("#avisos")).to_contain_text("virou lead")
    expect(linha(pagina, "Associação Fictícia 1")).to_contain_text("Na central")
    assert ctx.repo.base_get("D00001")["status"] == "na_cadencia"
    novo = ctx.repo.base_get("D00001")["leadId"]
    assert ctx.repo.lead_get(novo)["nome"] == "Associação Fictícia 1"
    linha(pagina, "Associação Fictícia 1").get_by_role("button", name="Ver lead").click()
    expect(pagina.locator("#painel")).to_be_visible()
    expect(pagina.locator("#painel-titulo")).to_have_text("Associação Fictícia 1")
    expect(pagina.locator('.coluna[data-coluna="Sem contato"] .card', has_text="Associação Fictícia 1")).to_have_count(1)


def test_promover_varios_pede_confirmacao(ctx, pagina):
    entrar(pagina, ctx.url)
    abrir_base(pagina)
    linha(pagina, "Associação Fictícia 1").get_by_role("checkbox").check()
    linha(pagina, "Feiras Fictícias").get_by_role("checkbox").check()
    vista = pagina.locator("#vista-base")
    vista.get_by_role("button", name="Promover selecionadas (2)").click()
    expect(pagina.locator("#l3-base-confirmar")).to_contain_text("Promover 2 empresas")
    vista.get_by_role("button", name="Cancelar").click()
    assert ctx.repo.base_get("D00001")["status"] == "base"
    vista.get_by_role("button", name="Promover selecionadas (2)").click()
    vista.get_by_role("button", name="Sim, promover 2").click()
    expect(pagina.locator("#avisos")).to_contain_text("2 empresas viraram lead")
    assert ctx.repo.base_get("D00001")["status"] == ctx.repo.base_get("D00002")["status"] == "na_cadencia"


def test_posvenda_vazio_novo_cliente_e_etapas(ctx, pagina):
    entrar(pagina, ctx.url)
    pagina.get_by_role("tab", name="Pós-venda").click()
    vista = pagina.locator("#vista-posvenda")
    expect(vista).to_contain_text("Nenhum cliente no pós-venda")
    vista.get_by_role("button", name="Novo cliente").click()
    vista.get_by_role("button", name="Cadastrar e começar").click()
    expect(pagina.locator("#l3-nc-erro")).to_contain_text("nome")
    vista.get_by_label("Nome do cliente").fill("Clínica Fictícia")
    vista.get_by_label("Como a Letícia chama").fill("Dra. Exemplo")
    vista.get_by_label("E-mail").fill("contato@ficticia.example")
    vista.get_by_label("Serviço contratado").select_option("Hora de Estúdio")
    vista.get_by_label("Valor (R$, opcional)").fill("1500")
    vista.get_by_role("button", name="Cadastrar e começar").click()
    cartao = pagina.locator(".l3-cliente", has_text="Clínica Fictícia")
    expect(cartao).to_contain_text("Etapa 1 de 3 · Boas-vindas")
    expect(cartao).to_contain_text("Oi, Dra. Exemplo, bem-vindos ao Hora de Estúdio.")
    assert ctx.repo.clientes_todos()[0]["valor"] == 1500
    cartao.get_by_role("button", name="Marcar como enviada").click()
    expect(cartao.get_by_role("button", name="Desfazer envio")).to_be_visible()
    cartao.get_by_role("button", name="Concluir etapa").click()
    expect(cartao).to_contain_text("Etapa 2 de 3 · Kickoff")
    cartao.get_by_label("Data do kickoff").fill("2026-10-09T14:00")
    cartao.get_by_label("Data do kickoff").blur()
    expect(cartao).to_contain_text("confirmando o kickoff sexta, 09/10, às 14h")
    cartao.get_by_role("button", name="Pausar").click()
    expect(cartao).to_contain_text("Pausado")
    cartao.get_by_role("button", name="Retomar").click()
    expect(cartao.get_by_role("button", name="Pausar")).to_be_visible()


def test_virar_cliente_no_painel_do_lead_que_fechou(ctx, pagina):
    entrar(pagina, ctx.url)
    pagina.locator('.card[data-id="L5"]').click()
    extra = pagina.locator("#l3-virar")
    expect(extra).to_contain_text("Virar cliente")
    extra.get_by_label("Serviço contratado").select_option("Outro")
    extra.get_by_role("button", name="Virar cliente").click()
    expect(pagina.locator("#avisos")).to_contain_text("virou cliente")
    expect(extra).to_contain_text("Já é cliente")
    assert ctx.repo.cliente_get("L5")["produto"] == "Outro"
    extra.get_by_role("button", name="Ver no Pós-venda").click()
    expect(pagina.locator(".l3-cliente", has_text="Empresa Teste 5")).to_be_visible()

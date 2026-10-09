"""Card: conversa completa vinda do WhatsApp, resumo da IA e faixa de WhatsApp desconectado."""
import os

import pytest

pytest.importorskip("playwright.sync_api")
from playwright.sync_api import expect  # noqa: E402

from e2e.test_tela import coluna, ctx, entrar, navegador, pagina  # noqa: F401,E402

JID = "5565999900004@s.whatsapp.net"


def test_abrir_o_card_traz_o_que_mandamos_pelo_celular_e_resume(ctx, pagina):
    ctx.wa.mensagens = lambda jid: [
        {"id": "c1", "fromMe": True, "timestamp": "2026-10-07T14:50:00Z", "content": "Mandei do celular: posso ligar?"}
    ] if jid == JID else []
    ctx.repo.aplicar("L4", {"jidWa": JID})

    class IaFalsa:
        def resumir(self, nome, msgs, agora):
            return {"resumo": "Perguntou o preço do piloto.", "momento": "falou de preço",
                    "proximo": "A Letícia liga e explica."}
    ctx.srv.atendente.ia = IaFalsa()
    entrar(pagina, ctx.url)
    coluna(pagina, "Responderam").locator(".card").click()
    painel = pagina.get_by_role("dialog", name="Empresa Teste 4")
    expect(painel.locator("#painel-conversa")).to_contain_text("Mandei do celular: posso ligar?")
    expect(painel.locator("#resumo-ia")).to_contain_text("Resumir com IA")
    painel.get_by_role("button", name="Resumir com IA").click()
    expect(painel.locator("#resumo-ia")).to_contain_text("falou de preço")
    expect(painel.locator("#resumo-ia")).to_contain_text("A Letícia liga e explica.")
    if os.environ.get("PRINT_DIR"):
        pagina.screenshot(path=os.path.join(os.environ["PRINT_DIR"], "card-conversa.png"))


def test_faixa_vermelha_quando_o_whatsapp_cai(ctx, pagina):
    ctx.wa.conectado = lambda: False
    entrar(pagina, ctx.url)
    expect(pagina.locator("#faixa-wa")).to_be_visible()
    expect(pagina.locator("#faixa-wa")).to_contain_text("WhatsApp desconectado")

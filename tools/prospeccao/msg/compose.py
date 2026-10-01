"""Montagem das mensagens de WhatsApp, do link wa.me e dos e-mails dos três toques."""
import urllib.parse

from msg.copy_v1 import ASSINATURA_EMAIL, ASSUNTOS, SAIDA_EMAIL, blocos


def compose_whatsapp(toque: int, icp: str, saudacao: str, nome_curto: str, frase: str) -> str:
    return "\n".join(b.format(saudacao=saudacao, nome_curto=nome_curto, frase=frase)
                     for b in blocos(toque, icp))


def wa_link(telefone: str, texto: str) -> str:
    return "https://wa.me/" + telefone + "?text=" + urllib.parse.quote(texto, safe="")


def compose_email(toque: int, icp: str, saudacao: str, nome_curto: str, frase: str) -> tuple[str, str]:
    assunto = ASSUNTOS[toque].format(nome_curto=nome_curto)
    partes = [b.format(saudacao=saudacao, nome_curto=nome_curto, frase=frase) for b in blocos(toque, icp)]
    # No e-mail a abertura vira "Olá" e a saída pede resposta ao e-mail.
    partes[0] = partes[0].replace("Oi, ", "Olá, ", 1)
    corpo = "\n\n".join(partes + [SAIDA_EMAIL, ASSINATURA_EMAIL]) + "\n"
    return assunto, corpo

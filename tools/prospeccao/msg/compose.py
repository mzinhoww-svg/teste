"""Montagem das mensagens de WhatsApp, do link wa.me e dos e-mails dos três toques."""
import urllib.parse

from msg.copy_v1 import ASSINATURA_EMAIL, SAIDA_EMAIL, SEPARADOR, assunto, blocos


def compose_whatsapp(toque: int, icp: str, saudacao: str, nome_curto: str, frase: str,
                     linha_foto: str = "", regiao: str = "MT") -> str:
    """Mensagem com um parágrafo por bloco. `linha_foto` entra no toque 1 quando vai foto junto; `regiao` escolhe
    a versão da copy (msg/regiao.py)."""
    return SEPARADOR.join(b.format(saudacao=saudacao, nome_curto=nome_curto, frase=frase, linha_foto=linha_foto)
                          for b in blocos(toque, icp, foto=bool(linha_foto), regiao=regiao))


def wa_link(telefone: str, texto: str) -> str:
    return "https://wa.me/" + telefone + "?text=" + urllib.parse.quote(texto, safe="")


def compose_email(toque: int, icp: str, saudacao: str, nome_curto: str, frase: str,
                  regiao: str = "MT") -> tuple[str, str]:
    titulo = assunto(toque, regiao).format(nome_curto=nome_curto)
    partes = [b.format(saudacao=saudacao, nome_curto=nome_curto, frase=frase) for b in blocos(toque, icp, regiao=regiao)]
    # No e-mail a abertura vira "Olá" e a saída pede resposta ao e-mail.
    partes[0] = partes[0].replace("Oi, ", "Olá, ", 1)
    corpo = "\n\n".join(partes + [SAIDA_EMAIL, ASSINATURA_EMAIL]) + "\n"
    return titulo, corpo

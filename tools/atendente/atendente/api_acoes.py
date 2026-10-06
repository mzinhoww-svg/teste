"""Leva 2: ações no card. Mover entre colunas, ver o próximo toque e enviar o toque agora pelo WA-AKG.

    POST /api/leads/<id>/mover {coluna}      -> situação coerente com a coluna (e cancela o envio agendado)
    GET  /api/leads/<id>/proximo-toque       -> {n, texto, assunto, foto, midiaUrl, podeEnviar, motivo}
    POST /api/leads/<id>/enviar-toque {}     -> envia já o próximo toque (texto + foto), marca enviadoN

O envio usa o agendador do WA-AKG com horário "agora" (o mesmo caminho do planejador, e o único que leva foto). O
lead fica com `agendamento` desse envio, para a conferência registrar se saiu ou falhou; como `etapa` já avançou, a
conferência não avança de novo (wa_akg.conferir só avança quando etapa == n - 1)."""
import logging
import threading
from datetime import timedelta
from urllib.parse import unquote

from scripts import wa_akg

from .rotas import rota

log = logging.getLogger("atendente.acoes")

SITUACAO_DA_COLUNA = {"Para hoje": "ativo", "Aguardando": "ativo", "Responderam": "respondeu",
                      "Fecharam": "fechou", "Saíram": "sair"}
SEM_CONTATO = "Sem contato"
SEM_TELEFONE = "Este lead não tem telefone com DDD."
_trava_envio = threading.Lock()   # um envio de toque por vez: dois cliques nunca mandam duas mensagens


def _servidor():
    from . import servidor          # import tardio: servidor importa rotas, que importa este módulo
    return servidor


def _lead_ou_404(h, m, post=False):
    lead = h.server.repo.lead_get(unquote(m.group("id")))
    if lead is None:
        if post:
            h._corpo()
        h._erro(404, "Lead não encontrado.")
    return lead


def _cancelar_agendado(srv, lead) -> tuple[bool, bool]:
    """(tinha agendamento, conseguiu cancelar)."""
    ag = lead.get("agendamento")
    if not ag:
        return False, True
    try:
        srv.wa.cancelar(ag["id"])
        return True, True
    except Exception as e:
        log.warning("não consegui cancelar o agendamento do lead: %s", type(e).__name__)
        return True, False


# --------------------------------------------------------------------------- mover

@rota("POST", r"/api/leads/(?P<id>[^/]+)/mover")
def mover(h, usuario, agora, m):
    srv = h.server
    lead = _lead_ou_404(h, m, post=True)
    if lead is None:
        return
    dados, falhou = h._json_do_corpo()
    if falhou:
        return
    coluna = dados.get("coluna") if isinstance(dados, dict) else None
    if coluna == SEM_CONTATO:
        return h._erro(409, "Sem contato é automático: o card vai para lá quando o lead não tem WhatsApp. "
                            "Para tirar o lead da cadência, mova para Saíram.")
    if coluna not in SITUACAO_DA_COLUNA:
        return h._erro(400, "Coluna desconhecida. Use: " + ", ".join(SITUACAO_DA_COLUNA) + ".")
    sv = _servidor()
    antes = lead.get("situacao") or "ativo"
    coluna_antes = sv.coluna_do_lead(lead, agora)
    nova = SITUACAO_DA_COLUNA[coluna]
    if nova == antes and coluna_antes == coluna:
        return h._json(200, {"ok": True, "semMudanca": True, "coluna": coluna, "situacao": nova, "situacaoAntes": antes})
    mudanca = {"situacao": nova, "historico": wa_akg.registrar(
        lead.get("historico"), f"Card movido de {coluna_antes} para {coluna} (por {usuario})", agora)}
    out = {}
    if nova != "ativo":           # quem respondeu, saiu ou fechou não recebe o toque agendado
        tinha, ok = _cancelar_agendado(srv, lead)
        if tinha and ok:
            mudanca["agendamento"] = {"__delete__": True}
        elif tinha:
            out["aviso"] = "Movido, mas não consegui cancelar o envio agendado no WhatsApp. Confira na fila."
    novo = srv.repo.aplicar(lead["id"], mudanca)
    coluna_agora = sv.coluna_do_lead(novo, agora)
    if coluna_agora != coluna and "aviso" not in out:
        out["aviso"] = f"Voltou para a cadência. O card ficou em {coluna_agora}: é a regra dos toques que decide."
    return h._json(200, dict({"ok": True, "coluna": coluna_agora, "situacao": nova, "situacaoAntes": antes}, **out))


# --------------------------------------------------------------------------- próximo toque

def _e_whatsapp(lead) -> bool:
    return str(lead.get("canal") or "WhatsApp").strip().lower() == "whatsapp"


def proximo_toque(lead, agora, fotos_url: str) -> dict:
    """O que sai no próximo toque e, se não puder sair agora, por quê (em português simples)."""
    n = wa_akg._etapa(lead) + 1
    if n > 3:
        return {"n": None, "texto": "", "assunto": "", "foto": None, "midiaUrl": None, "podeEnviar": False,
                "motivo": "Os três toques já foram enviados."}
    toque = next((t for t in lead.get("toques") or [] if int(t.get("n") or 0) == n), {})
    email = not _e_whatsapp(lead)
    texto = (toque.get("corpo") or "") if email else wa_akg.mensagem_do_toque(lead, n)
    foto, midia = wa_akg.foto_do_toque(lead), None
    if not email and n == 1 and "Te mandei uma foto" in texto and foto and fotos_url:
        midia = f"{fotos_url.rstrip('/')}/{foto}.jpg"
    out = {"n": n, "texto": texto, "assunto": toque.get("assunto") or "", "foto": foto if not email else None,
           "midiaUrl": midia, "podeEnviar": False, "motivo": ""}
    sit = lead.get("situacao") or "ativo"
    if sit in ("sair", "fechou"):
        out["motivo"] = f"Este lead está como '{sit}': não se escreve mais para ele por aqui."
    elif sit == "respondeu":
        out["motivo"] = "Este lead já respondeu: escreva para ele em Responder pelo WhatsApp."
    elif email:
        out["motivo"] = "Este lead é de e-mail: o toque não sai pelo WhatsApp."
    elif not texto.strip():
        out["motivo"] = "O toque está sem mensagem."
    elif not wa_akg.numero_whatsapp(wa_akg.telefone_destino(lead)) and not lead.get("jidWa"):
        out["motivo"] = SEM_TELEFONE
    elif n == 1 and "Te mandei uma foto" in texto and not midia:
        out["motivo"] = "O toque 1 promete uma foto, mas a foto não está hospedada (endereço das fotos não configurado)."
    elif midia and len(texto) > wa_akg.LEGENDA_MAX:
        out["motivo"] = "A mensagem é longa demais para ir junto com a foto."
    elif not wa_akg.vence_hoje(lead, agora):
        ultimo = wa_akg._data(lead.get(f"enviado{n - 1}"))
        dias = wa_akg.ESPERA_DIAS.get(n, 0)
        quando = (wa_akg._inicio_do_dia(ultimo) + timedelta(days=dias)).strftime("%d/%m") if ultimo else "outro dia"
        out["motivo"] = f"O toque {n} só vence em {quando}. Assim a cadência não aperta o lead."
    else:
        out["podeEnviar"] = True
    return out


@rota("GET", r"/api/leads/(?P<id>[^/]+)/proximo-toque")
def ver_proximo_toque(h, usuario, agora, m):
    lead = _lead_ou_404(h, m)
    if lead is None:
        return
    return h._json(200, proximo_toque(lead, agora, h.server.cfg.get("fotos_url") or ""))


# --------------------------------------------------------------------------- enviar o toque agora

@rota("POST", r"/api/leads/(?P<id>[^/]+)/enviar-toque")
def enviar_toque(h, usuario, agora, m):
    srv = h.server
    if _lead_ou_404(h, m, post=True) is None:
        return
    _, falhou = h._json_do_corpo()
    if falhou:
        return
    with _trava_envio:
        lead = srv.repo.lead_get(unquote(m.group("id")))      # relido dentro da trava: o outro clique já pode ter enviado
        if lead is None:
            return h._erro(404, "Lead não encontrado.")
        return _enviar_toque(h, srv, lead, usuario, agora)


def _enviar_toque(h, srv, lead, usuario, agora):
    if srv.repo.config_get("status", "pausado") == "parado":
        return h._erro(409, "Está tudo parado. Retome o atendente antes de enviar pelo WhatsApp.")
    p = proximo_toque(lead, agora, srv.cfg.get("fotos_url") or "")
    if not p["podeEnviar"]:
        return h._erro(400 if p["motivo"] == SEM_TELEFONE else 409, p["motivo"])
    n = p["n"]
    numero = wa_akg.numero_whatsapp(wa_akg.telefone_destino(lead))
    erro_wa = "Não consegui falar com o WhatsApp agora. O toque NÃO foi enviado; tente de novo."
    try:
        if not srv.wa.conectado():
            return h._erro(502, "O WhatsApp está desconectado. O toque NÃO foi enviado.")
        jid = lead.get("jidWa") or srv.wa.verificar([numero]).get(numero)
        if not jid:
            return h._erro(400, "Este número não tem WhatsApp.")
        ag = lead.get("agendamento")
        if ag:
            # Já agendado: só cancela se ainda estiver pendente. Se não está mais, pode estar saindo agora.
            pendentes = {str(x.get("id")) for x in srv.wa.agendadas("pending") or []}
            if str(ag.get("id")) not in pendentes:
                return h._erro(409, "O envio agendado deste lead já saiu ou está saindo. Espere a conferência "
                                    "(alguns minutos) para não mandar duas vezes.")
            srv.wa.cancelar(ag["id"])
            srv.repo.aplicar(lead["id"], {"agendamento": {"__delete__": True}, "historico": wa_akg.registrar(
                lead.get("historico"), f"Toque {ag.get('n')} agendado cancelado para sair agora (por {usuario})", agora)})
        id_ = srv.wa.agendar(jid, p["texto"], wa_akg._iso(agora), p["midiaUrl"])
    except Exception as e:
        log.warning("falha ao enviar o toque agora: %s", type(e).__name__)
        return h._erro(502, erro_wa)
    em = wa_akg._iso(agora)
    atual = srv.repo.lead_get(lead["id"]) or lead
    texto_hist = f"Toque {n} enviado agora pelo WhatsApp (por {usuario})" + (" com foto" if p["midiaUrl"] else "")
    novo = srv.repo.aplicar(lead["id"], {
        "etapa": n, f"enviado{n}": em, "jidWa": jid,
        "agendamento": {"n": n, "id": id_, "sendAt": em, "jid": jid, "agora": True},
        "historico": wa_akg.registrar(atual.get("historico"), texto_hist, agora)})
    return h._json(200, {"ok": True, "n": n, "coluna": _servidor().coluna_do_lead(novo, agora)})

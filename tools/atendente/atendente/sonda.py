"""Sonda "Olá": antes do toque 1, manda só um "Olá" e espera alguns minutos.

Serve para saber se do outro lado tem robô (menu, saudação) ou pessoa. O toque 1 só é liberado depois da espera.
Resultado fica em `lead["sonda"]["resultado"]`: "sem_resposta", "robo" ou "humano". Se uma pessoa respondeu, o núcleo
já marcou o lead como "respondeu" e a cadência não segue por aqui. Interruptor: config `sonda_ola` (padrão ligado)."""
from datetime import datetime, timedelta

from atendente.politica import e_saudacao_automatica
from scripts import wa_akg

TEXTO = "Olá"
ESPERA = timedelta(seconds=45)                # curta: "Olá" solto por muito tempo confunde quem é pessoa
ESPACO = timedelta(seconds=90)              # entre uma sonda e a próxima (o WhatsApp não gosta de rajada)
NOVOS_DIA_PADRAO = 12                       # conversas novas por dia (cada "Olá" abre uma)


def ligada(repo) -> bool:
    return bool(repo.config_get("sonda_ola", True))


def vagas_hoje(wa, agora: datetime, limite_dia: int) -> int:
    """Quantas mensagens ainda cabem hoje no número, contando TUDO o que o WA-AKG tem agendado ou enviado hoje
    ("Olá", toques e respostas). Se não der para conferir, devolve 0: na dúvida, não manda."""
    try:
        _, ocupados = wa_akg.ritmo_atual(wa.agendadas("pending"), wa.agendadas("history"), agora)
    except Exception:
        return 0
    return max(0, int(limite_dia) - ocupados.get(agora.astimezone(wa_akg.FUSO).date(), 0))


def novos_hoje(repo, agora: datetime) -> int:
    """Quantas conversas novas ("Olá" de primeiro contato) já foram abertas hoje, no dia de Cuiabá."""
    hoje = agora.astimezone(wa_akg.FUSO).date()
    n = 0
    for l in repo.leads_todos():
        d = wa_akg._data((l.get("sonda") or {}).get("enviadaEm"))
        if d and d.astimezone(wa_akg.FUSO).date() == hoje:
            n += 1
    return n


def vagas_novos(repo, agora: datetime) -> int:
    """Conversas novas que ainda cabem hoje (config `novos_dia`, padrão 12). Quem já está em conversa não conta."""
    try:
        limite = int(repo.config_get("novos_dia", NOVOS_DIA_PADRAO))
    except (TypeError, ValueError):
        limite = NOVOS_DIA_PADRAO
    return max(0, limite - novos_hoje(repo, agora))


def _numero(lead) -> str:
    return wa_akg.numero_whatsapp(wa_akg.telefone_destino(lead))


def _candidato(lead) -> bool:
    return (lead.get("canal") == "WhatsApp" and lead.get("situacao") in (None, "", "ativo")
            and wa_akg._etapa(lead) == 0 and not lead.get("sonda") and not lead.get("agendamento")
            and lead.get("id") != "TESTE" and bool(_numero(lead) or lead.get("jidWa")))


def seguram_o_toque(repo) -> set:
    """Leads que ainda não podem receber o toque 1: sem sonda enviada, ou com sonda esperando resposta."""
    if not ligada(repo):
        return set()
    out = set()
    for l in repo.leads_todos():
        s = l.get("sonda")
        if _candidato(l) or (s and not s.get("liberada") and wa_akg._etapa(l) == 0):
            out.add(l["id"])
    return out


def resolver(repo, agora: datetime) -> dict:
    """Fecha as sondas cuja espera acabou e libera o toque 1."""
    cont = {"liberadas": 0, "sem_resposta": 0, "robo": 0, "humano": 0}
    for l in repo.leads_todos():
        s = l.get("sonda")
        if not s or s.get("liberada"):
            continue
        quando = wa_akg._data(s.get("enviadaEm"))
        if quando is None or agora - quando < ESPERA:
            continue
        recebidas = [m for m in repo.msgs_do_lead(l["id"], 50)
                     if not m["de_mim"] and (wa_akg._data(m["em"]) or agora) >= quando]
        if not recebidas:
            resultado = "sem_resposta"
        elif all(m["tipo"] == "TEXT" and e_saudacao_automatica(m["texto"]) for m in recebidas):
            resultado = "robo"
        else:
            resultado = "humano"
        texto = {"sem_resposta": "Sonda 'Olá': ninguém respondeu; o toque 1 segue.",
                 "robo": "Sonda 'Olá': respondeu um robô; o toque 1 segue.",
                 "humano": "Sonda 'Olá': uma pessoa respondeu."}[resultado]
        repo.aplicar(l["id"], {"sonda": {**s, "resultado": resultado, "liberada": True, "resolvidaEm": wa_akg._iso(agora)},
                               "historico": wa_akg.registrar(l.get("historico"), texto, agora)})
        cont[resultado] += 1
        cont["liberadas"] += 1
    return cont


def enviar(repo, wa, agora: datetime, quantas: int) -> int:
    """Agenda o "Olá" para até `quantas` leads de primeiro contato, espaçados. Quem falhar fica sem sonda e tenta na próxima."""
    enviadas = 0
    candidatos = sorted((l for l in repo.leads_todos() if _candidato(l)), key=wa_akg.prioridade)
    for l in candidatos:
        if enviadas >= quantas:
            break
        try:
            jid = l.get("jidWa")
            if not jid:
                numero = _numero(l)
                jid = wa.verificar([numero]).get(numero)
            if not jid:
                continue                                  # sem WhatsApp: o planejador cuida do caso
            quando = agora + ESPACO * enviadas
            id_ = wa.agendar(jid, TEXTO, wa_akg._iso(quando))
        except Exception:
            continue
        repo.aplicar(l["id"], {"jidWa": jid, "sonda": {"enviadaEm": wa_akg._iso(quando), "id": id_, "liberada": False},
                               "historico": wa_akg.registrar(l.get("historico"), "Sonda 'Olá' agendada antes do toque 1",
                                                             agora)})
        enviadas += 1
    return enviadas

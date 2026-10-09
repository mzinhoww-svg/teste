"""Conversa completa no card: copia do WA-AKG para o banco o que já aconteceu no WhatsApp de cada lead.

O webhook e a caixa de entrada (`conferencia_respostas`) só trazem o que o lead escreve de novo. O que a Reiners
manda (toques, respostas da IA e tudo o que a Letícia escreve pelo celular) só chegava pelo webhook `message.sent`; se
ele falha, o card ficava sem a nossa parte. Aqui entra:
- tudo o que é nosso (`fromMe`);
- o que o lead escreveu até `respostasVistasAte` (já tratado). O que é mais novo fica para a caixa de entrada, que
  passa pelo atendente (classificação, aviso, resposta). Copiar antes faria o atendente achar que já viu.
Só leitura no WhatsApp: nada é enviado daqui. Mensagem repetida é barrada pelo `Repo.msg_add`.
"""
import logging
from datetime import datetime, timedelta

from scripts import wa_akg

log = logging.getLogger("atendente.conversas")

SITUACOES = (None, "", "ativo", "respondeu", "fechou")
MAX_LEADS = 40                      # por rodada automática (cada lead é uma chamada ao WA-AKG)
RECENTE = timedelta(days=21)        # só conversas com movimento nas últimas 3 semanas entram na rodada automática


def _iso(d: datetime) -> str:
    return wa_akg._iso(d)


def _em_conversa(l: dict) -> bool:
    return (l.get("canal") == "WhatsApp" and l.get("situacao") in SITUACOES and bool(l.get("jidWa"))
            and bool(l.get("enviado1") or (l.get("sonda") or {}).get("enviadaEm")))


def _ultimo_movimento(l: dict):
    datas = [wa_akg._data(l.get(k)) for k in ("respostasVistasAte", "enviado4", "enviado3", "enviado2", "enviado1")]
    datas.append(wa_akg._data((l.get("sonda") or {}).get("enviadaEm")))
    datas = [d for d in datas if d]
    return max(datas) if datas else None


def _wa_id(m: dict, jid: str, quando: str, de_mim: bool) -> str:
    for v in (m.get("id"), (m.get("key") or {}).get("id") if isinstance(m.get("key"), dict) else None):
        if isinstance(v, str) and v:
            return v
    return f"sync:{jid}:{quando}:{1 if de_mim else 0}"


def sincronizar_lead(repo, wa, lead: dict, agora: datetime) -> int:
    """Copia a conversa de um lead. Devolve quantas mensagens novas entraram no banco."""
    jid = lead.get("jidWa")
    if not jid:
        return 0
    visto = wa_akg._data(lead.get("respostasVistasAte"))
    novas = 0
    for m in wa.mensagens(jid) or []:
        if not isinstance(m, dict):
            continue
        de_mim = bool(m.get("fromMe"))
        quando = wa_akg._data(m.get("timestamp"))
        if quando is None:
            continue
        if not de_mim and (visto is None or quando > visto):
            continue                                    # resposta nova: é da caixa de entrada (passa pelo atendente)
        em = _iso(quando)
        tipo = str(m.get("type") or "TEXT").upper()
        if repo.msg_add(str(lead["id"]), jid, de_mim, wa_akg._texto_msg(m), tipo, _wa_id(m, jid, em, de_mim), em):
            novas += 1
    return novas


def sincronizar(repo, wa, agora: datetime, max_leads: int = MAX_LEADS) -> dict:
    """Rodada automática: as conversas com movimento recente, da mais nova para a mais antiga."""
    candidatos = []
    for l in repo.leads_todos():
        if not _em_conversa(l):
            continue
        ult = _ultimo_movimento(l)
        if ult is None or agora - ult > RECENTE:
            continue
        candidatos.append((ult, l))
    candidatos.sort(key=lambda x: x[0], reverse=True)
    out = {"leads": 0, "mensagens": 0, "erros": 0}
    for _, l in candidatos[:max_leads]:
        try:
            out["mensagens"] += sincronizar_lead(repo, wa, l, agora)
            out["leads"] += 1
        except Exception as e:
            out["erros"] += 1
            log.warning("não consegui ler a conversa de um lead: %s", type(e).__name__)
    return out

"""O fluxo de uma mensagem: grava, cancela o que estava agendado, classifica, decide e executa.

A decisão de responder é de `politica.decidir`; aqui só se executa. Nada se perde: se a IA ou o
WhatsApp falharem, o caso vira aviso à equipe.
"""
import logging
import threading
from datetime import datetime, timezone

from scripts import wa_akg

from . import sonda
from .politica import decidir, e_saudacao_automatica, tem_pedido

log = logging.getLogger("atendente.nucleo")

PREFIXOS_AUTO = ("Resposta automática",)
RESPOSTA_OLA_MAX = 200          # resposta ao "Olá" mais longa que isso é conversa de verdade: segue o fluxo normal


def _iso(d: datetime) -> str:
    d = d if d.tzinfo else d.replace(tzinfo=timezone.utc)
    return d.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


class Atendente:
    def __init__(self, repo, wa, ia, avisador, fotos_url: str = ""):
        self.repo, self.wa, self.ia, self.avisador = repo, wa, ia, avisador
        self.fotos_url = fotos_url or ""
        self._trava_leads: dict[str, threading.Lock] = {}
        self._trava_dict = threading.Lock()         # protege o dicionário de travas por lead
        self._reserva = threading.Lock()            # decide + reserva a cota do dia de forma atômica
        self._em_voo = 0                            # respostas automáticas decididas e ainda não gravadas

    def _trava_do_lead(self, lead_id: str) -> threading.Lock:
        with self._trava_dict:
            return self._trava_leads.setdefault(lead_id, threading.Lock())

    # ---- auxiliares
    def _e_nossa_automatica(self, lead: dict, texto: str) -> bool:
        t = (texto or "").strip()
        if not t:
            return False
        if t.startswith(PREFIXOS_AUTO) or t == sonda.TEXTO:
            return True
        for tq in lead.get("toques") or []:
            if (tq.get("mensagem") or "").strip() == t:
                return True
        for n in (1, 2, 3):
            try:
                if wa_akg.mensagem_do_toque(lead, n).strip() == t:
                    return True
            except Exception:
                pass
        return any((a.get("respostaEnviada") or "").strip() == t
                   for a in self.repo.atendimento_lista(limite=50, lead_id=str(lead["id"])))

    def _seguir_apos_ola(self, lead: dict, m, em: str, agora: datetime) -> bool:
        """Uma pessoa respondeu ao "Olá" da sonda com um cumprimento ou pergunta simples: manda o toque 1 na hora,
        como continuação da conversa. Pedido de verdade, fila parada ou qualquer falha: devolve False e segue o
        fluxo normal (marca respondeu, IA, aviso)."""
        s = lead.get("sonda") or {}
        if s.get("liberada") is not False or wa_akg._etapa(lead) != 0 or lead.get("situacao") not in (None, "", "ativo"):
            return False
        texto = (m.texto or "").strip()
        if m.tipo != "TEXT" or not texto or len(texto) > RESPOSTA_OLA_MAX or tem_pedido(texto):
            return False
        if self.repo.config_get("status", "ativo") == "parado":
            return False
        corpo = wa_akg.mensagem_do_toque(lead, 1)
        if not corpo.strip():
            return False
        foto, midia = wa_akg.foto_do_toque(lead), None
        if "Te mandei uma foto" in corpo:
            if not (foto and self.fotos_url):
                return False
            midia = f"{self.fotos_url.rstrip('/')}/{foto}.jpg"
        jid = m.jid or lead.get("jidWa")
        limite = self.repo.config_get("limite_dia", 12)
        if sonda.vagas_hoje(self.wa, agora, limite) <= 0:
            # limite do dia cheio: libera a sonda e deixa o toque 1 para o planejador, que respeita o limite
            self.repo.aplicar(lead["id"], {
                "sonda": {**s, "resultado": "humano", "liberada": True, "resolvidaEm": _iso(agora)},
                "jidWa": jid, "respostasVistasAte": em,
                "historico": wa_akg.registrar(lead.get("historico"),
                                              "Respondeu ao 'Olá'; toque 1 fica para quando houver vaga no limite do dia",
                                              agora)})
            return True
        try:
            id_ = self.wa.agendar(jid, corpo, _iso(agora), midia)
        except Exception as e:
            log.warning("não consegui mandar o toque 1 depois do Olá: %s", type(e).__name__)
            return False
        envio = _iso(agora)
        self.repo.aplicar(lead["id"], {
            "sonda": {**s, "resultado": "humano", "liberada": True, "resolvidaEm": envio},
            "etapa": 1, "enviado1": envio, "jidWa": jid, "respostasVistasAte": em,
            "agendamento": {"n": 1, "id": id_, "sendAt": envio, "jid": jid, "agora": True},
            "historico": wa_akg.registrar(lead.get("historico"),
                                          "Respondeu ao 'Olá': toque 1 enviado na sequência", agora)})
        self.repo.atendimento_add(leadId=str(lead["id"]), empresa=lead.get("nome"), em=envio, mensagemLead=m.texto,
                                  acao="seguiu_toque")
        return True

    def _cancelar_pendentes(self, lead: dict, jid: str, agora: datetime) -> dict:
        """Cancela no WA-AKG o que ainda está pendente para o lead. Falha não impede o resto do fluxo."""
        ag = lead.get("agendamento") or {}
        jids = {j for j in (jid, lead.get("jidWa"), ag.get("jid")) if j}
        try:
            pend = self.wa.agendadas("pending")
        except Exception as e:
            log.warning("não consegui listar os pendentes: %s", type(e).__name__)
            return {"erro": True, "cancelados": 0}
        alvos = [p for p in pend if (ag.get("id") and str(p.get("id")) == str(ag["id"])) or p.get("jid") in jids]
        cancelados, erro = 0, False
        for p in alvos:
            try:
                self.wa.cancelar(p.get("id"))
                cancelados += 1
            except Exception as e:
                erro = True
                log.warning("não consegui cancelar um pendente: %s", type(e).__name__)
        return {"erro": erro, "cancelados": cancelados}

    def _avisar(self, lead: dict, m, motivo: str, agora: datetime, intencao=None) -> str:
        trecho = m.texto or f"[{m.tipo.lower()}]"
        self.avisador.adicionar(lead, motivo, trecho, agora)
        lead = self.repo.aplicar(lead["id"], {"historico": wa_akg.registrar(
            lead.get("historico"), f"ATENÇÃO: {motivo}. Mensagem do lead: {trecho[:200]}", agora)})
        self.repo.atendimento_add(leadId=lead["id"], empresa=lead.get("nome"), em=_iso(agora), mensagemLead=m.texto,
                                  intencao=intencao, acao="avisou", motivoAviso=motivo)
        return "avisada"

    # ---- fluxo
    def tratar_mensagem(self, m, agora: datetime) -> str:
        em = m.em or _iso(agora)
        lead = self.repo.lead_por_numero(m.numero) if m.numero else None
        if lead is None:
            return "desconhecido"
        lead_id = str(lead["id"])

        if m.de_mim:
            if not self.repo.msg_add(lead_id, m.jid, True, m.texto, m.tipo, m.wa_id, em):
                return "duplicada"
            if not self._e_nossa_automatica(lead, m.texto):
                self.repo.atendimento_add(leadId=lead_id, empresa=lead.get("nome"), em=_iso(agora),
                                          mensagemLead=m.texto, acao="humano", humanoRespondeu=True)
            return "nossa"

        # 1) toda mensagem do lead é gravada antes de qualquer outra coisa
        if not self.repo.msg_add(lead_id, m.jid, False, m.texto, m.tipo, m.wa_id, em):
            return "duplicada"

        # 1b) saudação de robô do WhatsApp Business: não é resposta de gente; não marca, não cancela, não avisa
        if m.tipo == "TEXT" and e_saudacao_automatica(m.texto):
            self.repo.atendimento_add(leadId=lead_id, empresa=lead.get("nome"), em=_iso(agora), mensagemLead=m.texto,
                                      intencao="automatica", acao="ignorou", motivoAviso="saudação automática")
            return "automatica"

        # 1c) uma pessoa respondeu ao "Olá" da sonda: a conversa segue com o toque 1, sem marcar respondeu
        with self._trava_do_lead(lead_id):
            atual = self.repo.lead_get(lead_id) or lead
            if self._seguir_apos_ola(atual, m, em, agora):
                return "seguiu_toque"

        # 2) o lead respondeu: marca, atualiza o visto e cancela o que estava agendado
        dados = {"respostasVistasAte": em}
        if lead.get("situacao") not in ("sair", "fechou"):
            dados["situacao"] = "respondeu"
        canc = self._cancelar_pendentes(lead, m.jid, agora)
        if lead.get("agendamento"):
            if canc.get("erro"):
                dados["historico"] = wa_akg.registrar(
                    lead.get("historico"), "ATENÇÃO: não consegui cancelar o envio agendado; confira no WhatsApp",
                    agora)
            else:
                dados["agendamento"] = {"__delete__": True}
                dados["historico"] = wa_akg.registrar(
                    lead.get("historico"), "Envio agendado cancelado porque o lead respondeu", agora)
        lead = self.repo.aplicar(lead_id, dados)

        with self._trava_do_lead(lead_id):
            # dentro da trava: relê o lead (outra mensagem pode ter respondido antes de nós)
            lead = self.repo.lead_get(lead_id) or lead
            # 3) classificação (só texto, e só se a política ainda deixaria sair algo)
            ultima_nossa = next((x["texto"] for x in reversed(self.repo.msgs_do_lead(lead_id, 20)) if x["de_mim"]), None)
            status = self.repo.config_get("status", "ativo")
            classificacao = None
            if m.tipo == "TEXT" and m.texto and status != "parado" and lead.get("situacao") != "sair":
                try:
                    classificacao = self.ia.classificar(
                        m.texto, {"empresa": lead.get("nome"), "ultima_mensagem_nossa": ultima_nossa}, agora)
                except Exception as e:
                    log.warning("a IA falhou: %s", type(e).__name__)
            cfg = {"status": status, "auto_resposta": self.repo.config_get("auto_resposta", True)}
            with self._reserva:
                # contagens relidas aqui, dentro das travas: 24 h por lead e 20/dia no total (inclui as em voo)
                d = decidir(lead, classificacao, cfg, self.repo.auto_respostas_hoje(agora) + self._em_voo,
                            self.repo.ultima_auto_resposta(lead_id), agora, m.tipo)
                reservou = d.acao == "responder"
                if reservou:
                    self._em_voo += 1
            intencao = (classificacao or {}).get("intencao")

            # 4) execução
            if d.acao == "responder":
                try:
                    try:
                        r = wa_akg.responder_lead(self.wa, lead, m.jid or lead.get("jidWa"), d.texto, agora, auto=True)
                    except Exception as e:
                        log.warning("não consegui responder: %s", type(e).__name__)
                        return self._avisar(lead, m, "falha ao enviar a resposta automática", agora, intencao)
                    lead = self.repo.aplicar(lead_id, r["data"])
                    self.repo.msg_add(lead_id, m.jid, True, d.texto, "TEXT", None, _iso(agora))
                    self.repo.atendimento_add(leadId=lead_id, empresa=lead.get("nome"), em=_iso(agora),
                                              mensagemLead=m.texto, intencao=intencao, acao="sozinha",
                                              respostaEnviada=d.texto)
                    return "respondida"
                finally:
                    with self._reserva:
                        self._em_voo -= 1
            if d.acao == "avisar":
                return self._avisar(lead, m, d.motivo, agora, intencao)
            if d.acao == "sair":
                self.repo.aplicar(lead_id, {"situacao": "sair", "historico": wa_akg.registrar(
                    lead.get("historico"), "Pediu para sair: não recebe mais mensagens", agora)})
                self.repo.atendimento_add(leadId=lead_id, empresa=lead.get("nome"), em=_iso(agora), mensagemLead=m.texto,
                                          intencao=intencao, acao="sair")
                return "sair"
            self.repo.atendimento_add(leadId=lead_id, empresa=lead.get("nome"), em=_iso(agora), mensagemLead=m.texto,
                                      intencao=intencao, acao="ignorou", motivoAviso=d.motivo)
            return "ignorada"

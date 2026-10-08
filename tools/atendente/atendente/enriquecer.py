"""Enriquecimento da base na VPS, sem o Claude: busca o celular de quem decide (treg, pago) e o contato que a empresa
publica no próprio site (grátis).

A lógica é a de `scripts/enriquecer_leads.py` (limpar, selecionar, estimar, executar, aplicar) e de
`scripts/site_contatos.py`, usadas como biblioteca. Aqui só fica o que é da VPS:
- uma rodada por vez, numa thread só (`Ocupado` se já há uma);
- teto de US$ 10 por rodada, com confirmação explícita;
- progresso ao vivo e histórico em `config["enriquecimento"]`, resultado gravado lead a lead com `repo.aplicar`;
- Parar (pela tela) e "Parar tudo" do atendente (`config.status == "parado"`) interrompem antes do próximo lead;
- token do treg só na memória (TREG_TOKEN ou TREG_API_KEY do ambiente), nunca no banco nem no log.
"""
import logging
import re
import threading
from datetime import datetime, timedelta, timezone

from scripts import enriquecer_leads as el
from scripts import site_contatos

log = logging.getLogger("atendente.enriquecer")

CHAVE = "enriquecimento"
TETO_MICRO = 10_000_000
SALDO_DESCONHECIDO = 10 ** 12          # o treg recusa com 402 quando falta saldo; aí a rodada para
HISTORICO_MAX = 20
SITE_MAX = 100                         # visitas a sites por rodada (cada uma pode levar alguns segundos)
SITE_DIAS = 90
CAMPOS_LEAD = ("contatos", "decisores", "buscaTreg", "historico", "pendencias", "enriquecimento")
SEM_TOKEN = ("Falta o token do treg na VPS. Peça para colocar TREG_TOKEN=<token> no arquivo /opt/atendente/.env "
             "e reiniciar o atendente. Sem ele a busca de telefones fica desligada.")
PARADO_EQUIPE = "parado pela equipe"
PARADO_TUDO = "atendente parado (Parar tudo)"
FALHA = "falha inesperada"
INTERROMPIDA = "interrompida"
TEXTO_MOTIVO = {
    None: "Rodada concluída.",
    "teto de US$10": "Parou no teto de US$ 10 desta rodada.",
    "saldo insuficiente": "Saldo do treg insuficiente. Recarregue o saldo no painel do treg (Team, Billing) e tente de novo.",
    "acerto abaixo de 30%": "Parou porque menos de 30% das buscas acharam telefone (regra antiga).",
    "acerto muito baixo": "Parou porque menos de 5% das buscas acharam telefone, depois de pelo menos 100 buscas.",
    "erros consecutivos": "Parou depois de 10 erros seguidos do treg. Tente de novo mais tarde.",
    PARADO_EQUIPE: "Parada pela equipe.",
    PARADO_TUDO: "Parou porque o atendente foi parado (Parar tudo).",
    FALHA: "A rodada parou por uma falha inesperada. Os leads já buscados ficaram gravados.",
    INTERROMPIDA: "A rodada foi interrompida porque o serviço reiniciou. Os leads já buscados ficaram gravados.",
}


class Recusado(Exception):
    """Pedido que não dá para atender agora; a mensagem vai para a tela."""

    def __init__(self, msg, status=400):
        super().__init__(msg)
        self.status = status


class Ocupado(Recusado):
    def __init__(self):
        super().__init__("Já tem uma rodada de enriquecimento em andamento. Espere terminar ou clique em Parar.", 409)


def token_do_ambiente(env) -> str | None:
    for nome in ("TREG_TOKEN", "TREG_API_KEY"):
        v = (env.get(nome) or "").strip()
        if v:
            return v
    return None


def _iso(d: datetime) -> str:
    return d.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _agora_utc() -> datetime:
    return datetime.now(timezone.utc)


def _digitos(x) -> str:
    return re.sub(r"\D", "", str(x or ""))


def _sem_55(x) -> str:
    d = _digitos(x)
    return d[2:] if len(d) in (12, 13) and d.startswith("55") else d


def contato_do_site(achado: dict | None, lead: dict) -> dict | None:
    """O contato `geral` da empresa tirado do site (resultado de site_contatos.coletar_um), no mesmo formato que
    `scripts/base_explee.contato_do_lead` grava: um telefone (WhatsApp primeiro) e um e-mail, nunca repetindo o que o
    lead já tem. (base_explee não é importado aqui porque puxa `central/`, que não vai para o contêiner.)"""
    achado = achado or {}
    wa = next((_digitos(x) for x in achado.get("whatsapp") or [] if _digitos(x)), "")
    tel = next((_digitos(x) for x in achado.get("telefones") or [] if _digitos(x)), "")
    mail = next((str(x).strip().lower() for x in achado.get("emails") or [] if str(x).strip()), "")
    fone = wa or tel
    if not (fone or mail):
        return None
    contatos = lead.get("contatos") or []
    tem_fone = {_sem_55(c.get("telefone")) for c in contatos} | {_sem_55(lead.get("telefone"))}
    tem_mail = {str(c.get("email") or "").strip().lower() for c in contatos} | {str(lead.get("email") or "").strip().lower()}
    if (fone and _sem_55(fone) in tem_fone) or (mail and mail in tem_mail):
        return None
    ns = [int(m.group(1)) for c in contatos if (m := re.fullmatch(r"k(\d+)", str(c.get("id"))))]
    return {"id": f"k{max(ns, default=0) + 1}", "papel": "geral", "nome": "", "cargo": "Contato da empresa (site)",
            "telefone": fone, "whatsapp": "sim" if wa else "?", "email": mail,
            "fonte": str(achado.get("fonte") or "")[:200], "confianca": "média"}


def _tem_telefone(lead: dict) -> bool:
    if len(_digitos(lead.get("telefone"))) >= 10:
        return True
    return any(len(_digitos(c.get("telefone"))) >= 10 and not c.get("invalido") for c in lead.get("contatos") or [])


def _precisa_site(lead: dict, agora: datetime) -> str:
    """Domínio a visitar, ou "" se o lead não precisa (saiu/fechou, já tem telefone, sem site, visitado há pouco)."""
    if lead.get("situacao") in el.IGNORADAS or _tem_telefone(lead):
        return ""
    em = el._parse_data((lead.get("siteContatos") or {}).get("em"))
    if em and em > agora - timedelta(days=SITE_DIAS):
        return ""
    return el._dominio(lead.get("site") or "")


class _ClienteSeguro:
    """Embrulha o TregCliente: qualquer falha inesperada numa chamada vira erro daquele lead, não da rodada."""

    def __init__(self, cliente):
        self._c = cliente

    def chamar(self, *a, **k):
        try:
            return self._c.chamar(*a, **k)
        except (el.TregErro, OSError):
            raise
        except Exception as e:
            log.warning("chamada ao treg falhou: %s", type(e).__name__)
            raise el.TregErro(0, None, f"falha: {type(e).__name__}")


class Enriquecedor:
    def __init__(self, repo, token=None, org=None, transporte=None, coletar_site=None, relogio=None,
                 teto_micro=TETO_MICRO, dormir=None):
        self.repo = repo
        self.token, self.org = token, org
        self.transporte = transporte                       # None = HTTP de verdade (urllib)
        self.coletar_site = coletar_site or site_contatos.coletar_um
        self.relogio = relogio or _agora_utc
        self.teto_micro = teto_micro
        self.dormir = dormir
        self._trava = threading.Lock()
        self._thread: threading.Thread | None = None
        self._parar = threading.Event()
        self._parar_por = None

    # ------------------------------------------------------------------ leitura
    @property
    def rodando(self) -> bool:
        th = self._thread
        return th is not None and th.is_alive()

    def _doc(self) -> dict:
        d = self.repo.config_get(CHAVE) or {}
        return d if isinstance(d, dict) else {}

    def _gravar(self, **campos) -> dict:
        with self._trava_doc():
            d = self._doc()
            d.update(campos)
            self.repo.config_set(CHAVE, d)
            return d

    def _trava_doc(self):
        return getattr(self.repo, "_lock", None) or threading.Lock()

    def estado(self) -> dict:
        d = self._doc()
        if d.get("status") == "executando" and not self.rodando:
            d = self._fechar_doc(d, INTERROMPIDA)
        if d.get("status") not in ("executando", "concluido", "parado"):
            d["status"] = "ocioso"         # "pedido"/"estimando" vindos da Central antiga não valem aqui
        d.setdefault("historicoExecucoes", [])
        motivo = d.get("motivoParada")
        texto = TEXTO_MOTIVO.get(motivo, motivo or "")
        if motivo == PARADO_EQUIPE and d.get("pararPor"):
            texto = f"Parada por {d['pararPor']}."
        return dict(d, rodando=self.rodando, disponivel=bool(self.token), tetoUsd=self.teto_micro / 1_000_000,
                    semToken="" if self.token else SEM_TOKEN,
                    motivoTexto=texto if d["status"] in ("parado", "concluido") else "")

    def plano(self) -> dict:
        agora = self.relogio()
        leads = self.repo.leads_todos()
        limpos, _ = el.limpar(leads)
        cands = el.selecionar(limpos, agora)
        reais = [h for h in self._doc().get("historicoExecucoes") or [] if not h.get("simulado")]
        est = el.estimar(cands, reais)
        ignorados = sum(1 for l in leads if l.get("situacao") in el.IGNORADAS)
        site = sum(1 for l in limpos if _precisa_site(l, agora))
        return {"candidatos": len(cands), "buscasLinkedin": est["buscasLinkedin"], "taxa": est["taxa"],
                "fonteTaxa": est["fonte"], "custoEstimadoUsd": round(est["custoEstimadoMicro"] / 1_000_000, 2),
                "tetoUsd": self.teto_micro / 1_000_000, "ignorados": ignorados,
                "foraDoAlvo": len(leads) - ignorados - len(cands), "site": min(site, SITE_MAX),
                "disponivel": bool(self.token), "semToken": "" if self.token else SEM_TOKEN}

    # ------------------------------------------------------------------ comandos
    def iniciar(self, usuario: str, confirmo: bool = False, simular: bool = False) -> dict:
        with self._trava:
            if self.rodando:
                raise Ocupado()
            if not simular and not self.token:
                raise Recusado(SEM_TOKEN)
            if self.repo.config_get("status") == "parado":
                raise Recusado("O atendente está parado (Parar tudo). Retome o atendente antes de enriquecer.", 409)
            if confirmo is not True:
                raise Recusado("Confirme que a rodada pode gastar até US$ 10 antes de começar.")
            plano = self.plano()
            if not plano["candidatos"] and not (plano["site"] and not simular):
                raise Recusado("Nenhum lead para enriquecer agora: todos já foram buscados, saíram ou não têm "
                               "com o que buscar.", 409)
            agora = self.relogio()
            execucao = "E" + agora.astimezone(timezone.utc).strftime("%Y%m%d%H%M%S")
            self._parar.clear()
            self._parar_por = None
            self._gravar(status="executando", execucaoId=execucao, iniciadoEm=_iso(agora), por=usuario,
                         simulado=bool(simular), plano=plano, motivoParada=None, pararPor=None,
                         progresso={"candidatos": plano["candidatos"], "consultados": 0, "achados": 0, "erros": 0,
                                    "gastoMicro": 0, "taxa": None, "siteFeitos": 0, "siteAchados": 0,
                                    "etapa": "treg", "atualizadoEm": _iso(agora)})
            self._thread = threading.Thread(target=self._rodar, args=(execucao, usuario, bool(simular)),
                                            name="atendente-enriquecer", daemon=True)
            self._thread.start()
        return self.estado()

    def parar(self, usuario: str) -> dict:
        if not self.rodando:
            raise Recusado("Nenhuma rodada de enriquecimento em andamento.", 409)
        self._parar_por = usuario
        self._parar.set()
        self._gravar(pararPor=usuario)
        return self.estado()

    def esperar(self, timeout=None) -> bool:
        th = self._thread
        if th is not None:
            th.join(timeout)
        return not self.rodando

    # ------------------------------------------------------------------ rodada
    def _motivo_parar(self):
        if self._parar.is_set():
            return PARADO_EQUIPE
        if self.repo.config_get("status") == "parado":
            return PARADO_TUDO
        return None

    def _cliente(self, simular: bool):
        if simular:
            return el.TregCliente("simulado", transporte=el.transporte_simulado, dormir=lambda s: None)
        extra = {"transporte": self.transporte} if self.transporte else {}
        if self.dormir:
            extra["dormir"] = self.dormir
        return _ClienteSeguro(el.TregCliente(self.token, org=self.org, **extra))

    def _progresso(self, **campos):
        with self._trava_doc():
            d = self._doc()
            pr = dict(d.get("progresso") or {})
            pr.update(campos, atualizadoEm=_iso(self.relogio()))
            d["progresso"] = pr
            self.repo.config_set(CHAVE, d)

    def _aplicar_lead(self, lead_id, mudar) -> None:
        """Relê o lead e grava o que `mudar(lead)` devolver (dict de campos), sem perder edições feitas no meio."""
        with self._trava_doc():
            atual = self.repo.lead_get(lead_id)
            if atual is None:
                return
            data = mudar(atual)
            if data:
                self.repo.aplicar(lead_id, data)

    def _limpar_telefones(self) -> None:
        _, alteracoes = el.limpar(self.repo.leads_todos())
        for lead_id in {a["leadId"] for a in alteracoes if a["tipo"] != "ignorado"}:
            def mudar(atual):
                limpo = el.limpar([atual])[0][0]
                return {"contatos": limpo["contatos"]} if limpo.get("contatos") != atual.get("contatos") else None
            self._aplicar_lead(lead_id, mudar)

    def _rodar(self, execucao: str, usuario: str, simular: bool) -> None:
        motivo = None
        try:
            agora = self.relogio()
            if not simular:
                self._limpar_telefones()
            limpos, _ = el.limpar(self.repo.leads_todos())
            cands = el.selecionar(limpos, agora)
            por_id = {c["leadId"]: c for c in cands}
            self._progresso(candidatos=len(cands))

            def ao_lead(lead_id, r, parcial):
                if not simular:
                    try:
                        self._gravar_resultado(lead_id, r, por_id[lead_id], execucao, usuario)
                    except Exception as e:      # um lead com forma estranha não derruba a rodada
                        log.error("falha ao gravar o resultado de um lead: %s", type(e).__name__)
                self._progresso(consultados=parcial["consultados"], achados=parcial["achados"],
                                erros=parcial["erros"], gastoMicro=parcial["gastoMicro"], taxa=parcial["taxa"])

            res = el.executar(cands, self._cliente(simular), execucao, SALDO_DESCONHECIDO, teto_micro=self.teto_micro,
                              parar=self._motivo_parar, ao_lead=ao_lead)
            motivo = res["motivoParada"]
            if not simular:   # interrompidos (só a busca de LinkedIn rodou) não passam pelo ao_lead
                for lead_id, r in res["porLead"].items():
                    if r.get("resultado") == "interrompido":
                        self._gravar_resultado(lead_id, r, por_id[lead_id], execucao, usuario)
            self._progresso(consultados=res["consultados"], achados=res["achados"], erros=res["erros"],
                            gastoMicro=res["gastoMicro"], taxa=res["taxa"])
            if not simular and motivo in (None, "acerto abaixo de 30%", "acerto muito baixo", "teto de US$10", "saldo insuficiente",
                                          "erros consecutivos"):
                motivo = self._sites(usuario) or motivo
        except Exception as e:
            log.error("rodada de enriquecimento falhou: %s", type(e).__name__)
            motivo = FALHA
        finally:
            with self._trava_doc():
                self._fechar_doc(self._doc(), motivo)

    def _gravar_resultado(self, lead_id, r, cand, execucao, usuario) -> None:
        agora = self.relogio()

        def mudar(atual):
            novo = el.aplicar(atual, r, cand["decisorIndex"], agora, execucao)
            h = list(novo.get("historico") or [])
            if r.get("resultado") != "interrompido" and h and h[-1].get("tipo") == "enriquecimento":
                h[-1] = dict(h[-1], texto=f"{h[-1]['texto']} (rodada pedida por {usuario})", por=usuario)
                novo["historico"] = h
            return {k: novo[k] for k in CAMPOS_LEAD if k in novo and novo.get(k) != atual.get(k)}
        self._aplicar_lead(lead_id, mudar)

    def _sites(self, usuario: str):
        """Contato publicado no site, para quem não tem telefone nenhum. Devolve um motivo de parada ou None."""
        agora = self.relogio()
        alvos = []
        for l in self.repo.leads_todos():
            dom = _precisa_site(l, agora)
            if dom:
                alvos.append((l["id"], dom))
        alvos = alvos[:SITE_MAX]
        self._progresso(etapa="site", siteTotal=len(alvos))
        feitos = achados = 0
        for lead_id, dom in alvos:
            m = self._motivo_parar()
            if m:
                return m
            try:
                achado = self.coletar_site(dom)
            except Exception as e:
                log.warning("site de um lead não respondeu: %s", type(e).__name__)
                achado = None
            em = _iso(self.relogio())
            achou = []

            def mudar(atual):
                contatos = list(atual.get("contatos") or [])
                novo = contato_do_site(achado, atual)
                data = {"siteContatos": {"em": em, "achou": bool(novo), "fonte": (novo or {}).get("fonte", "")}}
                if novo:
                    achou.append(1)
                    data["contatos"] = contatos + [novo]
                    data["historico"] = list(atual.get("historico") or []) + [{
                        "em": em, "tipo": "enriquecimento", "por": usuario,
                        "texto": f"Contato da empresa achado no site (rodada pedida por {usuario})"}]
                return data
            self._aplicar_lead(lead_id, mudar)
            feitos += 1
            achados += len(achou)
            self._progresso(siteFeitos=feitos, siteAchados=achados)
        return None

    def _fechar_doc(self, d: dict, motivo) -> dict:
        pr = d.get("progresso") or {}
        d = dict(d, status="concluido" if motivo is None else "parado", motivoParada=motivo,
                 terminadoEm=_iso(self.relogio()))
        if motivo == PARADO_EQUIPE and self._parar_por:
            d["pararPor"] = self._parar_por
        hist = list(d.get("historicoExecucoes") or [])
        hist.append({"execucaoId": d.get("execucaoId"), "em": d.get("iniciadoEm"), "terminadoEm": d["terminadoEm"],
                     "por": d.get("por"), "simulado": bool(d.get("simulado")),
                     "candidatos": pr.get("candidatos", 0), "consultados": pr.get("consultados", 0),
                     "achados": pr.get("achados", 0), "erros": pr.get("erros", 0), "taxa": pr.get("taxa"),
                     "gastoMicro": pr.get("gastoMicro", 0), "siteFeitos": pr.get("siteFeitos", 0),
                     "siteAchados": pr.get("siteAchados", 0), "motivoParada": motivo})
        d["historicoExecucoes"] = hist[-HISTORICO_MAX:]
        self.repo.config_set(CHAVE, d)
        return d

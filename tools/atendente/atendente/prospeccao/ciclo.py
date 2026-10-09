"""Ciclo da prospecção: uma rodada de uma campanha, numa thread só, de empresa a lead na cadência (spec 5 e 6).

Estados de cada prospecto (tabela `prospectos`, `tipo` "empresa" ou "pessoa"):
    empresa → pessoa → contato → qualificado → promovido | descartado(motivo)
- empresa: `empresas.achar` (CNPJ de MT, sem pagar) e `empresas.completar` (Maps, só se faltar site); fechada não
  entra. Depois `pessoas.achar` com `pessoas.regra_por_porte`; sem pessoa física, a empresa é descartada.
- pessoa: chave da pessoa (`qualificar.chave_pessoa`) é o id: o mesmo dono em vários CNPJs, ou em outra campanha, é
  contatado uma vez. Empresa que já é lead, cliente ou Base, ou que já tem decisor qualificado, não paga celular.
- contato: `contatos.enriquecer` (cadastro filtrado, celular pago só com LinkedIn ou site, e-mail).
- qualificado: `qualificar.qualificar` (lista de saída, duplicidade, WhatsApp no WA-AKG; fora do ar = fica para
  a próxima rodada). promovido: `promover.promover`, até a meta do dia.

Estabilidade: uma rodada por vez (`Recusado` 409 se ocupada); o estado mora no banco (prospectos, campanha e
`config["prospeccao"]`), então a rodada seguinte retoma de onde parou e não paga de novo; rodada que estava
"executando" quando o serviço caiu aparece "interrompida" ao subir. Falha de uma empresa ou pessoa não derruba a
rodada (10 seguidas, sim). Teto por dia e por campanha (`campanha.orcamento`, gasto gravado chamada a chamada);
sem saldo (402) para com mensagem; Parar (tela), Parar tudo (`config.status == "parado"`) e pausar a campanha param
antes do próximo passo. Token do treg só na memória. Telefone e e-mail só no banco, nunca no log nem no histórico.
"""
import logging
import re
import threading
import unicodedata
from datetime import datetime, timedelta, timezone

from scripts import enriquecer_leads as el

from .. import enriquecer as enr
from ..enriquecer import Recusado
from . import campanha as camp_mod
from . import contatos, empresas, pessoas, promover, qualificar
from .campanha import MICRO, Orcamento
from .treg_ops import SemSaldo

log = logging.getLogger("atendente.prospeccao")

CHAVE = "prospeccao"
HISTORICO_MAX = 30
ERROS_SEGUIDOS_MAX = 10
ERROS_POR_ITEM = 3
SALDO_ESPERA = timedelta(minutes=5)     # depois de um 402, iniciar responde 402 por este tempo
SEM_TOKEN = ("Falta o token do treg na VPS. Peça para colocar TREG_TOKEN=<token> no arquivo /opt/atendente/.env "
             "e reiniciar o atendente. Sem ele a prospecção fica desligada.")

TETO_DIA, TETO_CAMPANHA, META = "teto do dia", "teto da campanha", "meta do dia"
SALDO, ERROS = "saldo insuficiente", "erros consecutivos"
PARADO_EQUIPE, PARADO_TUDO, PAUSADA = enr.PARADO_EQUIPE, enr.PARADO_TUDO, "campanha pausada"
FALHA, INTERROMPIDA = "falha inesperada", "interrompida"
SEM_EMPRESAS = "sem empresas"
SO_MAPS = "0000000"        # CNAE "nenhum": a base de CNPJ não tem nada com ele, então a campanha usa só o Google Maps
TEXTO_MOTIVO = {
    None: "Rodada concluída: todas as empresas da campanha foram vistas.",
    TETO_DIA: "Parou no teto do dia desta campanha. Amanhã continua de onde parou.",
    TETO_CAMPANHA: "Parou no teto da campanha. Aumente o teto para continuar.",
    META: "Bateu a meta de leads do dia. Amanhã continua de onde parou.",
    SALDO: "Saldo do treg insuficiente. Recarregue o saldo no painel do treg (Team, Billing) e tente de novo.",
    ERROS: "Parou depois de 10 erros seguidos. Tente de novo mais tarde.",
    PARADO_EQUIPE: "Parada pela equipe.",
    PARADO_TUDO: "Parou porque o atendente foi parado (Parar tudo).",
    PAUSADA: "Campanha pausada.",
    FALHA: "A rodada parou por uma falha inesperada. O que já foi feito ficou gravado.",
    INTERROMPIDA: "A rodada foi interrompida porque o serviço reiniciou. A próxima continua de onde parou.",
    SEM_EMPRESAS: "Não achamos empresas deste segmento nas cidades da campanha, nem na base de CNPJ nem no Google "
                  "Maps. Confira o nome do segmento e as cidades.",
}
STATUS_DO_MOTIVO = {None: "concluida", TETO_DIA: "teto", TETO_CAMPANHA: "teto", META: "parada", SALDO: "erro",
                    ERROS: "erro", FALHA: "erro", PARADO_EQUIPE: "parada", PARADO_TUDO: "parada",
                    PAUSADA: "pausada", INTERROMPIDA: "parada", SEM_EMPRESAS: "parada"}
PENDENTES = ("pessoa", "contato", "qualificado")

# Segmento → CNAEs (quando a tela não manda os códigos). Chave sem acento, procurada dentro do segmento.
CNAES_DO_SEGMENTO = {
    "restaurante": ["5611201", "5611203"], "lanchonete": ["5611203"], "bar": ["5611204"],
    "academia": ["9313100"], "supermercado": ["4711302", "4712100"], "mercado": ["4711302", "4712100"],
    "farmacia": ["4771701"], "padaria": ["1091102", "4721102"], "salao": ["9602501", "9602502"],
    "estetica": ["9602502"], "clinica": ["8630501", "8630502", "8630503"], "odonto": ["8630504"],
    "dentist": ["8630504"], "pet": ["4789004"], "imobiliaria": ["6821801", "6821802"],
    "oficina": ["4520001"], "autopeca": ["4530703"], "auto peca": ["4530703"], "escola": ["8512100", "8513900"],
    "hotel": ["5510801"], "construtora": ["4120400"], "otica": ["4774100"],
    # serviços profissionais (os segmentos que a Reiners mais prospecta)
    "contab": ["6920601", "6920602"], "contador": ["6920601"], "advoca": ["6911701"], "advogad": ["6911701"],
    "juridic": ["6911701"], "arquitet": ["7111100"], "engenhar": ["7112000"], "consultor": ["7020400"],
    "medic": ["8630503"], "fisioterap": ["8650004"], "psicolog": ["8650003"], "nutricion": ["8650002"],
    "veterinar": ["7500100"], "laboratorio": ["8640202"], "corretora de seguro": ["6622300"],
    "seguros": ["6622300"], "marketing": ["7311400"], "agencia de publicidade": ["7311400"],
    "software": ["6201501", "6202300"], "tecnologia": ["6201501", "6202300", "6204000"],
    "transportadora": ["4930202"], "faculdade": ["8531700"], "idiomas": ["8593700"],
}

try:
    from zoneinfo import ZoneInfo
    _CUIABA = ZoneInfo("America/Cuiaba")
except Exception:   # pragma: no cover - sem base de fusos no contêiner
    _CUIABA = timezone(timedelta(hours=-4))


class _Parada(Exception):
    def __init__(self, motivo):
        super().__init__(motivo)
        self.motivo = motivo


class Ocupado(Recusado):
    def __init__(self):
        super().__init__("Já tem uma rodada de prospecção em andamento. Espere terminar ou clique em Parar.", 409)


def _iso(d: datetime) -> str:
    return d.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _dia(d: datetime) -> str:
    return d.astimezone(_CUIABA).strftime("%Y-%m-%d")


def _data(s):
    try:
        d = datetime.fromisoformat(str(s).replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None
    return d if d.tzinfo else d.replace(tzinfo=timezone.utc)


def _usd(micro) -> float:
    return round(int(micro or 0) / MICRO, 4)


def _brl_usd(v) -> str:
    return f"US$ {float(v):.2f}".replace(".", ",")


def _sem_acento(t) -> str:
    return unicodedata.normalize("NFKD", str(t or "")).encode("ascii", "ignore").decode().lower()


def cnaes_do_segmento(segmento) -> list[str]:
    s = _sem_acento(segmento)
    out = []
    for chave, cnaes in CNAES_DO_SEGMENTO.items():
        if re.search(r"\b" + re.escape(chave), s):
            out += cnaes
    return list(dict.fromkeys(out))


def rotulo_motivo(motivo) -> str:
    """Motivo de descarte agrupável: sem ids entre parênteses, com maiúscula."""
    t = re.sub(r"\s*\([^)]*\)", "", str(motivo or "")).strip() or "Sem motivo"
    return t[:1].upper() + t[1:]


def contar(prospectos: list[dict]) -> dict:
    f = {"empresas": 0, "pessoas": 0, "comContato": 0, "qualificados": 0, "promovidos": 0, "descartados": 0}
    for p in prospectos:
        estado = p.get("estado")
        if estado == "descartado":
            f["descartados"] += 1
        if p.get("tipo") == "empresa":
            f["empresas"] += 1
            continue
        f["pessoas"] += 1
        if p.get("celular"):
            f["comContato"] += 1
        if estado in ("qualificado", "promovido") or p.get("qualificadoEm"):
            f["qualificados"] += 1
        if estado == "promovido":
            f["promovidos"] += 1
    return f


class _Rodada:
    def __init__(self, cid, usuario, cli, orc, hoje):
        self.cid, self.usuario, self.cli, self.orc, self.hoje = cid, usuario, cli, orc, hoje
        self.stats = {"empresas": 0, "pessoas": 0, "promovidos": 0, "descartados": 0, "erros": 0, "pendentes": 0,
                      "gastoMicro": 0}
        self.erros_seguidos = 0
        self.promovidos_hoje = 0
        self.meta = 0
        self.empresas_com_decisor: set[str] = set()
        self.dominios: dict[str, str] = {}     # domínio → motivo (já é lead, cliente ou está na Base)
        self.feitos = self.total = 0


class Ciclo:
    def __init__(self, repo, wa, token, relogio=None, transporte=None, org=None, dormir=None):
        self.repo, self.wa, self.token, self.org = repo, wa, token, org
        self.relogio = relogio or (lambda: datetime.now(timezone.utc))
        self.transporte, self.dormir = transporte, dormir
        self._trava = threading.Lock()            # iniciar/estado
        self._trava_doc = threading.RLock()       # leitura-escrita de config e campanha
        self._thread: threading.Thread | None = None
        self._parar = threading.Event()
        self._parar_por = None
        self._reparar()

    # ------------------------------------------------------------------ leitura
    @property
    def rodando(self) -> bool:
        th = self._thread
        return th is not None and th.is_alive()

    def _doc(self) -> dict:
        d = self.repo.config_get(CHAVE) or {}
        return d if isinstance(d, dict) else {}

    def _gravar(self, **campos) -> dict:
        with self._trava_doc:
            d = self._doc()
            d.update(campos)
            self.repo.config_set(CHAVE, d)
            return d

    def _campanha(self, cid) -> dict:
        c = self.repo.campanha_get(cid) if cid else None
        if c is None:
            raise Recusado("Campanha não encontrada.", 404)
        return c

    def _mudar_campanha(self, cid, **campos) -> dict:
        with self._trava_doc:
            c = self._campanha(cid)
            c.update(campos)
            self.repo.campanha_put(c)
            return c

    def _reparar(self) -> None:
        """Rodada que estava executando sem thread viva (o serviço caiu) vira "interrompida"."""
        with self._trava_doc:
            d = self._doc()
            if d.get("status") == "executando" and not self.rodando:
                self._fechar(d.get("campanhaId"), INTERROMPIDA, d.get("ultimaRodada") or {})
            for c in self.repo.campanhas():
                if c.get("status") == "rodando" and not self.rodando:
                    c.update(status="parada", motivoParada=INTERROMPIDA)
                    self.repo.campanha_put(c)

    def _gastos(self, c: dict, hoje: str) -> tuple[int, int]:
        return int((c.get("gastoDia") or {}).get(hoje) or 0), int(c.get("gastoMicro") or 0)

    def _promovidos_hoje(self, cid, hoje) -> int:
        n = 0
        for p in self.repo.prospectos(cid, "promovido"):
            d = _data(p.get("promovidoEm"))
            if d and _dia(d) == hoje:
                n += 1
        return n

    def resumo(self, c: dict) -> dict:
        hoje = _dia(self.relogio())
        dia, total = self._gastos(c, hoje)
        ativa = self.rodando and self._doc().get("campanhaId") == c["id"]
        motivo = c.get("motivoParada")
        return {"id": c["id"], "nome": c.get("nome") or c.get("segmento") or "", "segmento": c.get("segmento") or "",
                "cidades": list(c.get("cidades") or []), "cnaes": list(c.get("cnaes") or []),
                "porte": c.get("porte"), "oferta": c.get("oferta") or "", "metaPorDia": c.get("metaPorDia"),
                "status": "rodando" if ativa else (c.get("status") or "nova"),
                "tetoDiaUsd": c.get("tetoDiaUsd"), "tetoCampanhaUsd": c.get("tetoCampanhaUsd"),
                "gastoHojeUsd": _usd(dia), "gastoTotalUsd": _usd(total),
                "funil": contar(self.repo.prospectos(c["id"])), "motivoParada": motivo,
                "motivoTexto": "" if ativa or c.get("status") in (None, "nova") else TEXTO_MOTIVO.get(motivo, ""),
                "criadaEm": c.get("criadaEm")}

    def estado(self) -> dict:
        if not self.rodando and self._doc().get("status") == "executando":
            with self._trava:
                if not self.rodando:
                    self._reparar()
        d = self._doc()
        rodando = self.rodando
        status = d.get("status") if d.get("status") in ("executando", "concluido", "parado") else "ocioso"
        motivo = d.get("motivoParada")
        texto = TEXTO_MOTIVO.get(motivo, motivo or "")
        if motivo == PARADO_EQUIPE and d.get("pararPor"):
            texto = f"Parada por {d['pararPor']}."
        campanhas = sorted(self.repo.campanhas(), key=lambda c: str(c.get("criadaEm") or ""))
        out = {"disponivel": bool(self.token), "rodando": rodando, "status": status,
               "campanhas": [self.resumo(c) for c in campanhas],
               "progresso": d.get("progresso") if rodando else None, "motivoParada": motivo,
               "motivoTexto": texto if status in ("parado", "concluido") else "",
               "historico": list(d.get("historico") or [])}
        if not self.token:
            out["semToken"] = SEM_TOKEN
        return out

    def funil(self, cid) -> dict:
        c = self._campanha(cid)
        todos = self.repo.prospectos(cid)
        f = contar(todos)
        descartes = {}
        for p in todos:
            if p.get("estado") == "descartado":
                r = rotulo_motivo(p.get("motivo"))
                descartes[r] = descartes.get(r, 0) + 1
        custo = _usd(c.get("gastoMicro"))
        return {"etapas": [{"nome": "Empresas", "n": f["empresas"]}, {"nome": "Decisores achados", "n": f["pessoas"]},
                           {"nome": "Com celular", "n": f["comContato"]},
                           {"nome": "Com WhatsApp", "n": f["qualificados"]},
                           {"nome": "Entraram na cadência", "n": f["promovidos"]}],
                "descartes": [{"motivo": k, "n": v} for k, v in sorted(descartes.items(), key=lambda x: -x[1])],
                "custoUsd": custo,
                "custoPorLeadUsd": round(custo / f["promovidos"], 4) if f["promovidos"] else None}

    # ------------------------------------------------------------------ campanhas
    def criar(self, dados: dict, usuario: str) -> dict:
        """ValueError com mensagem legível se algo não vale."""
        dados = dados if isinstance(dados, dict) else {}
        nome = " ".join(str(dados.get("nome") or "").split())[:80]
        if not nome:
            raise ValueError("Dê um nome à campanha.")
        cnaes = dados.get("cnaes") or []
        if not isinstance(cnaes, list):
            raise ValueError("CNAEs precisam vir numa lista.")
        if not cnaes:
            # segmento sem CNAE conhecido: a campanha procura direto no Google Maps pelo nome do segmento
            cnaes = cnaes_do_segmento(dados.get("segmento")) or [SO_MAPS]
        cidades = dados.get("cidades")
        c = camp_mod.nova(dados.get("segmento"), cidades if isinstance(cidades, list) else None, cnaes,
                          dados.get("porte") or "pequena", dados.get("oferta") or "marketing",
                          dados.get("tetoDiaUsd", 10), dados.get("tetoCampanhaUsd", 30),
                          dados.get("metaPorDia", 50))
        c.update(nome=nome, criadaPor=usuario, criadaEm=_iso(self.relogio()), gastoMicro=0, gastoDia={})
        self.repo.campanha_put(c)
        return self.resumo(c)

    def teto(self, cid, teto_dia_usd, teto_campanha_usd) -> dict:
        try:
            dia, total = float(teto_dia_usd), float(teto_campanha_usd)
        except (TypeError, ValueError):
            raise ValueError("Tetos precisam ser números.") from None
        if dia <= 0 or total <= 0:
            raise ValueError("Tetos precisam ser maiores que zero.")
        if dia > total:
            raise ValueError("O teto do dia não pode passar do teto da campanha.")
        c = self._mudar_campanha(cid, tetoDiaUsd=dia, tetoCampanhaUsd=total, tetoDiaEm=None,
                                 tetoCampanhaAtingido=False)
        return self.resumo(c)

    def pausar(self, cid, usuario) -> dict:
        c = self._mudar_campanha(cid, status="pausada", motivoParada=PAUSADA, pausadaPor=usuario)
        return self.resumo(c)

    def retomar(self, cid, usuario) -> dict:
        c = self._campanha(cid)
        if c.get("status") == "pausada":
            c = self._mudar_campanha(cid, status="parada", motivoParada=None, retomadaPor=usuario)
        return self.resumo(c)

    # ------------------------------------------------------------------ comandos
    def iniciar(self, usuario: str, campanha_id: str, confirmo: bool = False) -> dict:
        with self._trava:
            if self.rodando:
                raise Ocupado()
            if not self.token:
                raise Recusado(SEM_TOKEN)
            if self.repo.config_get("status") == "parado":
                raise Recusado("O atendente está parado (Parar tudo). Retome o atendente antes de prospectar.", 409)
            c = self._campanha(campanha_id)
            if confirmo is not True:
                raise Recusado(f"Confirme que a campanha pode gastar até {_brl_usd(c.get('tetoDiaUsd') or 0)} por dia "
                               f"e {_brl_usd(c.get('tetoCampanhaUsd') or 0)} no total antes de começar.")
            if c.get("status") == "pausada":
                raise Recusado("Esta campanha está pausada. Retome a campanha antes de iniciar.", 409)
            agora = self.relogio()
            sem_saldo = _data(self._doc().get("semSaldoEm"))
            if sem_saldo and agora - sem_saldo < SALDO_ESPERA:
                raise Recusado(TEXTO_MOTIVO[SALDO], 402)
            hoje = _dia(agora)
            dia, total = self._gastos(c, hoje)
            if c.get("tetoCampanhaAtingido") or total >= float(c.get("tetoCampanhaUsd") or 0) * MICRO:
                raise Recusado(f"Esta campanha chegou no teto da campanha ({_brl_usd(c.get('tetoCampanhaUsd') or 0)}). "
                               "Aumente o teto para continuar.", 409)
            if c.get("tetoDiaEm") == hoje or dia >= float(c.get("tetoDiaUsd") or 0) * MICRO:
                raise Recusado("Hoje esta campanha já chegou no teto do dia. Amanhã ela continua, ou aumente o teto.",
                               409)
            if self._promovidos_hoje(campanha_id, hoje) >= int(c.get("metaPorDia") or 0):
                raise Recusado("A meta de leads de hoje desta campanha já foi batida. Amanhã ela continua.", 409)
            rodada = "R" + agora.astimezone(timezone.utc).strftime("%Y%m%d%H%M%S")
            self._parar.clear()
            self._parar_por = None
            self._gravar(status="executando", campanhaId=campanha_id, rodadaId=rodada, iniciadoEm=_iso(agora),
                         por=usuario, motivoParada=None, pararPor=None, terminadoEm=None,
                         progresso={"campanhaId": campanha_id, "etapa": "empresa", "feitos": 0, "total": 0})
            self._mudar_campanha(campanha_id, status="rodando", motivoParada=None)
            self._thread = threading.Thread(target=self._rodar, args=(campanha_id, usuario, rodada),
                                            name="atendente-prospeccao", daemon=True)
            self._thread.start()
        return self.estado()

    def parar(self, usuario: str) -> dict:
        if not self.rodando:
            raise Recusado("Nenhuma rodada de prospecção em andamento.", 409)
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
    def _cliente(self):
        extra = {"transporte": self.transporte} if self.transporte else {}
        if self.dormir:
            extra["dormir"] = self.dormir
        return enr._ClienteSeguro(el.TregCliente(self.token, org=self.org, **extra))

    def _progresso(self, ctx: _Rodada, etapa=None) -> None:
        pr = {"campanhaId": ctx.cid, "etapa": etapa or "empresa", "feitos": ctx.feitos, "total": ctx.total}
        self._gravar(progresso=pr, ultimaRodada=dict(ctx.stats))

    def _registro(self, ctx: _Rodada):
        def reg(evento):
            micro = int((evento or {}).get("custoMicro") or 0)
            if micro <= 0:
                return
            ctx.stats["gastoMicro"] += micro
            with self._trava_doc:
                c = self.repo.campanha_get(ctx.cid) or {"id": ctx.cid}
                gd = dict(c.get("gastoDia") or {})
                gd[ctx.hoje] = int(gd.get(ctx.hoje) or 0) + micro
                c.update(gastoDia=gd, gastoMicro=int(c.get("gastoMicro") or 0) + micro)
                self.repo.campanha_put(c)
        return reg

    def _motivo_teto(self, cid, hoje) -> str:
        c = self.repo.campanha_get(cid) or {}
        dia, total = self._gastos(c, hoje)
        resto_dia = float(c.get("tetoDiaUsd") or 0) * MICRO - dia
        resto_total = float(c.get("tetoCampanhaUsd") or 0) * MICRO - total
        return TETO_CAMPANHA if resto_total <= resto_dia else TETO_DIA

    def _checar(self, ctx: _Rodada):
        if self._parar.is_set():
            return PARADO_EQUIPE
        if self.repo.config_get("status") == "parado":
            return PARADO_TUDO
        if (self.repo.campanha_get(ctx.cid) or {}).get("status") == "pausada":
            return PAUSADA
        if ctx.orc.estourou:
            return self._motivo_teto(ctx.cid, ctx.hoje)
        if ctx.erros_seguidos >= ERROS_SEGUIDOS_MAX:
            return ERROS
        if ctx.promovidos_hoje >= ctx.meta:
            return META
        return None

    def _preparar(self, ctx: _Rodada, c: dict) -> None:
        ctx.meta = int(c.get("metaPorDia") or 0)
        ctx.promovidos_hoje = self._promovidos_hoje(ctx.cid, ctx.hoje)
        for p in self.repo.prospectos(ctx.cid):
            if p.get("tipo") == "pessoa" and p.get("estado") in ("qualificado", "promovido"):
                ctx.empresas_com_decisor.add(p.get("empresaId"))
        for motivo, docs in (("já é lead", self.repo.leads_todos()), ("já é cliente", self.repo.clientes_todos()),
                             ("já está na Base", [b for b in self.repo.base_todos() if not b.get("prospectoId")])):
            for d in docs:
                for dom in qualificar._dominios(d):
                    ctx.dominios.setdefault(dom, motivo)

    def _rodar(self, cid: str, usuario: str, rodada: str) -> None:
        motivo, ctx = None, None
        try:
            c = self.repo.campanha_get(cid)
            hoje = _dia(self.relogio())
            dia, total = self._gastos(c, hoje)
            ctx = _Rodada(cid, usuario, self._cliente(), camp_mod.orcamento(c, dia, total), hoje)
            self._preparar(ctx, c)
            pendentes = [p for p in self.repo.prospectos(cid) if p.get("tipo") == "pessoa"
                         and p.get("estado") in PENDENTES]
            feitas = {p.get("empresaId") for p in self.repo.prospectos(cid)
                      if p.get("tipo") == "empresa" and p.get("estado") != "empresa"}
            todas = empresas.achar(self.repo, None, c, Orcamento(0))
            if not todas and not pendentes and not c.get("mapsBuscadoEm"):
                # a base de CNPJ não tem empresas deste segmento nestas cidades: procura no Google Maps (uma vez)
                achadas = empresas.buscar_no_maps(self.repo, ctx.cli, c, ctx.orc, registro=self._registro(ctx))
                c = self._mudar_campanha(cid, mapsBuscadoEm=_iso(self.relogio()), mapsAchadas=achadas)
                todas = empresas.achar(self.repo, None, c, Orcamento(0))
            if not todas and not pendentes:
                raise _Parada(SEM_EMPRESAS)
            lista = [e for e in todas if e["id"] not in feitas]
            ctx.total = len(pendentes) + len(lista)
            self._progresso(ctx)
            for p in pendentes:
                motivo = self._checar(ctx)
                if motivo:
                    break
                self._pessoa_segura(ctx, p)
                ctx.feitos += 1
                self._progresso(ctx, "pessoa")
            if motivo is None:
                for e in lista:
                    motivo = self._checar(ctx)
                    if motivo:
                        break
                    self._empresa_segura(ctx, e)
                    ctx.feitos += 1
                    self._progresso(ctx, "empresa")
            if motivo is None and (ctx.orc.estourou or ctx.erros_seguidos >= ERROS_SEGUIDOS_MAX):
                motivo = self._checar(ctx)
        except _Parada as p:
            motivo = p.motivo
        except SemSaldo:
            log.warning("prospecção: treg sem saldo (402); rodada parada")
            motivo = SALDO
        except Exception as e:
            log.error("rodada de prospecção falhou: %s", type(e).__name__)
            motivo = FALHA
        finally:
            self._fechar(cid, motivo, ctx.stats if ctx else {})

    # ---- empresa
    def _empresa_doc(self, ctx: _Rodada, e: dict) -> dict:
        pid = f"{ctx.cid}-e{e['id']}"
        d = self.repo.prospecto_get(pid)
        if d is None:
            d = {"id": pid, "tipo": "empresa", "campanhaId": ctx.cid, "estado": "empresa", "empresaId": e["id"],
                 "empresa": e.get("nome") or "", "criadoEm": _iso(self.relogio())}
            self.repo.prospecto_put(d)
        return d

    def _atualizar(self, pid, **campos) -> dict:
        d = self.repo.prospecto_get(pid) or {"id": pid}
        d.update(campos)
        self.repo.prospecto_put(d)
        return d

    def _descartar(self, ctx, pid, motivo, **extra) -> dict:
        ctx.stats["descartados"] += 1
        return self._atualizar(pid, estado="descartado", motivo=motivo, descartadoEm=_iso(self.relogio()), **extra)

    def _empresa_segura(self, ctx: _Rodada, e: dict) -> None:
        doc = self._empresa_doc(ctx, e)
        try:
            self._empresa(ctx, e, doc)
            ctx.erros_seguidos = 0
        except (SemSaldo, _Parada):
            raise
        except Exception as ex:
            log.warning("prospecção: uma empresa falhou: %s", type(ex).__name__)
            ctx.stats["erros"] += 1
            ctx.erros_seguidos += 1
            atual = self.repo.prospecto_get(doc["id"]) or doc
            erros = int(atual.get("erros") or 0) + 1
            if atual.get("estado") == "empresa":
                if erros >= ERROS_POR_ITEM:
                    self._descartar(ctx, doc["id"], f"falhou {erros} vezes", erros=erros)
                else:
                    self._atualizar(doc["id"], erros=erros, ultimoErro=type(ex).__name__)

    def _empresa(self, ctx: _Rodada, e: dict, doc: dict) -> None:
        ctx.stats["empresas"] += 1
        reg = self._registro(ctx)
        if not e.get("site") and not e.get("mapsEm") and not ctx.orc.cabe(empresas.MAPS_MAX):
            raise _Parada(self._motivo_teto(ctx.cid, ctx.hoje))
        e2 = empresas.completar(self.repo, ctx.cli, e, ctx.orc, registro=reg)
        if e2 is None:
            self._descartar(ctx, doc["id"], "empresa fechada")
            return
        try:
            regra = pessoas.regra_por_porte(e2.get("classePorte") or e2.get("porte") or "pequena",
                                            (self.repo.campanha_get(ctx.cid) or {}).get("oferta") or "")
        except ValueError:
            regra = list(pessoas.DONO)
        achadas = pessoas.achar(self.repo, ctx.cli, e2, regra, ctx.orc, registro=reg)
        if not achadas:
            if ctx.orc.estourou:
                raise _Parada(self._motivo_teto(ctx.cid, ctx.hoje))
            self._descartar(ctx, doc["id"], "nenhum decisor pessoa física")
            return
        for pessoa in achadas:
            m = self._checar(ctx)
            if m:
                raise _Parada(m)
            p = self._pessoa_doc(ctx, pessoa, e2)
            if p is not None:
                self._pessoa_segura(ctx, p)
        self._atualizar(doc["id"], estado="pessoa", pessoas=len(achadas), feitaEm=_iso(self.relogio()))

    # ---- pessoa
    def _pessoa_doc(self, ctx: _Rodada, pessoa: dict, e: dict) -> dict | None:
        """Documento da pessoa nesta campanha, ou None se ela já foi (ou está sendo) contatada."""
        chave = pessoa["chavePessoa"]
        existentes = self.repo.prospectos_por_chave(chave)
        mesmo = next((x for x in existentes if x.get("campanhaId") == ctx.cid), None)
        base = {"empresaId": e["id"], "empresa": e.get("nome") or "", "dominio": e.get("dominio") or "",
                "site": e.get("site") or "", "cidade": pessoas.nome_bonito(e.get("municipio")),
                "fontePessoa": pessoa.get("fonte") or ""}
        if mesmo is not None:
            tentadas = list(mesmo.get("empresasTentadas") or [mesmo.get("empresaId")])
            # outro CNPJ do mesmo dono: só tenta de novo se a anterior não deu celular
            if (mesmo.get("estado") == "descartado" and mesmo.get("motivoCodigo") == "sem_celular"
                    and e["id"] not in tentadas):
                return self._atualizar(mesmo["id"], estado="pessoa", motivo="", motivoCodigo="",
                                       empresasTentadas=tentadas + [e["id"]],
                                       linkedin=mesmo.get("linkedin") or pessoa.get("linkedin") or "", **base)
            if e["id"] not in tentadas and mesmo.get("estado") != "descartado":
                self._atualizar(mesmo["id"], outrasEmpresas=list(dict.fromkeys(
                    list(mesmo.get("outrasEmpresas") or []) + [e["id"]])))
            return None
        if existentes:
            return None                       # já é prospecto de outra campanha: contatado uma vez
        p = dict(base, id=f"{ctx.cid}-{chave}", tipo="pessoa", campanhaId=ctx.cid, estado="pessoa",
                 chavePessoa=chave, nome=pessoa.get("nome") or "", cargo=pessoa.get("cargo") or "",
                 persona=pessoa.get("persona") or "decisor", linkedin=pessoa.get("linkedin") or "",
                 faixaEtaria=pessoa.get("faixaEtaria") or "", empresasTentadas=[e["id"]], custoMicro=0,
                 criadoEm=_iso(self.relogio()))
        self.repo.prospecto_put(p)
        ctx.stats["pessoas"] += 1
        return p

    def _pessoa_segura(self, ctx: _Rodada, p: dict) -> None:
        try:
            self._avancar(ctx, p)
            ctx.erros_seguidos = 0
        except (SemSaldo, _Parada):
            raise
        except Exception as ex:
            log.warning("prospecção: uma pessoa falhou: %s", type(ex).__name__)
            ctx.stats["erros"] += 1
            ctx.erros_seguidos += 1
            atual = self.repo.prospecto_get(p["id"]) or p
            erros = int(atual.get("erros") or 0) + 1
            if atual.get("estado") in PENDENTES:
                if erros >= ERROS_POR_ITEM:
                    self._descartar(ctx, p["id"], f"falhou {erros} vezes", erros=erros)
                else:
                    self._atualizar(p["id"], erros=erros, ultimoErro=type(ex).__name__)

    def _avancar(self, ctx: _Rodada, p: dict) -> None:
        for _ in range(4):
            estado = p.get("estado")
            if estado == "pessoa":
                self._progresso(ctx, "contato")
                self._contato(ctx, p)
            elif estado == "contato":
                self._progresso(ctx, "qualificar")
                if self._qualificar(ctx, p) == "pendente":
                    return
            elif estado == "qualificado":
                if ctx.promovidos_hoje >= ctx.meta:
                    raise _Parada(META)
                self._progresso(ctx, "promover")
                self._promover(ctx, p)
            else:
                return
            p = self.repo.prospecto_get(p["id"]) or p

    def _empresa_de(self, p: dict) -> dict:
        d = self.repo.cnpj_get(p.get("empresaId") or "") or {}
        return dict(d, id=p.get("empresaId"), nome=p.get("empresa") or "",
                    dominio=p.get("dominio") or d.get("dominio") or "", site=p.get("site") or d.get("site") or "")

    def _contato(self, ctx: _Rodada, p: dict) -> None:
        if p.get("empresaId") in ctx.empresas_com_decisor:
            self._descartar(ctx, p["id"], "a empresa já tem um decisor com WhatsApp")
            return
        dup = ctx.dominios.get(str(p.get("dominio") or "").lower())
        if dup:
            self._descartar(ctx, p["id"], dup)
            return
        pessoa = {"nome": p.get("nome"), "cargo": p.get("cargo"), "linkedin": p.get("linkedin") or "",
                  "fonte": p.get("fontePessoa") or "", "chavePessoa": p.get("chavePessoa"),
                  "empresa": p.get("empresa") or "", "dominio": p.get("dominio") or ""}
        r = contatos.enriquecer(self.repo, ctx.cli, self.wa, pessoa, self._empresa_de(p), ctx.orc,
                                registro=self._registro(ctx))
        campos = {"custoMicro": int(p.get("custoMicro") or 0) + int(r.get("custoMicro") or 0)}
        if r.get("email"):
            campos.update(email=r["email"], fonteEmail=r.get("fonteEmail") or "")
        if r.get("celular"):
            self._atualizar(p["id"], estado="contato", celular=r["celular"], fonte=r.get("fonte") or "",
                            contatoEm=_iso(self.relogio()), **campos)
        elif r.get("semOrcamento"):
            self._atualizar(p["id"], **campos)
            raise _Parada(self._motivo_teto(ctx.cid, ctx.hoje))
        else:
            sem_busca = not (p.get("linkedin") or p.get("dominio"))
            motivo = "sem celular: sem LinkedIn nem site para buscar" if sem_busca else "sem celular"
            self._descartar(ctx, p["id"], motivo, motivoCodigo="sem_celular", **campos)

    def _qualificar(self, ctx: _Rodada, p: dict) -> str:
        r = qualificar.qualificar(self.repo, self.wa, p, self.relogio())
        if r["estado"] == "pendente":
            ctx.stats["pendentes"] += 1
        elif r["estado"] == "descartado":
            ctx.stats["descartados"] += 1
        else:
            ctx.empresas_com_decisor.add(p.get("empresaId"))
        return r["estado"]

    def _promover(self, ctx: _Rodada, p: dict) -> None:
        r = promover.promover(self.repo, p, ctx.usuario, self.relogio())
        atual = self.repo.prospecto_get(p["id"]) or p
        if r.get("leadId"):
            if atual.get("estado") not in ("promovido", "descartado"):
                self._atualizar(p["id"], estado="promovido", leadId=r["leadId"])
            if r.get("novo"):
                ctx.promovidos_hoje += 1
                ctx.stats["promovidos"] += 1
                if p.get("dominio"):
                    ctx.dominios.setdefault(str(p["dominio"]).lower(), "já é lead")
            return
        self._descartar(ctx, p["id"], "ficou na Base: " + str(r.get("motivo") or "sem cadência"))

    # ---- fim
    def _fechar(self, cid, motivo, stats: dict) -> None:
        agora = self.relogio()
        with self._trava_doc:
            d = self._doc()
            if motivo == PARADO_EQUIPE and self._parar_por:
                d["pararPor"] = self._parar_por
            d.update(status="concluido" if motivo is None else "parado", motivoParada=motivo,
                     terminadoEm=_iso(agora), progresso=None)
            if motivo == SALDO:
                d["semSaldoEm"] = _iso(agora)
            hist = list(d.get("historico") or [])
            hist.append({"rodadaId": d.get("rodadaId"), "campanhaId": cid, "em": d.get("iniciadoEm"),
                         "terminadoEm": d["terminadoEm"], "por": d.get("por"), "motivoParada": motivo,
                         **{k: int(stats.get(k) or 0) for k in ("empresas", "pessoas", "promovidos", "descartados",
                                                                 "erros", "pendentes", "gastoMicro")}})
            d["historico"] = hist[-HISTORICO_MAX:]
            self.repo.config_set(CHAVE, d)
            c = self.repo.campanha_get(cid) if cid else None
            if c is not None:
                c.update(status=STATUS_DO_MOTIVO.get(motivo, "parada"), motivoParada=motivo,
                         terminadaEm=_iso(agora))
                if motivo == TETO_DIA:
                    c["tetoDiaEm"] = _dia(agora)
                if motivo == TETO_CAMPANHA:
                    c["tetoCampanhaAtingido"] = True
                self.repo.campanha_put(c)

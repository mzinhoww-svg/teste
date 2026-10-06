"""Laços em segundo plano: avisos, conferência das respostas, planejador, backup e saúde do WhatsApp.

Cada laço roda numa thread daemon e captura as exceções (loga só o tipo e a mensagem, nunca chaves).
Os `_passo_*` fazem uma volta só e podem ser chamados pelos testes sem threads."""
import logging
import os
import re
import threading
from datetime import datetime, timedelta, timezone

from atendente.planejador import conferencia_respostas, conferir_envios, rodada_envios
from scripts import wa_akg

log = logging.getLogger("atendente.trabalhos")

BACKUPS_MANTIDOS = 14
BACKUP_HORA = 3                          # 03:00 em Cuiabá
ESPERA_AVISO_SESSAO = timedelta(hours=6)
PADRAO_BACKUP = re.compile(r"^atendente-\d{8}\.db$")


def _agora_utc() -> datetime:
    return datetime.now(timezone.utc)


def na_janela_de_envio(agora: datetime) -> bool:
    """Segunda a sexta, das 9h às 17h de Cuiabá."""
    local = agora.astimezone(wa_akg.FUSO)
    return local.weekday() < 5 and wa_akg.JANELA[0] <= local.hour < wa_akg.JANELA[1]


class Trabalhos:
    INTERVALO_AVISOS = 20.0            # segundos
    INTERVALO_CONFERENCIA = 120.0
    INTERVALO_PLANEJADOR = 30 * 60.0
    INTERVALO_BACKUP = 60.0            # com que frequência olha se já é hora do backup
    INTERVALO_SAUDE = 5 * 60.0

    def __init__(self, repo, wa, atendente, avisador, cfg_env, relogio=_agora_utc):
        self.repo, self.wa, self.atendente, self.avisador = repo, wa, atendente, avisador
        self.cfg = cfg_env or {}
        self.relogio = relogio
        self._parar = threading.Event()
        self._threads: list[threading.Thread] = []
        self._trabalho = threading.Lock()          # planejador e conferência não mexem nos leads ao mesmo tempo
        self._ultimo_backup = None                 # data (Cuiabá) do último backup feito
        self._ultimo_aviso_sessao: datetime | None = None

    # ---- configuração vinda do ambiente
    def _dir_backup(self) -> str:
        return self.cfg.get("BACKUP_DIR") or "/data/backups"

    def _dir_saida(self) -> str:
        return self.cfg.get("SAIDA_DIR") or "/data/saida"

    # ---- uma volta de cada laço
    def _passo_avisos(self) -> None:
        self.avisador.descarregar(self.relogio())

    def _passo_conferencia(self) -> None:
        with self._trabalho:
            conferencia_respostas(self.repo, self.wa, self.atendente, self.relogio())

    def _passo_planejador(self) -> None:
        agora = self.relogio()
        with self._trabalho:
            ativo = self.repo.config_get("status", "parado") == "ativo"
            if ativo and not na_janela_de_envio(agora):
                conferir_envios(self.repo, self.wa, agora, self._dir_saida())     # fora do horário: só marca o que saiu
                return
            rodada_envios(self.repo, self.wa, agora, self.cfg.get("FOTOS_URL", ""), self._dir_saida())

    def _backup_devido(self, agora: datetime) -> bool:
        local = agora.astimezone(wa_akg.FUSO)
        return local.hour >= BACKUP_HORA and self._ultimo_backup != local.date()

    def _passo_backup(self) -> None:
        agora = self.relogio()
        dia = agora.astimezone(wa_akg.FUSO)
        pasta = self._dir_backup()
        os.makedirs(pasta, exist_ok=True)
        destino = os.path.join(pasta, f"atendente-{dia:%Y%m%d}.db")
        tmp = destino + ".tmp"
        try:
            self.repo.backup(tmp)
            os.replace(tmp, destino)
        finally:
            if os.path.exists(tmp):
                os.remove(tmp)
        self._ultimo_backup = dia.date()
        for antigo in sorted(f for f in os.listdir(pasta) if PADRAO_BACKUP.match(f))[:-BACKUPS_MANTIDOS]:
            os.remove(os.path.join(pasta, antigo))

    def _passo_saude(self) -> None:
        agora = self.relogio()
        try:
            conectado = bool(self.wa.conectado())
            motivo = "A sessão do WhatsApp caiu: escanear o QR de novo no WA-AKG."
        except Exception as e:                      # WA-AKG fora do ar também é motivo de aviso
            conectado = False
            motivo = f"O WA-AKG não respondeu ({type(e).__name__})."
        if conectado:
            return
        if self._ultimo_aviso_sessao and agora - self._ultimo_aviso_sessao < ESPERA_AVISO_SESSAO:
            return
        self._ultimo_aviso_sessao = agora
        self.avisador.adicionar({"id": "sistema", "nome": "Atendente (sistema)"}, motivo,
                                "Os envios e as respostas ficam parados até a sessão voltar.", agora)

    # ---- laços
    def _seguro(self, nome: str, passo) -> bool:
        try:
            passo()
            return True
        except Exception as e:
            log.error("laço %s: %s: %s", nome, type(e).__name__, e)
            return False

    def _laco(self, nome: str, intervalo_attr: str, passo, ao_ligar: bool = False, devido=None) -> None:
        if ao_ligar and not self._parar.is_set():
            self._seguro(nome, passo)
        while not self._parar.wait(getattr(self, intervalo_attr)):
            if devido is None or devido(self.relogio()):
                self._seguro(nome, passo)

    def iniciar(self) -> None:
        if self._threads:
            return
        self._parar.clear()
        laços = (("avisos", "INTERVALO_AVISOS", self._passo_avisos, False, None),
                 ("conferencia", "INTERVALO_CONFERENCIA", self._passo_conferencia, False, None),
                 ("planejador", "INTERVALO_PLANEJADOR", self._passo_planejador, True, None),
                 ("backup", "INTERVALO_BACKUP", self._passo_backup, True, self._backup_devido),
                 ("saude", "INTERVALO_SAUDE", self._passo_saude, False, None))
        for nome, attr, passo, ao_ligar, devido in laços:
            if nome == "backup" and ao_ligar and not self._backup_devido(self.relogio()):
                ao_ligar = False
            th = threading.Thread(target=self._laco, args=(nome, attr, passo, ao_ligar, devido),
                                  name=f"atendente-{nome}", daemon=True)
            self._threads.append(th)
            th.start()

    def parar(self) -> None:
        self._parar.set()
        for th in self._threads:
            th.join(timeout=5)
        self._threads = []

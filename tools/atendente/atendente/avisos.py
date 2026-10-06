"""Avisos à equipe: junta vários casos numa mensagem só e manda com um pequeno atraso.

A fila fica no banco (config `avisos_fila`), então um reinício não perde aviso. Se o envio falhar para
todos os números, os itens continuam na fila para a próxima tentativa.
"""
import logging
import re
import threading
from datetime import datetime, timezone

from scripts import wa_akg

log = logging.getLogger("atendente.avisos")

CHAVE_FILA = "avisos_fila"
MAX_LEADS = 5
MAX_TEXTO = 600
MAX_TRECHO = 120
_TELEFONE = re.compile(r"\d(?:[\s.\-()+]{0,2}\d){7,}")


def _utc(d: datetime) -> datetime:
    return d if d.tzinfo else d.replace(tzinfo=timezone.utc)


def _iso(d: datetime) -> str:
    return _utc(d).astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _limpo(texto, limite: int) -> str:
    """Uma linha, sem telefone, com limite de tamanho."""
    t = _TELEFONE.sub("[número]", " ".join(str(texto or "").split()))
    return t if len(t) <= limite else t[:limite - 3].rstrip() + "..."


class Avisador:
    def __init__(self, wa, numeros: list[str], repo, atraso_s: int = 40):
        self.wa, self.numeros, self.repo, self.atraso_s = wa, list(numeros or []), repo, atraso_s
        self._lock = threading.RLock()

    def _fila(self) -> list[dict]:
        f = self.repo.config_get(CHAVE_FILA, [])
        return f if isinstance(f, list) else []

    def adicionar(self, lead: dict, motivo: str, trecho: str, agora: datetime) -> None:
        item = {"leadId": str(lead.get("id", "")), "empresa": _limpo(lead.get("nome") or "lead", 60),
                "motivo": _limpo(motivo or "ver a conversa", 80), "trecho": _limpo(trecho, MAX_TRECHO),
                "em": _iso(agora)}
        with self._lock:
            self.repo.config_set(CHAVE_FILA, self._fila() + [item])

    def pendentes(self) -> int:
        with self._lock:
            return len(self._fila())

    @staticmethod
    def _linha(grupo: list[dict]) -> str:
        u = grupo[-1]
        extra = f" (+{len(grupo) - 1} msg)" if len(grupo) > 1 else ""
        t = f': "{u["trecho"]}"' if u["trecho"] else ""
        return f"- {u['empresa']}: {u['motivo']}{extra}{t}"

    def _montar(self, fila: list[dict]) -> tuple[str, list[dict]]:
        """Devolve o texto (até 600) e os itens da fila que entraram nele."""
        grupos: dict[str, list[dict]] = {}
        for it in fila:
            grupos.setdefault(it["leadId"], []).append(it)
        escolhidos = list(grupos.values())[:MAX_LEADS]
        cab = "Atendente: casos para a equipe ver na Central"
        texto, usados = cab, []
        for g in escolhidos:
            resto = len(grupos) - len(usados) - 1
            linha = self._linha(g)
            fim = f"\ne mais {resto}" if resto > 0 else ""
            cand = f"{texto}\n{linha}"
            if usados and len(cand + fim) > MAX_TEXTO:
                break
            if not usados and len(cand) > MAX_TEXTO:
                cand = cand[:MAX_TEXTO - 3] + "..."
            texto = cand
            usados.append(g)
        resto = len(grupos) - len(usados)
        if resto > 0:
            texto += f"\ne mais {resto}"
        return texto[:MAX_TEXTO], [it for g in usados for it in g]

    def descarregar(self, agora: datetime, forcar: bool = False) -> dict | None:
        with self._lock:
            fila = self._fila()
            if not fila:
                return None
            if not forcar:
                mais_antigo = wa_akg._data(fila[0].get("em"))
                if mais_antigo is not None and (_utc(agora) - mais_antigo).total_seconds() < self.atraso_s:
                    return None
            texto, usados = self._montar(fila)
            try:
                r = wa_akg.avisar_equipe(self.wa, self.numeros, texto)
            except Exception as e:  # WA-AKG fora do ar, texto recusado etc.
                log.warning("aviso à equipe falhou: %s", type(e).__name__)
                return {"enviados": [], "erros": [{"erro": str(e)}], "itens": 0}
            if not r.get("enviados"):
                return {**r, "itens": 0}
            ids = {id(x) for x in usados}
            self.repo.config_set(CHAVE_FILA, [x for x in fila if id(x) not in ids])
            return {**r, "itens": len(usados), "texto": texto}

"""Registro de rotas extras da API. Cada módulo `api_*.py` registra as suas com @rota e fica independente do servidor.

    @rota("POST", r"/api/leads/(?P<id>[^/]+)/mover")
    def mover(h, usuario, agora, m): ...

`h` é o Handler (usa h._json, h._erro, h._json_do_corpo, h.server.repo/wa/atendente/cfg). A rota roda só depois do login
e da checagem de origem. Corpo de POST: sempre ler com h._json_do_corpo() (que também esvazia a conexão)."""
import importlib
import re

ROTAS: list[tuple[str, "re.Pattern", object]] = []
MODULOS = ("api_leads", "api_posvenda", "api_base", "api_enriquecer")


def rota(metodo: str, padrao: str):
    rx = re.compile(padrao)

    def deco(fn):
        ROTAS.append((metodo, rx, fn))
        return fn
    return deco


def carregar() -> None:
    for nome in MODULOS:
        try:
            importlib.import_module(f"atendente.{nome}")
        except ModuleNotFoundError as e:
            if e.name != f"atendente.{nome}":
                raise


def despachar(h, metodo: str, caminho: str, usuario: str, agora) -> bool:
    for m, rx, fn in ROTAS:
        if m == metodo:
            achou = rx.fullmatch(caminho)
            if achou:
                fn(h, usuario, agora, achou)
                return True
    return False


carregar()

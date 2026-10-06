"""Rotas do enriquecimento (aba Enriquecer da tela).

    GET  /api/enriquecer          estado, progresso ao vivo e histórico das rodadas
    GET  /api/enriquecer/plano    quantos leads, custo estimado em US$ e o teto
    POST /api/enriquecer/iniciar  {"confirmo": true, "simular": false} -> 202; 409 se já há rodada
    POST /api/enriquecer/parar    {} -> para antes do próximo lead

O Enriquecedor vem de cfg["enriquecedor"] (testes) ou é criado uma vez por servidor com o token do ambiente
(TREG_TOKEN ou TREG_API_KEY; cfg["ambiente"] substitui os.environ nos testes)."""
import os
import threading

from .enriquecer import Enriquecedor, Recusado, token_do_ambiente
from .rotas import rota

_TRAVA = threading.Lock()


def enriquecedor_do(srv) -> Enriquecedor:
    pronto = srv.cfg.get("enriquecedor")
    if pronto is not None:
        return pronto
    with _TRAVA:
        e = getattr(srv, "_enriquecedor", None)
        if e is None:
            env = srv.cfg.get("ambiente", os.environ)
            e = Enriquecedor(srv.repo, token=token_do_ambiente(env), org=(env.get("TREG_ORG") or "").strip() or None,
                             relogio=srv.agora)
            srv._enriquecedor = e
        return e


@rota("GET", r"/api/enriquecer")
def estado(h, usuario, agora, m):
    h._json(200, enriquecedor_do(h.server).estado())


@rota("GET", r"/api/enriquecer/plano")
def plano(h, usuario, agora, m):
    h._json(200, enriquecedor_do(h.server).plano())


@rota("POST", r"/api/enriquecer/iniciar")
def iniciar(h, usuario, agora, m):
    dados, falhou = h._json_do_corpo()
    if falhou:
        return
    dados = dados if isinstance(dados, dict) else {}
    try:
        est = enriquecedor_do(h.server).iniciar(usuario, confirmo=dados.get("confirmo") is True,
                                                simular=dados.get("simular") is True)
    except Recusado as e:
        return h._erro(e.status, str(e))
    h._json(202, est)


@rota("POST", r"/api/enriquecer/parar")
def parar(h, usuario, agora, m):
    _, falhou = h._json_do_corpo()
    if falhou:
        return
    try:
        est = enriquecedor_do(h.server).parar(usuario)
    except Recusado as e:
        return h._erro(e.status, str(e))
    h._json(200, est)

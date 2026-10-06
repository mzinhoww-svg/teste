"""Rotas da prospecção (aba Prospecção da tela, web/leva5.js).

    GET  /api/prospeccao                              estado, campanhas com funil e gasto, progresso ao vivo
    POST /api/prospeccao/campanhas                    {nome, segmento, cidades, cnaes, porte, oferta, tetoDiaUsd,
                                                       tetoCampanhaUsd, metaPorDia} -> 201 campanha | 400 {erro}
    POST /api/prospeccao/campanhas/<id>/iniciar       {"confirmo": true} -> 202; 409 se ocupado; 402 sem saldo
    POST /api/prospeccao/parar                        {} -> 200 (409 se não há rodada)
    GET  /api/prospeccao/campanhas/<id>/funil         {etapas, descartes, custoUsd, custoPorLeadUsd}
    POST /api/prospeccao/campanhas/<id>/teto          {tetoDiaUsd, tetoCampanhaUsd} -> 200 campanha
    POST /api/prospeccao/campanhas/<id>/pausar        {} -> 200 campanha
    POST /api/prospeccao/campanhas/<id>/retomar       {} -> 200 campanha

O Ciclo vem de cfg["ciclo_prospeccao"] (testes) ou é criado uma vez por servidor com o token do ambiente
(TREG_TOKEN ou TREG_API_KEY; cfg["ambiente"] substitui os.environ nos testes) e o WA-AKG do servidor."""
import os
import threading

from .enriquecer import Recusado, token_do_ambiente
from .prospeccao.ciclo import Ciclo
from .rotas import rota

_TRAVA = threading.Lock()
_ID = r"(?P<id>[A-Za-z0-9_-]{1,64})"


def ciclo_do(srv) -> Ciclo:
    pronto = srv.cfg.get("ciclo_prospeccao")
    if pronto is not None:
        return pronto
    with _TRAVA:
        c = getattr(srv, "_ciclo_prospeccao", None)
        if c is None:
            env = srv.cfg.get("ambiente", os.environ)
            c = Ciclo(srv.repo, srv.wa, token_do_ambiente(env), srv.agora,
                      org=(env.get("TREG_ORG") or "").strip() or None)
            srv._ciclo_prospeccao = c
        return c


def _corpo(h):
    dados, falhou = h._json_do_corpo()
    return (dados if isinstance(dados, dict) else {}), falhou


def _responder(h, status, fn, *args):
    try:
        out = fn(*args)
    except Recusado as e:
        return h._erro(e.status, str(e))
    except ValueError as e:
        return h._erro(400, str(e))
    h._json(status, out)


@rota("GET", r"/api/prospeccao")
def estado(h, usuario, agora, m):
    h._json(200, ciclo_do(h.server).estado())


@rota("POST", r"/api/prospeccao/campanhas")
def criar(h, usuario, agora, m):
    dados, falhou = _corpo(h)
    if falhou:
        return
    _responder(h, 201, ciclo_do(h.server).criar, dados, usuario)


@rota("POST", r"/api/prospeccao/campanhas/" + _ID + r"/iniciar")
def iniciar(h, usuario, agora, m):
    dados, falhou = _corpo(h)
    if falhou:
        return
    _responder(h, 202, ciclo_do(h.server).iniciar, usuario, m["id"], dados.get("confirmo") is True)


@rota("POST", r"/api/prospeccao/parar")
def parar(h, usuario, agora, m):
    _, falhou = _corpo(h)
    if falhou:
        return
    _responder(h, 200, ciclo_do(h.server).parar, usuario)


@rota("GET", r"/api/prospeccao/(?:campanhas/)?" + _ID + r"/funil")
def funil(h, usuario, agora, m):
    _responder(h, 200, ciclo_do(h.server).funil, m["id"])


@rota("POST", r"/api/prospeccao/campanhas/" + _ID + r"/teto")
def teto(h, usuario, agora, m):
    dados, falhou = _corpo(h)
    if falhou:
        return
    _responder(h, 200, ciclo_do(h.server).teto, m["id"], dados.get("tetoDiaUsd"), dados.get("tetoCampanhaUsd"))


@rota("POST", r"/api/prospeccao/campanhas/" + _ID + r"/pausar")
def pausar(h, usuario, agora, m):
    _, falhou = _corpo(h)
    if falhou:
        return
    _responder(h, 200, ciclo_do(h.server).pausar, m["id"], usuario)


@rota("POST", r"/api/prospeccao/campanhas/" + _ID + r"/retomar")
def retomar(h, usuario, agora, m):
    _, falhou = _corpo(h)
    if falhou:
        return
    _responder(h, 200, ciclo_do(h.server).retomar, m["id"], usuario)

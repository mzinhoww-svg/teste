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


def origem_do_lead(l: dict) -> str:
    """De que base o lead veio, em palavras."""
    if l.get("prospectoId") or l.get("prospeccao"):
        return "Prospecção"
    if l.get("baseExplee"):
        return "Base Explee"
    if l.get("explee"):
        return "Explee"
    f = l.get("fonte")
    return f.split("·")[0].strip().capitalize() if isinstance(f, str) and f.strip() else "Central"


def achados_da_rodada(repo, execucao: str, inicio: str | None, fim: str | None) -> list[dict]:
    """Leads em que a rodada achou telefone: pelo treg (buscaTreg da execução) ou no site (siteContatos no período)."""
    from .servidor import nome_da_empresa
    out = []
    for l in repo.leads_todos():
        b, s = l.get("buscaTreg") or {}, l.get("siteContatos") or {}
        via = None
        if isinstance(b, dict) and b.get("execucaoId") == execucao and b.get("resultado") == "achou":
            via = "Celular de quem decide (treg)"
        elif (isinstance(s, dict) and s.get("achou") and inicio and fim
              and inicio <= str(s.get("em") or "") <= fim):
            via = "Contato no site da empresa"
        if via:
            out.append({"id": str(l["id"]), "empresa": nome_da_empresa(l), "segmento": l.get("segmento") or "",
                        "origem": origem_do_lead(l), "via": via, "situacao": l.get("situacao") or "ativo"})
    return sorted(out, key=lambda x: x["empresa"].lower())


@rota("GET", r"/api/enriquecer/achados")
def achados(h, usuario, agora, m):
    from urllib.parse import parse_qs, urlsplit
    execucao = (parse_qs(urlsplit(h.path).query).get("execucao") or [""])[0].strip()
    hist = (h.server.repo.config_get("enriquecimento") or {}).get("historicoExecucoes") or []
    rodada = next((x for x in hist if x.get("execucaoId") == execucao), None)
    if not execucao or rodada is None:
        return h._erro(404, "Rodada não encontrada.")
    h._json(200, {"execucaoId": execucao,
                  "leads": achados_da_rodada(h.server.repo, execucao, rodada.get("em"), rodada.get("terminadoEm"))})

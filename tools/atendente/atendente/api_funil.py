"""Funil: em que ponto está cada lead, quantos há em cada etapa e a taxa de resposta por segmento.

    GET  /api/funil[?segmento=X]               -> {etapas: [{id, nome, qtd, leads: [...]}], segmentos: [...], total}
    POST /api/leads/<id>/funil {etapa}         -> marca a etapa comercial (conversa, reunião, proposta)

As etapas automáticas vêm do que o sistema já sabe (sonda, toques, situação). As comerciais (em conversa, reunião
marcada, proposta) a equipe marca no card: ficam em `lead.funil`. Fechou e perdido seguem a situação do lead
(fechou / sair), que já tem botão próprio no card."""
from urllib.parse import parse_qs, unquote, urlsplit

from scripts import wa_akg

from .rotas import rota

ETAPAS = (
    ("novo", "Novo"),
    ("ola", "\"Olá\" enviado"),
    ("cadencia", "Em cadência"),
    ("respondeu", "Respondeu"),
    ("conversa", "Em conversa"),
    ("reuniao", "Reunião marcada"),
    ("proposta", "Proposta"),
    ("fechou", "Fechou"),
    ("perdido", "Perdido"),
)
NOMES = dict(ETAPAS)
COMERCIAIS = ("respondeu", "conversa", "reuniao", "proposta")   # o que a equipe pode marcar pelo funil
MAX_LEADS_ETAPA = 60


def etapa_do_lead(l: dict) -> str:
    sit = l.get("situacao")
    if sit == "fechou":
        return "fechou"
    if sit == "sair":
        return "perdido"
    if sit == "respondeu":
        return l.get("funil") if l.get("funil") in ("conversa", "reuniao", "proposta") else "respondeu"
    if wa_akg._etapa(l) >= 1:
        return "cadencia"
    if (l.get("sonda") or {}).get("enviadaEm"):
        return "ola"
    return "novo"


def _segmento(l: dict) -> str:
    s = l.get("segmento")
    return s.strip() if isinstance(s, str) and s.strip() else "Sem segmento"


def _ultimo(l: dict) -> str | None:
    hist = l.get("historico") or []
    for h in reversed(hist):
        if isinstance(h, dict) and h.get("em"):
            return h["em"]
    return None


def montar(leads: list[dict], segmento: str | None = None) -> dict:
    from .servidor import nome_da_empresa
    por_etapa = {e: [] for e, _ in ETAPAS}
    segs = {}
    for l in leads:
        if l.get("id") == "TESTE":
            continue
        e = etapa_do_lead(l)
        seg = _segmento(l)
        s = segs.setdefault(seg, {"segmento": seg, "total": 0, "contatados": 0, "responderam": 0, "fecharam": 0})
        s["total"] += 1
        if e not in ("novo",):
            s["contatados"] += 1
        if e in ("respondeu", "conversa", "reuniao", "proposta", "fechou"):
            s["responderam"] += 1
        if e == "fechou":
            s["fecharam"] += 1
        if segmento and seg != segmento:
            continue
        por_etapa[e].append({"id": str(l.get("id")), "empresa": nome_da_empresa(l), "segmento": seg,
                             "ultimo": _ultimo(l), "resumo": (l.get("resumoIa") or {}).get("momento") or ""})
    etapas = []
    for e, nome in ETAPAS:
        lista = sorted(por_etapa[e], key=lambda x: x["ultimo"] or "", reverse=True)
        etapas.append({"id": e, "nome": nome, "qtd": len(lista), "leads": lista[:MAX_LEADS_ETAPA]})
    # quantos chegaram até cada etapa (ela ou alguma depois; perdido fica de fora) e quanto passa da anterior
    ordem = [e for e in etapas if e["id"] != "perdido"]
    for i, e in enumerate(ordem):
        e["chegaram"] = sum(x["qtd"] for x in ordem[i:])
        ant = ordem[i - 1]["chegaram"] if i else None
        e["passagem"] = round(100 * e["chegaram"] / ant, 1) if ant else None
    for s in segs.values():
        s["taxaResposta"] = round(100 * s["responderam"] / s["contatados"], 1) if s["contatados"] else None
    segmentos = sorted(segs.values(), key=lambda s: (-(s["taxaResposta"] or -1), -s["contatados"]))
    return {"etapas": etapas, "segmentos": segmentos, "total": sum(x["qtd"] for x in etapas)}


@rota("GET", r"/api/funil")
def ver_funil(h, usuario, agora, m):
    qs = parse_qs(urlsplit(h.path).query)
    seg = (qs.get("segmento") or [""])[0].strip() or None
    return h._json(200, montar(h.server.repo.leads_todos(), seg))


@rota("POST", r"/api/leads/(?P<id>[^/]+)/funil")
def marcar_etapa(h, usuario, agora, m):
    srv = h.server
    lead = srv.repo.lead_get(unquote(m["id"]))
    dados, falhou = h._json_do_corpo()
    if falhou:
        return
    if lead is None:
        return h._erro(404, "Lead não encontrado.")
    etapa = dados.get("etapa") if isinstance(dados, dict) else None
    if etapa not in COMERCIAIS:
        return h._erro(400, "Etapa desconhecida. Use: Respondeu, Em conversa, Reunião marcada ou Proposta.")
    if lead.get("situacao") in ("sair", "fechou"):
        return h._erro(409, "Este lead já saiu ou fechou. Para voltar, use os botões de situação do card.")
    antes = etapa_do_lead(lead)
    mudanca = {"situacao": "respondeu",
               "funil": etapa if etapa != "respondeu" else {"__delete__": True},
               "historico": wa_akg.registrar(lead.get("historico"),
                                             f"Funil: de {NOMES[antes]} para {NOMES[etapa]} (por {usuario})", agora)}
    cancelou = None
    if lead.get("agendamento") and lead.get("situacao") in (None, "", "ativo"):
        from .api_acoes import _cancelar_agendado         # saiu da cadência: o toque agendado não sai mais
        tinha, ok = _cancelar_agendado(srv, lead)
        cancelou = ok if tinha else None
        if ok:
            mudanca["agendamento"] = {"__delete__": True}
    srv.repo.aplicar(lead["id"], mudanca)
    return h._json(200, {"ok": True, "etapa": etapa, "antes": antes, "cancelouAgendado": cancelou})

"""Rodadas do WhatsApp: conferir/planejar/agendar os envios e conferir as respostas dos leads.

Reaproveita `scripts.wa_akg.main([...], cliente=wa)` (as regras de ritmo já testadas) com arquivos temporários
e aplica os `updates` no Repo. `atendente` e `wa` são usados por duck typing (nada de nucleo/avisos aqui).
"""
import json
import os
import tempfile
from datetime import datetime

from scripts import wa_akg

JANELA_HORIZONTE_MIN = 480
POR_LOTE_PADRAO, LIMITE_DIA_PADRAO = 5, 50


def _inteiro(valor, padrao: int, minimo: int, maximo: int) -> int:
    try:
        n = int(valor)
    except (TypeError, ValueError):
        n = padrao
    return max(minimo, min(maximo, n))


def _ler(caminho):
    with open(caminho, encoding="utf-8") as fh:
        return json.load(fh)


def _leads_em(repo, pasta: str, nome: str = "leads.json") -> str:
    caminho = os.path.join(pasta, nome)
    with open(caminho, "w", encoding="utf-8") as fh:
        json.dump(repo.leads_todos(), fh, ensure_ascii=False)
    return caminho


def _aplicar(repo, updates) -> int:
    n = 0
    for u in updates or []:
        try:
            repo.aplicar(u["id"], u["data"])
            n += 1
        except KeyError:        # o lead saiu do banco no meio da rodada
            continue
    return n


def _rodar(args: list, wa) -> int:
    return wa_akg.main(args, cliente=wa)


def _conferir(repo, wa, agora: datetime, pasta: str) -> dict:
    saida = os.path.join(pasta, "conferir.json")
    rc = _rodar(["conferir", "--leads", _leads_em(repo, pasta), "--saida", saida, "--agora", wa_akg._iso(agora)], wa)
    if rc != 0 or not os.path.exists(saida):
        return {"erro": "conferir"}
    r = _ler(saida)
    _aplicar(repo, r.get("updates"))
    return {**r["resumo"], "painel": r.get("painel", {})}


def conferir_envios(repo, wa, agora: datetime, saida_dir: str) -> dict:
    """Só marca o que já saiu (ou falhou, ou sumiu) no WA-AKG. Nunca agenda nem cancela."""
    os.makedirs(saida_dir, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=saida_dir) as pasta:
        return _conferir(repo, wa, agora, pasta)


def rodada_envios(repo, wa, agora: datetime, fotos_url: str, saida_dir: str) -> dict:
    """conferir -> (ativo) planejar -> agendar --confirmo -> aplica os updates. Pausado/parado: cancela os pendentes.
    Quem liga a fila é a Letícia (config.status == "ativo"); por isso o agendamento roda com --confirmo."""
    status = repo.config_get("status", "parado")
    por_lote = _inteiro(repo.config_get("por_lote"), POR_LOTE_PADRAO, 1, wa_akg.POR_LOTE_MAX)
    limite_dia = _inteiro(repo.config_get("limite_dia"), LIMITE_DIA_PADRAO, 1, wa_akg.LIMITE_DIA_MAX)
    os.makedirs(saida_dir, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=saida_dir) as pasta:
        conferencia = _conferir(repo, wa, agora, pasta)
        if "erro" in conferencia:
            return {"erro": "conferir"}
        if status != "ativo":
            saida = os.path.join(pasta, "cancelar.json")
            _rodar(["cancelar", "--leads", _leads_em(repo, pasta, "leads2.json"), "--saida", saida,
                    "--agora", wa_akg._iso(agora)], wa)
            if not os.path.exists(saida):
                return {"erro": "cancelar"}
            r = _ler(saida)
            _aplicar(repo, r.get("updates"))
            out = {"cancelados": len(r.get("updates") or [])}
            if r.get("erros"):
                out["erros"] = len(r["erros"])
            return out
        plano = os.path.join(pasta, "plano.json")
        rc = _rodar(["planejar", "--leads", _leads_em(repo, pasta, "leads2.json"), "--saida", plano,
                     "--fotos-url", fotos_url or "", "--por-lote", str(por_lote), "--limite-dia", str(limite_dia),
                     "--horizonte-min", str(JANELA_HORIZONTE_MIN), "--agora", wa_akg._iso(agora)], wa)
        if rc == 3:
            return {"sessao_caida": True}
        if rc != 0 or not os.path.exists(plano):
            return {"erro": "planejar"}
        p = _ler(plano)
        out = {"agendados": 0, "erros": 0, "pulados": len(p.get("pulados") or []), "conferencia": conferencia}
        if not p.get("planos"):
            return out
        ag = os.path.join(pasta, "agendados.json")
        rc = _rodar(["agendar", "--plano", plano, "--leads", _leads_em(repo, pasta, "leads3.json"), "--saida", ag,
                     "--confirmo"], wa)
        if not os.path.exists(ag):
            return {**out, "erro": "agendar"}
        r = _ler(ag)
        _aplicar(repo, r.get("updates"))
        out.update({"agendados": len(r.get("agendados") or []), "erros": len(r.get("erros") or [])})
        return out


def _numero(jid: str) -> str:
    return "".join(c for c in str(jid or "").split("@")[0].split(":")[0] if c.isdigit())


def _mensagem(conversa: dict, item: dict, agora: datetime):
    from atendente.webhook import Mensagem      # dataclass pura (Task 4); importada aqui para manter o módulo leve
    jid = conversa["jid"]
    bruto = item.get("em")
    dt = wa_akg._data(bruto)
    return Mensagem(wa_id=f"poll:{jid}:{bruto if bruto else item.get('texto', '')}", jid=jid, numero=_numero(jid),
                    de_mim=False, tipo=str(item.get("tipo") or "TEXT"), texto=item.get("texto") or "",
                    em=wa_akg._iso(dt or agora), grupo=False)


def conferencia_respostas(repo, wa, atendente, agora: datetime) -> dict:
    """Plano B do webhook: lê a caixa de entrada no WA-AKG e entrega cada mensagem nova ao atendente. Mensagens que o
    webhook já trouxe são barradas pelo Repo.msg_add. O marcador `respostasVistasAte` só avança se tudo deu certo."""
    os.makedirs(tempfile.gettempdir(), exist_ok=True)
    with tempfile.TemporaryDirectory() as pasta:
        saida = os.path.join(pasta, "caixa.json")
        rc = _rodar(["caixa", "--leads", _leads_em(repo, pasta), "--saida", saida, "--agora", wa_akg._iso(agora)], wa)
        if rc != 0 or not os.path.exists(saida):
            return {"erro": "caixa", "conversas": 0, "mensagens": 0, "erros": 0, "resultados": {}}
        r = _ler(saida)
    resultados, mensagens, erros = {}, 0, 0
    for conversa in r.get("conversas", []):
        falhou = False
        for item in conversa.get("novas", []):
            mensagens += 1
            try:
                res = atendente.tratar_mensagem(_mensagem(conversa, item, agora), agora)
            except Exception:
                erros += 1
                falhou = True
                continue
            resultados[res] = resultados.get(res, 0) + 1
        if not falhou and conversa.get("vistasAte"):
            try:
                repo.aplicar(conversa["leadId"], {"respostasVistasAte": conversa["vistasAte"]})
            except KeyError:
                pass
    return {"conversas": len(r.get("conversas", [])), "mensagens": mensagens, "erros": erros, "resultados": resultados,
            "erros_leitura": len(r.get("erros", []))}

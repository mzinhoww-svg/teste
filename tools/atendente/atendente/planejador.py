"""Rodadas do WhatsApp: conferir/planejar/agendar os envios e conferir as respostas dos leads.

Reaproveita `scripts.wa_akg.main([...], cliente=wa)` (as regras de ritmo já testadas) com arquivos temporários
e aplica os `updates` no Repo. `atendente` e `wa` são usados por duck typing (nada de nucleo/avisos aqui).
"""
import json
import os
import tempfile
from datetime import datetime

from atendente import sonda
from scripts import wa_akg

JANELA_HORIZONTE_MIN = 480
POR_LOTE_PADRAO, LIMITE_DIA_PADRAO = 3, 12


def _inteiro(valor, padrao: int, minimo: int, maximo: int) -> int:
    try:
        n = int(valor)
    except (TypeError, ValueError):
        n = padrao
    return max(minimo, min(maximo, n))


def _ler(caminho):
    with open(caminho, encoding="utf-8") as fh:
        return json.load(fh)


def _leads_em(repo, pasta: str, nome: str = "leads.json", excluir=()) -> str:
    caminho = os.path.join(pasta, nome)
    with open(caminho, "w", encoding="utf-8") as fh:
        json.dump([l for l in repo.leads_todos() if l.get("id") not in excluir], fh, ensure_ascii=False)
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


def _adotar_pendentes(repo, wa, status_leads=(None, "", "ativo")) -> int:
    """Um POST de agendamento que deu timeout pode ter agendado no WA-AKG sem o lead saber. Antes de planejar, adota
    o pendente de quem está sem `agendamento`, para o planejador pular o lead e não duplicar o toque."""
    try:
        pend = wa.agendadas("pending")
    except Exception:
        return 0
    por_numero = {}
    for p in pend or []:
        num = _numero(p.get("jid"))
        if num and p.get("id") is not None:
            por_numero.setdefault(num, p)
    adotados = 0
    for l in repo.leads_todos():
        if l.get("agendamento") or l.get("situacao") not in status_leads:
            continue
        if (l.get("sonda") or {}).get("liberada") is False:
            continue                      # o pendente é o "Olá" da sonda, não o toque
        p = por_numero.get(wa_akg.numero_whatsapp(wa_akg.telefone_destino(l))) or por_numero.get(_numero(l.get("jidWa")))
        if p is None:
            continue
        try:
            repo.aplicar(l["id"], {"agendamento": {"n": wa_akg._etapa(l) + 1, "id": p["id"],
                                                   "sendAt": p.get("sendAt"), "jid": p.get("jid")}})
            adotados += 1
        except KeyError:
            continue
    return adotados


def _reconferir(repo, wa, updates, agora: datetime) -> int:
    """O mundo muda durante a rodada (lead responde, alguém põe `parado`). Cancela o que esta rodada agendou e já
    não deve sair."""
    revertidos = 0
    for u in updates or []:
        ag = (u.get("data") or {}).get("agendamento")
        if not isinstance(ag, dict) or not ag.get("id"):
            continue
        lead = repo.lead_get(u["id"])
        ativo = repo.config_get("status", "parado") == "ativo"
        if ativo and lead is not None and lead.get("situacao") in (None, "", "ativo"):
            continue
        try:
            wa.cancelar(ag["id"])
        except Exception:
            continue                       # segue marcado: a conferência acompanha e a equipe vê no histórico
        revertidos += 1
        if lead is not None:
            try:
                repo.aplicar(u["id"], {"agendamento": {"__delete__": True}, "historico": wa_akg.registrar(
                    lead.get("historico"), "Envio agendado cancelado: o lead respondeu ou a fila foi parada", agora)})
            except KeyError:
                pass
    return revertidos


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


def rodada_envios(repo, wa, agora: datetime, fotos_url: str, saida_dir: str, so_toques: bool = False) -> dict:
    """aguardando: não faz nada. conferir -> (ativo) planejar -> agendar --confirmo -> aplica os updates. Pausado/parado: cancela os pendentes.
    Quem liga a fila é a Letícia (config.status == "ativo"); por isso o agendamento roda com --confirmo."""
    status = repo.config_get("status", "parado")
    if status == "aguardando":          # instalado, esperando a liberação da equipe: não agenda nem cancela
        return {"aguardando": True}
    por_lote = _inteiro(repo.config_get("por_lote"), POR_LOTE_PADRAO, 1, wa_akg.POR_LOTE_MAX)
    limite_dia = _inteiro(repo.config_get("limite_dia"), LIMITE_DIA_PADRAO, 1, wa_akg.LIMITE_DIA_MAX)
    os.makedirs(saida_dir, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=saida_dir) as pasta:
        conferencia = _conferir(repo, wa, agora, pasta)
        if "erro" in conferencia:
            return {"erro": "conferir"}
        if status != "ativo":
            # Pausado/parado cancela TUDO o que a sessão tem pendente (corte de emergência). Já o núcleo, quando um
            # lead responde, cancela só os pendentes daquele lead.
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
        _adotar_pendentes(repo, wa)
        sondas = {}
        if sonda.ligada(repo):
            sondas = sonda.resolver(repo, agora)
            # o "Olá" também conta no limite do dia (antes não contava e o número passou do limite)
            vagas = 0 if so_toques else sonda.vagas_hoje(wa, agora, limite_dia)
            sondas["enviadas"] = sonda.enviar(repo, wa, agora, min(por_lote, vagas)) if vagas else 0
        segurar = sonda.seguram_o_toque(repo)               # primeiro contato só sai depois do "Olá" e da espera
        plano = os.path.join(pasta, "plano.json")
        rc = _rodar(["planejar", "--leads", _leads_em(repo, pasta, "leads2.json", segurar), "--saida", plano,
                     "--fotos-url", fotos_url or "", "--por-lote", str(por_lote), "--limite-dia", str(limite_dia),
                     "--horizonte-min", str(JANELA_HORIZONTE_MIN), "--agora", wa_akg._iso(agora)], wa)
        if rc == 3:
            return {"sessao_caida": True}
        if rc != 0 or not os.path.exists(plano):
            return {"erro": "planejar"}
        p = _ler(plano)
        out = {"agendados": 0, "erros": 0, "pulados": len(p.get("pulados") or []), "conferencia": conferencia,
               "sonda": sondas}
        if not p.get("planos"):
            return out
        ag = os.path.join(pasta, "agendados.json")
        rc = _rodar(["agendar", "--plano", plano, "--leads", _leads_em(repo, pasta, "leads3.json"), "--saida", ag,
                     "--confirmo"], wa)
        if not os.path.exists(ag):
            return {**out, "erro": "agendar"}
        r = _ler(ag)
        _aplicar(repo, r.get("updates"))
        revertidos = _reconferir(repo, wa, r.get("updates"), agora)
        out.update({"agendados": len(r.get("agendados") or []), "erros": len(r.get("erros") or []),
                    "revertidos": revertidos})
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


def completar_sondas(repo, wa, agora: datetime, fotos_url: str, saida_dir: str) -> dict | None:
    """Roda entre os planejadores (a cada conferência): se alguma sonda "Olá" venceu a espera, libera e já agenda o
    toque 1 na mesma hora. Sem isso o lead fica até 30 minutos com um "Olá" solto. Não manda sondas novas."""
    if not sonda.ligada(repo) or repo.config_get("status", "parado") != "ativo":
        return None
    r = sonda.resolver(repo, agora)
    if not r["liberadas"]:
        return None
    return rodada_envios(repo, wa, agora, fotos_url, saida_dir, so_toques=True)


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

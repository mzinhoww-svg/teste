"""Disparo da cadência pelo WA-AKG (https://github.com/mrifqidaffaaditya/WA-AKG), o gateway de WhatsApp da Reiners.

O script não acessa o banco da central: recebe e devolve JSON, e quem grava é o Claude (ArtifactData). Três passos:

    python3 -m scripts.wa_akg planejar --leads dados/wa/leads.json --saida dados/wa/plano.json --fotos-url https://.../fotos
    python3 -m scripts.wa_akg agendar  --plano dados/wa/plano.json --saida dados/wa/agendados.json --confirmo
    python3 -m scripts.wa_akg conferir --leads dados/wa/leads.json --saida dados/wa/conferido.json
    python3 -m scripts.wa_akg cancelar --leads dados/wa/leads.json --saida dados/wa/cancelado.json

O primeiro envio é sempre o do card TESTE (`planejar --so TESTE`), o WhatsApp da própria Reiners.

`planejar` não envia nada: separa quem vence hoje (mesma regra de `central/regras.js`, grupo "hoje"), confere se o número
tem WhatsApp, pula quem já respondeu, monta o texto e a foto do toque e distribui os horários. `agendar` só roda com
`--confirmo`. `conferir` lê o agendador e devolve o que mudar em cada lead (enviado, falhou ou sumiu).

Endereço, chave e sessão vêm de WA_AKG_URL, WA_AKG_KEY e WA_AKG_SESSION, ou dos arquivos ~/.wa-akg/url, key e session.
Nunca imprimir nem gravar a chave.

Fatos da API conferidos no código do WA-AKG (cabeçalho `X-API-Key`, prefixo `/api`):
- `GET /sessions` -> [{sessionId, status: "Connected" | ...}].
- `POST /chat/{sessao}/check` {numbers} (até 50) -> {results: [{number, exists, jid}]}.
- `POST /scheduler/{sessao}` {jid, content, sendAt, mediaUrl, mediaType} -> {data: {id}}. O `sendAt` sem offset é lido no
  fuso do sistema do WA-AKG (padrão Asia/Jakarta): por isso aqui vai sempre em UTC com "Z". Com `mediaUrl` o texto vai
  como legenda e o Baileys baixa a imagem da URL, então a foto precisa estar numa URL pública.
- `GET /scheduler/{sessao}?tab=pending|history` -> {data: [{id, status: PENDING | SENT | FAILED, sendAt}]}.
- `GET /chat/{sessao}/{jid}` -> últimas 100 mensagens, com `fromMe` e `timestamp`.
- O agendador do WA-AKG não espaça nada: o espaçamento entre mensagens é feito aqui, no `sendAt` de cada uma.
"""
import argparse
import json
import os
import random
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

from msg.fotos import linha_foto

FUSO = timezone(timedelta(hours=-4))  # Cuiabá (America/Cuiaba): UTC-4, sem horário de verão
DIA = timedelta(days=1)
ESPERA_DIAS = {2: 4, 3: 6}  # igual a esperaDias da central
USER_AGENT = "reiners-central/1.0"
LIMITE_DIA = 30            # número novo: poucos por dia, para não ser banido
JANELA = (9, 17)           # horas locais de envio, de segunda a sexta
INTERVALO = (60, 180)      # segundos entre uma mensagem e a próxima
LEGENDA_MAX = 1024         # limite do WhatsApp para legenda de foto
LOTE_CHECK = 50
SENT, FAILED, PENDING = "SENT", "FAILED", "PENDING"


class WaAkgErro(Exception):
    def __init__(self, status, msg=""):
        super().__init__(msg or f"WA-AKG respondeu {status}")
        self.status = status


# --------------------------------------------------------------------------- configuração e cliente

def _arquivo(nome, pasta="~/.wa-akg"):
    try:
        with open(os.path.join(os.path.expanduser(pasta), nome), encoding="utf-8") as fh:
            return fh.read().strip()
    except OSError:
        return ""


def ler_config(env=None, pasta="~/.wa-akg") -> dict:
    env = os.environ if env is None else env
    url = (env.get("WA_AKG_URL") or _arquivo("url", pasta)).rstrip("/")
    cfg = {"url": url, "chave": env.get("WA_AKG_KEY") or _arquivo("key", pasta),
           "sessao": env.get("WA_AKG_SESSION") or _arquivo("session", pasta)}
    faltam = [k for k, v in cfg.items() if not v]
    if faltam:
        raise WaAkgErro(0, "Falta configurar o WA-AKG: " + ", ".join(faltam) + " (WA_AKG_URL, WA_AKG_KEY, WA_AKG_SESSION ou ~/.wa-akg/)")
    if not url.endswith("/api"):
        cfg["url"] = url + "/api"
    return cfg


def transporte_urllib(metodo: str, url: str, headers: dict, corpo: bytes | None = None):
    req = urllib.request.Request(url, data=corpo, headers=headers, method=metodo)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, dict(r.headers), r.read()
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers), e.read()


class WaAkgCliente:
    def __init__(self, base, chave, sessao, transporte=transporte_urllib, dormir=time.sleep, tentativas=3):
        self.base, self.sessao, self._chave = base.rstrip("/"), sessao, chave
        self.transporte, self.dormir, self.tentativas = transporte, dormir, tentativas

    def _pedir(self, metodo, caminho, corpo=None, repetir=False):
        """`repetir` só vale para leitura: um POST de agendamento que repete pode mandar a mensagem duas vezes."""
        url = f"{self.base}{caminho}"
        headers = {"X-API-Key": self._chave, "Accept": "application/json", "User-Agent": USER_AGENT}
        dados = None
        if corpo is not None:
            headers["Content-Type"] = "application/json"
            dados = json.dumps(corpo).encode("utf-8")
        for tentativa in range(self.tentativas if repetir else 1):
            try:
                status, _, bruto = self.transporte(metodo, url, headers, dados)
            except (urllib.error.URLError, OSError):
                status, bruto = 0, b""
            if status == 0 or status == 429 or status >= 500:
                if repetir and tentativa + 1 < self.tentativas:
                    self.dormir(2 ** (tentativa + 1))
                    continue
                raise WaAkgErro(status, f"WA-AKG não respondeu em {caminho} ({status or 'sem conexão'})")
            if status >= 400:
                raise WaAkgErro(status, f"WA-AKG respondeu {status} em {caminho}")
            try:
                return json.loads(bruto.decode("utf-8")) if bruto else {}
            except ValueError:
                raise WaAkgErro(status, f"Resposta inválida do WA-AKG em {caminho}")

    def conectado(self) -> bool:
        sessoes = self._pedir("GET", "/sessions", repetir=True)
        sessoes = sessoes.get("data", []) if isinstance(sessoes, dict) else sessoes
        for s in sessoes:
            if s.get("sessionId") == self.sessao:
                return str(s.get("status", "")).lower() == "connected"
        raise WaAkgErro(404, f"Sessão '{self.sessao}' não existe no WA-AKG")

    def verificar(self, numeros: list[str]) -> dict:
        """número -> jid, ou None quando o número não tem WhatsApp."""
        achados = {}
        for i in range(0, len(numeros), LOTE_CHECK):
            lote = numeros[i:i + LOTE_CHECK]
            r = self._pedir("POST", f"/chat/{self.sessao}/check", {"numbers": lote}, repetir=True)
            por_numero = {x.get("number"): x for x in r.get("results", [])}
            for n in lote:
                x = por_numero.get(n) or {}
                achados[n] = x.get("jid") if x.get("exists") and x.get("jid") else None
        return achados

    def agendar(self, jid, texto, send_at: str, midia_url: str | None = None) -> str:
        corpo = {"jid": jid, "content": texto, "sendAt": send_at}
        if midia_url:
            corpo.update({"mediaUrl": midia_url, "mediaType": "image"})
        r = self._pedir("POST", f"/scheduler/{self.sessao}", corpo)
        id_ = (r.get("data") or {}).get("id") if isinstance(r, dict) else None
        if not id_:
            raise WaAkgErro(200, "O WA-AKG não devolveu o id do agendamento")
        return str(id_)

    def agendadas(self, aba: str) -> list[dict]:
        r = self._pedir("GET", f"/scheduler/{self.sessao}?tab={aba}", repetir=True)
        return r.get("data", []) if isinstance(r, dict) else r

    def cancelar(self, id_: str) -> None:
        self._pedir("DELETE", f"/scheduler/{self.sessao}/{urllib.parse.quote(str(id_), safe='')}", repetir=True)

    def mensagens(self, jid: str) -> list[dict]:
        r = self._pedir("GET", f"/chat/{self.sessao}/{urllib.parse.quote(jid, safe='')}", repetir=True)
        return r.get("data", []) if isinstance(r, dict) else r


# --------------------------------------------------------------------------- regras da cadência (espelho de central/regras.js)

def _data(v) -> datetime | None:
    if not v:
        return None
    try:
        d = datetime.fromisoformat(str(v).replace("Z", "+00:00"))
    except ValueError:
        return None
    return d if d.tzinfo else d.replace(tzinfo=timezone.utc)


def _inicio_do_dia(d: datetime) -> datetime:
    return d.astimezone(FUSO).replace(hour=0, minute=0, second=0, microsecond=0)


def _etapa(l: dict) -> int:
    try:
        return int(l.get("etapa") or 0)
    except (TypeError, ValueError):
        return 0


def contato_ativo(l: dict) -> dict | None:
    if not l.get("contatoAtivo"):
        return None
    return next((c for c in l.get("contatos") or [] if c.get("id") == l["contatoAtivo"]), None)


def telefone_destino(l: dict) -> str:
    c = contato_ativo(l)
    return (c.get("telefone") if c and c.get("telefone") else l.get("telefone")) or ""


def primeiro_nome(nome: str) -> str:
    partes = str(nome or "").split()
    if not partes:
        return ""
    if re.fullmatch(r"(?i)(dr|dra)\.?", partes[0]) and len(partes) > 1:
        return partes[0].rstrip(".") + ". " + partes[1]
    return partes[0].capitalize()


def numero_whatsapp(tel: str) -> str:
    """Só dígitos, com DDI 55. "" quando não parece um telefone do Brasil."""
    d = re.sub(r"\D", "", str(tel or "")).lstrip("0")
    if len(d) in (10, 11):
        d = "55" + d
    return d if d.startswith("55") and len(d) in (12, 13) else ""


def vence_hoje(l: dict, agora: datetime, espera: dict | None = None) -> bool:
    e = _etapa(l)
    if e >= 3:
        return False
    ultimo = _data(l.get(f"enviado{e}")) if e else None
    if not ultimo:
        return True
    dias = int((espera or ESPERA_DIAS).get(e + 1, 0))
    return _inicio_do_dia(ultimo) + timedelta(days=dias) <= _inicio_do_dia(agora)


def foto_do_toque(l: dict) -> str | None:
    return l.get("fotoEscolhida") or l.get("foto") or None


def mensagem_do_toque(l: dict, n: int) -> str:
    """A mensagem como a central a abre: saudação do contato ativo e a linha da foto trocada, se ela escolheu outra."""
    t = next((x for x in l.get("toques") or [] if int(x.get("n") or 0) == n), {})
    msg = t.get("mensagem") or ""
    c = contato_ativo(l)
    if c and c.get("nome") and l.get("saudacao"):
        msg = msg.replace(f"Oi, {l['saudacao']},", f"Oi, {primeiro_nome(c['nome'])},")
    escolhida = l.get("fotoEscolhida")
    if n == 1 and escolhida and l.get("foto") and escolhida != l["foto"]:
        try:
            msg = msg.replace(linha_foto(l["foto"]), linha_foto(escolhida))
        except KeyError:
            pass
    return msg


# --------------------------------------------------------------------------- horários

def _na_janela(t: datetime, janela: tuple, dias_uteis: bool) -> datetime:
    abre, fecha = janela
    for _ in range(14):
        local = t.astimezone(FUSO)
        if dias_uteis and local.weekday() >= 5:
            t = local.replace(hour=abre, minute=0, second=0, microsecond=0) + DIA
        elif local.hour < abre:
            t = local.replace(hour=abre, minute=0, second=0, microsecond=0)
        elif local.hour >= fecha:
            t = local.replace(hour=abre, minute=0, second=0, microsecond=0) + DIA
        else:
            return local.astimezone(timezone.utc)
    return t.astimezone(timezone.utc)


def distribuir(qtd: int, agora: datetime, *, limite_dia=LIMITE_DIA, ocupados: dict | None = None, janela=JANELA,
               intervalo=INTERVALO, rng=None, dias_uteis=True) -> list[datetime]:
    """Horários (UTC) em dias úteis, dentro da janela, com intervalo aleatório e no máximo `limite_dia` por dia."""
    if limite_dia < 1:
        raise ValueError("limite_dia precisa ser pelo menos 1")
    rng = rng or random.Random()
    cont = dict(ocupados or {})
    t, saida = agora + timedelta(minutes=2), []
    while len(saida) < qtd:
        t = _na_janela(t, janela, dias_uteis)
        dia = t.astimezone(FUSO).date()
        if cont.get(dia, 0) >= limite_dia:
            t = t.astimezone(FUSO).replace(hour=janela[0], minute=0, second=0, microsecond=0) + DIA
            continue
        saida.append(t)
        cont[dia] = cont.get(dia, 0) + 1
        t = t + timedelta(seconds=rng.randint(*intervalo))
    return saida


def _iso(d: datetime) -> str:
    return d.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


# --------------------------------------------------------------------------- plano

def planejar(leads: list[dict], agora: datetime, *, existem: dict, respondidas: set | None = None, fotos_url: str = "",
             limite_dia=LIMITE_DIA, ocupados: dict | None = None, janela=JANELA, intervalo=INTERVALO, rng=None,
             espera: dict | None = None, max_leads: int | None = None, so_ids: set | None = None) -> dict:
    """`existem`: número -> jid (None se o número não tem WhatsApp). Só entram leads de WhatsApp que vencem hoje.
    `so_ids` restringe a esses leads; é o único jeito de o card TESTE (o WhatsApp da própria Reiners) entrar."""
    respondidas = respondidas or set()
    itens, pulados = [], []

    def pula(l, n, motivo):
        pulados.append({"leadId": l["id"], "nome": l.get("nome", ""), "n": n, "motivo": motivo})

    for l in leads:
        if so_ids is not None and l.get("id") not in so_ids:
            continue
        if (l.get("id") == "TESTE" and so_ids is None) or l.get("canal") != "WhatsApp" or l.get("situacao") not in (None, "", "ativo"):
            continue
        if not vence_hoje(l, agora, espera):
            continue
        n = _etapa(l) + 1
        ag = l.get("agendamento") or {}
        if ag.get("n") == n:
            pula(l, n, "já agendado no WhatsApp")
            continue
        num = numero_whatsapp(telefone_destino(l))
        if not num:
            pula(l, n, "sem telefone com DDD")
            continue
        if num not in existem:
            pula(l, n, "número não verificado")
            continue
        if not existem[num]:
            pula(l, n, "o número não tem WhatsApp")
            continue
        if l["id"] in respondidas:
            pula(l, n, "já respondeu no WhatsApp: confira e use o botão Respondeu")
            continue
        texto = mensagem_do_toque(l, n)
        if not texto.strip():
            pula(l, n, "toque sem mensagem")
            continue
        midia = None
        if n == 1 and "Te mandei uma foto" in texto:
            foto = foto_do_toque(l)
            if not fotos_url or not foto:
                pula(l, n, "o toque 1 promete uma foto e ela não está hospedada (--fotos-url)")
                continue
            if len(texto) > LEGENDA_MAX:
                pula(l, n, "mensagem longa demais para legenda de foto")
                continue
            midia = f"{fotos_url.rstrip('/')}/{foto}.jpg"
        itens.append({"leadId": l["id"], "nome": l.get("nome", ""), "n": n, "jid": existem[num], "texto": texto,
                      "midiaUrl": midia, "ordem": l.get("ordem") or 0})
    itens.sort(key=lambda i: (-i["n"], i["ordem"], i["leadId"]))  # a continuação sai antes do primeiro contato
    if max_leads:
        itens = itens[:max_leads]
    horarios = distribuir(len(itens), agora, limite_dia=limite_dia, ocupados=ocupados, janela=janela, intervalo=intervalo, rng=rng)
    for i, h in zip(itens, horarios):
        i["sendAt"] = _iso(h)
        del i["ordem"]
    por_dia = {}
    for h in horarios:
        d = h.astimezone(FUSO).strftime("%d/%m")
        por_dia[d] = por_dia.get(d, 0) + 1
    return {"geradoEm": _iso(agora), "planos": itens, "pulados": pulados,
            "resumo": {"agendar": len(itens), "pulados": len(pulados), "porDia": por_dia,
                       "primeiro": _iso(horarios[0]) if horarios else None, "ultimo": _iso(horarios[-1]) if horarios else None}}


def detectar_respostas(cliente: WaAkgCliente, leads: list[dict], existem: dict) -> set:
    """Leads que já mandaram alguma mensagem depois do primeiro toque. Melhor esforço: o botão Respondeu da central manda."""
    achados = set()
    for l in leads:
        if _etapa(l) < 1 or l.get("situacao") not in (None, "", "ativo"):
            continue
        jid = existem.get(numero_whatsapp(telefone_destino(l)))
        if not jid:
            continue
        desde = _data(l.get("enviado1"))
        for m in cliente.mensagens(jid):
            if m.get("fromMe"):
                continue
            quando = _data(m.get("timestamp"))
            if desde is None or quando is None or quando >= desde:
                achados.add(l["id"])
                break
    return achados


def agendar_plano(cliente: WaAkgCliente, planos: list[dict]) -> dict:
    agendados, erros = [], []
    for p in planos:
        try:
            id_ = cliente.agendar(p["jid"], p["texto"], p["sendAt"], p.get("midiaUrl"))
        except WaAkgErro as e:
            erros.append({"leadId": p["leadId"], "n": p["n"], "erro": str(e)})
            if e.status in (401, 403, 404):  # chave, acesso ou sessão errados: não adianta insistir nos outros
                break
            continue
        agendados.append({"leadId": p["leadId"], "n": p["n"], "scheduleId": id_, "sendAt": p["sendAt"], "jid": p["jid"]})
    return {"agendados": agendados, "erros": erros}


# --------------------------------------------------------------------------- o que gravar nos leads

def registrar(historico, texto: str, agora: datetime, tipo: str | None = None) -> list[dict]:
    item = {"em": _iso(agora), "texto": texto}
    if tipo:
        item["tipo"] = tipo
    return (list(historico or []) + [item])[-100:]


def _hora_local(iso: str) -> str:
    return _data(iso).astimezone(FUSO).strftime("%d/%m %H:%M")


def atualizacoes_agendados(leads: list[dict], resultado: dict, agora: datetime) -> list[dict]:
    por_id = {l["id"]: l for l in leads}
    saida = []
    for a in resultado.get("agendados", []):
        l = por_id.get(a["leadId"], {})
        texto = f"Toque {a['n']} agendado no WhatsApp para {_hora_local(a['sendAt'])}"
        saida.append({"id": a["leadId"], "data": {
            "agendamento": {"n": a["n"], "id": a["scheduleId"], "sendAt": a["sendAt"], "jid": a["jid"]},
            "historico": registrar(l.get("historico"), texto, agora)}})
    return saida


def conferir(leads: list[dict], pendentes: list[dict], historico: list[dict], agora: datetime) -> dict:
    """Compara o `agendamento` de cada lead com o que o WA-AKG tem. Só mexe em quem tem agendamento."""
    pend = {str(x.get("id")): x for x in pendentes}
    hist = {str(x.get("id")): x for x in historico}
    updates, resumo = [], {"enviados": 0, "falhas": 0, "pendentes": 0, "sumiram": 0}
    for l in leads:
        ag = l.get("agendamento")
        if not ag:
            continue
        n, id_ = int(ag.get("n") or 0), str(ag.get("id"))
        apagar = {"__delete__": True}
        if id_ in hist and hist[id_].get("status") == SENT:
            resumo["enviados"] += 1
            quando = _iso(_data(hist[id_].get("sendAt")) or _data(ag.get("sendAt")))
            dados = {"agendamento": apagar, "historico": registrar(l.get("historico"), f"Toque {n} enviado", agora)}
            if _etapa(l) == n - 1:  # nunca pula um toque
                dados.update({"etapa": n, f"enviado{n}": quando})
            updates.append({"id": l["id"], "data": dados})
        elif id_ in hist and hist[id_].get("status") == FAILED:
            resumo["falhas"] += 1
            updates.append({"id": l["id"], "data": {"agendamento": apagar, "historico": registrar(
                l.get("historico"), f"Toque {n} não saiu: o WhatsApp falhou no envio", agora)}})
        elif id_ in pend:
            resumo["pendentes"] += 1
        else:
            resumo["sumiram"] += 1
            updates.append({"id": l["id"], "data": {"agendamento": apagar, "historico": registrar(
                l.get("historico"), f"Toque {n} não está mais agendado no WhatsApp", agora)}})
    return {"geradoEm": _iso(agora), "updates": updates, "resumo": resumo}


def cancelar_agendados(cliente: WaAkgCliente, leads: list[dict], pendentes: list[dict], agora: datetime) -> dict:
    """Cancela só o que ainda está pendente no WA-AKG. O que já saiu (ou sumiu) fica para o `conferir`, que registra o envio."""
    pend = {str(x.get("id")) for x in pendentes}
    updates, ficaram, erros = [], [], []
    for l in leads:
        ag = l.get("agendamento")
        if not ag:
            continue
        if str(ag.get("id")) not in pend:
            ficaram.append(l["id"])
            continue
        try:
            cliente.cancelar(ag["id"])
        except WaAkgErro as e:
            erros.append({"leadId": l["id"], "erro": str(e)})
            continue
        updates.append({"id": l["id"], "data": {"agendamento": {"__delete__": True}, "historico": registrar(
            l.get("historico"), f"Toque {ag.get('n')} cancelado no WhatsApp antes de sair", agora)}})
    return {"geradoEm": _iso(agora), "updates": updates, "naoPendentes": ficaram, "erros": erros,
            "resumo": {"cancelados": len(updates), "naoPendentes": len(ficaram), "erros": len(erros)}}


# --------------------------------------------------------------------------- linha de comando

def _ler(caminho):
    with open(caminho, encoding="utf-8") as fh:
        return json.load(fh)


def _gravar(caminho, dados):
    os.makedirs(os.path.dirname(os.path.abspath(caminho)), exist_ok=True)
    with open(caminho, "w", encoding="utf-8") as fh:
        json.dump(dados, fh, ensure_ascii=False, indent=1)


def _agora(txt):
    return _data(txt) if txt else datetime.now(timezone.utc)


def _cliente(cliente):
    if cliente:
        return cliente
    c = ler_config()
    return WaAkgCliente(c["url"], c["chave"], c["sessao"])


def main(argv=None, cliente=None):
    ap = argparse.ArgumentParser(prog="wa_akg", description=__doc__.split("\n")[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("planejar", help="monta o plano de envio; não envia nada")
    p.add_argument("--leads", required=True)
    p.add_argument("--saida", required=True)
    p.add_argument("--fotos-url", default="")
    p.add_argument("--limite-dia", type=int, default=LIMITE_DIA)
    p.add_argument("--max", type=int, default=None, help="no máximo N mensagens neste plano")
    p.add_argument("--so", default="", help="ids separados por vírgula; só estes entram (use TESTE para o primeiro envio)")
    p.add_argument("--ocupados", default="", help="JSON {dd/mm: quantas já agendadas}; opcional")
    p.add_argument("--agora", default="")
    a = sub.add_parser("agendar", help="agenda o plano no WA-AKG (exige --confirmo)")
    a.add_argument("--plano", required=True)
    a.add_argument("--leads", required=True, help="leads.json; usado para montar o que gravar em cada lead")
    a.add_argument("--saida", required=True)
    a.add_argument("--confirmo", action="store_true", help="a Letícia viu o plano e autorizou o envio")
    c = sub.add_parser("conferir", help="compara os agendamentos dos leads com o WA-AKG")
    c.add_argument("--leads", required=True)
    c.add_argument("--saida", required=True)
    c.add_argument("--agora", default="")
    x = sub.add_parser("cancelar", help="cancela no WA-AKG o que ainda está pendente (nada que já saiu)")
    x.add_argument("--leads", required=True)
    x.add_argument("--saida", required=True)
    x.add_argument("--agora", default="")
    args = ap.parse_args(argv)

    try:
        if args.cmd == "agendar" and not args.confirmo:
            print("Nada agendado: falta --confirmo (a Letícia precisa ter visto o plano).", file=sys.stderr)
            return 2
        cli = _cliente(cliente)
        if args.cmd == "planejar":
            agora, leads = _agora(args.agora), _ler(args.leads)
            if not cli.conectado():
                print("A sessão do WhatsApp não está conectada no WA-AKG (escanear o QR de novo).", file=sys.stderr)
                return 3
            numeros = sorted({n for n in (numero_whatsapp(telefone_destino(l)) for l in leads
                                          if l.get("canal") == "WhatsApp") if n})
            existem = cli.verificar(numeros)
            respondidas = detectar_respostas(cli, leads, existem)
            ocupados = {}
            for dm, q in (json.loads(args.ocupados) if args.ocupados else {}).items():
                ocupados[datetime.strptime(f"{dm}/{agora.astimezone(FUSO).year}", "%d/%m/%Y").date()] = int(q)
            plano = planejar(leads, agora, existem=existem, respondidas=respondidas, fotos_url=args.fotos_url,
                             limite_dia=args.limite_dia, ocupados=ocupados, max_leads=args.max,
                             so_ids={i.strip() for i in args.so.split(",") if i.strip()} or None)
            _gravar(args.saida, plano)
            print(json.dumps(plano["resumo"], ensure_ascii=False))
        elif args.cmd == "agendar":
            plano = _ler(args.plano)
            r = agendar_plano(cli, plano["planos"])
            r["updates"] = atualizacoes_agendados(_ler(args.leads), r, datetime.now(timezone.utc))
            _gravar(args.saida, r)
            print(json.dumps({"agendados": len(r["agendados"]), "erros": len(r["erros"])}, ensure_ascii=False))
            return 0 if not r["erros"] else 1
        elif args.cmd == "cancelar":
            r = cancelar_agendados(cli, _ler(args.leads), cli.agendadas("pending"), _agora(args.agora))
            _gravar(args.saida, r)
            print(json.dumps(r["resumo"], ensure_ascii=False))
            return 0 if not r["erros"] else 1
        else:
            r = conferir(_ler(args.leads), cli.agendadas("pending"), cli.agendadas("history"), _agora(args.agora))
            _gravar(args.saida, r)
            print(json.dumps(r["resumo"], ensure_ascii=False))
    except WaAkgErro as e:
        print(str(e), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())

"""Servidor HTTP do atendente: webhook do WA-AKG, API da tela, login e arquivos estáticos.

Só stdlib. O servidor recebe objetos prontos (duck typing):
  repo        -> atendente.db.Repo
  atendente   -> .tratar_mensagem(m, agora) -> str
  wa          -> .conectado(), .agendadas(aba), .cancelar(id)
  cfg (dict)  -> webhook_segredo, segredo_sessao, usuarios {nome: senha}; opcionais: pasta_web, relogio (callable
                 que devolve datetime com fuso), ao_mudar_config (callable(config dict)).
Todas as URLs da tela são relativas, para funcionar atrás de /central/ (o Caddy corta o prefixo).
"""
import base64
import dataclasses
import hashlib
import hmac
import ipaddress
import json
import logging
import mimetypes
import os
import re
import tempfile
import threading
import time
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import unquote, urlsplit, parse_qs

from . import ia as _ia
from . import rotas
from . import webhook
from scripts import wa_akg

log = logging.getLogger("atendente.servidor")

LIMITE_CORPO = 1024 * 1024
SESSAO_SEGUNDOS = 12 * 3600
LOGIN_TENTATIVAS = 5
LOGIN_JANELA_S = 5 * 60
LOGIN_BLOQUEIO_S = 15 * 60
STATUS_VALIDOS = ("ativo", "pausado", "parado", "aguardando")
PREFIXO_VALIDO = re.compile(r"^/[a-z0-9_-]+$")
SITUACOES = ("respondeu", "sair", "ativo", "fechou")
PADRAO_CONFIG = {"status": "pausado", "auto_resposta": False, "por_lote": 5, "limite_dia": 50,
                 "modelo": _ia.MODELO_PADRAO, "teto_usd_mes": 5.0}
RESPOSTAS_DO_LEAD = ("sozinha", "avisou", "sair", "ignorou")
PASTA_WEB = os.path.join(os.path.dirname(os.path.abspath(__file__)), "web")
COLUNAS = ("Para hoje", "Aguardando", "Sem contato", "Responderam", "Fecharam", "Saíram")


# ----------------------------------------------------------------------------- sessão (cookie assinado)

def _b64(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).decode("ascii").rstrip("=")


def _unb64(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def assinar_sessao(segredo: str, usuario: str, expira_em: float) -> str:
    corpo = _b64(json.dumps({"u": usuario, "exp": int(expira_em)}, separators=(",", ":")).encode("utf-8"))
    mac = hmac.new(segredo.encode("utf-8"), corpo.encode("ascii"), hashlib.sha256).hexdigest()
    return f"{corpo}.{mac}"


def ler_sessao(segredo: str, valor: str, agora_ts: float) -> str | None:
    """Devolve o usuário do cookie, ou None se estiver adulterado, vencido ou malformado."""
    try:
        if not segredo or not valor or valor.count(".") != 1:
            return None
        corpo, mac = valor.split(".")
        esperado = hmac.new(segredo.encode("utf-8"), corpo.encode("ascii"), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(mac.encode("ascii"), esperado.encode("ascii")):
            return None
        dados = json.loads(_unb64(corpo))
        if not isinstance(dados, dict) or not isinstance(dados.get("u"), str):
            return None
        if not isinstance(dados.get("exp"), int) or dados["exp"] <= agora_ts:
            return None
        return dados["u"]
    except (ValueError, UnicodeError, TypeError):
        return None


# ----------------------------------------------------------------------------- regras puras

def validar_config(corpo) -> tuple[dict | None, str | None]:
    """Devolve (valores, None) ou (None, mensagem de erro em português). Tudo ou nada."""
    if not isinstance(corpo, dict) or not corpo:
        return None, "Envie ao menos um campo de configuração."
    desconhecidos = sorted(set(corpo) - set(PADRAO_CONFIG))
    if desconhecidos:
        return None, f"Campo desconhecido: {', '.join(desconhecidos)}."
    out = {}
    for k, v in corpo.items():
        if k == "status":
            if v not in STATUS_VALIDOS:
                return None, 'O estado deve ser "ativo", "pausado", "parado" ou "aguardando".'
        elif k == "auto_resposta":
            if not isinstance(v, bool):
                return None, "Respostas automáticas deve ser ligado ou desligado (verdadeiro ou falso)."
        elif k in ("por_lote", "limite_dia"):
            maximo = 10 if k == "por_lote" else 60
            if isinstance(v, bool) or not isinstance(v, int) or not 1 <= v <= maximo:
                nome = "Mensagens por lote" if k == "por_lote" else "Limite por dia"
                return None, f"{nome} deve ser um número inteiro de 1 a {maximo}."
        elif k == "modelo":
            if not isinstance(v, str) or not v.strip() or len(v.strip()) > 80:
                return None, "O modelo da IA deve ser um texto de 1 a 80 caracteres."
            v = v.strip()
        elif k == "teto_usd_mes":
            if isinstance(v, bool) or not isinstance(v, (int, float)) or not 0 <= v <= 50:
                return None, "O teto mensal da IA deve ser um número de 0 a 50 (dólares)."
            v = float(v)
        out[k] = v
    return out, None


def ip_do_cliente(peer: str, xff: str | None) -> str:
    """IP de quem está do outro lado. Só confia no X-Forwarded-For quando quem conectou é o proxy: loopback ou rede
    privada (o Caddy no Docker chega pelo gateway da bridge, 172.x.0.1). Peer público: o cabeçalho pode ser forjado."""
    try:
        origem = ipaddress.ip_address(peer)
    except ValueError:
        return peer
    if xff and (origem.is_loopback or origem.is_private):
        ultimo = xff.split(",")[-1].strip()
        try:
            return str(ipaddress.ip_address(ultimo))
        except ValueError:
            return peer
    return peer


def caminho_do_cookie(prefixo: str | None) -> str:
    """Path do cookie: o prefixo que o proxy tira (X-Forwarded-Prefix), só se for /palavra; senão /."""
    prefixo = (prefixo or "").strip()
    return prefixo + "/" if PREFIXO_VALIDO.match(prefixo) else "/"


def coluna_do_lead(lead: dict, agora: datetime) -> str:
    sit = lead.get("situacao")
    if sit == "sair":
        return "Saíram"
    if sit == "fechou":
        return "Fecharam"
    if sit == "respondeu":
        return "Responderam"
    sem_numero = not wa_akg.numero_whatsapp(wa_akg.telefone_destino(lead)) and not lead.get("jidWa")
    if sem_numero:
        return "Sem contato"
    if wa_akg.vence_hoje(lead, agora):
        return "Para hoje"
    return "Aguardando"


def _atencao(lead: dict) -> str | None:
    for h in reversed((lead.get("historico") or [])[-10:]):
        t = h.get("texto") if isinstance(h, dict) else None
        if isinstance(t, str) and "ATENÇÃO:" in t:
            return t
    return None


def _iso(d: datetime) -> str:
    return d.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


class Servidor(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True

    def __init__(self, endereco, repo, atendente, wa, cfg):
        super().__init__(endereco, Handler)
        self.repo, self.atendente, self.wa, self.cfg = repo, atendente, wa, cfg
        self.pasta_web = os.path.realpath(cfg.get("pasta_web") or PASTA_WEB)
        self._falhas: dict[str, list[float]] = {}
        self._bloqueados: dict[str, float] = {}
        self._trava_login = threading.Lock()

    # ---- relógio e config
    def agora(self) -> datetime:
        rel = self.cfg.get("relogio")
        return rel() if rel else datetime.now(timezone.utc)

    def config_atual(self) -> dict:
        return {k: self.repo.config_get(k, v) for k, v in PADRAO_CONFIG.items()}

    # ---- bloqueio de login por IP
    def bloqueado(self, ip: str) -> bool:
        with self._trava_login:
            ate = self._bloqueados.get(ip)
            if ate and ate > time.time():
                return True
            self._bloqueados.pop(ip, None)
            return False

    def falha_de_login(self, ip: str) -> None:
        agora = time.time()
        with self._trava_login:
            lista = [t for t in self._falhas.get(ip, []) if agora - t < LOGIN_JANELA_S] + [agora]
            self._falhas[ip] = lista
            if len(lista) >= LOGIN_TENTATIVAS:
                self._bloqueados[ip] = agora + LOGIN_BLOQUEIO_S
                self._falhas.pop(ip, None)

    def login_ok(self, ip: str) -> None:
        with self._trava_login:
            self._falhas.pop(ip, None)

    # ---- operações
    def painel(self, agora: datetime) -> tuple[dict, bool]:
        painel = {"naFila": None, "enviadasHoje": None}
        conectado = False
        try:
            pend = self.wa.agendadas("pending")
            hist = self.wa.agendadas("history")
            hoje = agora.astimezone(wa_akg.FUSO).date()
            painel["naFila"] = len(pend)
            painel["enviadasHoje"] = sum(
                1 for x in hist if x.get("status") == wa_akg.SENT and wa_akg._data(x.get("sendAt"))
                and wa_akg._data(x["sendAt"]).astimezone(wa_akg.FUSO).date() == hoje)
            conectado = bool(self.wa.conectado())
        except Exception as e:
            log.warning("WA-AKG indisponível ao montar o painel: %s", type(e).__name__)
            conectado = False
            if painel["naFila"] is None or painel["enviadasHoje"] is None:
                painel = {"naFila": None, "enviadasHoje": None}
        hoje = agora.astimezone(wa_akg.FUSO).date()
        linhas = [r for r in self.repo.atendimento_lista(limite=5000)
                  if wa_akg._data(r.get("em")) and wa_akg._data(r["em"]).astimezone(wa_akg.FUSO).date() == hoje]
        painel["respostasHoje"] = sum(1 for r in linhas if r.get("acao") in RESPOSTAS_DO_LEAD)
        painel["autoHoje"] = self.repo.auto_respostas_hoje(agora)
        painel["avisosHoje"] = sum(1 for r in linhas if r.get("acao") == "avisou")
        painel["gastoMesUsd"] = self.repo.gasto_mes(agora)
        return painel, conectado

    def cancelar_pendentes(self, agora: datetime) -> dict:
        """Cancela tudo o que está pendente no WA-AKG e limpa o `agendamento` dos leads afetados."""
        cancelados, erros = [], 0
        try:
            pendentes = self.wa.agendadas("pending")
        except Exception as e:
            return {"cancelados": 0, "erroCancelar": f"Não consegui falar com o WhatsApp ({type(e).__name__})."}
        for p in pendentes:
            try:
                self.wa.cancelar(p["id"])
                cancelados.append(str(p["id"]))
            except Exception as e:
                erros += 1
                log.warning("falha ao cancelar um agendamento: %s", type(e).__name__)
        for l in self.repo.leads_todos():
            ag = l.get("agendamento")
            if ag and str(ag.get("id")) in cancelados:
                self.repo.aplicar(l["id"], {
                    "agendamento": {"__delete__": True},
                    "historico": wa_akg.registrar(l.get("historico"), f"Toque {ag.get('n')} cancelado no WhatsApp "
                                                  "antes de sair (Parar tudo)", agora)})
        out = {"cancelados": len(cancelados)}
        if erros:
            out["erroCancelar"] = f"{erros} agendamento(s) não puderam ser cancelados no WhatsApp."
        return out

    def resumo_do_lead(self, l: dict, agora: datetime) -> dict:
        msgs = self.repo.msgs_do_lead(str(l["id"]), 1)
        ult = ({"texto": msgs[-1]["texto"], "de_mim": msgs[-1]["de_mim"], "em": msgs[-1]["em"]} if msgs else None)
        return {"id": l["id"], "nome": l.get("nome"), "empresa": nome_da_empresa(l),
                "coluna": coluna_do_lead(l, agora), "etapa": l.get("etapa"), "situacao": l.get("situacao"),
                "ultimaMensagem": ult, "atencao": _atencao(l)}


def nome_da_empresa(lead: dict) -> str:
    """Texto para a tela. Nos dados da Central, `nome` é o nome da empresa e `empresa` é um objeto com dados do CNPJ
    (às vezes vazio); em dados antigos `empresa` pode ser texto. Nunca devolve um objeto."""
    nome = lead.get("nome")
    if isinstance(nome, str) and nome.strip():
        return nome.strip()
    emp = lead.get("empresa")
    if isinstance(emp, str) and emp.strip():
        return emp.strip()
    if isinstance(emp, dict):
        for chave in ("nome", "razaoSocial", "fantasia", "nomeFantasia"):
            v = emp.get(chave)
            if isinstance(v, str) and v.strip():
                return v.strip()
    return "Sem nome"


class Handler(BaseHTTPRequestHandler):
    server_version = "Atendente"
    sys_version = ""
    protocol_version = "HTTP/1.1"

    def log_message(self, formato, *args):  # nunca registra cookies nem corpos
        log.debug("%s %s", self.address_string(), formato % args)

    # ---- respostas
    def _enviar(self, status, corpo: bytes, tipo="application/json; charset=utf-8", extra=None):
        self.send_response(status)
        self.send_header("Content-Type", tipo)
        self.send_header("Content-Length", str(len(corpo)))
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Referrer-Policy", "no-referrer")
        if tipo.startswith("application/json"):
            self.send_header("Cache-Control", "no-store")
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        if self.close_connection:
            self.send_header("Connection", "close")
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(corpo)

    def _json(self, status, obj, extra=None):
        self._enviar(status, json.dumps(obj, ensure_ascii=False).encode("utf-8"), extra=extra)

    def _erro(self, status, msg):
        self._json(status, {"erro": msg})

    # ---- entrada
    def _ip(self):
        return ip_do_cliente(self.client_address[0], self.headers.get("X-Forwarded-For"))

    def _path_cookie(self):
        return caminho_do_cookie(self.headers.get("X-Forwarded-Prefix"))

    def _corpo(self) -> bytes | None:
        """Lê o corpo (limite de 1 MB). Devolve None depois de já ter respondido 413/400."""
        try:
            n = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            self.close_connection = True
            self._erro(400, "Content-Length inválido.")
            return None
        if n < 0:
            self.close_connection = True
            self._erro(400, "Content-Length inválido.")
            return None
        if n > LIMITE_CORPO:
            restante = min(n, 4 * LIMITE_CORPO)  # descarta para o cliente conseguir ler a resposta
            while restante > 0:
                lido = self.rfile.read(min(65536, restante))
                if not lido:
                    break
                restante -= len(lido)
            self.close_connection = True
            self._erro(413, "Corpo grande demais (limite de 1 MB).")
            return None
        return self.rfile.read(n) if n else b""

    def _json_do_corpo(self):
        bruto = self._corpo()
        if bruto is None:
            return None, True
        try:
            dados = json.loads(bruto.decode("utf-8")) if bruto else {}
        except (ValueError, UnicodeError):
            self._erro(400, "O corpo precisa ser um JSON válido.")
            return None, True
        return dados, False

    def _usuario(self) -> str | None:
        ck = self.headers.get("Cookie") or ""
        valor = None
        for parte in ck.split(";"):
            nome, _, v = parte.strip().partition("=")
            if nome == "sessao":
                valor = v
        if not valor:
            return None
        srv = self.server
        u = ler_sessao(srv.cfg.get("segredo_sessao") or "", valor, srv.agora().timestamp())
        return u if u in (srv.cfg.get("usuarios") or {}) else None

    def _mesma_origem(self) -> bool:
        origem = self.headers.get("Origin")
        if not origem:
            return True
        return urlsplit(origem).netloc == (self.headers.get("Host") or "")

    # ---- métodos
    def do_GET(self):
        self._tratar("GET")

    def do_POST(self):
        self._tratar("POST")

    def do_HEAD(self):
        self._tratar("GET")

    def _tratar(self, metodo):
        try:
            partes = urlsplit(self.path)
            caminho = partes.path
            if metodo == "GET" and caminho == "/saude":
                return self._json(200, {"ok": True})
            if metodo == "POST" and caminho == "/webhook":
                return self._webhook()
            if metodo == "POST" and caminho == "/login":
                return self._login()
            if caminho.startswith("/api/") or caminho == "/logout":
                return self._api(metodo, caminho, parse_qs(partes.query))
            if metodo == "GET":
                return self._estatico(caminho)
            return self._erro(404, "Não encontrado.")
        except (BrokenPipeError, ConnectionResetError):
            raise
        except Exception:
            log.exception("erro ao tratar %s %s", metodo, self.path.split("?")[0])
            self.close_connection = True
            try:
                self._erro(500, "Erro interno.")
            except Exception:
                pass

    # ---- webhook
    def _webhook(self):
        srv = self.server
        segredo = srv.cfg.get("webhook_segredo") or ""
        if not segredo:
            self.close_connection = True
            return self._erro(503, "Webhook sem segredo configurado.")
        bruto = self._corpo()
        if bruto is None:
            return
        if not webhook.verificar_assinatura(segredo, bruto, self.headers.get("X-Webhook-Signature")):
            return self._erro(401, "Assinatura inválida.")
        try:
            payload = json.loads(bruto.decode("utf-8"))
        except (ValueError, UnicodeError):
            return self._erro(400, "JSON inválido.")
        m = webhook.interpretar(payload)
        if m is None:
            return self._json(200, {"resultado": "ignorada"})
        agora = srv.agora()
        if not m.em:
            m = dataclasses.replace(m, em=_iso(agora))
        try:
            resultado = srv.atendente.tratar_mensagem(m, agora)
        except Exception:
            log.exception("falha ao tratar a mensagem do webhook")
            return self._erro(500, "Falha ao tratar a mensagem.")
        return self._json(200, {"resultado": resultado})

    # ---- login
    def _login(self):
        srv = self.server
        dados, falhou = self._json_do_corpo()
        if falhou:
            return
        ip = self._ip()
        if srv.bloqueado(ip):
            return self._erro(429, "Muitas tentativas erradas. Tente de novo em 15 minutos.")
        usuario = dados.get("usuario") if isinstance(dados, dict) else None
        senha = dados.get("senha") if isinstance(dados, dict) else None
        if not isinstance(usuario, str) or not isinstance(senha, str):
            return self._erro(400, "Envie usuario e senha.")
        usuarios = srv.cfg.get("usuarios") or {}
        esperada = usuarios.get(usuario)
        certo = hmac.compare_digest(senha.encode("utf-8"), (esperada if esperada is not None else "\0nao").encode("utf-8"))
        if esperada is None or not certo:
            srv.falha_de_login(ip)
            return self._erro(401, "Usuário ou senha incorretos.")
        srv.login_ok(ip)
        valor = assinar_sessao(srv.cfg.get("segredo_sessao") or "", usuario, srv.agora().timestamp() + SESSAO_SEGUNDOS)
        seguro = "; Secure" if self.headers.get("X-Forwarded-Proto") == "https" else ""
        cookie = f"sessao={valor}; Path={self._path_cookie()}; HttpOnly; SameSite=Strict; Max-Age={SESSAO_SEGUNDOS}{seguro}"
        return self._json(200, {"ok": True, "usuario": usuario}, extra={"Set-Cookie": cookie})

    # ---- API
    def _api(self, metodo, caminho, consulta):
        srv = self.server
        usuario = self._usuario()
        if usuario is None:
            return self._erro(401, "Entre com seu usuário e senha.")
        if metodo == "POST" and not self._mesma_origem():
            return self._erro(403, "Origem não permitida.")
        agora = srv.agora()
        if rotas.despachar(self, metodo, caminho, usuario, agora):
            return
        if metodo == "POST" and caminho == "/logout":
            self._corpo()
            return self._json(200, {"ok": True}, extra={"Set-Cookie": f"sessao=; Path={self._path_cookie()}; HttpOnly; SameSite=Strict; Max-Age=0"})
        if metodo == "GET" and caminho == "/api/estado":
            painel, conectado = srv.painel(agora)
            return self._json(200, {"config": srv.config_atual(), "painel": painel, "wa": {"conectado": conectado}})
        if metodo == "POST" and caminho == "/api/config":
            return self._config(agora)
        if metodo == "GET" and caminho == "/api/leads":
            leads = [srv.resumo_do_lead(l, agora) for l in srv.repo.leads_todos()]
            return self._json(200, leads)
        if metodo == "GET" and caminho == "/api/atendimento":
            try:
                limite = int((consulta.get("limite") or ["100"])[0])
            except ValueError:
                return self._erro(400, "O limite deve ser um número.")
            if not 1 <= limite <= 500:
                return self._erro(400, "O limite deve ser de 1 a 500.")
            return self._json(200, srv.repo.atendimento_lista(limite=limite))
        if metodo == "GET" and caminho == "/api/backup":
            return self._backup(agora)
        if caminho.startswith("/api/leads/"):
            resto = caminho[len("/api/leads/"):].split("/")
            lead_id = unquote(resto[0])
            lead = srv.repo.lead_get(lead_id) if lead_id else None
            if lead is None:
                if metodo == "POST":
                    self._corpo()
                return self._erro(404, "Lead não encontrado.")
            if metodo == "GET" and len(resto) == 1:
                return self._json(200, dict(lead, empresa=nome_da_empresa(lead), empresaDados=lead.get("empresa"),
                                            mensagens=srv.repo.msgs_do_lead(lead_id, 100)))
            if metodo == "POST" and len(resto) == 2 and resto[1] == "situacao":
                return self._situacao(lead, usuario, agora)
            if metodo == "POST" and len(resto) == 2 and resto[1] == "nota":
                return self._nota(lead, usuario, agora)
            if metodo == "POST" and len(resto) == 2 and resto[1] == "enviar":
                return self._enviar_ao_lead(lead, usuario, agora)
        if metodo == "POST":
            self._corpo()
        return self._erro(404, "Não encontrado.")

    def _config(self, agora):
        srv = self.server
        dados, falhou = self._json_do_corpo()
        if falhou:
            return
        valores, erro = validar_config(dados)
        if erro:
            return self._erro(400, erro)
        if valores.get("status") == "ativo" and "auto_resposta" not in valores \
                and srv.repo.config_get("status") == "aguardando":
            valores["auto_resposta"] = True  # "Ligar atendente": sair de aguardando liga também as respostas
        for k, v in valores.items():
            srv.repo.config_set(k, v)
        atual = srv.config_atual()
        gancho = srv.cfg.get("ao_mudar_config")
        if gancho:
            try:
                gancho(atual)
            except Exception:
                log.exception("falha ao aplicar a configuração")
        extra = {}
        if valores.get("status") == "parado":
            extra = srv.cancelar_pendentes(agora)
        return self._json(200, dict({"config": atual}, **extra))

    def _situacao(self, lead, usuario, agora):
        srv = self.server
        dados, falhou = self._json_do_corpo()
        if falhou:
            return
        sit = dados.get("situacao") if isinstance(dados, dict) else None
        if sit not in SITUACOES:
            return self._erro(400, 'A situação deve ser "respondeu", "sair", "ativo" ou "fechou".')
        mudanca = {"situacao": sit, "historico": wa_akg.registrar(
            lead.get("historico"), f"Situação mudou para {sit} (por {usuario})", agora)}
        ag = lead.get("agendamento")
        if sit != "ativo" and ag:  # quem respondeu, saiu ou fechou não recebe o toque agendado
            try:
                srv.wa.cancelar(ag["id"])
                mudanca["agendamento"] = {"__delete__": True}
            except Exception as e:
                log.warning("não consegui cancelar o agendamento do lead: %s", type(e).__name__)
        srv.repo.aplicar(lead["id"], mudanca)
        return self._json(200, {"ok": True, "situacao": sit})

    def _nota(self, lead, usuario, agora):
        srv = self.server
        dados, falhou = self._json_do_corpo()
        if falhou:
            return
        texto = dados.get("texto") if isinstance(dados, dict) else None
        if not isinstance(texto, str) or not texto.strip():
            return self._erro(400, "Escreva o texto da nota.")
        texto = texto.strip()
        if len(texto) > 1000:
            return self._erro(400, "A nota pode ter no máximo 1000 caracteres.")
        srv.repo.aplicar(lead["id"], {"historico": wa_akg.registrar(
            lead.get("historico"), f"Nota de {usuario}: {texto}", agora, tipo="nota")})
        return self._json(200, {"ok": True})

    def _enviar_ao_lead(self, lead, usuario, agora):
        """A equipe escreve para o lead pela tela. Sai na hora pelo WhatsApp, vira `respondeu`, cancela o toque agendado
        e entra no registro como intervenção humana (é material do aprendizado dos 30 dias)."""
        srv = self.server
        dados, falhou = self._json_do_corpo()
        if falhou:
            return
        texto = dados.get("texto") if isinstance(dados, dict) else None
        if not isinstance(texto, str) or not texto.strip():
            return self._erro(400, "Escreva a mensagem antes de enviar.")
        texto = texto.strip()
        if len(texto) > 1000:
            return self._erro(400, "A mensagem pode ter no máximo 1000 caracteres.")
        if lead.get("situacao") in ("sair", "fechou"):
            return self._erro(409, f"Este lead está como '{lead['situacao']}'. Para escrever, volte-o para a cadência ou marque Respondeu.")
        try:
            jid = lead.get("jidWa")
            if not jid:
                numero = wa_akg.numero_whatsapp(wa_akg.telefone_destino(lead))
                jid = srv.wa.verificar([numero]).get(numero) if numero else None
            if not jid:
                return self._erro(400, "Não achei o WhatsApp deste número.")
            envio = wa_akg.responder_lead(srv.wa, lead, jid, texto, agora)
        except wa_akg.WaAkgErro:
            return self._erro(502, "Não consegui falar com o WhatsApp agora. A mensagem NÃO foi enviada; tente de novo.")
        except ValueError as e:
            return self._erro(409, str(e))
        data = dict(envio["data"])
        data["historico"] = wa_akg.registrar(lead.get("historico"), f"Mensagem de {usuario} pelo WhatsApp: {texto[:200]}",
                                             agora, tipo="resposta")
        data["situacao"] = "respondeu"
        ag = lead.get("agendamento")
        if ag:  # quem já está conversando com a equipe não recebe o toque agendado
            try:
                srv.wa.cancelar(ag["id"])
                data["agendamento"] = {"__delete__": True}
            except Exception as e:
                log.warning("não consegui cancelar o agendamento do lead: %s", type(e).__name__)
        srv.repo.aplicar(lead["id"], data)
        em = agora.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        srv.repo.msg_add(lead["id"], jid, True, texto, "TEXT", None, em)
        srv.repo.atendimento_add(leadId=lead["id"], empresa=nome_da_empresa(lead), em=em, mensagemLead="",
                                 acao="humano", respostaEnviada=texto, humanoRespondeu=True)
        return self._json(200, {"ok": True})

    def _backup(self, agora):
        fd, tmp = tempfile.mkstemp(suffix=".db")
        os.close(fd)
        try:
            self.server.repo.backup(tmp)
            with open(tmp, "rb") as fh:
                dados = fh.read()
        finally:
            try:
                os.unlink(tmp)
            except OSError:
                pass
        nome = f"atendente-{agora.astimezone(wa_akg.FUSO).strftime('%Y%m%d')}.db"
        return self._enviar(200, dados, "application/octet-stream",
                            {"Content-Disposition": f'attachment; filename="{nome}"'})

    # ---- estáticos (públicos: só a tela, sem dados)
    def _estatico(self, caminho):
        base = self.server.pasta_web
        rel = unquote(caminho)
        if "\0" in rel or "\\" in rel:
            return self._erro(400, "Caminho inválido.")
        rel = rel.lstrip("/") or "index.html"
        alvo = os.path.realpath(os.path.join(base, rel))
        if os.path.commonpath([base, alvo]) != base:
            return self._erro(403, "Acesso negado.")
        if os.path.isdir(alvo):
            alvo = os.path.join(alvo, "index.html")
        if not os.path.isfile(alvo):
            return self._erro(404, "Não encontrado.")
        tipo = mimetypes.guess_type(alvo)[0] or "application/octet-stream"
        if tipo.startswith("text/") or tipo in ("application/javascript", "application/json"):
            tipo += "; charset=utf-8"
        with open(alvo, "rb") as fh:
            return self._enviar(200, fh.read(), tipo, {"Cache-Control": "no-cache"})


def criar_servidor(repo, atendente, wa, cfg, host="127.0.0.1", porta=8088) -> Servidor:
    return Servidor((host, porta), repo, atendente, wa, cfg)

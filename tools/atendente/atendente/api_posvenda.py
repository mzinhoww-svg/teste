"""Aba Pós-venda: clientes (tabela `clientes`), as etapas do `config/posvenda`, Novo cliente e Virar cliente.

As regras de etapa seguem a Central antiga (central/regras.js: etapaPV, vencimentoPV, grupoPV, textoPV,
ordenarClientes). Datas marcadas na tela (dataKickoff, dataGravacao) vêm do campo datetime-local, sem fuso, e valem
como hora de Cuiabá; os carimbos (pvEnviadoN, pvConcluidoN, criadoEm) são UTC ISO. Sem `config/posvenda` no banco, a
tela usa os textos de `msg/copy_posvenda.py` e avisa.
"""
import re
import time
from datetime import date, datetime, timedelta
from urllib.parse import quote, unquote

from msg.copy_posvenda import doc_config
from scripts import wa_akg

from .rotas import rota

GRUPOS = ("hoje", "andamento", "pausado", "concluido")
DIAS_SEMANA = ("segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo")
CAMPOS_DATA = ("dataKickoff", "dataGravacao")
DATA_LOCAL = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$")
EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
VALOR_MAXIMO = 10_000_000
ACOES = ("enviado", "desfazer-enviado", "concluir", "voltar", "pausar", "retomar")


def config_posvenda(repo) -> tuple[dict, bool]:
    """(config, é o padrão do código?)."""
    pv = repo.config_get("posvenda")
    if isinstance(pv, dict) and isinstance(pv.get("etapas"), list) and pv["etapas"]:
        return pv, False
    return doc_config(), True


# --------------------------------------------------------------------------- datas

def _local(valor) -> datetime | None:
    """Data/hora local de Cuiabá: carimbo ISO com fuso (convertido) ou datetime-local sem fuso (já é local)."""
    if not valor or not isinstance(valor, str):
        return None
    if DATA_LOCAL.match(valor):
        try:
            return datetime.strptime(valor, "%Y-%m-%dT%H:%M")
        except ValueError:
            return None
    d = wa_akg._data(valor)
    return d.astimezone(wa_akg.FUSO).replace(tzinfo=None) if d else None


def _dia(valor) -> date | None:
    d = _local(valor)
    return d.date() if d else None


def quando_texto(valor) -> str:
    """"2026-10-09T14:00" -> "quinta, 09/10, às 14h" (como a Central antiga)."""
    d = _local(valor)
    if not d:
        return ""
    h = f"{d.hour}h" + (f"{d.minute:02d}" if d.minute else "")
    return f"{DIAS_SEMANA[d.weekday()]}, {d:%d/%m}, às {h}"


# --------------------------------------------------------------------------- regras

def etapa_de(c: dict) -> int:
    try:
        return max(1, int(c.get("etapa") or 1))
    except (TypeError, ValueError):
        return 1


def _def(etapas, n):
    return etapas[n - 1] if 1 <= n <= len(etapas) else None


def vencimento(c: dict, etapas: list) -> date | None:
    """Dia em que a mensagem da etapa atual deve sair; date.min = já pode; None = depende de data não marcada."""
    n = etapa_de(c)
    e = _def(etapas, n)
    if not e:
        return None
    q = e.get("quando")
    if q == "data":
        d = _dia(c.get(e.get("campoData")))
        if not d:
            return None
        return d - timedelta(days=1) if e.get("vespera") else date.min
    if isinstance(q, (int, float)) and not isinstance(q, bool):
        anterior = _dia(c.get(f"pvConcluido{n - 1}"))
        return anterior + timedelta(days=int(q)) if anterior else date.min
    return date.min


def grupo(c: dict, etapas: list, hoje: date) -> str:
    if c.get("situacao") == "pausado":
        return "pausado"
    n = etapa_de(c)
    if c.get("situacao") == "concluido" or n > len(etapas):
        return "concluido"
    if c.get(f"pvEnviado{n}"):
        return "andamento"
    v = vencimento(c, etapas)
    if v is None:
        return "hoje"  # falta marcar a data: é a ação do dia
    return "hoje" if v <= hoje else "andamento"


def texto(c: dict, n: int, cfg: dict) -> str:
    e = _def(cfg.get("etapas") or [], n)
    if not e:
        return ""
    produtos = cfg.get("produtos") or {}
    p = produtos.get(c.get("produto")) or produtos.get("Outro") or {}
    preparo = (cfg.get("preparo") or {}).get("sede" if c.get("produto") == "Podcast In Loco" else "estudio") or ""
    rec = cfg.get("recorrencia") or {}
    valores = {"saudacao": c.get("saudacao") or "", "produto": c.get("produto") or "",
               "quando": quando_texto(c.get(e["campoData"])) if e.get("campoData") else "",
               "local": p.get("local") or "", "entregaveis": p.get("entregaveis") or "", "preparo": preparo,
               "recorrencia": rec.get(c.get("produto")) or rec.get("padrao") or ""}
    return re.sub(r"\{(\w+)\}", lambda m: valores.get(m.group(1), m.group(0)), e.get("texto") or "")


def info_cliente(c: dict, cfg: dict, agora: datetime) -> dict:
    """O que a tela precisa saber do cliente numa conta só (grupo, etapa, texto e link da mensagem)."""
    etapas = cfg.get("etapas") or []
    hoje = agora.astimezone(wa_akg.FUSO).date()
    n = etapa_de(c)
    e = _def(etapas, n)
    g = grupo(c, etapas, hoje)
    precisa = bool(e) and e.get("quando") == "data" and not c.get(e.get("campoData"))
    msg = texto(c, n, cfg) if e else ""
    numero = wa_akg.numero_whatsapp(c.get("telefone"))
    link = ""
    if e and not precisa and g in ("hoje", "andamento"):
        if numero:
            link = f"https://wa.me/{numero}?text={quote(msg, safe='')}"
        elif c.get("email"):
            link = f"mailto:{c['email']}?subject={quote('Reiners Media · ' + e.get('nome', ''), safe='')}&body={quote(msg, safe='')}"
    v = vencimento(c, etapas)
    return {"grupo": g, "etapa": n, "total": len(etapas), "etapaNome": (e or {}).get("nome", ""), "texto": msg,
            "precisaData": precisa, "campoData": (e or {}).get("campoData") if e and e.get("quando") == "data" else None,
            "enviado": bool(c.get(f"pvEnviado{n}")), "link": link, "porEmail": not numero and bool(c.get("email")),
            "vencimento": v.isoformat() if v and v != date.min else None}


def _chave_ordem(c: dict, etapas: list):
    v = vencimento(c, etapas)
    return (1 if c.get("situacao") == "pausado" else 0, v.toordinal() if v else -1, str(c.get("criadoEm") or ""))


def listar(repo, agora: datetime) -> dict:
    cfg, padrao = config_posvenda(repo)
    etapas = cfg.get("etapas") or []
    todos = sorted(repo.clientes_todos(), key=lambda c: _chave_ordem(c, etapas))
    hoje = agora.astimezone(wa_akg.FUSO).date()
    cont = {"todos": len(todos), **{g: 0 for g in GRUPOS}, "gravacoes7d": 0}
    saida = []
    for c in todos:
        info = info_cliente(c, cfg, agora)
        cont[info["grupo"]] += 1
        dg = _dia(c.get("dataGravacao"))
        if dg and info["grupo"] not in ("concluido", "pausado") and hoje <= dg < hoje + timedelta(days=8):
            cont["gravacoes7d"] += 1
        saida.append(dict(c, pv=info))
    return {"config": cfg, "configPadrao": padrao, "produtos": list((cfg.get("produtos") or {"Outro": {}}).keys()),
            "clientes": saida, "contagens": cont}


# --------------------------------------------------------------------------- validação

def _valor(v):
    """(número ou None, erro)."""
    if v is None or v == "":
        return None, None
    if isinstance(v, str):
        t = v.strip().replace("R$", "").replace(" ", "")
        if "," in t:
            t = t.replace(".", "").replace(",", ".")
        try:
            v = float(t)
        except ValueError:
            return None, "O valor precisa ser um número, como 1500 ou 1.500,00."
    if isinstance(v, bool) or not isinstance(v, (int, float)) or not 0 <= v <= VALOR_MAXIMO:
        return None, "O valor precisa ser um número de 0 a 10 milhões."
    return (int(v) if float(v).is_integer() else round(float(v), 2)), None


def _texto(v, limite) -> str:
    return " ".join(str(v or "").split())[:limite]


def _id_novo(repo) -> str:
    n = int(time.time() * 1000)
    while True:
        cid = "C" + _base36(n)
        if repo.cliente_get(cid) is None:
            return cid
        n += 1


def _base36(n: int) -> str:
    dig = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    s = ""
    while n:
        n, r = divmod(n, 36)
        s = dig[r] + s
    return s or "0"


def _iso(agora) -> str:
    return wa_akg._iso(agora)


# --------------------------------------------------------------------------- rotas

@rota("GET", r"/api/posvenda")
def _listar(h, usuario, agora, m):
    return h._json(200, listar(h.server.repo, agora))


@rota("GET", r"/api/clientes/(?P<id>[^/]+)")
def _um(h, usuario, agora, m):
    repo = h.server.repo
    c = repo.cliente_get(unquote(m.group("id")))
    if c is None:
        return h._erro(404, "Cliente não encontrado.")
    cfg, _ = config_posvenda(repo)
    return h._json(200, dict(c, pv=info_cliente(c, cfg, agora)))


@rota("POST", r"/api/clientes")
def _novo(h, usuario, agora, m):
    repo = h.server.repo
    dados, falhou = h._json_do_corpo()
    if falhou:
        return
    d = dados if isinstance(dados, dict) else {}
    cfg, _ = config_posvenda(repo)
    nome = _texto(d.get("nome"), 120)
    saudacao = _texto(d.get("saudacao"), 80)
    tel_bruto = _texto(d.get("telefone"), 40)
    tel = wa_akg.numero_whatsapp(tel_bruto) if tel_bruto else ""
    email = _texto(d.get("email"), 120).lower()
    produto = d.get("produto")
    valor, erro_valor = _valor(d.get("valor"))
    erro = ("Preencha o nome do cliente." if not nome else
            "O WhatsApp precisa ter o DDD (dois números) antes do número." if tel_bruto and not tel else
            "Esse e-mail não parece certo. Confira, por favor." if email and not EMAIL.match(email) else
            "Informe um WhatsApp ou um e-mail." if not tel and not email else
            "Escolha o serviço contratado na lista." if produto not in (cfg.get("produtos") or {"Outro": {}}) else
            erro_valor)
    if erro:
        return h._erro(400, erro)
    cid = _id_novo(repo)
    c = {"id": cid, "nome": nome, "saudacao": saudacao or f"pessoal da {nome}", "telefone": tel, "email": email,
         "produto": produto, "valor": valor, "origem": "Cadastro manual", "leadId": None, "segmento": "", "etapa": 1,
         "situacao": "ativo", "criadoEm": _iso(agora), "dataKickoff": None, "dataGravacao": None,
         "historico": wa_akg.registrar([], f"Cliente cadastrado por {usuario}", agora)}
    repo.cliente_put(c)
    return h._json(200, {"ok": True, "id": cid})


@rota("POST", r"/api/leads/(?P<id>[^/]+)/virar-cliente")
def _virar_cliente(h, usuario, agora, m):
    srv = h.server
    repo = srv.repo
    dados, falhou = h._json_do_corpo()
    if falhou:
        return
    lid = unquote(m.group("id"))
    lead = repo.lead_get(lid)
    if lead is None:
        return h._erro(404, "Lead não encontrado.")
    d = dados if isinstance(dados, dict) else {}
    cfg, _ = config_posvenda(repo)
    produto = d.get("produto")
    if produto not in (cfg.get("produtos") or {"Outro": {}}):
        return h._erro(400, "Escolha o serviço contratado na lista.")
    valor, erro = _valor(d.get("valor"))
    if erro:
        return h._erro(400, erro)
    if repo.cliente_get(lid) is not None:
        return h._erro(409, "Este lead já é cliente. Veja no Pós-venda.")
    from .servidor import nome_da_empresa  # aqui dentro: o servidor importa as rotas ao carregar
    contato = wa_akg.contato_ativo(lead) or {}
    nome = nome_da_empresa(lead)
    c = {"id": lid, "nome": nome, "saudacao": lead.get("saudacao") or f"pessoal da {nome}",
         "telefone": wa_akg.numero_whatsapp(wa_akg.telefone_destino(lead)),
         "email": (contato.get("email") or lead.get("email") or "").strip().lower(), "produto": produto, "valor": valor,
         "origem": "Prospecção", "leadId": lid, "segmento": lead.get("segmento") or "", "etapa": 1, "situacao": "ativo",
         "criadoEm": _iso(agora), "dataKickoff": None, "dataGravacao": None,
         "historico": wa_akg.registrar([], f"Cliente cadastrado a partir do lead {lid} por {usuario}", agora)}
    repo.cliente_put(c)
    mudanca = {"situacao": "fechou", "historico": wa_akg.registrar(
        lead.get("historico"), f"Virou cliente: {produto} (por {usuario})", agora)}
    ag = lead.get("agendamento")
    if ag:  # quem fechou não recebe o toque agendado
        try:
            srv.wa.cancelar(ag["id"])
            mudanca["agendamento"] = {"__delete__": True}
        except Exception:
            pass
    repo.aplicar(lid, mudanca)
    return h._json(200, {"ok": True, "id": lid})


@rota("POST", r"/api/clientes/(?P<id>[^/]+)/acao")
def _acao(h, usuario, agora, m):
    repo = h.server.repo
    dados, falhou = h._json_do_corpo()
    if falhou:
        return
    c = repo.cliente_get(unquote(m.group("id")))
    if c is None:
        return h._erro(404, "Cliente não encontrado.")
    acao = dados.get("acao") if isinstance(dados, dict) else None
    if acao not in ACOES:
        return h._erro(400, "Ação desconhecida.")
    cfg, _ = config_posvenda(repo)
    etapas = cfg.get("etapas") or []
    total = len(etapas)
    n = etapa_de(c)
    g = grupo(c, etapas, agora.astimezone(wa_akg.FUSO).date())
    agora_iso = _iso(agora)
    nome_etapa = (_def(etapas, n) or {}).get("nome", "")
    if acao in ("enviado", "desfazer-enviado", "concluir") and g in ("pausado", "concluido"):
        return h._erro(409, "Este cliente está pausado. Retome antes." if g == "pausado" else "Todas as etapas já foram concluídas.")
    if acao == "enviado":
        data, txt = {f"pvEnviado{n}": agora_iso}, f"Mensagem da etapa {n} ({nome_etapa}) marcada como enviada"
    elif acao == "desfazer-enviado":
        if not c.get(f"pvEnviado{n}"):
            return h._erro(409, "Nada a desfazer.")
        data, txt = {f"pvEnviado{n}": {"__delete__": True}}, f"Marca de envio da etapa {n} desfeita"
    elif acao == "concluir":
        data = {"etapa": n + 1, f"pvConcluido{n}": agora_iso}
        if n >= total:
            data["situacao"] = "concluido"
        txt = "Cliente concluído" if n >= total else f"Etapa concluída: {nome_etapa}"
    elif acao == "voltar":
        if n <= 1 or g == "pausado":
            return h._erro(409, "Não dá para voltar desta etapa.")
        data = {"etapa": n - 1, "situacao": "ativo", f"pvConcluido{n - 1}": {"__delete__": True},
                f"pvEnviado{n - 1}": {"__delete__": True}}
        txt = f"Voltou para {(_def(etapas, n - 1) or {}).get('nome', '')}"
    elif acao == "pausar":
        if g != "hoje" and g != "andamento":
            return h._erro(409, "Só dá para pausar um cliente em andamento.")
        data, txt = {"situacao": "pausado"}, "Cliente pausado"
    else:  # retomar
        if g != "pausado":
            return h._erro(409, "Este cliente não está pausado.")
        data, txt = {"situacao": "ativo"}, "Cliente retomado"
    data["historico"] = wa_akg.registrar(c.get("historico"), f"{txt} ({usuario})", agora)
    novo = repo.cliente_aplicar(c["id"], data)
    return h._json(200, {"ok": True, "cliente": dict(novo, pv=info_cliente(novo, cfg, agora))})


@rota("POST", r"/api/clientes/(?P<id>[^/]+)/data")
def _data(h, usuario, agora, m):
    repo = h.server.repo
    dados, falhou = h._json_do_corpo()
    if falhou:
        return
    c = repo.cliente_get(unquote(m.group("id")))
    if c is None:
        return h._erro(404, "Cliente não encontrado.")
    d = dados if isinstance(dados, dict) else {}
    campo, valor = d.get("campo"), d.get("valor")
    if campo not in CAMPOS_DATA:
        return h._erro(400, "Só dá para marcar a data do kickoff ou da gravação.")
    if valor in (None, ""):
        valor = None
    elif not isinstance(valor, str) or not DATA_LOCAL.match(valor) or _local(valor) is None:
        return h._erro(400, "Data inválida. Use dia e hora, como 09/10 às 14h.")
    rotulo = "kickoff" if campo == "dataKickoff" else "gravação"
    txt = f"Data do {rotulo} marcada: {quando_texto(valor)}" if valor else f"Data do {rotulo} apagada"
    repo.cliente_aplicar(c["id"], {campo: valor, "historico": wa_akg.registrar(c.get("historico"), f"{txt} ({usuario})", agora)})
    return h._json(200, {"ok": True})

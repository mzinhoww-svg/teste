"""Enriquecimento de telefones de decisores via treg (Central de disparo da Reiners).

Desenho: docs/superpowers/specs/2026-10-02-enriquecer-leads.md. Só biblioteca padrão. O script não acessa
o banco da central: recebe e devolve JSON. O HTTP fica atrás de `TregCliente`, com transporte injetável.

    python3 -m scripts.enriquecer_leads limpar --entrada leads.json --saida limpos.json --alteracoes alteracoes.json
    python3 -m scripts.enriquecer_leads planejar --entrada limpos.json --config enriquecimento.json --saida plano.json
    python3 -m scripts.enriquecer_leads executar --plano plano.json --entrada limpos.json --saldo-micro N \
        --execucao ID --saida resultado.json [--simular] [--teto-micro 10000000]
    python3 -m scripts.enriquecer_leads recuperar --call-id ID --lead R0008 --entrada limpos.json --saida atualizados.json

Fatos do treg conferidos (https://treg.to/llms.txt e `treg catalog get`):
- Endpoints roteados: `treg.people.phone.find` e `treg.people.enrich` (POST https://treg.to/call/<id>).
- Teto por chamada: cabeçalho `X-Treg-Route-Max-Cost` em US$ (não em micro).
- Provedor que atendeu: cabeçalho `X-Treg-Served-By` (e `_treg.served_by` no corpo `{output, raw, _treg}`).
- Custo: `X-Treg-Cost-Micro`; id da chamada: `X-Treg-Call-Id`; 503 `treg_saturated` traz `Retry-After`.
"""
import argparse
import copy
import hashlib
import json
import os
import re
import sys
import time
import unicodedata
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone

from msg.enriquecimento import telefone_valido
from msg.enriquecimento import status as status_enriquecimento

BASE_URL = "https://treg.to"
EP_TELEFONE = "treg.people.phone.find"
EP_ENRICH = "treg.people.enrich"
MAX_TELEFONE_MICRO = 150_000
MAX_ENRICH_MICRO = 10_000
CUSTO_LINKEDIN_MICRO = 2_600
PILOTO_TAXA = 0.33
PILOTO_CUSTO_ACERTO_MICRO = 125_000
TETO_PADRAO_MICRO = 10_000_000
DIAS_SEM_REBUSCAR = 90
IGNORADAS = ("sair", "fechou")
ERROS_SEGUIDOS_MAX = 10


# --------------------------------------------------------------------------- limpeza

def limpar_telefone(valor) -> str:
    """Regra do `limparTelefone` da página: só dígitos, sem zeros à esquerda, 10/11 dígitos ganham 55.
    Devolve "" se não for válido (^55\\d{10,11}$)."""
    d = re.sub(r"\D", "", re.sub(r"\.0+\s*$", "", str(valor if valor is not None else "").strip()))
    d = d.lstrip("0")
    if len(d) in (10, 11):
        d = "55" + d
    return d if re.fullmatch(r"55\d{10,11}", d) else ""


def _preenchido(v) -> bool:
    return v not in (None, "", [], {})


def limpar(leads: list[dict]) -> tuple[list[dict], list[dict]]:
    """Normaliza telefones, marca inválidos (sem apagar) e remove contatos duplicados por telefone no lead."""
    saida, alteracoes = [], []
    for original in leads:
        lead = copy.deepcopy(original)
        if lead.get("situacao") in IGNORADAS:
            alteracoes.append({"leadId": lead.get("id"), "tipo": "ignorado", "contatoId": None,
                               "antes": lead.get("situacao"), "depois": lead.get("situacao")})
            saida.append(lead)
            continue
        mantidos, por_telefone = [], {}
        for c in lead.get("contatos") or []:
            antes = c.get("telefone")
            if not _preenchido(antes) or not str(antes).strip():
                mantidos.append(c)
                continue
            novo = limpar_telefone(antes)
            if not novo:
                c["invalido"] = True
                alteracoes.append({"leadId": lead.get("id"), "tipo": "invalido", "contatoId": c.get("id"),
                                   "antes": antes, "depois": antes})
                mantidos.append(c)
                continue
            c.pop("invalido", None)
            if novo != antes:
                c["telefone"] = novo
                alteracoes.append({"leadId": lead.get("id"), "tipo": "normalizado", "contatoId": c.get("id"),
                                   "antes": antes, "depois": novo})
            if novo in por_telefone:
                fica = por_telefone[novo]
                for k, v in c.items():
                    if k != "id" and not _preenchido(fica.get(k)) and _preenchido(v):
                        fica[k] = v
                alteracoes.append({"leadId": lead.get("id"), "tipo": "duplicado_removido",
                                   "contatoId": c.get("id"), "antes": antes, "depois": novo})
                continue
            por_telefone[novo] = c
            mantidos.append(c)
        if "contatos" in lead:
            lead["contatos"] = mantidos
        saida.append(lead)
    return saida, alteracoes


# --------------------------------------------------------------------------- seleção

def _sem_acento(s: str) -> str:
    return unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode()


def _palavras(nome: str) -> list[str]:
    ps = (nome or "").split()
    while ps and re.fullmatch(r"(?i)dra?\.?", ps[0]) and len(ps) > 1:
        ps = ps[1:]
    return ps


def _chave_nome(palavra: str) -> str:
    return re.sub(r"[^a-z]", "", _sem_acento(palavra).lower())


def decisor_alvo(lead: dict):
    """(índice, decisor) cujo primeiro nome bate com a saudação; senão o primeiro; None se não houver."""
    decisores = lead.get("decisores") or []
    if not decisores:
        return None
    sa = _palavras(lead.get("saudacao") or "")
    alvo = _chave_nome(sa[0]) if sa else ""
    if alvo:
        for i, d in enumerate(decisores):
            ps = _palavras(d.get("nome") or "")
            if ps and _chave_nome(ps[0]) == alvo:
                return i, d
    return 0, decisores[0]


def _parse_data(s):
    try:
        d = datetime.fromisoformat(str(s).replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None
    return d if d.tzinfo else d.replace(tzinfo=timezone.utc)


def _dominio(site: str) -> str:
    s = (site or "").strip().lower()
    if not s:
        return ""
    s = re.sub(r"^[a-z]+://", "", s)
    host = re.split(r"[/?#]", s, 1)[0].split("@")[-1].split(":")[0]
    return host[4:] if host.startswith("www.") else host


def _tem_decisor_com_telefone(lead: dict) -> bool:
    return any(c.get("papel") == "decisor" and str(c.get("telefone") or "").strip() and not c.get("invalido")
               for c in lead.get("contatos") or [])


def selecionar(leads: list[dict], agora: datetime) -> list[dict]:
    """Candidatos à busca, na ordem: pedidos pela Base (`enriquecimento.fila`), faixa A, score desc, etapa 0, id.

    Leads sem LinkedIn e sem site ficam de fora: não há com o que buscar."""
    if agora.tzinfo is None:
        agora = agora.replace(tzinfo=timezone.utc)
    corte = agora - timedelta(days=DIAS_SEM_REBUSCAR)
    achados = []
    for lead in leads:
        if lead.get("situacao") in IGNORADAS:
            continue
        em = _parse_data((lead.get("buscaTreg") or {}).get("em"))
        if em and em > corte and (lead.get("buscaTreg") or {}).get("resultado") in ("achou", "nao_achou"):
            continue
        if _tem_decisor_com_telefone(lead):
            continue
        alvo = decisor_alvo(lead)
        if not alvo:
            continue
        i, d = alvo
        ps = _palavras(d.get("nome") or "")
        if not ps:
            continue
        dominio = _dominio(lead.get("site") or "")
        linkedin = (d.get("linkedin") or "").strip()
        if not linkedin and not dominio:
            continue
        achados.append({
            "leadId": lead.get("id"), "decisorIndex": i, "nome": d.get("nome") or "", "primeiro": ps[0],
            "sobrenome": ps[-1] if len(ps) > 1 else "", "cargo": d.get("cargo") or "", "linkedin": linkedin,
            "dominio": dominio, "_ord": (not (lead.get("enriquecimento") or {}).get("fila"), lead.get("faixa") != "A", -(lead.get("score") or 0),
                                         lead.get("etapa") != 0, str(lead.get("id"))),
        })
    achados.sort(key=lambda c: c["_ord"])
    for c in achados:
        del c["_ord"]
    return achados


def estimar(candidatos: list[dict], historico_execucoes: list[dict] | None) -> dict:
    h = historico_execucoes or []
    consultados = sum(e.get("consultados") or 0 for e in h)
    achados = sum(e.get("achados") or 0 for e in h)
    gasto = sum(e.get("gastoMicro") or 0 for e in h)
    if consultados >= 1:
        taxa = achados / consultados
        custo_acerto = gasto / achados if achados else PILOTO_CUSTO_ACERTO_MICRO
        fonte = "historico"
    else:
        taxa, custo_acerto, fonte = PILOTO_TAXA, PILOTO_CUSTO_ACERTO_MICRO, "piloto"
    buscas = sum(1 for c in candidatos if not c.get("linkedin"))
    custo = round(len(candidatos) * taxa * custo_acerto + buscas * CUSTO_LINKEDIN_MICRO)
    return {"candidatos": len(candidatos), "buscasLinkedin": buscas, "taxa": taxa,
            "custoPorAcertoMicro": custo_acerto, "custoEstimadoMicro": custo, "fonte": fonte}


# --------------------------------------------------------------------------- HTTP

class TregErro(Exception):
    def __init__(self, status, corpo=None, msg=""):
        super().__init__(msg or f"HTTP {status}")
        self.status, self.corpo = status, corpo

    @property
    def sem_saldo(self) -> bool:
        """402 por falta de saldo pré-pago (corpo com balance_micro/topup_url). O 402 `route_max_cost` é o teto
        da chamada, não falta de saldo."""
        if self.status != 402:
            return False
        c = self.corpo if isinstance(self.corpo, dict) else {}
        if str(c.get("error") or "") == "route_max_cost":
            return False
        texto = json.dumps(c).lower()
        return "balance" in texto or "topup" in texto or "insufficient" in texto or not c


def transporte_urllib(metodo: str, url: str, headers: dict, corpo: bytes | None):
    """(status, headers, bytes). Erros HTTP voltam como resposta, não como exceção."""
    req = urllib.request.Request(url, data=corpo, headers=headers, method=metodo)
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return r.status, dict(r.headers.items()), r.read()
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers.items()), e.read()


def ler_token(env=None, config_path="~/.treg/config.json"):
    """(token, org). Nunca imprimir nem gravar o token."""
    env = os.environ if env is None else env
    org = env.get("TREG_ORG") or None
    for nome in ("TREG_TOKEN", "TREG_API_KEY"):
        if (env.get(nome) or "").strip():
            return env[nome].strip(), org
    try:
        with open(os.path.expanduser(config_path), encoding="utf-8") as fh:
            cfg = json.load(fh)
    except (OSError, ValueError):
        return None, org
    token = cfg.get("token") or cfg.get("api_key") or cfg.get("access_token")
    return token, org or (cfg.get("active_org") if cfg.get("identity") else None)


def _usd(micro: int) -> str:
    return f"{micro / 1_000_000:.6f}".rstrip("0").rstrip(".")


def _header(headers: dict, nome: str):
    for k, v in (headers or {}).items():
        if k.lower() == nome.lower():
            return v
    return None


def _json(b: bytes):
    try:
        return json.loads(b.decode("utf-8")) if b else None
    except (ValueError, UnicodeDecodeError):
        return None


class TregCliente:
    def __init__(self, token, org=None, transporte=transporte_urllib, dormir=time.sleep, base=BASE_URL,
                 tentativas_503=3):
        self._token, self._org = token, org
        self.transporte, self.dormir, self.base, self.tentativas_503 = transporte, dormir, base, tentativas_503

    def _cab(self, extra=None):
        h = {"X-Treg-Token": self._token or "", "Accept": "application/json"}
        if self._org:
            h["X-Treg-Org"] = self._org
        h.update(extra or {})
        return h

    def _requisitar(self, metodo, url, headers, corpo):
        """Repete a mesma requisição (mesma chave) nos 503 `treg_saturated`, esperando o Retry-After."""
        for tentativa in range(self.tentativas_503 + 1):
            status, hs, bruto = self.transporte(metodo, url, headers, corpo)
            dados = _json(bruto)
            texto = bruto.decode("utf-8", "ignore") if isinstance(bruto, bytes) else str(bruto or "")
            saturado = status == 503 and ("treg_saturated" in texto or _header(hs, "Retry-After") is not None)
            if saturado and tentativa < self.tentativas_503:
                try:
                    espera = float(_header(hs, "Retry-After") or 1)
                except ValueError:
                    espera = 1.0
                self.dormir(espera)
                continue
            return status, hs, dados
        raise AssertionError("inalcançável")

    def chamar(self, endpoint: str, corpo: dict, max_micro: int, chave: str, cabecalhos: dict | None = None) -> dict:
        """POST /call/<endpoint>. Devolve {corpo, custoMicro, callId, provedor}; TregErro em 4xx/5xx.

        `cabecalhos`: extras de rota (`X-Treg-Route-Prefer|Exclude|Waterfall`). Só `X-Treg-Route-*` passa, e o
        teto (`X-Treg-Route-Max-Cost`) vem sempre de `max_micro`: ValueError antes de chamar se tentar outro."""
        extras = {}
        for k, v in (cabecalhos or {}).items():
            if not str(k).lower().startswith("x-treg-route-") or str(k).lower() == "x-treg-route-max-cost":
                raise ValueError(f"cabeçalho não permitido: {k}")
            extras[k] = str(v)
        headers = self._cab({**extras, "Content-Type": "application/json", "Idempotency-Key": chave,
                             "X-Treg-Route-Max-Cost": _usd(max_micro)})
        status, hs, dados = self._requisitar("POST", f"{self.base}/call/{endpoint}", headers,
                                             json.dumps(corpo).encode("utf-8"))
        if not 200 <= status < 300:
            raise TregErro(status, dados)
        try:
            custo = int(_header(hs, "X-Treg-Cost-Micro") or 0)
        except ValueError:
            custo = 0
        prov = _header(hs, "X-Treg-Served-By") or ((dados or {}).get("_treg") or {}).get("served_by") \
            if isinstance(dados, dict) else _header(hs, "X-Treg-Served-By")
        return {"corpo": dados, "custoMicro": custo, "callId": _header(hs, "X-Treg-Call-Id"),
                "provedor": prov or "desconhecido"}

    def resultado_chamada(self, call_id: str):
        """GET /calls/<id>/result (grátis). Devolve o JSON; `stored: false` quando não há cópia."""
        status, _, dados = self._requisitar("GET", f"{self.base}/calls/{call_id}/result", self._cab(), None)
        if not 200 <= status < 300:
            raise TregErro(status, dados)
        return dados


def recuperar_call(cliente, call_id: str):
    return cliente.resultado_chamada(call_id)


# --------------------------------------------------------------------------- extração

def achar_linkedin(obj):
    """Primeira string com linkedin.com/in/ em qualquer lugar do JSON."""
    if isinstance(obj, str):
        m = re.search(r"(?:https?://)?(?:[\w-]+\.)?linkedin\.com/in/[^\s\"'<>)]+", obj)
        if m:
            url = m.group(0)
            return url if url.startswith("http") else "https://" + url
    elif isinstance(obj, dict):
        for v in obj.values():
            r = achar_linkedin(v)
            if r:
                return r
    elif isinstance(obj, list):
        for v in obj:
            r = achar_linkedin(v)
            if r:
                return r
    return None


_CHAVES_IGNORADAS = ("company", "org", "organization", "work", "office", "hq")


def _chave_telefone(k) -> bool:
    k = str(k).lower()
    return "phone" in k or "mobile" in k or "telefone" in k


def candidatos_telefone(obj, sob_chave=False):
    """Strings/números sob chaves com phone/mobile/telefone (inclusive em listas), na ordem do JSON.
    Ignora o que está sob chaves de empresa (company/org/work/office/hq)."""
    if isinstance(obj, dict):
        for k, v in obj.items():
            if any(x in str(k).lower() for x in _CHAVES_IGNORADAS):
                continue
            yield from candidatos_telefone(v, sob_chave or _chave_telefone(k))
    elif isinstance(obj, list):
        for v in obj:
            yield from candidatos_telefone(v, sob_chave)
    elif sob_chave and isinstance(obj, (str, int)) and not isinstance(obj, bool):
        yield str(obj)


def extrair_telefone(corpo) -> str:
    """Número brasileiro válido (regra estrita). Valores de `output` primeiro; celular antes de fixo."""
    fontes = [corpo]
    if isinstance(corpo, dict) and "output" in corpo:
        fontes = [corpo["output"], corpo]
    validos = []
    for f in fontes:
        for c in candidatos_telefone(f):
            t = telefone_valido(c)
            if t and t not in validos:
                validos.append(t)
    return next((t for t in validos if re.fullmatch(r"55\d\d9\d{8}", t)), validos[0] if validos else "")


# --------------------------------------------------------------------------- execução

def _consultado(r: dict) -> bool:
    return r.get("resultado") in ("achou", "nao_achou")


def executar(candidatos, cliente, execucao_id, saldo_micro, teto_micro=TETO_PADRAO_MICRO, lote=10,
             taxa_minima=0.30, ao_fim_do_lote=None, parar=None, ao_lead=None) -> dict:
    """Consulta lead a lead. Erros (HTTP) não entram na taxa: não foram busca de fato nem foram cobrados.

    `parar()` é olhada antes de cada lead: se devolver um texto, a rodada para com ele como motivo.
    `ao_lead(lead_id, resultado, parcial)` é chamada depois de cada lead consultado (progresso ao vivo).
    402 por falta de saldo para a rodada na hora com "saldo insuficiente" (o lead não conta como erro)."""
    por_lead: dict = {}
    estado = {"gasto": 0, "motivo": None}

    def pode(max_micro):
        if estado["gasto"] + MAX_TELEFONE_MICRO > teto_micro:
            estado["motivo"] = "teto de US$10"
        elif saldo_micro - estado["gasto"] < max_micro:
            estado["motivo"] = "saldo insuficiente"
        return estado["motivo"] is None

    def parcial():
        consultados = sum(1 for r in por_lead.values() if _consultado(r))
        achados = sum(1 for r in por_lead.values() if r["resultado"] == "achou")
        return {"execucaoId": execucao_id, "consultados": consultados, "achados": achados,
                "erros": sum(1 for r in por_lead.values() if r["resultado"] == "erro"),
                "gastoMicro": estado["gasto"], "motivoParada": estado["motivo"],
                "taxa": achados / consultados if consultados else None, "porLead": por_lead}

    def chamar(r, endpoint, corpo, max_micro, lead_id, passo):
        resp = cliente.chamar(endpoint, corpo, max_micro, f"{execucao_id}-{lead_id}-{passo}")
        estado["gasto"] += resp["custoMicro"]
        r["custoMicro"] += resp["custoMicro"]
        if resp["callId"]:
            r["callIds"].append(resp["callId"])
        return resp

    seguidos = 0
    for n, c in enumerate(candidatos, 1):
        motivo = parar() if parar else None
        if motivo:
            estado["motivo"] = motivo
            break
        lead_id = c["leadId"]
        r = {"resultado": "nao_achou", "callIds": [], "custoMicro": 0}
        linkedin = (c.get("linkedin") or "").strip()
        try:
            if not linkedin:
                if not pode(MAX_ENRICH_MICRO):
                    break
                resp = chamar(r, EP_ENRICH, {"domain": c.get("dominio"), "full_name": c.get("nome")},
                              MAX_ENRICH_MICRO, lead_id, "enrich")
                url = achar_linkedin(resp["corpo"])
                if url:
                    linkedin = url
                    r["linkedinNovo"] = url
            if not pode(MAX_TELEFONE_MICRO):
                if r["callIds"]:  # só a busca de LinkedIn rodou: guarda o ganho, sem contar como consulta
                    r["resultado"] = "interrompido"
                    por_lead[lead_id] = r
                break
            corpo = ({"linkedin_url": linkedin} if linkedin else
                     {"domain": c.get("dominio"), "first_name": c.get("primeiro"), "last_name": c.get("sobrenome")})
            resp = chamar(r, EP_TELEFONE, corpo, MAX_TELEFONE_MICRO, lead_id, "phone")
            tel = extrair_telefone(resp["corpo"])
            if tel:
                r.update(resultado="achou", telefone=tel, provedor=resp["provedor"])
        except TregErro as e:
            if e.sem_saldo:
                estado["motivo"] = "saldo insuficiente"
                if r["callIds"]:  # a busca de LinkedIn já foi paga: guarda o ganho, sem contar como consulta
                    r["resultado"] = "interrompido"
                    por_lead[lead_id] = r
                break
            r["resultado"] = "erro"
            r["erro"] = f"HTTP {e.status}"
        except OSError as e:  # URLError, timeout, conexão resetada
            r["resultado"] = "erro"
            r["erro"] = f"rede: {type(e).__name__}"
        por_lead[lead_id] = r
        if ao_lead:
            ao_lead(lead_id, r, parcial())
        seguidos = seguidos + 1 if r["resultado"] == "erro" else 0
        if seguidos >= ERROS_SEGUIDOS_MAX:
            estado["motivo"] = "erros consecutivos"
            if ao_fim_do_lote:
                ao_fim_do_lote(parcial())
            break
        if n % lote == 0 or n == len(candidatos):
            p = parcial()
            if ao_fim_do_lote:
                ao_fim_do_lote(p)
            if (n % lote == 0 and p["consultados"] > 0 and p["achados"] / p["consultados"] < taxa_minima):
                estado["motivo"] = "acerto abaixo de 30%"
                break
    return parcial()


# --------------------------------------------------------------------------- aplicar

_PEND_TELEFONE = re.compile(r"(?i)(telefone|whats|celular).*decisor|decisor.*(telefone|whats|celular)")
_PEND_BUSCA = re.compile(r"(?i)n[ãa]o encontrado na busca treg")


def _status_lead(lead: dict) -> str:
    reg = {
        "empresa": lead.get("empresa") or {}, "socios": lead.get("socios") or [],
        "decisores": lead.get("decisores") or [],
        "contatos": [{"papel": c.get("papel") or "geral",
                      "telefone": "" if c.get("invalido") else str(c.get("telefone") or ""),
                      "whatsapp": c.get("whatsapp") or "?", "confianca": c.get("confianca") or "baixa"}
                     for c in lead.get("contatos") or []],
    }
    try:
        return status_enriquecimento(reg)
    except Exception:  # forma inesperada: regra simples
        tem = any(c["papel"] in ("decisor", "comunicacao") for c in reg["contatos"])
        return "completo" if reg["decisores"] and tem else "parcial"


def aplicar(lead: dict, r: dict, decisor_index: int, agora: datetime, execucao_id: str) -> dict:
    """Devolve uma cópia do lead com o resultado da busca. Nunca mexe em `contatoAtivo`."""
    novo = copy.deepcopy(lead)
    em = agora.isoformat()
    if r.get("linkedinNovo") and 0 <= decisor_index < len(novo.get("decisores") or []):
        novo["decisores"][decisor_index]["linkedin"] = r["linkedinNovo"]
    if r.get("resultado") == "interrompido":
        return novo
    resultado = r.get("resultado")
    pend = list(novo.get("pendencias") or [])
    if resultado == "achou":
        contatos = novo.setdefault("contatos", [])
        numeros = [int(m.group(1)) for c in contatos if (m := re.fullmatch(r"k(\d+)", str(c.get("id"))))]
        d = (novo.get("decisores") or [{}])[decisor_index] if novo.get("decisores") else {}
        ja_tem = any(r["telefone"] in (limpar_telefone(c.get("telefone")), telefone_valido(str(c.get("telefone") or "")))
                     for c in contatos)
        if not ja_tem:
            contatos.append({
                "id": f"k{max(numeros, default=0) + 1}", "papel": "decisor", "nome": d.get("nome", ""),
                "cargo": d.get("cargo", ""), "telefone": r["telefone"], "whatsapp": "?", "email": "",
                "fonte": f"treg · {r.get('provedor') or 'desconhecido'} · call {(r.get('callIds') or ['?'])[-1]}",
                "confianca": "média"})
        pend = [p for p in pend if not _PEND_TELEFONE.search(p) and not _PEND_BUSCA.search(p)]
    elif resultado == "nao_achou":
        pend = [p for p in pend if not _PEND_BUSCA.search(p)]
        pend.append(f"Telefone do decisor não encontrado na busca treg ({em[:10]})")
    novo["pendencias"] = pend
    novo["buscaTreg"] = {"em": em, "execucaoId": execucao_id, "resultado": resultado,
                         "custoMicro": r.get("custoMicro", 0), "callIds": list(r.get("callIds") or [])}
    texto = {"achou": "achou", "nao_achou": "não achou"}.get(resultado, "erro")
    novo["historico"] = (list(novo.get("historico") or []) +
                         [{"em": em, "texto": f"Busca de telefone (treg): {texto}", "tipo": "enriquecimento"}])[-100:]
    enr = dict(novo.get("enriquecimento") or {})
    enr.pop("fila", None)  # pedido pela Base e já buscado: sai da frente da fila
    enr["atualizadoEm"] = em[:10]
    enr["status"] = _status_lead(novo)
    novo["enriquecimento"] = enr
    return novo


# --------------------------------------------------------------------------- simulador

def transporte_simulado(metodo: str, url: str, headers: dict, corpo: bytes | None):
    """Respostas determinísticas: ~1/3 dos leads acha (US$0,125), o resto não acha (US$0). Números fictícios."""
    chave = _header(headers, "Idempotency-Key") or ""
    lead_id = chave.rsplit("-", 2)[-2] if chave.count("-") >= 2 else chave
    h = int(hashlib.sha1(lead_id.encode()).hexdigest(), 16)
    hs = {"X-Treg-Call-Id": hashlib.md5(chave.encode()).hexdigest()}
    if url.endswith(EP_ENRICH):
        tem = h % 2 == 0
        hs["X-Treg-Cost-Micro"] = str(CUSTO_LINKEDIN_MICRO)
        hs["X-Treg-Served-By"] = "simulado"
        dados = {"output": {"linkedin_url": f"https://www.linkedin.com/in/sim-{lead_id.lower()}" if tem else None}}
        return 200, hs, json.dumps(dados).encode()
    hit = (h // 7) % 3 == 0
    hs["X-Treg-Served-By"] = "simulado"
    hs["X-Treg-Cost-Micro"] = "125000" if hit else "0"
    dados = {"output": {"phone": f"55659000000{h % 100:02d}" if hit else None}, "_treg": {"served_by": "simulado"}}
    return 200, hs, json.dumps(dados).encode()


# --------------------------------------------------------------------------- CLI

def _ler(caminho):
    with open(caminho, encoding="utf-8") as fh:
        return json.load(fh)


def _gravar(caminho, dados):
    with open(caminho, "w", encoding="utf-8") as fh:
        json.dump(dados, fh, ensure_ascii=False, indent=1)


def _cliente(simular: bool) -> TregCliente:
    if simular:
        return TregCliente("simulado", transporte=transporte_simulado, dormir=lambda s: None)
    token, org = ler_token()
    if not token:
        sys.exit("Sem token: defina TREG_TOKEN ou ~/.treg/config.json")
    return TregCliente(token, org=org)


def _agora():
    return datetime.now(timezone.utc)


def _atualizados(leads, candidatos, porlead, agora, execucao_id):
    por_id = {l["id"]: l for l in leads}
    saida = []
    for c in candidatos:
        r = porlead.get(c["leadId"])
        if r and c["leadId"] in por_id:
            saida.append(aplicar(por_id[c["leadId"]], r, c["decisorIndex"], agora, execucao_id))
    return saida


def main(argv=None):
    ap = argparse.ArgumentParser(prog="enriquecer_leads")
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("limpar")
    p.add_argument("--entrada", required=True)
    p.add_argument("--saida", required=True)
    p.add_argument("--alteracoes", required=True)
    p = sub.add_parser("planejar")
    p.add_argument("--entrada", required=True)
    p.add_argument("--config")
    p.add_argument("--saida", required=True)
    p = sub.add_parser("executar")
    p.add_argument("--plano", required=True)
    p.add_argument("--entrada", required=True)
    p.add_argument("--saldo-micro", type=int, required=True)
    p.add_argument("--execucao", required=True)
    p.add_argument("--saida", required=True)
    p.add_argument("--simular", action="store_true")
    p.add_argument("--teto-micro", type=int, default=TETO_PADRAO_MICRO)
    p = sub.add_parser("recuperar")
    p.add_argument("--call-id", required=True)
    p.add_argument("--lead", required=True)
    p.add_argument("--entrada", required=True)
    p.add_argument("--saida", required=True)
    p.add_argument("--simular", action="store_true")
    a = ap.parse_args(argv)

    if a.cmd == "limpar":
        limpos, alt = limpar(_ler(a.entrada))
        _gravar(a.saida, limpos)
        _gravar(a.alteracoes, alt)
        resumo = {}
        for x in alt:
            resumo[x["tipo"]] = resumo.get(x["tipo"], 0) + 1
        print(json.dumps(resumo, ensure_ascii=False))
    elif a.cmd == "planejar":
        cands = selecionar(_ler(a.entrada), _agora())
        hist = (_ler(a.config).get("historicoExecucoes") if a.config and os.path.exists(a.config) else None) or []
        est = estimar(cands, hist)
        _gravar(a.saida, {"candidatos": cands, "estimativa": est})
        print(json.dumps(est, ensure_ascii=False))
    elif a.cmd == "executar":
        plano, leads = _ler(a.plano), _ler(a.entrada)
        cands = plano["candidatos"]
        pasta = os.path.dirname(os.path.abspath(a.saida))
        agora = _agora()

        def progresso(parc):
            _gravar(os.path.join(pasta, "progresso.json"),
                    {k: v for k, v in parc.items() if k != "porLead"} | {"candidatos": len(cands), "em": _agora().isoformat()})
            _gravar(os.path.join(pasta, "atualizados.json"),
                    _atualizados(leads, cands, parc["porLead"], agora, a.execucao))

        res = executar(cands, _cliente(a.simular), a.execucao, a.saldo_micro, teto_micro=a.teto_micro,
                       ao_fim_do_lote=progresso)
        _gravar(a.saida, res)
        _gravar(os.path.join(pasta, "atualizados.json"), _atualizados(leads, cands, res["porLead"], agora, a.execucao))
        print(json.dumps({k: v for k, v in res.items() if k != "porLead"}, ensure_ascii=False))
    elif a.cmd == "recuperar":
        leads = _ler(a.entrada)
        lead = next((l for l in leads if l.get("id") == a.lead), None)
        if lead is None:
            sys.exit(f"Lead {a.lead} não está em {a.entrada}")
        resp = recuperar_call(_cliente(a.simular), a.call_id)
        if not isinstance(resp, dict) or resp.get("stored") is False:
            sys.exit("O treg não guardou a resposta dessa chamada (stored: false); nada gravado. "
                     f"Nota do treg: {(resp or {}).get('note', '')}")
        corpo = resp.get("response")
        tel = extrair_telefone(corpo)
        alvo = decisor_alvo(lead)
        r = {"resultado": "achou" if tel else "nao_achou", "callIds": [a.call_id], "custoMicro": 0}
        if tel:
            r.update(telefone=tel, provedor=((corpo or {}).get("_treg") or {}).get("served_by", "desconhecido")
                     if isinstance(corpo, dict) else "desconhecido")
        novo = aplicar(lead, r, alvo[0] if alvo else 0, _agora(), f"recuperado-{a.call_id[:8]}")
        _gravar(a.saida, [novo])
        print(json.dumps({"leadId": a.lead, "resultado": r["resultado"]}))


if __name__ == "__main__":
    main()

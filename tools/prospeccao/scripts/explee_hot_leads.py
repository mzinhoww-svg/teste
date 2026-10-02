"""Hot leads da Explee na Central de disparo da Reiners.

Hot lead é quem respondeu uma campanha de cold e-mail da Explee com interesse de verdade. Só biblioteca
padrão. O script não acessa o banco da central: recebe e devolve JSON, e quem grava é o Claude (ArtifactData).
O HTTP fica atrás de `ExpleeCliente`, com transporte injetável.

    python3 -m scripts.explee_hot_leads buscar --since "2026-09-28T14:25:41Z" --saida dados/explee/hot.json
    python3 -m scripts.explee_hot_leads mapear --entrada dados/explee/hot.json --existentes dados/explee/leads.json \
        --saida dados/explee/mapa.json

A chave vem só de `EXPLEE_API_KEY` ou do arquivo `~/.explee/key`. Nunca imprimir nem gravar a chave.

Fatos da API conferidos (https://api.explee.com/public/api/v1/autogtm, cabeçalho `X-API-Key`):
- `GET /hot-leads?since=<ISO>&limit=50&offset=N` -> {leads, total, has_more, next_offset}; o `since` do servidor
  inclui o próprio instante, por isso o filtro estrito é feito aqui.
- `GET /projects` -> {projects: [{id, domain, ...}], total}.
- `GET /campaigns?project_id=N` -> {campaigns: [{id, project_id, name, status, ...}], total}.
- O Cloudflare da Explee devolve 403 (erro 1010) ao User-Agent padrão do urllib: mandamos um próprio.
"""
import argparse
import copy
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

from scripts.enriquecer_leads import _dominio, _parse_data, limpar_telefone

BASE_URL = "https://api.explee.com/public/api/v1/autogtm"
LIMITE = 50
PAGINAS_MAX = 200
TENTATIVAS = 3
USER_AGENT = "reiners-central/1.0"
HISTORICO_MAX = 100
ORDEM_BASE = 9000
FLAG = "hot lead Explee"
PENDENCIA = "Responder pelo e-mail da Explee ou ligar"
TIPO_HIST = "explee"
# Provedores de e-mail: o domínio não identifica a empresa.
DOMINIOS_GENERICOS = {"gmail.com", "hotmail.com", "outlook.com", "yahoo.com", "yahoo.com.br", "icloud.com",
                      "live.com", "bol.com.br", "uol.com.br", "terra.com.br", "msn.com"}
SENIOR = re.compile(r"(?i)\b(ceo|cfo|coo|cmo|cto|cio|chief|founder|co-?founder|fundador|fundadora|s[óo]ci[oa]|owner|"
                    r"propriet[áa]ri[oa]|president[ea]?|presidente|vice|vp|diretor|diretora|director|head|"
                    r"superintendente|managing|partner|dono|dona|administrador|administradora)\b")


# --------------------------------------------------------------------------- HTTP

class ExpleeErro(Exception):
    def __init__(self, status, msg=""):
        super().__init__(msg or f"HTTP {status}")
        self.status = status


def transporte_urllib(metodo: str, url: str, headers: dict):
    """(status, headers, bytes). Erros HTTP voltam como resposta, não como exceção."""
    req = urllib.request.Request(url, headers=headers, method=metodo)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, dict(r.headers.items()), r.read()
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers.items()), e.read()


def ler_chave(env=None, caminho="~/.explee/key"):
    """A chave da Explee: `EXPLEE_API_KEY` ou o arquivo `~/.explee/key`. Nunca imprimir nem gravar."""
    env = os.environ if env is None else env
    if (env.get("EXPLEE_API_KEY") or "").strip():
        return env["EXPLEE_API_KEY"].strip()
    try:
        with open(os.path.expanduser(caminho), encoding="utf-8") as fh:
            return fh.read().strip() or None
    except OSError:
        return None


def _header(headers: dict, nome: str):
    for k, v in (headers or {}).items():
        if k.lower() == nome.lower():
            return v
    return None


class ExpleeCliente:
    def __init__(self, chave, transporte=transporte_urllib, dormir=time.sleep, base=BASE_URL, tentativas=TENTATIVAS):
        self._chave = chave
        self.transporte, self.dormir, self.base, self.tentativas = transporte, dormir, base, tentativas

    def get(self, caminho: str, params: dict | None = None) -> dict:
        """GET com nova tentativa curta em 429 e 5xx (Retry-After ou 1, 2, 4 s). Erro nunca leva a chave."""
        qs = urllib.parse.urlencode({k: v for k, v in (params or {}).items() if v not in (None, "")})
        url = f"{self.base}{caminho}" + (f"?{qs}" if qs else "")
        # Sem User-Agent próprio o Cloudflare da Explee barra o urllib (erro 1010).
        headers = {"X-API-Key": self._chave or "", "Accept": "application/json", "User-Agent": USER_AGENT}
        for tentativa in range(self.tentativas + 1):
            try:
                status, hs, bruto = self.transporte("GET", url, headers)
            except (urllib.error.URLError, OSError) as e:
                status, hs, bruto = 0, {}, str(e).encode()
            if status == 429 or status >= 500 or status == 0:
                if tentativa < self.tentativas:
                    try:
                        espera = float(_header(hs, "Retry-After") or 2 ** tentativa)
                    except ValueError:
                        espera = float(2 ** tentativa)
                    self.dormir(min(espera, 30.0))
                    continue
            if not 200 <= status < 300:
                raise ExpleeErro(status, f"Explee respondeu {status} em {caminho}")
            try:
                return json.loads(bruto.decode("utf-8")) if bruto else {}
            except (ValueError, UnicodeDecodeError):
                raise ExpleeErro(status, f"Explee devolveu JSON inválido em {caminho}")
        raise AssertionError("inalcançável")

    def _paginar(self, caminho: str, chave_lista: str, params: dict) -> list[dict]:
        itens, offset = [], 0
        for _ in range(PAGINAS_MAX):
            pagina = self.get(caminho, {**params, "limit": LIMITE, "offset": offset})
            lote = pagina.get(chave_lista) or []
            itens.extend(lote)
            prox = pagina.get("next_offset")
            if not pagina.get("has_more") or not lote:
                break
            offset = prox if isinstance(prox, int) and prox > offset else offset + len(lote)
        return itens

    def hot_leads(self, since: str | None) -> list[dict]:
        return self._paginar("/hot-leads", "leads", {"since": since or None})

    def campanhas(self) -> dict:
        """{str(campaign_id): nome} de todos os projetos."""
        nomes = {}
        for p in self._paginar("/projects", "projects", {}):
            for c in self._paginar("/campaigns", "campaigns", {"project_id": p.get("id")}):
                if c.get("id") is not None:
                    nomes[str(c["id"])] = c.get("name") or ""
        return nomes


# --------------------------------------------------------------------------- buscar

def _iso(d: datetime) -> str:
    return d.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def buscar(cliente: ExpleeCliente, since: str | None) -> dict:
    """{leads, campanhas, maisRecente}. Só os hot leads estritamente depois de `since`.

    `maisRecente` é o maior `became_hot_at` devolvido; sem lead novo, repete `since` (o cursor não anda)."""
    corte = _parse_data(since) if since else None
    vistos, leads = set(), []
    for h in cliente.hot_leads(since):
        quando = _parse_data(h.get("became_hot_at"))
        if quando is None or (corte is not None and quando <= corte):
            continue
        chave = (h.get("person_id"), h.get("became_hot_at"))
        if chave in vistos:
            continue
        vistos.add(chave)
        leads.append(h)
    leads.sort(key=lambda h: _parse_data(h["became_hot_at"]))
    mais = max((h["became_hot_at"] for h in leads), key=_parse_data) if leads else (since or None)
    return {"leads": leads, "campanhas": cliente.campanhas(), "maisRecente": mais}


# --------------------------------------------------------------------------- mapear

def _email(v) -> str:
    return str(v or "").strip().lower()


def _texto(v) -> str:
    return str(v or "").replace("\r\n", "\n").replace("\r", "\n").strip()


# Cabeçalho do e-mail citado: "Em <data>, Fulano <x@y>\nescreveu:" (no máximo uma quebra), "On ... wrote:",
# "-----Original Message" ou "De:/From: ... @" (o Outlook quebra a linha depois do "De:").
_CITACAO = re.compile(r"(?im)^[ \t]*(?:em|on)\b[^\n]*(?:\n[^\n]*)?\b(?:escreveu|wrote):"
                      r"|^[ \t]*-{2,}\s*original message|^[ \t]*(?:de|from):[^\n]*(?:\n[^\n]*)?@")


def resposta_curta(texto: str) -> str:
    """A resposta da pessoa sem o e-mail citado ("Em ..., Fulano escreveu:" e linhas com ">")."""
    t = _texto(texto)
    cortes = [m.start() for m in [_CITACAO.search(t), re.search(r"(?m)^>", t)] if m]
    if cortes:
        t = t[:min(cortes)]
    return re.sub(r"\n{3,}", "\n\n", t).strip() or _texto(texto)


def primeiro_nome(nome: str) -> str:
    p = (nome or "").strip().split()
    return p[0][:1].upper() + p[0][1:] if p else ""


def papel_por_cargo(cargo: str) -> str:
    return "decisor" if SENIOR.search(cargo or "") else "geral"


def _campanha(h: dict, campanhas: dict) -> str:
    cid = h.get("campaign_id")
    return (campanhas or {}).get(str(cid)) or (f"#{cid}" if cid is not None else "Explee")


def _fonte(campanha: str) -> str:
    return f"Explee · campanha {campanha}"


def item_historico(h: dict, campanha: str) -> dict:
    return {"em": h.get("became_hot_at"), "texto": f"Respondeu na Explee (campanha {campanha}): "
                                                    f"{resposta_curta(h.get('why_hot'))}", "tipo": TIPO_HIST}


def bloco_explee(h: dict, campanha: str) -> dict:
    return {"personId": h.get("person_id"), "campanhaId": h.get("campaign_id"), "campanha": campanha,
            "quente": True, "quenteEm": h.get("became_hot_at"), "resposta": _texto(h.get("why_hot")),
            "respostaCurta": resposta_curta(h.get("why_hot")), "pessoa": (h.get("name") or "").strip(),
            "cargo": (h.get("job_title") or "").strip(), "email": _email(h.get("email")),
            "linkedin": h.get("linkedin_url") or ""}


def _contato(h: dict, kid: str, campanha: str, telefone: str) -> dict:
    return {"id": kid, "papel": papel_por_cargo(h.get("job_title")), "nome": (h.get("name") or "").strip(),
            "cargo": (h.get("job_title") or "").strip(), "telefone": telefone, "whatsapp": "?",
            "email": _email(h.get("email")), "linkedin": h.get("linkedin_url") or "", "fonte": _fonte(campanha),
            "confianca": "alta"}


def _proximo_k(contatos: list[dict]) -> str:
    nums = [int(m.group(1)) for c in contatos if (m := re.fullmatch(r"k(\d+)", str(c.get("id"))))]
    return f"k{max(nums, default=0) + 1}"


def _emails_do_lead(l: dict) -> set[str]:
    es = {_email(l.get("email"))} | {_email(c.get("email")) for c in l.get("contatos") or []}
    ex = (l.get("explee") or {}).get("email")
    if ex:
        es.add(_email(ex))
    return {e for e in es if e}


def _host(v: str) -> str:
    return _dominio(v or "")


def achar(h: dict, leads: dict) -> str | None:
    """Id do lead da central que corresponde ao hot lead: personId, depois e-mail, depois domínio do site."""
    pid = h.get("person_id")
    ids = [i for i in leads if i != "TESTE"]
    if pid:
        for i in ids:
            if (leads[i].get("explee") or {}).get("personId") == pid:
                return i
    email = _email(h.get("email"))
    if email:
        for i in ids:
            if email in _emails_do_lead(leads[i]):
                return i
    dom = _host(h.get("company_domain"))
    if dom and dom not in DOMINIOS_GENERICOS:
        for i in ids:
            if _host(leads[i].get("site")) == dom:
                return i
    return None


def _proximo_x(leads: dict) -> int:
    nums = [int(m.group(1)) for i in leads if (m := re.fullmatch(r"X(\d+)", str(i)))]
    return max(nums, default=0) + 1


def lead_novo(h: dict, campanha: str, num: int) -> dict:
    """Documento completo de um lead novo, no formato que a página espera (ver central/seed.py)."""
    dom = _host(h.get("company_domain"))
    email = _email(h.get("email"))
    tel = limpar_telefone(h.get("phone")) if h.get("phone") else ""
    nome = (h.get("company_name") or "").strip() or dom or (h.get("name") or "").strip()
    pessoa = (h.get("name") or "").strip()
    pend = [PENDENCIA]
    if h.get("phone") and not tel:
        pend.append(f"Telefone da Explee fora do padrão brasileiro: {h.get('phone')}")
    return {
        "ordem": ORDEM_BASE + num, "nome": nome, "saudacao": primeiro_nome(pessoa), "icp": "", "segmento": campanha,
        "categoria": "Explee", "faixa": "", "score": None, "bairro": "",
        "canal": "E-mail" if email else ("WhatsApp" if tel else ""),
        "telefone": tel, "email": email, "site": dom, "instagram": "", "fraseUnica": "", "flags": [FLAG],
        "versaoCopy": "", "toques": [], "foto": "",
        "etapa": 0, "situacao": "respondeu", "enviado1": None, "enviado2": None, "enviado3": None,
        "contatoAtivo": None,
        "perfil": {"especialidade": "", "porte": "", "cidade": "", "nota": None, "avaliacoes": None,
                   "fonteDados": "Explee", "fonteFrase": ""},
        "empresa": {}, "socios": [], "redes": {"linkedinEmpresa": "", "instagram": "", "youtube": ""},
        "decisores": [{"nome": pessoa, "cargo": (h.get("job_title") or "").strip(),
                       "linkedin": h.get("linkedin_url") or "", "fonte": _fonte(campanha)}] if pessoa else [],
        "contatos": [_contato(h, "k1", campanha, tel)],
        "sinais": [], "alertas": [], "pendencias": pend,
        "enriquecimento": {"status": "parcial"},
        "historico": [item_historico(h, campanha)],
        "explee": bloco_explee(h, campanha),
    }


def atualizar(lead: dict, h: dict, campanha: str) -> dict:
    """Só os campos que mudam num lead que já existe: historico, explee e (se a pessoa é nova) contatos.

    Nunca mexe em situacao, etapa, enviadoN nem contatoAtivo."""
    dados = {}
    hist = list(lead.get("historico") or [])
    item = item_historico(h, campanha)
    if not any(x.get("em") == item["em"] and x.get("texto") == item["texto"] and x.get("tipo") == item["tipo"]
               for x in hist):
        dados["historico"] = (hist + [item])[-HISTORICO_MAX:]
    atual = lead.get("explee") or {}
    novo = bloco_explee(h, campanha)
    t_atual, t_novo = _parse_data(atual.get("quenteEm")), _parse_data(novo["quenteEm"])
    if not atual or t_atual is None or (t_novo is not None and t_novo >= t_atual):
        if novo != atual:
            dados["explee"] = novo
    email = _email(h.get("email"))
    contatos = list(lead.get("contatos") or [])
    if email and email not in {_email(c.get("email")) for c in contatos}:
        tel = limpar_telefone(h.get("phone")) if h.get("phone") else ""
        dados["contatos"] = contatos + [_contato(h, _proximo_k(contatos), campanha, tel)]
    return dados


def _achatar(item: dict) -> dict:
    """Aceita o lead achatado ({id, ...campos}) ou no formato do banco ({id, data})."""
    if isinstance(item.get("data"), dict) and "nome" not in item:
        return {"id": item["id"], **item["data"]}
    return item


def mapear(entrada: dict, existentes: list[dict]) -> dict:
    """{novos: [{id, data}], atualizacoes: [{id, data}], ignorados: [...]}. Idempotente: rodar de novo com a
    central já gravada não cria nada nem repete histórico."""
    campanhas = entrada.get("campanhas") or {}
    leads = {}
    for x in existentes or []:
        x = _achatar(x)
        if x.get("id"):
            leads[x["id"]] = {k: v for k, v in x.items() if k != "id"}
    originais = copy.deepcopy(leads)
    novos_ids, tocados, ignorados = [], [], []
    hot = sorted(entrada.get("leads") or [], key=lambda h: (_parse_data(h.get("became_hot_at")) or datetime.min.replace(tzinfo=timezone.utc)))
    for h in hot:
        base_ign = {"personId": h.get("person_id"), "nome": h.get("name") or "", "empresa": h.get("company_name") or ""}
        if not h.get("person_id") or _parse_data(h.get("became_hot_at")) is None:
            ignorados.append({**base_ign, "motivo": "sem person_id ou became_hot_at"})
            continue
        campanha = _campanha(h, campanhas)
        alvo = achar(h, leads)
        if alvo is None:
            if not _email(h.get("email")) and not limpar_telefone(h.get("phone")):
                ignorados.append({**base_ign, "motivo": "sem e-mail e sem telefone"})
                continue
            num = _proximo_x(leads)
            lid = f"X{num:04d}"
            leads[lid] = lead_novo(h, campanha, num)
            novos_ids.append(lid)
            continue
        dados = atualizar(leads[alvo], h, campanha)
        if not dados:
            ignorados.append({**base_ign, "id": alvo, "motivo": "já importado"})
            continue
        leads[alvo].update(dados)
        if alvo not in novos_ids and alvo not in tocados:
            tocados.append(alvo)
    campos = ("historico", "explee", "contatos")
    atualizacoes = []
    for i in tocados:
        mud = {k: leads[i][k] for k in campos if k in leads[i] and leads[i].get(k) != originais[i].get(k)}
        if mud:
            atualizacoes.append({"id": i, "data": mud})
    return {"novos": [{"id": i, "data": leads[i]} for i in novos_ids], "atualizacoes": atualizacoes,
            "ignorados": ignorados}


# --------------------------------------------------------------------------- CLI

def _ler(caminho):
    with open(caminho, encoding="utf-8") as fh:
        return json.load(fh)


def _gravar(caminho, dados):
    pasta = os.path.dirname(os.path.abspath(caminho))
    os.makedirs(pasta, exist_ok=True)
    with open(caminho, "w", encoding="utf-8") as fh:
        json.dump(dados, fh, ensure_ascii=False, indent=1)


def main(argv=None, cliente=None):
    ap = argparse.ArgumentParser(prog="explee_hot_leads")
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("buscar")
    p.add_argument("--since", default="", help="ISO de config/explee.ultimoQuenteEm; vazio busca tudo")
    p.add_argument("--saida", required=True)
    p = sub.add_parser("mapear")
    p.add_argument("--entrada", required=True)
    p.add_argument("--existentes", required=True)
    p.add_argument("--saida", required=True)
    a = ap.parse_args(argv)

    if a.cmd == "buscar":
        if cliente is None:
            chave = ler_chave()
            if not chave:
                sys.exit("Sem chave da Explee: defina EXPLEE_API_KEY ou grave em ~/.explee/key")
            cliente = ExpleeCliente(chave)
        try:
            res = buscar(cliente, a.since.strip() or None)
        except ExpleeErro as e:
            sys.exit(str(e))
        _gravar(a.saida, res)
        print(json.dumps({"leads": len(res["leads"]), "campanhas": len(res["campanhas"]),
                          "maisRecente": res["maisRecente"]}, ensure_ascii=False))
    elif a.cmd == "mapear":
        res = mapear(_ler(a.entrada), _ler(a.existentes))
        _gravar(a.saida, res)
        print(json.dumps({"novos": len(res["novos"]), "atualizacoes": len(res["atualizacoes"]),
                          "ignorados": len(res["ignorados"])}, ensure_ascii=False))


if __name__ == "__main__":
    main()

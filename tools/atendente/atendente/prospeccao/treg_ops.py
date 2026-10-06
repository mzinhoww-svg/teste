"""Operações de alto nível no treg para a prospecção: Google Maps, decisores por domínio, celular e e-mail.

Recebem um `TregCliente` (scripts/enriquecer_leads.py) e devolvem dados já normalizados. Regras:
- Endpoints `treg.*` são roteados: o corpo leva tudo o que se sabe da pessoa; as opções de rota vão em cabeçalhos
  (`X-Treg-Route-Prefer|Exclude`), nunca no corpo.
- Resposta 200 com `output.phone == null`, `output.email == null` ou lista vazia é "não achou" (None ou []),
  não é erro.
- 402 por falta de saldo vira `SemSaldo`; outros erros HTTP sobem como `TregErro` para quem chamou decidir.
- Nenhum telefone, e-mail ou nome vai para log.
`registro(evento)` (opcional) recebe `{etapa, provedor, custoMicro, achou}` de cada chamada feita, inclusive das
que não acharam: é o que a bancada usa para medir acerto e custo por provedor."""
import re

from scripts.enriquecer_leads import TregErro, extrair_telefone
from msg.enriquecimento import telefone_valido

EP_MAPS = "treg.google.serp.maps"
EP_PESSOAS = "treg.people.search"
EP_CELULAR = "treg.people.phone.find"
EP_EMAIL = "treg.people.email.find"

_CELULAR = re.compile(r"55[1-9]\d9\d{8}")
_EMAIL = re.compile(r"[^@\s]+@[^@\s]+\.[^@\s]+")


class SemSaldo(Exception):
    """O treg recusou por falta de saldo pré-pago (402). A rodada deve parar com esta mensagem."""

    def __init__(self, msg="Saldo do treg insuficiente: recarregue para continuar."):
        super().__init__(msg)


def _chamar(cli, endpoint, corpo, max_micro, chave, cabecalhos=None):
    try:
        if cabecalhos:
            return cli.chamar(endpoint, corpo, max_micro, chave, cabecalhos=cabecalhos)
        return cli.chamar(endpoint, corpo, max_micro, chave)
    except TregErro as e:
        if e.sem_saldo:
            raise SemSaldo() from None
        raise


def _output(resp) -> dict:
    corpo = resp.get("corpo")
    out = corpo.get("output") if isinstance(corpo, dict) else None
    return out if isinstance(out, dict) else {}


def _primeiro(d: dict, *chaves) -> str:
    for k in chaves:
        v = d.get(k)
        if isinstance(v, list):
            v = next((x for x in v if isinstance(x, str) and x.strip()), None)
        if isinstance(v, (str, int)) and not isinstance(v, bool) and str(v).strip():
            return str(v).strip()
    return ""


def _lista(out: dict, *chaves) -> list:
    for k in chaves:
        v = out.get(k)
        if isinstance(v, list):
            return [x for x in v if isinstance(x, dict)]
    return []


def _registrar(registro, etapa, resp, achou):
    if registro:
        registro({"etapa": etapa, "provedor": resp.get("provedor") or "desconhecido",
                  "custoMicro": int(resp.get("custoMicro") or 0), "achou": bool(achou)})


def cabecalhos_de_ordem(ordem) -> dict:
    """["aiark", "wiza", "-lusha"] → Prefer "aiark,wiza" e Exclude "lusha". Lista vazia: roteamento padrão."""
    prefer = [p.strip() for p in ordem or [] if p and p.strip() and not p.strip().startswith("-")]
    exclude = [p.strip()[1:].strip() for p in ordem or [] if p and p.strip().startswith("-") and p.strip()[1:].strip()]
    h = {}
    if prefer:
        h["X-Treg-Route-Prefer"] = ",".join(prefer)
    if exclude:
        h["X-Treg-Route-Exclude"] = ",".join(exclude)
    return h


def _corpo_pessoa(pessoa: dict) -> dict:
    """Tudo o que se sabe da pessoa, nos nomes de campo dos endpoints roteados `treg.people.*`."""
    nome = " ".join(str(pessoa.get("nome") or "").split())
    partes = nome.split(" ", 1)
    corpo = {"full_name": nome, "first_name": partes[0] if nome else "",
             "last_name": partes[1] if len(partes) > 1 else "",
             "domain": pessoa.get("dominio") or "", "company_name": pessoa.get("empresa") or "",
             "linkedin_url": pessoa.get("linkedin") or "", "country": "br"}
    return {k: v for k, v in corpo.items() if v}


def maps(cli, consulta: str, cidade: str, max_micro: int, chave: str, registro=None) -> list[dict]:
    """Lugares do Google Maps em uma cidade de MT: [{nome, endereco, telefone, site, categoria, place_id}].
    Telefone normalizado (55 + DDD) ou "" se não for número brasileiro válido."""
    q = f"{consulta} em {cidade} - MT"
    resp = _chamar(cli, EP_MAPS, {"q": q, "country": "br", "language": "pt"}, max_micro, chave)
    saida = []
    for p in _lista(_output(resp), "places", "local_results", "results"):
        nome = _primeiro(p, "title", "name", "nome")
        if not nome:
            continue
        saida.append({"nome": nome,
                      "endereco": _primeiro(p, "address", "endereco", "formatted_address"),
                      "telefone": telefone_valido(_primeiro(p, "phoneNumber", "phone", "phone_number", "telefone")),
                      "site": _primeiro(p, "website", "site", "url"),
                      "categoria": _primeiro(p, "category", "type", "categories", "categoria"),
                      "place_id": _primeiro(p, "placeId", "place_id", "cid", "data_id")})
    _registrar(registro, "maps", resp, bool(saida))
    return saida


def decisores(cli, dominio: str, cargos: list[str], max_micro: int, chave: str, registro=None, limite: int = 3) -> list[dict]:
    """Pessoas da empresa (pelo domínio) com os cargos pedidos: [{nome, cargo, linkedin}].
    O `treg.people.search` aceita UM cargo por chamada (`title`); uma chamada por cargo, sem repetir pessoa.
    `limite` = linhas por chamada (a maioria dos provedores cobra por linha)."""
    saida, vistos = [], set()
    for i, cargo in enumerate(list(cargos or []) or [""]):
        corpo = {"company_domain": dominio, "country": "br", "limit": limite}
        if cargo:
            corpo["title"] = cargo
        resp = _chamar(cli, EP_PESSOAS, corpo, max_micro, f"{chave}-{i}")
        achou = False
        for p in _lista(_output(resp), "people", "persons", "results", "contacts"):
            nome = _primeiro(p, "name", "full_name", "nome")
            if not nome or nome.casefold() in vistos:
                continue
            vistos.add(nome.casefold())
            achou = True
            saida.append({"nome": nome, "cargo": _primeiro(p, "title", "job_title", "position", "cargo"),
                          "linkedin": _primeiro(p, "linkedin_url", "linkedin", "linkedin_profile")})
        _registrar(registro, "decisores", resp, achou)
    return saida


def celular(cli, pessoa: dict, ordem: list[str], max_micro: int, chave: str, registro=None) -> dict | None:
    """Celular da pessoa (55 + DDD + 9 + 8 dígitos) ou None. Fixo e número inválido contam como "não achou".
    `ordem` vira `X-Treg-Route-Prefer` (nomes) e `X-Treg-Route-Exclude` (nomes com "-" na frente)."""
    resp = _chamar(cli, EP_CELULAR, _corpo_pessoa(pessoa), max_micro, chave, cabecalhos_de_ordem(ordem))
    out = _output(resp)
    tel = extrair_telefone({"output": out}) if out else ""
    achou = bool(tel and _CELULAR.fullmatch(tel))
    _registrar(registro, "celular", resp, achou)
    if not achou:
        return None
    return {"telefone": tel, "provedor": resp.get("provedor") or "desconhecido",
            "custoMicro": int(resp.get("custoMicro") or 0)}


def email(cli, pessoa: dict, max_micro: int, chave: str, registro=None, ordem=None) -> dict | None:
    """E-mail profissional da pessoa ou None (vazio ou fora do formato contam como "não achou")."""
    resp = _chamar(cli, EP_EMAIL, _corpo_pessoa(pessoa), max_micro, chave, cabecalhos_de_ordem(ordem))
    valor = _primeiro(_output(resp), "email", "work_email", "emails").lower()
    achou = bool(_EMAIL.fullmatch(valor))
    _registrar(registro, "email", resp, achou)
    if not achou:
        return None
    return {"email": valor, "provedor": resp.get("provedor") or "desconhecido",
            "custoMicro": int(resp.get("custoMicro") or 0)}

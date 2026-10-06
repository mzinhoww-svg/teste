"""Contato da pessoa: a cascata do mais barato ao mais caro, parando no primeiro celular achado (spec 5, passos 3 e 4).

1. Telefone do cadastro da Receita (grátis), só para sócio vindo da Receita, só depois do filtro de contabilidade
   (`cnpj_mt.provavel_contabilidade`, seção 5.1), só se for celular e, com o WA-AKG à mão, só se tiver WhatsApp.
2. `treg_ops.celular` na ordem da F0 (`ORDEM_CELULAR`), só com LinkedIn ou domínio (sem nenhum dos dois não há como
   achar e não se paga) e só se couber no orçamento.
3. E-mail: o do cadastro só vale no domínio da própria empresa (o resto costuma ser do contador); senão
   `treg_ops.email`, que também passa pelo filtro de contabilidade.
Quem está na lista de saída nunca é consultado (nem no WA-AKG). Telefone e e-mail não vão para log.

Devolve {celular, email, fonte, fonteEmail, custoMicro, semOrcamento}; `fonte` é "receita:cadastro" ou
"treg:<provedor>". `SemSaldo` (402) sobe para o ciclo parar a rodada.
"""
from scripts.classificar_base import HOSTS_GENERICOS
from scripts.enriquecer_leads import _dominio

from . import cnpj_mt, treg_ops
from .qualificar import normalizar_celular

CELULAR_MAX = 150_000          # wiza ≈ US$ 0,12 é o mais caro da cascata; lusha (US$ 0,75) fica de fora
EMAIL_MAX = 10_000
ORDEM_CELULAR = ["aiark", "wiza", "-lusha"]   # provisória: a ordem final sai do relatório da F0 (bancada)


def _dominio_de(valor) -> str:
    v = str(valor or "").strip().lower()
    d = v.rsplit("@", 1)[1] if "@" in v else _dominio(v)
    return "" if not d or d in HOSTS_GENERICOS or d in cnpj_mt.WEBMAIL else d


def _telefones(empresa: dict) -> list[str]:
    tels = list(empresa.get("telefones") or [])
    if empresa.get("telefone"):
        tels.append(empresa["telefone"])
    return list(dict.fromkeys(str(t) for t in tels if t))


def _whatsapp(wa, numero) -> bool:
    if wa is None:
        return True
    try:
        return bool((wa.verificar([numero]) or {}).get(numero))
    except Exception:  # WA-AKG fora do ar: aceita; o qualificar confere de novo antes da cadência
        return True


def _celular_do_cadastro(repo, wa, empresa: dict):
    for t in _telefones(empresa):
        n = normalizar_celular(t)
        if not n or repo.sair_tem(n):
            continue
        if cnpj_mt.provavel_contabilidade(repo, telefone=n, cnae_da_empresa=empresa.get("cnae")):
            continue
        if _whatsapp(wa, n):
            return n
    return None


def _email_do_cadastro(repo, empresa: dict):
    e = str(empresa.get("email") or "").strip().lower()
    dom = _dominio_de(empresa.get("dominio") or empresa.get("site"))
    if not e or not dom or _dominio_de(e) != dom or repo.sair_tem(e):
        return None
    if cnpj_mt.provavel_contabilidade(repo, email=e, cnae_da_empresa=empresa.get("cnae")):
        return None
    return e


def enriquecer(repo, cli, wa, pessoa: dict, empresa: dict, orcamento, ordem=None, registro=None) -> dict:
    out = {"celular": None, "email": None, "fonte": "", "fonteEmail": "", "custoMicro": 0, "semOrcamento": False}

    def reg(evento):
        orcamento.registrar(evento)
        out["custoMicro"] += int(evento.get("custoMicro") or 0)
        if registro:
            registro(evento)

    dominio = pessoa.get("dominio") or empresa.get("dominio") or ""
    alvo = {"nome": pessoa.get("nome"), "dominio": dominio, "linkedin": pessoa.get("linkedin") or "",
            "empresa": pessoa.get("empresa") or empresa.get("nome") or ""}
    pode_pagar = bool(alvo["linkedin"] or dominio)
    chave = pessoa.get("chavePessoa") or empresa.get("cnpj") or alvo["nome"]

    # 1 e 2: celular
    if str(pessoa.get("fonte") or "").startswith("receita"):
        n = _celular_do_cadastro(repo, wa, empresa)
        if n:
            out.update(celular=n, fonte="receita:cadastro")
    if out["celular"] is None and pode_pagar:
        if orcamento.cabe(CELULAR_MAX):
            r = treg_ops.celular(cli, alvo, ordem if ordem is not None else ORDEM_CELULAR, CELULAR_MAX,
                                 f"prosp-cel-{chave}", registro=reg)
            if r and not repo.sair_tem(r["telefone"]):
                out.update(celular=r["telefone"], fonte=f"treg:{r['provedor']}")
        else:
            out["semOrcamento"] = True

    # 3: e-mail (só coletado e guardado; o canal agora é o WhatsApp)
    e = _email_do_cadastro(repo, empresa)
    if e:
        out.update(email=e, fonteEmail="receita:cadastro")
    elif pode_pagar:
        if orcamento.cabe(EMAIL_MAX):
            r = treg_ops.email(cli, alvo, EMAIL_MAX, f"prosp-mail-{chave}", registro=reg)
            if r and not repo.sair_tem(r["email"]) and not cnpj_mt.provavel_contabilidade(repo, email=r["email"]):
                out.update(email=r["email"], fonteEmail=f"treg:{r['provedor']}")
        else:
            out["semOrcamento"] = True
    return out

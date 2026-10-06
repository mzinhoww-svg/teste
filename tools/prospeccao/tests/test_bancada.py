"""Teste de bancada (F0): mede acerto e custo por provedor sem gastar dinheiro nem usar a rede.

Transporte falso no formato real do treg (`{output, raw, _treg: {served_by, tried}}`, custo em
`X-Treg-Cost-Micro`, "não achou" = 200 com `output.phone == null`). Números fictícios 55659999000NN."""
import json
import re

from scripts import bancada
from scripts.enriquecer_leads import TregCliente


def _amostra(n=4):
    return [{"nome": f"Pessoa{i} Exemplo", "dominio": f"empresa{i}.com.br", "empresa": f"Empresa {i}",
             "linkedin": f"https://www.linkedin.com/in/pessoa{i}-exemplo"} for i in range(1, n + 1)]


class Transporte:
    def __init__(self, regra):
        self.regra, self.chamadas = regra, []

    def __call__(self, metodo, url, headers, corpo):
        ep = url.rsplit("/", 1)[-1]
        self.chamadas.append({"endpoint": ep, "headers": dict(headers)})
        status, hs, body = self.regra(ep, headers)
        return status, hs, json.dumps(body).encode()


def _resp(provedor, output, custo):
    return 200, {"X-Treg-Cost-Micro": str(custo), "X-Treg-Served-By": provedor}, \
        {"output": output, "raw": {}, "_treg": {"served_by": provedor, "tried": [provedor]}}


def _cli(regra):
    t = Transporte(regra)
    return TregCliente("tok-de-teste-inventado", transporte=t, dormir=lambda s: None), t


def _prefer(headers):
    return (headers.get("X-Treg-Route-Prefer") or "roteado").split(",")[0]


def test_bancada_mede_por_provedor_e_etapa():
    def regra(ep, h):
        p = _prefer(h)
        if ep == "treg.people.email.find":
            return _resp("trykitt", {"email": "pessoa@empresa-exemplo.com.br"}, 5_000)
        if p == "wiza":
            return _resp("wiza", {"phone": "5565999900001"}, 120_000)
        return _resp(p, {"phone": None}, 0)

    cli, t = _cli(regra)
    rel = bancada.rodar(_amostra(4), cli, provedores=["aiark", "wiza"], teto_micro=3_000_000)
    cel = rel["por_etapa"]["celular"]
    assert cel["wiza"] == {"tentativas": 4, "achados": 4, "taxa": 1.0, "custo_usd": 0.48, "erros": 0,
                           "servido_por_outro": 0, "custo_por_achado_usd": 0.12}
    assert cel["aiark"]["tentativas"] == 4 and cel["aiark"]["achados"] == 0 and cel["aiark"]["custo_usd"] == 0
    assert rel["por_etapa"]["email"]["trykitt"]["achados"] == 4
    assert rel["motivo_parada"] is None and rel["pessoas_testadas"] == 4
    # cada provedor isolado: prefere ele e exclui os outros
    h = next(c["headers"] for c in t.chamadas if c["headers"].get("X-Treg-Route-Prefer") == "aiark")
    assert h["X-Treg-Route-Exclude"] == "wiza"


def test_bancada_para_no_teto():
    cli, t = _cli(lambda ep, h: _resp(_prefer(h), {"phone": "5565999900002"}, 120_000))
    rel = bancada.rodar(_amostra(10), cli, provedores=["wiza"], teto_micro=500_000, max_celular_micro=150_000,
                        etapas=("celular",))
    assert rel["motivo_parada"] == "teto"
    assert rel["gasto_usd"] <= 0.5
    assert len(t.chamadas) == 3                      # 0,36 + 0,15 de reserva passaria de 0,50


def test_bancada_para_sem_saldo_com_mensagem():
    cli, _ = _cli(lambda ep, h: (402, {}, {"error": "insufficient_balance", "balance_micro": 0}))
    rel = bancada.rodar(_amostra(3), cli, provedores=["aiark"], teto_micro=3_000_000)
    assert rel["motivo_parada"] == "saldo insuficiente"


def test_bancada_erro_de_um_provedor_nao_derruba():
    def regra(ep, h):
        if _prefer(h) == "aiark":
            return 500, {}, {"error": "upstream"}
        return _resp(_prefer(h), {"phone": None}, 0)

    cli, _ = _cli(regra)
    rel = bancada.rodar(_amostra(2), cli, provedores=["aiark", "tomba"], teto_micro=3_000_000, etapas=("celular",))
    assert rel["por_etapa"]["celular"]["aiark"]["erros"] == 2
    assert rel["por_etapa"]["celular"]["tomba"]["tentativas"] == 2


def test_relatorio_sem_pii(tmp_path):
    amostra = tmp_path / "amostra.json"
    amostra.write_text(json.dumps(_amostra(6)), encoding="utf-8")
    saida = tmp_path / "relatorio.json"
    assert bancada.main(["--amostra", str(amostra), "--teto-usd", "3", "--saida", str(saida), "--simular"]) == 0
    texto = saida.read_text(encoding="utf-8")
    assert not re.search(r"\d{8,}", texto)
    assert "@" not in texto
    assert "Pessoa" not in texto and "linkedin" not in texto.lower() and "empresa1" not in texto
    rel = json.loads(texto)
    assert rel["pessoas"] == 6
    assert sum(v["tentativas"] for v in rel["por_etapa"]["celular"].values()) == 6 * len(bancada.PROVEDORES_CELULAR)


def test_simulador_no_formato_real_e_numeros_ficticios():
    cli = bancada.cliente_simulado()
    r = cli.chamar("treg.people.phone.find", {"full_name": "x"}, 150_000, "bancada-0-celular-wiza",
                   cabecalhos={"X-Treg-Route-Prefer": "wiza"})
    assert set(r["corpo"]) == {"output", "raw", "_treg"}
    tel = r["corpo"]["output"]["phone"]
    assert tel is None or re.fullmatch(r"55659999000\d\d", tel)

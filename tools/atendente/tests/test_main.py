"""Montagem do serviço a partir do ambiente: endereço do WA-AKG e semente da primeira subida."""
import pytest

from atendente import __main__ as principal
from scripts import wa_akg


@pytest.mark.parametrize("entrada,esperado", [
    ("http://app:3000", "http://app:3000/api"),
    ("http://app:3000/", "http://app:3000/api"),
    ("https://wa.reiners.agency/api", "https://wa.reiners.agency/api"),
    ("https://wa.reiners.agency/api/", "https://wa.reiners.agency/api"),
    ("", ""),
])
def test_url_api_acrescenta_api_uma_vez(entrada, esperado):
    assert principal.url_api(entrada) == esperado


def test_cliente_do_main_chama_api_sessions():
    visto = []

    def transporte(metodo, url, headers, corpo=None):
        visto.append(url)
        return 200, {}, b'[{"sessionId": "s1", "status": "Connected"}]'

    cli = principal.montar_wa({"wa_url": "http://app:3000", "wa_chave": "k", "wa_sessao": "s1"}, transporte=transporte)
    assert isinstance(cli, wa_akg.WaAkgCliente)
    assert cli.conectado() is True
    assert visto == ["http://app:3000/api/sessions"]


def test_semente_primeira_subida_fica_aguardando_e_nao_sobrescreve():
    class Repo:
        def __init__(self, dados):
            self.dados = dict(dados)

        def config_get(self, k, padrao=None):
            return self.dados.get(k, padrao)

        def config_set(self, k, v):
            self.dados[k] = v

    novo = Repo({})
    principal.semear_config(novo)
    assert novo.dados == {"status": "aguardando", "auto_resposta": False, "por_lote": 5, "limite_dia": 50}
    existente = Repo({"status": "ativo", "auto_resposta": True, "por_lote": 8})
    principal.semear_config(existente)
    assert existente.dados == {"status": "ativo", "auto_resposta": True, "por_lote": 8, "limite_dia": 50}

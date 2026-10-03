import json
import re

import pytest

from msg.checks import LIMITE_WHATS, _termo_proibido, tem_emoji
from msg.copy_posvenda import ETAPAS, PRODUTOS, compor, doc_config, linhas_copy

QUANDO = "sexta, 09/10, às 14h"


@pytest.mark.parametrize("produto", list(PRODUTOS))
@pytest.mark.parametrize("etapa", [e["n"] for e in ETAPAS])
def test_toda_mensagem_compoe_limpa(etapa, produto):
    texto = compor(etapa, "pessoal da Exemplo", produto, QUANDO)
    assert not re.search(r"[{}]", texto)
    assert "—" not in texto and not tem_emoji(texto)
    assert _termo_proibido(texto) is None
    assert len(texto) <= LIMITE_WHATS
    assert texto.startswith("Oi, pessoal da Exemplo,")


def test_etapas_em_ordem_e_com_regra_de_prazo():
    assert [e["n"] for e in ETAPAS] == list(range(1, 8))
    for e in ETAPAS:
        assert e["quando"] in ("imediato", "data") or isinstance(e["quando"], int)
        if e["quando"] == "data":
            assert e["campoData"] in ("dataKickoff", "dataGravacao")
            assert "{quando}" in e["texto"]


def test_produto_muda_local_entrega_e_recorrencia():
    assert "na sede de vocês" in compor(4, "Ana", "Podcast In Loco", QUANDO)
    assert "aqui no estúdio" in compor(4, "Ana", "Hora de Estúdio", QUANDO)
    assert "arquivos da gravação" in compor(6, "Ana", "Hora de Estúdio")
    assert "pauta do próximo" in compor(7, "Ana", "BTS Recorrente")
    assert "formato mensal" in compor(7, "Ana", "Episódio piloto")


def test_preco_nao_aparece_no_pos_venda():
    for e in ETAPAS:
        assert not re.search(r"R\$|desconto|grátis", e["texto"], re.IGNORECASE)


def test_config_vai_para_o_banco_e_para_a_planilha():
    json.dumps(doc_config(), ensure_ascii=False)
    assert len([l for l in linhas_copy() if l[0].startswith("Etapa")]) == 7

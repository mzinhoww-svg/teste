import os
import sys

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(os.path.dirname(AQUI))            # tools/
for p in (os.path.join(RAIZ, "atendente"), os.path.join(RAIZ, "prospeccao")):
    if p not in sys.path:
        sys.path.insert(0, p)


import pytest


@pytest.fixture(autouse=True)
def _sonda_desligada_por_padrao(monkeypatch):
    """Em produção a sonda "Olá" vem ligada; os testes antigos de ritmo não a esperam. Quem testa a sonda liga `sonda_ola`."""
    from atendente import sonda
    monkeypatch.setattr(sonda, "ligada", lambda repo: bool(repo.config_get("sonda_ola", False)))

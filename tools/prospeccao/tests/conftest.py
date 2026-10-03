import json

import pytest

from msg.checks import Personal
from msg.prep import Lead


def lead(**kw) -> Lead:
    base = dict(id="R0001", icp="ICP2", nome="Escritório Exemplo Advogados", categoria="Advocacia",
                bairro="Centro", cidade="Cuiabá", telefone="5565999991111", celular=True,
                email="contato@exemplo.com.br", especialidade="advocacia empresarial e tributária",
                porte="médio", score=90, faixa="A")
    base.update(kw)
    return Lead(**base)


def personal(**kw) -> Personal:
    base = dict(id="R0001", saudacao="pessoal da Exemplo Advogados", nome_curto="Exemplo Advogados",
                frase="Escritório de direito empresarial e tributário explica muita coisa difícil para o cliente todos os dias.",
                fonte="Especialidade")
    base.update(kw)
    return Personal(**base)


@pytest.fixture
def arquivos(tmp_path):
    """leads.json e personal.json mínimos: um WhatsApp, um e-mail e um sem canal."""
    leads = [
        lead().to_dict(),
        lead(id="R0002", icp="ICP1", nome="Clínica Exemplo", telefone="556530000000", celular=False,
             email="contato@clinica.com.br", especialidade="clínica de dermatologia").to_dict(),
        lead(id="R0003", icp="ICP5", nome="Sem Canal", telefone="", celular=False, email="").to_dict(),
    ]
    pers = [
        personal().__dict__,
        personal(id="R0002", saudacao="pessoal da Clínica Exemplo", nome_curto="Clínica Exemplo",
                 frase="Uma clínica de dermatologia responde as mesmas dúvidas toda semana, e isso vira conteúdo.").__dict__,
    ]
    lp, pp = tmp_path / "leads.json", tmp_path / "personal.json"
    lp.write_text(json.dumps(leads, ensure_ascii=False), encoding="utf-8")
    pp.write_text(json.dumps(pers, ensure_ascii=False), encoding="utf-8")
    return str(lp), str(pp)

"""CNPJ aberto de MT: importação em fluxo e filtro de contabilidade (spec 5.1).

Tudo sintético, no layout real da Receita: CSV sem cabeçalho, separador ';', campos entre aspas,
latin-1, dentro de ZIPs Estabelecimentos*/Empresas*/Socios*/Municipios*. Telefones: 55659999000NN.
"""
import io
import json
import tracemalloc
import zipfile
from datetime import datetime, timezone

import pytest

from atendente.prospeccao import cnpj_mt

AGORA = datetime(2026, 10, 7, 12, 0, tzinfo=timezone.utc)
CUIABA = "9067"
VARZEA = "9167"


class RepoFalso:
    """Só o que a Tarefa 3 vai expor: cnpj_put(doc)."""

    def __init__(self):
        self.cnpj = {}

    def cnpj_put(self, doc):
        self.cnpj[doc["cnpj"]] = json.loads(json.dumps(doc))   # cópia, como o SQLite faria

    def cnpjs(self, filtro=None):
        return list(self.cnpj.values())


def _linha(campos):
    return ";".join('"' + c.replace('"', '""') + '"' for c in campos) + "\r\n"


def estab(basico, *, ordem="0001", dv="00", fantasia="", situacao="02", cnae="4711302", uf="MT",
          municipio=CUIABA, ddd="65", tel="", ddd2="", tel2="", email=""):
    c = [""] * 30
    c[0], c[1], c[2], c[3] = basico, ordem, dv, "1"
    c[4], c[5], c[6] = fantasia, situacao, "20200101"
    c[10], c[11], c[12] = "20150101", cnae, ""
    c[13], c[14], c[15], c[17], c[18] = "RUA", "TESTE", "1", "CENTRO", "78000000"
    c[19], c[20] = uf, municipio
    c[21], c[22], c[23], c[24] = (ddd if tel else ""), tel, ddd2, tel2
    c[27] = email
    return c


def empresa(basico, razao, porte="01"):
    return [basico, razao, "2062", "49", "10000,00", porte, ""]


def socio(basico, nome, *, tipo="2", doc="***123456**", qualif="49", faixa="5"):
    return [basico, tipo, nome, doc, qualif, "20150101", "", "***000000**", "", "00", faixa]


def _zip(pasta, nome, membro, linhas):
    with zipfile.ZipFile(pasta / nome, "w", zipfile.ZIP_DEFLATED) as z:
        with z.open(membro, "w") as f:
            for c in linhas:
                f.write(_linha(c).encode("latin-1"))


def montar(pasta, estabs, empresas, socios, municipios=((CUIABA, "CUIABA"), (VARZEA, "VARZEA GRANDE"))):
    _zip(pasta, "Estabelecimentos0.zip", "K3241.K03200Y0.D41011.ESTABELE", estabs)
    _zip(pasta, "Empresas0.zip", "K3241.K03200Y0.D41011.EMPRECSV", empresas)
    _zip(pasta, "Socios0.zip", "K3241.K03200Y0.D41011.SOCIOCSV", socios)
    _zip(pasta, "Municipios.zip", "F.K03200$Z.D41011.MUNICCSV", [list(m) for m in municipios])
    return str(pasta)


def tel(nn):
    return "9999000" + nn[-2:].rjust(2, "0")      # com o DDD 65 vira 55659999000NN


@pytest.fixture
def pasta(tmp_path):
    estabs = [
        estab("10000001", fantasia="MERCADO UM", tel=tel("01"), email="dono@mercadoum.com.br"),
        estab("10000002", fantasia="FECHADO", situacao="08", tel=tel("02")),
        estab("10000003", fantasia="OUTRO ESTADO", uf="SP", municipio="7107", tel=tel("03")),
        estab("10000004", fantasia="OUTRO CNAE", cnae="5611201", tel=tel("04")),
        estab("10000005", fantasia="MERCADO VG", municipio=VARZEA, tel=tel("05")),
        estab("10000006", fantasia="AÇOUGUE SÃO JOSÉ", tel=tel("06")),
    ]
    empresas = [empresa(b, f"EMPRESA {b} LTDA") for b in
                ("10000001", "10000002", "10000003", "10000004", "10000005", "10000006")]
    empresas[0] = empresa("10000001", "MERCADO UM LTDA", porte="03")
    socios = [
        socio("10000001", "FULANO DE TESTE", qualif="49", faixa="5", doc="***987654**"),
        socio("10000001", "HOLDING TESTE SA", tipo="1", doc="20000001000100", qualif="22", faixa="0"),
        socio("10000003", "NAO DEVE APARECER"),
    ]
    return montar(tmp_path, estabs, empresas, socios)


def test_so_mt_ativas_e_cnae(pasta):
    repo = RepoFalso()
    r = cnpj_mt.importar(pasta, repo, ["4711-3/02"], None, AGORA)
    assert sorted(repo.cnpj) == ["10000001000100", "10000005000100", "10000006000100"]
    assert r == {"lidos": 6, "mantidos": 3, "ignorados": 3}
    d = repo.cnpj["10000001000100"]
    assert d["razao"] == "MERCADO UM LTDA"
    assert d["fantasia"] == "MERCADO UM"
    assert d["cnae"] == "4711302"
    assert d["municipio"] == "CUIABA"
    assert d["uf"] == "MT"
    assert d["porte"] == "epp"
    assert d["telefone"] == "55659999000" + "01"
    assert d["email"] == "dono@mercadoum.com.br"
    assert repo.cnpj["10000006000100"]["fantasia"] == "AÇOUGUE SÃO JOSÉ"    # latin-1 lido certo


def test_filtro_de_municipio_aceita_nome_sem_acento_ou_codigo(pasta):
    repo = RepoFalso()
    cnpj_mt.importar(pasta, repo, ["4711302"], ["Várzea Grande"], AGORA)
    assert sorted(repo.cnpj) == ["10000005000100"]
    repo2 = RepoFalso()
    cnpj_mt.importar(pasta, repo2, ["4711302"], [CUIABA], AGORA)
    assert sorted(repo2.cnpj) == ["10000001000100", "10000006000100"]


def test_socios_com_qualificacao_e_faixa(pasta):
    repo = RepoFalso()
    cnpj_mt.importar(pasta, repo, ["4711302"], None, AGORA)
    socios = repo.cnpj["10000001000100"]["socios"]
    pf = next(s for s in socios if s["tipo"] == "pf")
    assert pf == {"nome": "FULANO DE TESTE", "qualificacao": "Sócio-Administrador", "faixa_etaria": "41-50",
                  "tipo": "pf"}
    assert repo.cnpj["10000005000100"]["socios"] == []


def test_socio_pessoa_juridica_tipo_pj(pasta):
    repo = RepoFalso()
    cnpj_mt.importar(pasta, repo, ["4711302"], None, AGORA)
    pj = next(s for s in repo.cnpj["10000001000100"]["socios"] if s["nome"] == "HOLDING TESTE SA")
    assert pj["tipo"] == "pj"
    assert pj["cnpj"] == "20000001000100"     # dá para subir um nível; CNPJ de empresa não é dado pessoal
    assert pj["faixa_etaria"] == ""


def test_cpf_mascarado_nao_vaza(pasta):
    repo = RepoFalso()
    cnpj_mt.importar(pasta, repo, ["4711302"], None, AGORA)
    texto = json.dumps(repo.cnpj, ensure_ascii=False)
    assert "***" not in texto and "987654" not in texto and "123456" not in texto
    for s in repo.cnpj["10000001000100"]["socios"]:
        if s["tipo"] != "pj":
            assert "cnpj" not in s and "cpf" not in s


def test_lixo_e_linha_curta_nao_derrubam(tmp_path):
    estabs = [["curta", "demais"], estab("10000001", tel=tel("01"))]
    pasta = montar(tmp_path, estabs, [empresa("10000001", "X LTDA")], [])
    repo = RepoFalso()
    r = cnpj_mt.importar(pasta, repo, ["4711302"], None, AGORA)
    assert r == {"lidos": 2, "mantidos": 1, "ignorados": 1}


def test_telefone_fixo_e_sujo_normalizados(tmp_path):
    estabs = [estab("10000001", ddd="65", tel="3322" + "1100"),       # fixo: 8 dígitos, guardado mas não é celular
              estab("10000002", ddd=" 65", tel="99990-00" + "07")]       # formatação suja
    pasta = montar(tmp_path, estabs, [], [])
    repo = RepoFalso()
    cnpj_mt.importar(pasta, repo, ["4711302"], None, AGORA)
    assert repo.cnpj["10000001000100"]["telefone"] == "5565" + "33221100"
    assert repo.cnpj["10000002000100"]["telefone"] == "55659999000" + "07"


def test_reimportar_nao_duplica(pasta):
    repo = RepoFalso()
    cnpj_mt.importar(pasta, repo, ["4711302"], None, AGORA)
    cnpj_mt.importar(pasta, repo, ["4711302"], None, AGORA)
    assert len(repo.cnpj) == 3


def test_streaming_nao_carrega_tudo(tmp_path):
    n = 120_000
    with zipfile.ZipFile(tmp_path / "Estabelecimentos1.zip", "w", zipfile.ZIP_DEFLATED) as z:
        with z.open("K3241.K03200Y1.D41011.ESTABELE", "w") as f:
            for i in range(n):
                uf = "MT" if i % 1000 == 0 else "SP"
                f.write(_linha(estab(f"{30000000 + i}", fantasia="EMPRESA SINTETICA DE TESTE " * 3, uf=uf,
                                     cnae="4711302" if i % 2000 == 0 else "5611201")).encode("latin-1"))
    tamanho = (tmp_path / "Estabelecimentos1.zip").stat().st_size
    with zipfile.ZipFile(tmp_path / "Estabelecimentos1.zip") as z:
        bruto = z.infolist()[0].file_size
    assert bruto > 25_000_000 > tamanho
    _zip(tmp_path, "Empresas0.zip", "EMPRE", [])
    _zip(tmp_path, "Socios0.zip", "SOCIO", [])
    repo = RepoFalso()
    tracemalloc.start()
    try:
        r = cnpj_mt.importar(str(tmp_path), repo, ["4711302"], None, AGORA)
        _, pico = tracemalloc.get_traced_memory()
    finally:
        tracemalloc.stop()
    assert r["lidos"] == n and r["mantidos"] == n // 2000
    assert pico < 8_000_000, pico


# ---------- filtro de contabilidade ----------

@pytest.fixture
def pasta_contador(tmp_path):
    compartilhado = tel("10")
    estabs = [
        estab("10000001", tel=compartilhado, email="fiscal@contabilteste.com.br"),
        estab("10000002", tel=compartilhado, cnae="5611201", email="fiscal@contabilteste.com.br"),
        estab("10000003", tel=compartilhado, cnae="4781400", email="dono3@gmail.com"),
        estab("10000004", tel=tel("11"), email="dono4@gmail.com"),
        estab("10000005", tel=tel("12"), email="dono5@gmail.com"),
        estab("10000006", tel=tel("13"), email="dono6@gmail.com"),
        estab("10000007", tel=tel("14"), email="contato@empresasete.com.br"),
        estab("10000008", tel=tel("15"), email="vendas@empresasete.com.br"),
        estab("10000009", tel=tel("16"), cnae="6920601", email="x@empresanove.com.br"),
        estab("10000010", tel=compartilhado, uf="SP", municipio="7107"),     # fora de MT não conta
    ]
    return montar(tmp_path, estabs, [], [])


def _importado(pasta_contador):
    repo = RepoFalso()
    cnpj_mt.importar(pasta_contador, repo, ["4711302"], None, AGORA)
    cnpj_mt.contagem_compartilhada(repo)
    return repo


def test_tres_cnpjs_mesmo_telefone_marca_contabilidade(pasta_contador):
    repo = _importado(pasta_contador)
    assert cnpj_mt.provavel_contabilidade(repo, telefone="55659999000" + "10")
    assert cnpj_mt.provavel_contabilidade(repo, telefone="(65) 99990-00" + "10")       # sujo, mesmo número
    assert not cnpj_mt.provavel_contabilidade(repo, telefone="55659999000" + "11")


def test_dois_cnpjs_mesmo_dominio_ainda_nao_e_contabilidade(pasta_contador):
    repo = _importado(pasta_contador)
    assert not cnpj_mt.provavel_contabilidade(repo, email="contato@empresasete.com.br")


def test_dominio_gmail_nao_conta_como_contabilidade(pasta_contador):
    repo = _importado(pasta_contador)
    # quatro CNPJs com gmail.com, mas cada um com o próprio endereço: não é domínio compartilhado
    assert not cnpj_mt.provavel_contabilidade(repo, email="dono4@gmail.com")
    assert not cnpj_mt.provavel_contabilidade(repo, email="novo@gmail.com")


def test_mesmo_endereco_gmail_em_tres_cnpjs_conta(tmp_path):
    estabs = [estab(f"1000000{i}", tel=tel(f"2{i}"), email="escritorio.x@gmail.com") for i in range(1, 4)]
    repo = RepoFalso()
    cnpj_mt.importar(montar(tmp_path, estabs, [], []), repo, ["4711302"], None, AGORA)
    assert cnpj_mt.provavel_contabilidade(repo, email="Escritorio.X@gmail.com")


def test_dominio_de_escritorio_contabil(pasta_contador):
    repo = _importado(pasta_contador)
    assert cnpj_mt.provavel_contabilidade(repo, email="fiscal@contabilteste.com.br")
    assert cnpj_mt.provavel_contabilidade(repo, email="a@assessoriafiscalteste.com.br")
    assert cnpj_mt.provavel_contabilidade(repo, email="a@escritorioteste.com.br")


def test_cnae_de_contabilidade(pasta_contador):
    repo = _importado(pasta_contador)
    assert cnpj_mt.provavel_contabilidade(repo, telefone="55659999000" + "16", cnae_da_empresa="6920-6/01")
    assert not cnpj_mt.provavel_contabilidade(repo, telefone="55659999000" + "16", cnae_da_empresa="4711302")


def test_limite_ajustavel(pasta_contador):
    repo = _importado(pasta_contador)
    assert cnpj_mt.provavel_contabilidade(repo, email="contato@empresasete.com.br", limite=2)


def test_contagem_registros_sem_valor_em_claro(pasta_contador):
    repo = _importado(pasta_contador)
    regs = cnpj_mt.registros_compartilhados(repo)
    texto = json.dumps(regs)
    assert "9999000" not in texto and "contabilteste" not in texto and "@" not in texto
    tel_reg = next(r for r in regs if r["chave"] == cnpj_mt.chave_hash("telefone", "55659999000" + "10"))
    assert tel_reg["tipo"] == "telefone"
    assert tel_reg["empresas"] == 3
    assert sorted(tel_reg["cnaes"]) == ["4711302", "4781400", "5611201"]
    assert tel_reg["primeira_vez"] == tel_reg["ultima_vez"] == AGORA.isoformat()


def test_contagem_compartilhada_grava_no_repo_quando_ha_metodo(pasta_contador):
    class RepoComTabela(RepoFalso):
        def __init__(self):
            super().__init__()
            self.compartilhados = {}

        def compartilhado_set(self, chave_hash, empresas, cnaes, primeira, ultima):
            self.compartilhados[chave_hash] = {"empresas": empresas, "cnaes": cnaes}

    repo = RepoComTabela()
    cnpj_mt.importar(pasta_contador, repo, ["4711302"], None, AGORA)
    cnpj_mt.contagem_compartilhada(repo)
    assert cnpj_mt.chave_hash("telefone", "55659999000" + "10") in repo.compartilhados


def test_contagem_sem_importar_reconstroi_do_repo():
    repo = RepoFalso()
    for i in range(3):
        repo.cnpj_put({"cnpj": f"1000000{i}000100", "cnae": "4711302", "telefone": "55659999000" + "30",
                       "email": ""})
    cnpj_mt.contagem_compartilhada(repo)
    assert cnpj_mt.provavel_contabilidade(repo, telefone="55659999000" + "30")


def test_reimportar_nao_conta_duas_vezes(pasta_contador):
    repo = RepoFalso()
    for _ in range(2):
        cnpj_mt.importar(pasta_contador, repo, ["4711302"], None, AGORA)
    assert not cnpj_mt.provavel_contabilidade(repo, email="contato@empresasete.com.br")


# ---------- CLI ----------

def test_cli(pasta, monkeypatch, capsys):
    repo = RepoFalso()
    monkeypatch.setattr(cnpj_mt, "_abrir_repo", lambda: repo)
    rc = cnpj_mt.main(["--pasta", pasta, "--cnaes", "4711-3/02,5611-2/01", "--municipios", "CUIABA"])
    assert rc == 0
    assert sorted(repo.cnpj) == ["10000001000100", "10000004000100", "10000006000100"]
    saida = capsys.readouterr().out
    assert "mantidos=3" in saida and "9999000" not in saida


def test_cli_sem_cnaes_falha_com_mensagem(capsys):
    assert cnpj_mt.main(["--pasta", "/nao/existe"]) == 2
    assert "--cnaes" in capsys.readouterr().err


def test_com_o_repo_de_verdade_a_contagem_sobrevive_ao_reinicio(pasta_contador):
    from atendente.db import Repo
    repo = Repo(":memory:")
    cnpj_mt.importar(pasta_contador, repo, ["4711302"], None, AGORA)
    cnpj_mt.contagem_compartilhada(repo)                       # grava em contatos_compartilhados
    chave = cnpj_mt.chave_hash("telefone", "55659999000" + "10")
    assert repo.compartilhado_get(chave)["empresas"] >= 3
    cnpj_mt._CONTAGENS.pop(repo, None)                         # "reinício": some a contagem em memória
    assert cnpj_mt.provavel_contabilidade(repo, telefone="55659999000" + "10") is True

from datetime import datetime, timedelta, timezone

from atendente.avisos import Avisador
from atendente.db import Repo
from scripts.wa_akg import WaAkgErro

AGORA = datetime(2026, 10, 6, 14, 0, tzinfo=timezone.utc)
EQUIPE = ["5565999900001", "5565999900002"]


class WaFalso:
    def __init__(self, sem_whatsapp=(), falhar_envio=(), tudo_falha=False):
        self.enviados, self.sem_whatsapp, self.falhar_envio, self.tudo_falha = [], set(sem_whatsapp), set(falhar_envio), tudo_falha

    def verificar(self, numeros):
        if self.tudo_falha:
            raise WaAkgErro(0, "fora do ar")
        return {n: (None if n in self.sem_whatsapp else f"{n}@s.whatsapp.net") for n in numeros}

    def enviar_texto(self, jid, texto):
        if jid.split("@")[0] in self.falhar_envio:
            raise WaAkgErro(500, "falhou")
        self.enviados.append((jid.split("@")[0], texto))
        return {}


def lead(i, nome="Clínica Modelo"):
    return {"id": f"R{i:04d}", "nome": nome, "telefone": "65999900033"}


def avisador(wa, atraso=40):
    return Avisador(wa, EQUIPE, Repo(":memory:"), atraso_s=atraso)


def test_junta_varios_casos_numa_mensagem_ate_600():
    wa = WaFalso()
    av = avisador(wa)
    for i in range(8):
        av.adicionar(lead(i, f"Empresa {i}"), "pediu preço " + "x" * 60, "quero saber " * 20, AGORA)
    r = av.descarregar(AGORA + timedelta(seconds=60))
    textos = {t for _, t in wa.enviados}
    assert len(textos) == 1 and len(wa.enviados) == 2          # uma mensagem só, para os dois números
    texto = textos.pop()
    assert len(texto) <= 600
    assert texto.count("- Empresa") <= 5 and "e mais" in texto
    assert r["itens"] == texto.count("- Empresa")
    assert av.pendentes() == 8 - r["itens"]                      # o que não coube continua na fila


def test_so_envia_depois_do_atraso_ou_forcado():
    wa = WaFalso()
    av = avisador(wa)
    av.adicionar(lead(1), "reclamação", "olá", AGORA)
    assert av.descarregar(AGORA + timedelta(seconds=10)) is None and wa.enviados == []
    assert av.descarregar(AGORA + timedelta(seconds=10), forcar=True)["itens"] == 1
    av.adicionar(lead(2), "dúvida", "oi", AGORA)
    assert av.descarregar(AGORA + timedelta(seconds=41))["itens"] == 1
    assert av.descarregar(AGORA + timedelta(hours=1)) is None  # fila vazia


def test_numero_sem_whatsapp_nao_derruba_o_envio():
    wa = WaFalso(sem_whatsapp=[EQUIPE[0]])
    av = avisador(wa)
    av.adicionar(lead(1), "reclamação", "olá", AGORA)
    r = av.descarregar(AGORA, forcar=True)
    assert [n for n, _ in wa.enviados] == [EQUIPE[1]]
    assert r["erros"] and av.pendentes() == 0


def test_numero_que_falha_nao_impede_o_outro():
    wa = WaFalso(falhar_envio=[EQUIPE[0]])
    av = avisador(wa)
    av.adicionar(lead(1), "reclamação", "olá", AGORA)
    av.descarregar(AGORA, forcar=True)
    assert [n for n, _ in wa.enviados] == [EQUIPE[1]] and av.pendentes() == 0


def test_aviso_falho_fica_na_fila_para_a_proxima():
    wa = WaFalso(tudo_falha=True)
    av = avisador(wa)
    av.adicionar(lead(1), "reclamação", "olá", AGORA)
    assert av.descarregar(AGORA, forcar=True)["itens"] == 0
    assert av.pendentes() == 1
    wa.tudo_falha = False
    assert av.descarregar(AGORA + timedelta(seconds=45))["itens"] == 1
    assert av.pendentes() == 0


def test_todos_os_numeros_falham_na_entrega_mantem_na_fila():
    wa = WaFalso(falhar_envio=EQUIPE)
    av = avisador(wa)
    av.adicionar(lead(1), "reclamação", "olá", AGORA)
    av.descarregar(AGORA, forcar=True)
    assert av.pendentes() == 1


def test_texto_do_aviso_nao_leva_telefone_nem_passa_de_120_no_trecho():
    wa = WaFalso()
    av = avisador(wa)
    av.adicionar(lead(1), "pediu contato", "me liga 65 99990-0033 " + "a" * 300, AGORA)
    av.descarregar(AGORA, forcar=True)
    texto = wa.enviados[0][1]
    assert "99990" not in texto and "65999900033" not in texto
    assert len(texto.split('"')[1]) <= 120


def test_fila_sobrevive_a_novo_avisador_no_mesmo_banco():
    repo = Repo(":memory:")
    Avisador(WaFalso(), EQUIPE, repo).adicionar(lead(1), "x", "y", AGORA)
    assert Avisador(WaFalso(), EQUIPE, repo).pendentes() == 1

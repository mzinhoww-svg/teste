"""Fotos dos cenários do estúdio: catálogo rotulado e a foto de cada lead no toque 1.

Origem: pasta "Fotos Cenários" do Drive da Letícia (ensaio 190A71xx). As 31 fotos
foram normalizadas em JPEG sRGB, 1600 px no lado maior, sem EXIF, e renomeadas por
cenário (dados/fotos/, fora do git). As 12 marcadas `usar=True` são as que vão para
a central (central/fotos/) e podem ser trocadas no card.

Ficam de fora da prospecção as fotos com a claquete "Estúdio Zura" (outra marca)
e os detalhes sem contexto.
"""
import re
import unicodedata

# Cenários como o site os apresenta (lib/site/gallery.ts), com o uso que vai na mensagem.
CENARIOS = {
    "puff": {"nome": "Puff", "uso": "pensado para conversas mais pessoais, de reflexão"},
    "escritorio": {"nome": "Escritório", "uso": "pensado para aulas e conteúdo explicativo"},
    "mesa": {"nome": "Mesa de reunião", "uso": "para bate-papo com até quatro pessoas"},
    "sofa": {"nome": "Sofá", "uso": "para entrevista em dupla, com clima de conversa"},
    "estante": {"nome": "Estante", "uso": "para conversas mais pessoais, com um visual mais leve"},
}
LINHA_FOTO = "Te mandei uma foto do nosso cenário {nome}, {uso}."

# arquivo: (original no Drive, cenário, tem pessoa, usar na prospecção, descrição)
CATALOGO = {
    "puff-vazio-01": ("190A7129", "puff", False, True, "Puff de couro caramelo com microfone, luminária de arco e plantas, plano aberto"),
    "puff-vazio-02": ("190A7130", "puff", False, False, "Puff de couro com microfone, plano mais fechado"),
    "puff-detalhe-01": ("190A7131", "puff", False, False, "Detalhe do puff e do microfone"),
    "puff-pessoa-01": ("190A7132", "puff", True, False, "Apresentadora no puff, plano fechado"),
    "puff-pessoa-02": ("190A7133", "puff", True, False, "Apresentadora no puff, plano fechado"),
    "puff-pessoa-03": ("190A7136", "puff", True, False, "Apresentadora no puff falando ao microfone"),
    "puff-pessoa-04": ("190A7140", "puff", True, True, "Apresentadora gravando no puff, plano aberto com luminária e plantas"),
    "puff-pessoa-05": ("190A7141", "puff", True, False, "Apresentadora gravando no puff, plano aberto"),
    "escritorio-pessoa-01": ("190A7157", "escritorio", True, True, "Apresentadora à mesa oval branca com microfone e notebook"),
    "escritorio-pessoa-02": ("190A7159", "escritorio", True, True, "Mesa oval branca com apresentadora ao fundo, plano em perspectiva"),
    "mesa-vazia-01": ("190A7162", "mesa", False, False, "Mesa de madeira com microfones, plano fechado"),
    "mesa-vazia-02": ("190A7163", "mesa", False, True, "Mesa de madeira com quatro microfones articulados e cadeiras, pronta para gravar"),
    "mesa-vazia-03": ("190A7164", "mesa", False, False, "Detalhe de microfones na mesa de madeira"),
    "bastidor-claquete-01": ("190A7176", "mesa", True, False, "Claquete Estúdio Zura em primeiro plano"),
    "bastidor-claquete-02": ("190A7177", "mesa", True, False, "Claquete Estúdio Zura em primeiro plano"),
    "bastidor-claquete-03": ("190A7178", "mesa", True, False, "Claquete Estúdio Zura em primeiro plano"),
    "mesa-claquete-01": ("190A7179", "mesa", False, False, "Mesa de madeira com claquete ao fundo"),
    "mesa-pessoa-01": ("190A7182", "mesa", True, False, "Apresentadora à mesa com xícaras e microfones"),
    "mesa-pessoa-02": ("190A7183", "mesa", True, True, "Apresentadora à mesa de reunião com microfones e xícaras"),
    "mesa-pessoa-03": ("190A7184", "mesa", True, False, "Apresentadora falando ao microfone na mesa de reunião"),
    "mesa-pessoa-04": ("190A7185", "mesa", True, True, "Apresentadora sorrindo na mesa de reunião, microfones em primeiro plano"),
    "mesa-claquete-02": ("190A7188", "mesa", True, False, "Mesa de reunião com claquete Estúdio Zura ao lado"),
    "sofa-vazio-01": ("190A7190", "sofa", False, True, "Sofá claro com tapete persa, dois microfones e cortina bege"),
    "sofa-pessoa-01": ("190A7202", "sofa", True, True, "Apresentadora no sofá com microfone, plano médio"),
    "sofa-pessoa-02": ("190A7203", "sofa", True, True, "Apresentadora no sofá com tapete persa e plantas, plano aberto"),
    "sofa-pessoa-03": ("190A7205", "sofa", True, False, "Apresentadora no sofá, plano aberto horizontal"),
    "detalhe-microfone-01": ("190A7209", "sofa", True, False, "Mão segurando o microfone, detalhe"),
    "estante-pessoa-01": ("190A7211", "estante", True, True, "Apresentadora na banqueta diante da estante branca e parede rosa"),
    "estante-pessoa-02": ("190A7216", "estante", True, False, "Apresentadora gesticulando diante da estante"),
    "estante-pessoa-03": ("190A7219", "estante", True, True, "Apresentadora falando diante da estante branca com plantas"),
    "estante-pessoa-04": ("190A7221", "estante", True, False, "Apresentadora diante da estante, sorrindo"),
}


def curadas() -> list[str]:
    return [k for k, v in CATALOGO.items() if v[3]]


def cenario(foto: str) -> str:
    return CATALOGO[foto][1]


def linha_foto(foto: str) -> str:
    c = CENARIOS[cenario(foto)]
    return LINHA_FOTO.format(nome=c["nome"], uso=c["uso"])


def _txt(*partes: str) -> str:
    t = " ".join(p or "" for p in partes).lower()
    return unicodedata.normalize("NFKD", t).encode("ascii", "ignore").decode()


# Regras por segmento: a primeira que casar define a foto.
REGRAS = [
    ("ICP1", r"estetic|harmoniz|dermat|cosmia|tricolog", "estante-pessoa-03"),
    ("ICP1", r"", "sofa-pessoa-02"),
    ("ICP2", r"", "mesa-pessoa-02"),
    ("ICP3", r"", "mesa-vazia-02"),
    ("ICP4", r"oratoria|faculdade|escola|curso|graduac", "escritorio-pessoa-01"),
    ("ICP4", r"imobil|imove|corret|incorpora|construtora|loca", "sofa-vazio-01"),
    ("ICP4", r"", "puff-pessoa-04"),
    ("ICP5", r"colegio|faculdade|escola|ensino", "escritorio-pessoa-02"),
    ("ICP5", r"", "mesa-pessoa-04"),
    ("ICP6", r"", "sofa-pessoa-01"),
]


def foto_para(icp: str, nome: str = "", categoria: str = "", especialidade: str = "") -> str:
    alvo = _txt(nome, categoria, especialidade)
    for r_icp, padrao, foto in REGRAS:
        if r_icp == icp and (not padrao or re.search(padrao, alvo)):
            return foto
    return "mesa-pessoa-04"


def doc_config() -> dict:
    """Documento config/fotos: as fotos curadas com cenário, descrição e a linha da mensagem."""
    return {"fotos": {k: {"arquivo": f"fotos/{k}.jpg", "cenario": CENARIOS[cenario(k)]["nome"],
                          "descricao": CATALOGO[k][4], "linha": linha_foto(k)} for k in curadas()}}

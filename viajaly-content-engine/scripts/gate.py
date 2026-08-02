#!/usr/bin/env python3
"""
VIAJALY — GATE DE COMPLIANCE
Roda em toda peca antes de publicar. Bloqueia sozinho. ~4s por peca.

Uso:
    python3 gate.py peca.json
    python3 gate.py --lote pasta/          # valida um lote inteiro
    python3 gate.py --texto "copy aqui"    # valida texto solto

Saida: exit 0 = APROVADO | exit 1 = BLOQUEADO
Peca bloqueada NAO publica. Vai pra fila de revisao humana.
"""

import json
import re
import sys
import os
from datetime import datetime, timedelta
from pathlib import Path

# ==============================================================
# CAMADA 1 — PROIBICOES ABSOLUTAS (bloqueio imediato, sem excecao)
# ==============================================================
# Estes termos violam o brand book, o disclaimer regulatorio, ou ambos.
# Uma unica ocorrencia bloqueia a peca inteira.

PROIBIDO_ABSOLUTO = [
    # Promessa de aprovacao = risco regulatorio + destroi o posicionamento.
    # ATENCAO: cobre TODAS as conjugacoes de garantir (garanto/garante/garantimos/
    # garantido/garantia/garantir). Um padrao que so pega "garante" deixa passar
    # "garantimos", que e exatamente como a frase ilegal costuma aparecer.
    r"garant\w*\s+(a\s+|o\s+|sua\s+|seu\s+|)?(aprova|visto)",
    r"(visto|aprova[çc][ãa]o)\s+(100%\s+)?garantid",
    r"garantia\s+de\s+(aprova|visto)",
    r"100%\s*de\s*aprova",
    r"aprova[çc][ãa]o\s+(certa|assegurad)",
    r"(seu\s+)?visto\s+aprovado\s+ou\s+(seu\s+)?dinheiro",
    r"(dinheiro|valor)\s+de\s+volta\s+se\s+(n[ãa]o|for\s+negad)",
    r"reembols\w*\s+se\s+(n[ãa]o\s+aprovar|for\s+negad)",
    r"chance\s+de\s+aprova[çc][ãa]o\s+de\s+100",

    # Clichê proibido no brand book
    r"sonho\s+americano",
    r"realize\s+o\s+sonho",

    # Escassez inventada (viola "sem urgencia artificial")
    r"[úu]ltimas\s+vagas",
    r"[úu]ltima\s+chance",
    r"corre\s+que\s+(vai\s+)?acaba",
    r"s[óo]\s+hoje",
    r"vagas\s+limitadas",
    r"restam\s+apenas",

    # Sugestao de influencia sobre o consulado = gravissimo
    r"conhec\w+\s+algu[ée]m\s+no\s+consulado",
    r"contato\s+(no|dentro\s+do)\s+consulado",
    r"a\s+gente\s+agiliza\s+com\s+o\s+c[ôo]nsul",
]

# ==============================================================
# CAMADA 2 — ESTILO DA MARCA (bloqueia, mas e correcao trivial)
# ==============================================================

ESTILO_PROIBIDO = {
    "emoji": None,          # tratado por regex unicode abaixo
    "travessao": r"—",      # brand book: sem travessao
}

EMOJI_RE = re.compile(
    "[\U0001F300-\U0001FAFF\U00002600-\U000027BF\U0001F1E6-\U0001F1FF]",
    flags=re.UNICODE,
)

# ==============================================================
# CAMADA 3 — DISCLAIMER OBRIGATORIO
# ==============================================================
# Toda peca que fala de visto DEVE carregar o disclaimer.

GATILHO_DISCLAIMER = [r"visto", r"consulado", r"c[ôo]nsul", r"DS-160", r"entrevista"]

DISCLAIMER_OK = [
    r"n[ãa]o\s+garantimos\s+a\s+aprova",
    r"decis[ãa]o\s+[ée]\s+exclusiva\s+das\s+autoridades\s+consulares",
    r"a\s+decis[ãa]o\s+[ée]\s+do\s+(oficial\s+)?c[ôo]nsul",
]

# ==============================================================
# CAMADA 4 — FATOS PERECIVEIS (o risco mais caro e mais silencioso)
# ==============================================================
# Fila, taxa e regra MUDAM. Peca com dado factual so publica se o dado
# tiver sido verificado nos ultimos N dias.

FATOS_PERECIVEIS = {
    "fila": {
        "gatilhos": [r"fila", r"espera", r"\d+\s*(dias|meses)\s+de\s+espera", r"agendamento\s+(est[áa]|em)"],
        "validade_dias": 14,   # fila muda TODA semana
        "fonte_obrigatoria": True,
    },
    "taxa": {
        "gatilhos": [r"US\$\s*\d+", r"taxa\s+(consular|do\s+governo|MRV)", r"\d+\s*d[óo]lares"],
        "validade_dias": 30,
        "fonte_obrigatoria": True,
    },
    "regra": {
        "gatilhos": [r"nova\s+regra", r"mudou", r"a\s+partir\s+de\s+\d", r"entra\s+em\s+vigor", r"Federal\s+Register"],
        "validade_dias": 30,
        "fonte_obrigatoria": True,
    },
    "prova": {
        "gatilhos": [r"\+?\s*\d+\s*vistos\s+aprovados", r"\d+%\s*de\s*aprova"],
        "validade_dias": 90,
        "fonte_obrigatoria": False,   # dado interno, mas precisa ser real
    },
}

# ==============================================================
# CAMADA 5 — DIFAMACAO (ataque a pratica = OK; ataque a CNPJ = processo)
# ==============================================================
# Nomes de concorrentes conhecidos do nicho. Citar nominalmente em peca
# de denuncia = risco juridico real.

CONCORRENTES = [
    "now vistos", "s2 vistos", "mundo dos vistos", "mundial vistos",
    "we vistos", "carol vistos", "serian", "alcance vistos", "may vistos",
    "visto completo", "vistos br", "antecipavisa", "tia cris",
]

CONTEXTO_ATAQUE = [
    r"mentir", r"mentira", r"golpe", r"enganar?", r"picareta", r"charlat",
    r"rouba", r"fraude", r"cuidado\s+com", r"fuja", r"corre\s+de",
]


# Marcadores de negacao. Se aparecerem na janela ANTES do termo proibido,
# a peca esta NEGANDO a promessa (posicionamento correto), nao fazendo ela.
NEGACOES = [
    r"n[ãa]o\b", r"nunca\b", r"ningu[ée]m\b", r"nenhum[a]?\b", r"jamais\b",
    r"sem\b", r"mentira", r"mentindo", r"mentir", r"falso", r"golpe",
    r"cuidado", r"desconfi", r"fuja", r"n[ãa]o\s+existe", r"impossivel",
    r"n[ãa]o\s+[ée]\s+verdade", r"promete", r"prometeu", r"prometem",
]
JANELA_NEGACAO = 90  # caracteres antes do termo


def _e_negacao(texto_low, pos_termo):
    """
    Verifica se o termo proibido esta sendo NEGADO ou DENUNCIADO.

    "garantimos seu visto"              -> promessa   -> BLOQUEIA
    "a gente nao garante seu visto"     -> negacao    -> permite
    "quem promete visto garantido mente"-> denuncia   -> permite
    """
    inicio = max(0, pos_termo - JANELA_NEGACAO)
    janela = texto_low[inicio:pos_termo]
    return any(re.search(n, janela) for n in NEGACOES)


def carregar_peca(caminho):
    with open(caminho, encoding="utf-8") as f:
        return json.load(f)


def extrair_texto(peca):
    """Puxa todo texto de uma peca, seja carrossel (slides) ou reel (roteiro)."""
    partes = []

    def varrer(obj):
        if isinstance(obj, str):
            partes.append(obj)
        elif isinstance(obj, dict):
            for k, v in obj.items():
                if k in ("fonte_url", "fonte_verificada_em", "tipo", "kit", "formato", "id"):
                    continue
                varrer(v)
        elif isinstance(obj, list):
            for item in obj:
                varrer(item)

    varrer(peca.get("slides") or peca.get("roteiro") or peca)
    if peca.get("legenda"):
        partes.append(peca["legenda"])
    return "\n".join(partes)


def validar(peca, texto):
    erros = []
    avisos = []
    low = texto.lower()

    # --- CAMADA 1: proibicao absoluta
    # CRITICO: "a gente NAO garante seu visto" e o posicionamento CORRETO da marca.
    # "garantimos seu visto" e o que mata. A diferenca e a negacao — o gate PRECISA
    # enxergar isso, ou bloqueia justamente a melhor frase do arsenal.
    for padrao in PROIBIDO_ABSOLUTO:
        for m in re.finditer(padrao, low, re.IGNORECASE):
            if _e_negacao(low, m.start()):
                continue  # negado = permitido. E o disclaimer virando arma.
            erros.append(f"[BLOQUEIO CRITICO] Termo proibido: '{m.group(0)}' (padrao: {padrao})")

    # --- CAMADA 2: estilo
    emojis = EMOJI_RE.findall(texto)
    if emojis:
        erros.append(f"[ESTILO] Emoji encontrado ({len(emojis)}x): {''.join(emojis[:5])} — brand book proibe")
    if "—" in texto:
        erros.append("[ESTILO] Travessao encontrado — brand book proibe")

    # --- CAMADA 3: disclaimer
    fala_de_visto = any(re.search(g, low) for g in GATILHO_DISCLAIMER)
    tem_disclaimer = any(re.search(d, low) for d in DISCLAIMER_OK)
    if fala_de_visto and not tem_disclaimer:
        erros.append("[DISCLAIMER] Peca fala de visto e NAO carrega o disclaimer obrigatorio")

    # --- CAMADA 4: fatos periveis
    hoje = datetime.now()
    for nome, cfg in FATOS_PERECIVEIS.items():
        gatilhou = any(re.search(g, low) for g in cfg["gatilhos"])
        if not gatilhou:
            continue

        verif = peca.get("fonte_verificada_em")
        if not verif:
            erros.append(
                f"[FATO PERECIVEL: {nome.upper()}] Peca cita dado factual mas nao tem "
                f"'fonte_verificada_em'. Dado nao verificado NAO publica."
            )
            continue

        try:
            data_verif = datetime.strptime(verif, "%Y-%m-%d")
        except ValueError:
            erros.append(f"[FATO PERECIVEL] 'fonte_verificada_em' invalido: {verif} (use YYYY-MM-DD)")
            continue

        idade = (hoje - data_verif).days
        if idade > cfg["validade_dias"]:
            erros.append(
                f"[FATO VENCIDO: {nome.upper()}] Dado verificado ha {idade} dias. "
                f"Validade: {cfg['validade_dias']} dias. REVERIFICAR antes de publicar."
            )
        elif idade > cfg["validade_dias"] * 0.7:
            avisos.append(f"[ATENCAO] Dado de '{nome}' vence em {cfg['validade_dias'] - idade} dias")

        if cfg["fonte_obrigatoria"] and not peca.get("fonte_url"):
            erros.append(
                f"[SEM FONTE: {nome.upper()}] Peca factual sem 'fonte_url'. "
                f"Regra da doutrina: cite a fonte, e a urgencia vira informacao. "
                f"Omita a fonte, e vira manipulacao."
            )

    # --- CAMADA 5: difamacao
    ha_ataque = any(re.search(c, low) for c in CONTEXTO_ATAQUE)
    if ha_ataque:
        for conc in CONCORRENTES:
            if conc in low:
                erros.append(
                    f"[RISCO JURIDICO] Concorrente '{conc}' citado nominalmente em contexto "
                    f"de ataque. Regra: ataque a PRATICA, nunca o CNPJ."
                )

    return erros, avisos


def relatorio(nome, erros, avisos):
    print(f"\n{'=' * 70}")
    print(f"PECA: {nome}")
    print(f"{'=' * 70}")

    if erros:
        print(f"\nSTATUS: BLOQUEADO ({len(erros)} erro(s))\n")
        for e in erros:
            print(f"  X {e}")
    else:
        print("\nSTATUS: APROVADO PARA PUBLICACAO\n")

    if avisos:
        print(f"\n  Avisos ({len(avisos)}):")
        for a in avisos:
            print(f"  ! {a}")

    return len(erros) == 0


def main():
    args = sys.argv[1:]
    if not args:
        print(__doc__)
        sys.exit(2)

    # modo texto solto
    if args[0] == "--texto":
        texto = " ".join(args[1:])
        peca = {"legenda": texto}
        erros, avisos = validar(peca, texto)
        ok = relatorio("(texto solto)", erros, avisos)
        sys.exit(0 if ok else 1)

    # modo lote
    if args[0] == "--lote":
        pasta = Path(args[1])
        arquivos = sorted(pasta.glob("*.json"))
        if not arquivos:
            print(f"Nenhum .json em {pasta}")
            sys.exit(2)

        aprovadas, bloqueadas = [], []
        for arq in arquivos:
            peca = carregar_peca(arq)
            texto = extrair_texto(peca)
            erros, avisos = validar(peca, texto)
            ok = relatorio(arq.name, erros, avisos)
            (aprovadas if ok else bloqueadas).append(arq.name)

        print(f"\n\n{'#' * 70}")
        print(f"RESUMO DO LOTE: {len(aprovadas)} aprovadas | {len(bloqueadas)} bloqueadas")
        print(f"{'#' * 70}")
        if bloqueadas:
            print("\nBLOQUEADAS (nao publicar, mandar pra revisao):")
            for b in bloqueadas:
                print(f"  - {b}")
        sys.exit(0 if not bloqueadas else 1)

    # modo peca unica
    peca = carregar_peca(args[0])
    texto = extrair_texto(peca)
    erros, avisos = validar(peca, texto)
    ok = relatorio(os.path.basename(args[0]), erros, avisos)
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()

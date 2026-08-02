#!/usr/bin/env python3
"""
VIAJALY -- ACENTUACAO

Passe de acentuacao do portugues sobre os specs (o conteudo foi escrito sem
acento por seguranca de encoding; aqui restauramos). Preserva caixa (NAO->NAO,
Nao->Nao, nao->nao) e acentua tambem os 'destaques' (senao o coral para de casar
com o texto). Regras de frase primeiro (e/da/esta ambiguos), depois o mapa de
palavras. Nao mexe em chaves tecnicas, URLs, hashtags (#token) nem palavras-CTA
em CAIXA ALTA (keywords).

Uso: python3 scripts/acentuar.py saida/arquivo.json [outro.json ...]
"""

import json
import re
import sys
from pathlib import Path

# Regras de frase (aplicadas antes; resolvem e/da/esta ambiguos com contexto).
FRASES = [
    (r"\bnao e\b", "não é"), (r"\bque e\b", "que é"), (r"\bisso e\b", "isso é"),
    (r"\bqual e\b", "qual é"), (r"\bela e\b", "ela é"), (r"\bele e\b", "ele é"),
    (r"\bcada caso e\b", "cada caso é"), (r"\be so\b", "é só"),
    (r"\bda pra\b", "dá pra"), (r"\bda pro\b", "dá pro"), (r"\bda certo\b", "dá certo"),
    (r"\bda errado\b", "dá errado"), (r"\bda tempo\b", "dá tempo"), (r"\bda gosto\b", "dá gosto"),
    (r"\bvoce esta\b", "você está"), (r"\besta no\b", "está no"), (r"\besta na\b", "está na"),
    (r"\besta ali\b", "está ali"), (r"\besta la\b", "está lá"), (r"\besta com\b", "está com"),
    (r"\besta sendo\b", "está sendo"), (r"\besta pronto\b", "está pronto"),
    (r"\besta pronta\b", "está pronta"), (r"\bja e\b", "já é"),
]

# Mapa de palavra -> forma acentuada (so palavras que mudam; ambiguas ficam de fora).
MAPA = {
"nao":"não","voce":"você","voces":"vocês","tambem":"também","tao":"tão","sao":"são",
"ja":"já","la":"lá","ta":"tá","ai":"aí","so":"só","ate":"até","alem":"além","atras":"atrás",
"pe":"pé","mao":"mão","mes":"mês","sera":"será","tres":"três","familia":"família",
"crianca":"criança","criancas":"crianças","dolares":"dólares","historia":"história",
"memoria":"memória","ferias":"férias","cafe":"café","agua":"água","alcool":"álcool",
"epoca":"época","area":"área","aviao":"avião","cabeca":"cabeça","caca":"caça","faca":"faça",
"facil":"fácil","dificil":"difícil","impossivel":"impossível","perecivel":"perecível",
"util":"útil","uteis":"úteis","numero":"número","codigo":"código","metodo":"método",
"publico":"público","obvio":"óbvio","otimo":"ótimo","unico":"único","unica":"única",
"proprio":"próprio","propria":"própria","proximo":"próximo","proxima":"próxima",
"proximos":"próximos","rapido":"rápido","rapida":"rápida","varios":"vários","varias":"várias",
"minuscula":"minúscula","legitima":"legítima","legitimo":"legítimo","logistica":"logística",
"estatistica":"estatística","diagnostico":"diagnóstico","planetario":"planetário",
"cenario":"cenário","calendario":"calendário","formulario":"formulário","imovel":"imóvel",
"vinculo":"vínculo","video":"vídeo","vitima":"vítima","alivio":"alívio","desperdicio":"desperdício",
"criticos":"críticos","tecnica":"técnica","autonomo":"autônomo","antidoto":"antídoto",
"consul":"cônsul","consulo":"cônsul","fondue":"fondue","trenó":"trenó",
"decisao":"decisão","atencao":"atenção","emocao":"emoção","solucao":"solução",
"profissao":"profissão","imigracao":"imigração","emissao":"emissão","impressao":"impressão",
"projecao":"projeção","empolgacao":"empolgação","frustracao":"frustração","contradicao":"contradição",
"discussao":"discussão","divisao":"divisão","renovacao":"renovação","revisao":"revisão",
"regiao":"região","versao":"versão","versoes":"versões","condicoes":"condições",
"estacao":"estação","estacoes":"estações","opcao":"opção","autorizacao":"autorização",
"antecipacao":"antecipação","movimentacao":"movimentação","aprovacao":"aprovação",
"consequencia":"consequência","experiencia":"experiência","emergencia":"emergência",
"ausencia":"ausência","ciencia":"ciência","coerencia":"coerência","incoerencia":"incoerência",
"denuncia":"denúncia","confianca":"confiança","seguranca":"segurança","lembranca":"lembrança",
"sentenca":"sentença","heranca":"herança","bagunca":"bagunça","abraco":"abraço","espaco":"espaço",
"preco":"preço","terco":"terço","forca":"força","graca":"graça","gratis":"grátis","marco":"março",
"comeca":"começa","comecar":"começar","comeco":"começo","comecem":"começem","comecou":"começou",
"comece":"comece","endereco":"endereço","orcamento":"orçamento","cartao":"cartão",
"analise":"análise","america":"américa","california":"califórnia","angeles":"angeles",
"manha":"manhã","saude":"saúde","folego":"fôlego","duvida":"dúvida","media":"média",
"ingles":"inglês","impermeavel":"impermeável","disponivel":"disponível","responsavel":"responsável",
"nivel":"nível","possivel":"possível","incluidas":"incluídas","saida":"saída","saidas":"saídas",
"pais":"país","paises":"países","ceu":"céu",
"ninguem":"ninguém","alguem":"alguém","apos":"após","porem":"porém","tras":"trás",
"basico":"básico","basica":"básica","horario":"horário","turistica":"turística",
"turistico":"turístico","ultima":"última","ultimo":"último","ultimas":"últimas",
"romantica":"romântica","romantico":"romântico","magico":"mágico","aereo":"aéreo",
"aereas":"aéreas","pratico":"prático","pratica":"prática","obrigatorio":"obrigatório",
"necessario":"necessário","horarios":"horários","romanticas":"românticas",
}


def _case(alvo, molde):
    if molde.isupper():
        return alvo.upper()
    if molde[:1].isupper():
        return alvo[:1].upper() + alvo[1:]
    return alvo


def _frases(texto):
    for pat, sub in FRASES:
        def _f(m, sub=sub):
            g = m.group(0)
            return sub[:1].upper() + sub[1:] if g[:1].isupper() else sub
        texto = re.sub(pat, _f, texto, flags=re.IGNORECASE)
    return texto


def _palavra(w):
    base = MAPA.get(w.lower())
    return _case(base, w) if base else w


SKIP = {"imagem", "fonte_url", "combo", "angulo_id", "persona_id", "kit",
        "formato", "tipo", "tema", "conta", "data", "acao", "_doc",
        "fonte_verificada_em", "nota_producao"}


def processar(obj):
    if isinstance(obj, str):
        return obj
    if isinstance(obj, dict):
        out = {}
        for k, v in obj.items():
            if k in SKIP:
                out[k] = v
            elif k == "acao":
                out[k] = v
            elif isinstance(v, str):
                # nao acentua dentro de hashtag/url; legenda tem hashtags no fim
                out[k] = _acentuar_preservando(v)
            else:
                out[k] = processar(v)
        return out
    if isinstance(obj, list):
        return [(_acentuar_preservando(i) if isinstance(i, str) else processar(i)) for i in obj]
    return obj


def _acentuar_preservando(s):
    if not s:
        return s
    s = _frases(s)  # regras de frase na string inteira
    # depois mapa de palavra token a token, pulando hashtag e CAIXA ALTA (keywords)
    partes = re.split(r"(\s+)", s)
    saida = []
    for tok in partes:
        if tok.startswith("#") or (tok.isupper() and len(tok) > 3 and tok.isalpha()):
            saida.append(tok)
        else:
            saida.append(re.sub(r"[A-Za-zÀ-ÿ]+", lambda m: _palavra(m.group(0)), tok))
    return "".join(saida)


def main():
    for arg in sys.argv[1:]:
        p = Path(arg)
        d = json.loads(p.read_text(encoding="utf-8"))
        d["pecas"] = [processar(x) for x in d.get("pecas", [])]
        p.write_text(json.dumps(d, ensure_ascii=False, indent=2), encoding="utf-8")
        print("acentuado:", arg)


if __name__ == "__main__":
    main()

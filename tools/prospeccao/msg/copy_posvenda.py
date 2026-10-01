"""Copy v1 do funil de pós-venda: de quem fechou até a recorrência.

Segue o pipeline Produção e Entrega da Reiners (docs/reiners-media-seed.md) e o
agente de Onboarding (lib/agents/catalog.ts), em sete etapas com uma mensagem da
Letícia cada. A central monta o texto na hora, porque datas e produto só existem
depois que o cliente fecha. Placeholders: {saudacao}, {produto}, {quando},
{local} e {entregaveis}.
"""

VERSAO = "pv1"

# Produto contratado: como a entrega é descrita e onde a gravação acontece.
PRODUTOS = {
    "Hora de Estúdio": {"entregaveis": "os arquivos da gravação", "local": "aqui no estúdio"},
    "Podcast In Loco": {"entregaveis": "o episódio editado, os cortes, o reel e as fotos do bastidor",
                        "local": "na sede de vocês"},
    "BTS Recorrente": {"entregaveis": "os episódios do mês e os cortes", "local": "aqui no estúdio"},
    "Episódio piloto": {"entregaveis": "o episódio piloto editado", "local": "aqui no estúdio"},
    "Outro": {"entregaveis": "o material combinado", "local": "no local combinado"},
}

# quando: "imediato" (assim que a etapa começa), "data" (precisa de data marcada;
# vence na véspera quando vespera=True) ou dias depois da etapa anterior concluída.
ETAPAS = [
    {
        "n": 1, "nome": "Boas-vindas", "quando": "imediato",
        "texto": ("Oi, {saudacao}, aqui é a Letícia, da Reiners Media. Que bom ter vocês com a gente no {produto}.\n"
                  "O próximo passo é o kickoff: uma conversa de 30 a 40 minutos para alinhar objetivo, público, pauta e convidados.\n"
                  "Que dia e horário ficam bons para vocês esta semana?"),
    },
    {
        "n": 2, "nome": "Kickoff", "quando": "data", "campoData": "dataKickoff", "vespera": False,
        "texto": ("Oi, {saudacao}, confirmando nosso kickoff {quando}.\n"
                  "Para aproveitar bem o tempo, se puder, já pensa em três coisas: o objetivo principal do programa, "
                  "quem vocês querem ouvir ou convidar e os temas que não podem faltar.\n"
                  "Qualquer mudança de horário, me avisa por aqui."),
    },
    {
        "n": 3, "nome": "Pauta e agenda", "quando": "imediato",
        "texto": ("Oi, {saudacao}, obrigada pelo kickoff. Vou te mandar por aqui o resumo do que combinamos e a pauta "
                  "do primeiro episódio para você aprovar.\n"
                  "Para fechar a agenda de gravação, me diz quais datas funcionam para vocês e para os convidados."),
    },
    {
        "n": 4, "nome": "Gravação", "quando": "data", "campoData": "dataGravacao", "vespera": True,
        "texto": ("Oi, {saudacao}, passando para lembrar da gravação {quando}, {local}.\n"
                  "{preparo}\n"
                  "Se algum convidado mudar, me avisa por aqui que eu ajusto a pauta."),
    },
    {
        "n": 5, "nome": "Aprovação", "quando": "imediato",
        "texto": ("Oi, {saudacao}, o material está editado. Vou te mandar o link por aqui para você assistir com calma.\n"
                  "Se quiser algum ajuste, me manda os pontos com o minuto de cada um, que a gente ajusta."),
    },
    {
        "n": 6, "nome": "Entrega", "quando": "imediato",
        "texto": ("Oi, {saudacao}, entrega feita: {entregaveis} já estão com vocês.\n"
                  "Queria muito saber o que você achou da experiência. Se topar, uma frase sua sobre o trabalho pode "
                  "entrar no nosso site, com o seu nome."),
    },
    {
        "n": 7, "nome": "Recorrência", "quando": 15,
        "texto": ("Oi, {saudacao}, como foi a repercussão por aí?\n"
                  "{recorrencia}"),
    },
]

# Trechos que mudam conforme o produto.
PREPARO = {
    "estudio": ("Vale chegar uns 20 minutos antes para ajustar som e câmera com calma. "
                "Roupa lisa, sem listra fina, fica melhor no vídeo."),
    "sede": ("A nossa equipe chega antes para montar a estrutura. Só precisamos de uma sala com tomada "
             "e o mínimo de barulho. Roupa lisa, sem listra fina, fica melhor no vídeo."),
}
RECORRENCIA = {
    "padrao": ("Quem grava uma vez costuma sentir o efeito quando a presença vira constante. Posso te mostrar "
               "como fica um formato mensal, com a gente cuidando de pauta, gravação e distribuição?"),
    "BTS Recorrente": ("Queria ouvir de vocês o que funcionou neste mês e já pensar juntos a pauta do próximo. "
                       "Tem 20 minutos esta semana?"),
}


def preparo(produto: str) -> str:
    return PREPARO["sede"] if produto == "Podcast In Loco" else PREPARO["estudio"]


def recorrencia(produto: str) -> str:
    return RECORRENCIA.get(produto, RECORRENCIA["padrao"])


def compor(etapa: int, saudacao: str, produto: str, quando: str = "") -> str:
    """Mesma montagem que a central faz em JavaScript (central/index.html, textoPV)."""
    e = ETAPAS[etapa - 1]
    p = PRODUTOS.get(produto, PRODUTOS["Outro"])
    return e["texto"].format(saudacao=saudacao, produto=produto, quando=quando, local=p["local"],
                             entregaveis=p["entregaveis"], preparo=preparo(produto),
                             recorrencia=recorrencia(produto))


def doc_config() -> dict:
    """Documento config/posvenda que a central lê para montar as mensagens."""
    return {"versao": VERSAO, "etapas": ETAPAS, "produtos": PRODUTOS, "preparo": PREPARO,
            "recorrencia": RECORRENCIA}


def linhas_copy() -> list[tuple[str, str, str]]:
    linhas = [("Versão", "", VERSAO)]
    for e in ETAPAS:
        quando = {"imediato": "assim que a etapa começa", "data": "com data marcada"}.get(
            e["quando"], f"{e['quando']} dias depois da etapa anterior")
        if e.get("vespera"):
            quando = "na véspera da data marcada"
        linhas.append((f"Etapa {e['n']} · {e['nome']}", quando, e["texto"]))
    for k, v in PREPARO.items():
        linhas.append(("Preparo da gravação", k, v))
    for k, v in RECORRENCIA.items():
        linhas.append(("Recorrência", k, v))
    for nome, p in PRODUTOS.items():
        linhas.append(("Produto", nome, f"Entrega: {p['entregaveis']} · Local: {p['local']}"))
    return linhas

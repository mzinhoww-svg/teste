"""Copy v1 da cadência de prospecção da Reiners Media: três toques por ICP.

Toque 1 convida para conhecer o estúdio. Toque 2, quatro dias depois, oferece o
Diagnóstico de Presença Institucional por nossa conta. Toque 3, seis dias depois
do 2, oferece um episódio piloto gravado e entregue pela Reiners. Quem assina é
a Letícia Reiners. Tom: conversa, não pitch (lib/agents/reiners-context.ts).
"""

VERSAO = "v2"
# Um bloco por parágrafo, com linha em branco entre eles: no WhatsApp a mensagem respira.
SEPARADOR = "\n\n"
WHATS_LETICIA = "5565999207108"
WHATS_LETICIA_FMT = "+55 65 99920-7108"
INSTAGRAM = "instagram.com/reinersmedia"

# Dias de espera depois do toque anterior (toque 1 sai assim que o lead entra na fila).
ESPERA_DIAS = {1: 0, 2: 4, 3: 6}
TOQUES = (1, 2, 3)

ICPS = {
    "ICP1": "Saúde",
    "ICP2": "Jurídico e contábil",
    "ICP3": "Empresas, agro e entidades",
    "ICP4": "Mentores e imobiliário",
    "ICP5": "Empresas de médio porte",
    "ICP6": "Eventos e feiras",
}

# O que a Reiners faz por cada ICP (entra no toque 1).
O_QUE_FAZEMOS = {
    "ICP1": ("A gente grava podcast e videocast para quem é da saúde explicar o próprio trabalho "
             "com calma, e o paciente chega à consulta já confiando em quem vai atender."),
    "ICP2": ("A gente grava podcast e videocast para escritórios que querem transformar tema "
             "técnico em conversa clara e virar referência para quem decide."),
    "ICP3": ("A gente produz comunicação institucional em áudio e vídeo: entrevistas e séries "
             "que mostram o trabalho da organização para quem ela representa."),
    "ICP4": ("A gente cuida de set, câmeras e edição para quem já ensina e vende com conteúdo, "
             "e entrega o episódio e os cortes prontos para publicar."),
    "ICP5": ("A gente produz videocast corporativo: a empresa conta a própria história, "
             "apresenta lideranças e clientes, e constrói presença institucional que dura."),
    "ICP6": ("A gente grava podcast e videocast com quem faz o evento acontecer: entrevistas com "
             "organizadores, palestrantes e expositores, que mantêm a conversa viva antes e depois de cada edição."),
}

# ---------- Toque 1 · visita ao estúdio ----------
T1_ABERTURA = "Oi, {saudacao}, tudo bem? Aqui é a Letícia, da Reiners Media, estúdio de podcast aqui em Cuiabá."
T1_CONVITE = ("Queria te convidar para conhecer o estúdio: um café, uns 20 minutos, e você vê o set "
              "funcionando. Se for mais fácil, eu vou até vocês.")
T1_FECHO = "Que dia fica bom para você? Se não fizer sentido agora, é só me avisar."

# ---------- Toque 2 · diagnóstico por nossa conta ----------
T2_ABERTURA = "Oi, {saudacao}, é a Letícia de novo, da Reiners Media."
T2_GANCHO = "Sei que a agenda aperta, então pensei em algo que não exige vir até aqui."
T2_OFERTA = ("A gente faz um Diagnóstico de Presença Institucional: olhamos como vocês se "
             "comunicam hoje e entregamos um relatório com 5 a 8 recomendações práticas. Para "
             "vocês, ele fica por nossa conta.")
T2_FECHO = "Posso marcar 30 minutos de conversa para começar? Se não for o momento, me fala que eu não insisto."

# ---------- Toque 3 · episódio piloto ----------
T3_ABERTURA = "Oi, {saudacao}, é a Letícia, da Reiners Media. Prometo que é a última mensagem."
T3_GANCHO = ("Às vezes fica difícil imaginar como seria um podcast de vocês sem ver um pronto. "
             "Então a proposta é simples: a gente grava um episódio piloto com vocês, por nossa "
             "conta, e entrega editado.")
T3_DETALHE = ("Vocês escolhem o tema e a gente cuida do roteiro, da gravação e da edição, aqui no "
              "estúdio ou na sede de vocês.")
T3_FECHO = "Topa marcarmos uma data? Se não fizer sentido, sem problema, e obrigada pela atenção."

ASSUNTOS = {
    1: "Um café no estúdio, {nome_curto}?",
    2: "Um diagnóstico por nossa conta, {nome_curto}",
    3: "Um episódio piloto para {nome_curto}",
}

ASSINATURA_EMAIL = (f"Abraço,\nLetícia Reiners\nReiners Media · Estúdio de podcast\n"
                    f"WhatsApp: {WHATS_LETICIA_FMT}\n{INSTAGRAM}")
SAIDA_EMAIL = "Se preferir não receber mais, é só responder este e-mail que eu não envio mais nada."

# Termos que o manual comercial só admite ao corrigir a percepção do cliente.
TERMOS_PROIBIDOS = ("posts", "viralizar", "viral", "feed bonito", "pacote de posts",
                    "stories", "gestão de redes", "métricas", "engajamento", "alcance")


def blocos(toque: int, icp: str, foto: bool = False) -> list[str]:
    """Blocos fixos do toque, com {saudacao}, {frase}, {nome_curto} e {linha_foto} por preencher.

    Com foto (WhatsApp do toque 1), entra a linha que apresenta o cenário da foto enviada junto.
    """
    if toque == 1:
        fixo = [T1_ABERTURA, "{frase}", O_QUE_FAZEMOS[icp]]
        return fixo + (["{linha_foto}"] if foto else []) + [T1_CONVITE, T1_FECHO]
    if toque == 2:
        return [T2_ABERTURA, T2_GANCHO, T2_OFERTA, T2_FECHO]
    if toque == 3:
        return [T3_ABERTURA, T3_GANCHO, T3_DETALHE, T3_FECHO]
    raise ValueError(f"toque inválido: {toque}")


def linhas_copy() -> list[tuple[str, str, str]]:
    """Toda a copy em linhas (Bloco, ICP, Texto) para a aba Copy da planilha."""
    linhas = [("Versão", "", VERSAO)]
    for t in TOQUES:
        espera = ESPERA_DIAS[t]
        rotulo = f"Toque {t}" + (f" (+{espera} dias)" if espera else "")
        for i, b in enumerate(blocos(t, "ICP1", foto=True), start=1):
            if b == O_QUE_FAZEMOS["ICP1"]:
                for icp, texto in O_QUE_FAZEMOS.items():
                    linhas.append((f"{rotulo} · bloco {i}", icp, texto))
            else:
                linhas.append((f"{rotulo} · bloco {i}", "Todos", b))
        linhas.append((f"{rotulo} · assunto e-mail", "Todos", ASSUNTOS[t]))
    linhas.append(("Assinatura e-mail", "Todos", ASSINATURA_EMAIL))
    linhas.append(("Saída e-mail", "Todos", SAIDA_EMAIL))
    return linhas

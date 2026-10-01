"""Personalização v1: saudação, nome curto e frase única por lead (entra no toque 1).

Escrita a partir de dados/leads.json, com base no que a pesquisa achou de cada lead
(especialidade, Instagram, trajetória). Rodar `python3 -m msg.personal_v1` regrava
msg/personal.json. Se `msg.prep` renumerar os leads, confira os IDs antes de gerar.
"""
import json
import os

E, I, R, T, N = "Especialidade", "Instagram", "Reputação", "Trajetória", "Neutra"

# id: (saudação, nome curto, frase, fonte)
PERSONAL = {
    # ---------- ICP1 · Saúde ----------
    "R0009": ("Dra. Mara", "Betoni Odontologia", "Uma clínica que atende desde 1992, em duas unidades, tem muita história de paciente para contar.", T),
    "R0010": ("Dra. Graciela", "Clínica IDEA", "Laser, tricologia e dermatologia cirúrgica geram dúvida que o paciente gostaria de ouvir explicada com calma.", E),
    "R0011": ("pessoal da Royal Face", "Royal Face", "Harmonização facial é procedimento que o paciente pesquisa muito antes de marcar, e quer ouvir de quem faz.", E),
    "R0012": ("pessoal da Verbene", "Verbene Oftalmologia", "Catarata, cirurgia refrativa e glaucoma são temas que o paciente entende melhor numa conversa do que num folheto.", E),
    "R0032": ("Dr. Cassio", "Clínica Genus", "Ortopedia por subespecialidade é um diferencial que fica claro quando o próprio médico explica.", E),
    "R0033": ("Dra. Daiane", "Clínica Venésse", "Estética facial e odontologia na mesma casa rendem conversa boa sobre como os dois cuidados se encontram.", E),
    "R0034": ("pessoal do IOME", "IOME", "Medicina do esporte é assunto que atleta amador e profissional consomem com gosto quando vem de quem trata.", E),
    "R0045": ("Dr. Álvaro", "Clínica Saúde dos Olhos", "Oftalmologia pediátrica é tema em que pai e mãe confiam mais quando ouvem o médico falar.", E),
    "R0046": ("Dra. Lara", "Dra. Lara Tavares", "Quem já presidiu a SBD-MT tem autoridade para explicar dermatologia de um jeito que o paciente leva a sério.", T),
    "R0047": ("Dra. Mariana", "Dra. Mariana Barros", "Oncologia cutânea é um tema sério, e ouvir a especialista explicar tranquiliza o paciente antes da consulta.", E),
    "R0048": ("Luana", "Luana Pinatti", "Vi o seu trabalho no Instagram, e procedimentos como os fios PDO pedem uma explicação mais longa do que um vídeo curto.", I),
    "R0049": ("Dr. Andrey", "Odonto Alfa", "Lentes, facetas e Invisalign são escolhas que o paciente faz melhor depois de ouvir o dentista explicar.", E),
    "R0050": ("Dra. Regianne", "Rosa Limão Estética", "Bioestimulador e toxina ainda geram muita dúvida, e conversa gravada responde antes da primeira consulta.", E),
    "R0051": ("pessoal do VIVER CIN", "VIVER CIN", "Um centro de oftalmologia com quatro médicos tem quatro olhares diferentes para levar a uma mesma conversa.", E),
    "R0064": ("Dra. Aline", "Dra. Aline Dalávia", "Harmonização feita por médica é um diferencial que fica claro quando você mesma explica.", E),
    "R0065": ("Dra. Cintia", "Dra. Cintia Procopio", "Tratamento capilar e laser são assuntos que a paciente pesquisa muito antes de chegar ao consultório.", E),
    "R0066": ("Dra. Marielli", "Dra. Marielli Pichini", "Tricologia ainda é pouco conhecida, e é o tipo de tema que rende uma série de conversas.", E),
    "R0067": ("Dr. Thiago", "Oral Unic", "Implante e alinhador são decisões grandes, e o paciente decide melhor depois de ouvir quem trata.", E),
    "R0090": ("pessoal do Grupo Crepaldi", "Grupo Crepaldi", "Uma clínica com cinco dermatologistas reúne especialidade suficiente para uma conversa por mês.", E),
    "R0103": ("pessoal da Santa Júlia", "Clínica Santa Júlia", "Mapeamento corporal e dermatologia oncológica salvam vidas, e falar disso com calma faz diferença.", E),
    "R0104": ("Dr. Elson", "Dr. Elson Adorno", "Cirurgia de contorno corporal é decisão que a paciente amadurece ouvindo o cirurgião, muito antes da consulta.", E),
    "R0116": ("pessoal da Cliniprev", "Cliniprev", "Estética e implantes no mesmo lugar dão assunto para conversar sobre autoestima de um jeito sério.", E),
    "R0117": ("pessoal da Fisio Ativa", "Fisio Ativa", "Reabilitação vestibular é pouco conhecida, e quem tem tontura procura exatamente esse tipo de explicação.", E),
    "R0118": ("pessoal da FisioMove", "FisioMove", "Fisioterapia é das áreas em que o paciente mais pergunta, e cada resposta pode virar um episódio.", N),

    # ---------- ICP2 · Jurídico e contábil ----------
    "R0001": ("Antônio", "Espósito Advocacia", "Um escritório que vai de família e sucessões a direito eleitoral conversa com públicos muito diferentes.", E),
    "R0002": ("Charles", "Handell Advocacia", "Recuperação judicial e questão fundiária são temas que o empresário precisa ouvir traduzidos.", E),
    "R0013": ("pessoal da AGA", "AGA Advocacia", "Crédito rural e recuperação judicial no agro são temas que o produtor quer entender antes de precisar.", E),
    "R0014": ("Bruno", "Ferreira Alegria", "Direito ambiental e minerário para produtor rural é assunto técnico que ganha muito quando vira conversa.", E),
    "R0015": ("pessoal da MTCONT", "MTCONT", "Planejamento tributário é o tipo de tema que o empresário só entende de verdade quando alguém explica com calma.", E),
    "R0016": ("Marco Aurélio", "Mestre Medeiros", "Recuperação judicial e agronegócio são áreas em que a confiança no escritório começa antes da primeira reunião.", E),
    "R0035": ("pessoal da Alfa", "Alfa Contabilidade", "Holding rural é um assunto que o produtor ouve falar muito e entende pouco, e vocês sabem explicar.", E),
    "R0036": ("Samuel", "CF Contabilidade", "Contabilidade consultiva é um serviço que se vende melhor quando o cliente ouve como vocês pensam.", E),
    "R0037": ("pessoal da Contabilist", "Contabilist", "Recuperação tributária para agro e saúde é um tema que costuma surpreender quem ouve pela primeira vez.", E),
    "R0038": ("pessoal da Exatus", "Exatus", "Vocês já têm canal no YouTube, e um set de estúdio pode levar esse conteúdo a outro patamar.", T),
    "R0039": ("pessoal da FAF", "FAF Advogados", "Recuperação judicial com foco no agro é assunto em que o produtor quer ouvir quem faz isso desde 2006.", T),
    "R0052": ("Silvana", "Alves & Souza", "Direito trabalhista e previdenciário geram as dúvidas que mais aparecem na conversa do dia a dia do cliente.", E),
    "R0053": ("Ana Paula", "Ana Paula Costa", "Um escritório 100% tributário tem profundidade para explicar execução fiscal sem juridiquês.", E),
    "R0054": ("Fernando", "FZanin Advocacia", "Tributário, ambiental e agrário juntos é uma combinação rara, e rende conversa com o produtor rural.", E),
    "R0055": ("Marta", "Marta Oliveira Advocacia", "Previdência e família são áreas em que o cliente chega inseguro, e ouvir a advogada antes ajuda muito.", E),
    "R0056": ("Vagner", "ZAHI Contábil", "Gestão tributária e societária é assunto que o empresário adia, e uma boa conversa ajuda a destravar.", E),
    "R0068": ("José", "Advocacia Lacerda", "Mais de 40 anos em direito agrário e ambiental é uma história que merece ser contada em conversa.", T),
    "R0069": ("Carlos", "Ghiorzi Advocacia", "Um escritório tributário que atende 100% online já vive de conteúdo, e conversa gravada reforça essa confiança.", E),
    "R0070": ("pessoal da Master Assessoria", "Master Assessoria", "Departamento pessoal e planejamento tributário são as dúvidas que o pequeno empresário mais traz para o contador.", E),
    "R0091": ("Anderson", "Anderson Gadelha", "Nota 5 em 35 avaliações no Google mostra cliente satisfeito com a defesa tributária de vocês.", R),
    "R0092": ("Isabelly", "Furtunato Advocacia", "Um escritório que cobre empresarial, tributário e família fala com o empresário e com a família dele.", E),
    "R0093": ("Marcos", "Lima Contabilidade", "Perícia e planejamento tributário para construção e saúde são temas específicos que pouca gente explica bem.", E),
    "R0094": ("Nayara", "Portocarrero Advogados", "Advocacia trabalhista é das áreas em que o empresário mais precisa de orientação clara e preventiva.", E),
    "R0105": ("Mauricio", "Bios do Direito", "Trabalhista e tributário juntos com consultoria empresarial é o dia a dia de quem tem empresa em Cuiabá.", E),
    "R0106": ("pessoal da Borralho e Rabaneda", "Borralho e Rabaneda", "Planejamento sucessório e mediação são conversas delicadas que as famílias adiam por falta de informação.", E),
    "R0107": ("pessoal da CBS", "CBS Contábil", "Assessoria fiscal e trabalhista para pequena e média empresa responde as mesmas dúvidas toda semana.", E),
    "R0113": ("pessoal da Coelho & Almeida", "Coelho & Almeida", "Recuperação judicial e direito bancário são temas em que o empresário precisa confiar em quem fala.", E),

    # ---------- ICP3 · Empresas, agro e entidades ----------
    "R0003": ("Celso", "Sindicato Rural de Cuiabá", "Quem organiza a Expoagro já reúne o produtor rural, e cada edição rende conversa para o ano inteiro.", E),
    "R0004": ("Claudio", "Sinduscon-MT", "O sindicato da construção tem pauta de sobra sobre o que está mudando nas obras de Mato Grosso.", E),
    "R0040": ("pessoal da AMPA", "AMPA", "O algodão de Mato Grosso tem uma história que o produtor conhece e que o resto do país ainda escuta pouco.", E),
    "R0057": ("pessoal da Fecomércio", "Fecomércio-MT", "Comércio, serviços e turismo juntos dão uma pauta que interessa a quase todo empresário do estado.", E),
    "R0058": ("pessoal do IMAC", "IMAC", "Promover a carne de Mato Grosso é contar a história de quem produz, e essa história rende em áudio e vídeo.", E),
    "R0059": ("pessoal da FIEMT", "FIEMT", "Uma federação que representa 37 sindicatos industriais tem um banco de vozes enorme para entrevistar.", E),
    "R0071": ("pessoal da AEAM", "AEAM-MT", "Engenharia ambiental está no centro do debate em Mato Grosso, e quem entende do assunto merece ser ouvido.", E),
    "R0072": ("pessoal da CDL", "CDL Cuiabá", "Uma entidade que representa os lojistas de Cuiabá tem pauta toda semana sobre o comércio da cidade.", E),
    "R0073": ("pessoal da MT Leite", "MT Leite", "O produtor de leite tem desafios que pouca gente fora do campo conhece, e isso dá boa conversa.", E),
    "R0095": ("pessoal da ACCuiabá", "ACCuiabá", "Uma associação que reúne os empresários de Cuiabá tem histórias de negócio para muitos episódios.", E),
    "R0096": ("pessoal da Aprosoja", "Aprosoja MT", "Soja e milho movem Mato Grosso, e o produtor quer ouvir quem representa o setor falando com profundidade.", E),
    "R0097": ("pessoal da Iguaçu Máquinas", "Iguaçu Máquinas", "Agricultura de precisão é um tema que o produtor quer ver explicado por quem entrega e dá assistência.", E),
    "R0098": ("pessoal da UNEM", "UNEM", "O etanol de milho cresceu rápido em Mato Grosso, e ainda tem muita gente querendo entender como funciona.", E),
    "R0108": ("pessoal da Acrimat", "Acrimat", "A pecuária de corte tem um peso enorme em Mato Grosso, e o pecuarista gosta de ouvir quem o representa.", E),
    "R0109": ("pessoal da Agro Amazônia", "Agro Amazônia", "Quem distribui insumos conversa com o produtor sobre a safra o tempo todo, e essa conversa pode ser gravada.", E),
    "R0110": ("pessoal da Amaggi", "Amaggi", "Grãos, logística e energia numa empresa com matriz em Cuiabá é uma história que merece formato longo.", E),
    "R0111": ("pessoal da OCB/MT", "Sistema OCB/MT", "O cooperativismo de Mato Grosso tem muita história de cooperado para contar em conversa.", E),
    "R0114": ("pessoal da Acrismat", "Acrismat", "A suinocultura de Mato Grosso tem uma cadeia que o consumidor conhece pouco, e isso é pauta boa.", E),
    "R0115": ("pessoal da Ferro Tractor", "Ferro Tractor", "Quem vende peça de trator e colheitadeira conhece a rotina do produtor como pouca gente conhece.", N),
    "R0119": ("pessoal da Aprofir", "Aprofir-MT", "Feijão, pulses e irrigação são culturas que pouca gente fora do campo entende, e vocês têm o que explicar.", E),
    "R0120": ("pessoal da Famato", "Sistema Famato", "Uma federação que representa os sindicatos rurais do estado tem voz em quase todo assunto do campo.", E),
    "R0122": ("Silvio", "Bioind-MT", "Bioenergia é dos setores que mais cresceram em Mato Grosso, e ainda há pouca conversa séria sobre ele.", E),
    "R0123": ("Wilmar", "SIAMT", "A indústria da alimentação de Mato Grosso tem uma história que o consumidor da própria cidade não conhece.", E),
    "R0124": ("Lázaro", "Sindarroz-MT", "O arroz de Mato Grosso tem uma indústria por trás que merece ser apresentada com calma.", E),
    "R0125": ("Carlos", "Sindenergia", "Geração e transmissão de energia são assuntos técnicos que a sociedade precisa ouvir de quem é do setor.", E),
    "R0126": ("Tadeu", "Sindifrigo", "A indústria frigorífica de Mato Grosso e Rondônia tem números e histórias que pouca gente conhece.", E),
    "R0127": ("Antônio", "Sindilat-MT", "A indústria de laticínios do estado tem uma cadeia inteira de produtores para mostrar em conversa.", E),

    # ---------- ICP4 · Mentores e imobiliário ----------
    "R0005": ("Alessandro", "Style Brokers", "Imóvel de alto padrão se vende com conversa, e as três lojas da Style Brokers têm assunto de sobra.", E),
    "R0017": ("pessoal da Lopes", "Lopes Cuiabá", "Vocês já mantêm um canal no YouTube, e um set de estúdio dá mais peso a cada imóvel apresentado.", T),
    "R0041": ("pessoal da CID", "CID Imóveis", "Uma imobiliária de Cuiabá desde 1977, que já mantém um blog, tem história e conteúdo para muita conversa.", T),
    "R0042": ("pessoal da Imóveli", "Imóveli", "Primeira moradia e Minha Casa Minha Vida geram muita dúvida, e vocês sabem responder cada uma.", E),
    "R0043": ("pessoal da UNIFACC", "UNIFACC-MT", "Uma faculdade com especialização em oratória sabe o valor de uma boa conversa gravada.", E),
    "R0060": ("Luiz", "Cuiabá Imóveis", "Compra e locação em Cuiabá geram as mesmas perguntas todo mês, e cada resposta pode virar um episódio.", N),
    "R0061": ("Joéverton", "DNA Compliance", "Compliance e governança são temas densos, e quem é mentor e professor sabe que eles rendem em conversa.", E),
    "R0062": ("Esmarilda", "MB Inteligência Imobiliária", "Financiamento é a parte que mais assusta quem compra imóvel, e vocês explicam isso desde 2013.", T),
    "R0074": ("pessoal da AB3", "AB3", "Imobiliária e construtora juntas acompanham o imóvel da obra até a entrega das chaves.", E),
    "R0075": ("pessoal da Bueno", "Bueno Negócios Imobiliários", "Regularização de imóvel é um assunto que quase ninguém explica bem e todo comprador precisa entender.", E),
    "R0076": ("pessoal da CVL", "CVL Imóveis", "Vocês já usam o YouTube, e uma conversa em estúdio aproxima o cliente antes da visita ao imóvel.", T),
    "R0077": ("pessoal da Cleide Imóveis", "Cleide Imóveis", "Consultoria de financiamento é onde o comprador mais precisa de alguém explicando com paciência.", E),
    "R0078": ("pessoal da Coach'tigo", "Coach'tigo", "Quem dá palestra e treinamento de liderança já pensa em formato de conversa, só falta o set.", E),
    "R0079": ("pessoal da D3", "D3 Imobiliária", "Venda, locação e financiamento em Várzea Grande são temas em que o cliente confia em quem conhece a região.", E),
    "R0080": ("Gladistone", "Evolua Mentoria", "Vocês já ensinam empreendedores no YouTube e no TikTok, e um estúdio dá outra cara a esse conteúdo.", I),
    "R0081": ("pessoal da Gerencial", "Gerencial Construtora", "Mais de 40 anos construindo em Cuiabá é história suficiente para apresentar cada empreendimento em conversa.", T),
    "R0082": ("Patricia", "Hota Imóveis", "Corretagem em Cuiabá e Várzea Grande gera dúvida de comprador e de inquilino toda semana.", E),
    "R0083": ("pessoal da Prudente", "Imobiliária Prudente", "Vocês já têm canal no YouTube e no TikTok, e crédito imobiliário é tema que rende episódio longo.", T),
    "R0084": ("pessoal da Império", "Império Imóveis de Luxo", "Imóvel de luxo pede apresentação à altura, e conversa bem gravada passa essa sensação.", E),
    "R0085": ("pessoal da Yassin", "Yassin Imobiliária", "Mais de 30 anos entre Cuiabá e Chapada é uma bagagem que o cliente gosta de ouvir de perto.", T),
    "R0086": ("pessoal da Zinger", "Zinger Skills", "Uma escola de oratória ensina a falar bem, e um podcast gravado em estúdio mostra isso na prática.", E),
    "R0099": ("Cândida", "Horas Imóveis", "Uma imobiliária que leva o seu nome promete atendimento pessoal, e conversa gravada mostra isso.", E),
    "R0100": ("Jordano", "Oratória Sem Limites", "Quem ensina oratória e persuasão tem o melhor material para um podcast: a própria voz.", E),
    "R0112": ("pessoal da Vox2you", "Vox2you Cuiabá", "Uma escola de comunicação mostra o resultado dos alunos melhor ainda quando eles falam no microfone.", E),
    "R0121": ("pessoal da FBR", "FBR Consultoria", "Mentoria executiva é feita de conversa, e conversa bem gravada vira prova do método.", E),

    # ---------- ICP5 · Empresas de médio porte ----------
    "R0006": ("Irmã Rose", "Colégio Coração de Jesus", "Um colégio salesiano tem tradição e valores que as famílias gostam de ouvir explicados de perto.", E),
    "R0007": ("Dr. Marcus", "FAIPE", "Uma faculdade com Odontologia, Direito e Marketing tem professor para muita conversa boa.", E),
    "R0008": ("Davi", "Olimpo Engenharia", "Obra industrial e pré-moldado são temas que o cliente entende melhor quando o engenheiro explica.", E),
    "R0018": ("pessoal da Aços Cuiabá", "Aços Cuiabá", "NR-12 e manutenção industrial são assuntos técnicos que o cliente da indústria quer ouvir explicados.", E),
    "R0019": ("pessoal do Bom Jesus", "Bom Jesus Supermercado", "Uma rede de supermercados de Cuiabá conhece o cliente da cidade como poucas empresas conhecem.", E),
    "R0020": ("pessoal do Colégio Maxi", "Colégio Maxi", "Do fundamental ao pré-vestibular, o colégio acompanha anos de decisão das famílias.", E),
    "R0021": ("pessoal do São Gonçalo", "Colégio São Gonçalo", "Um colégio que educa em Cuiabá desde 1894 tem uma história que a cidade inteira gostaria de ouvir.", T),
    "R0022": ("pessoal do São Mateus", "Colégio São Mateus", "Educar do berçário ao ensino médio desde 1980 dá ao colégio muita história de família para contar.", T),
    "R0023": ("pessoal da Construcel", "Construcel", "Quem vende acabamento ajuda o cliente a decidir a cara da casa, e essa conversa rende muito.", E),
    "R0024": ("pessoal da Cuiabá Formas", "Cuiabá Formas", "Mais de 2.000 unidades em parede de concreto é um método que vale ser explicado por quem executa.", T),
    "R0025": ("pessoal da Ginco", "Ginco Urbanismo", "Condomínio de alto padrão se vende com a história do projeto, e essa história cabe numa boa conversa.", E),
    "R0026": ("pessoal do Grupo Moinho", "Grupo Moinho", "Uma rede de materiais de construção com 33 anos tem cliente e história em todas as lojas.", T),
    "R0027": ("pessoal da IMEPP", "IMEPP", "Quem fabrica poste e padrão de energia está por trás de cada ligação nova, e pouca gente sabe disso.", E),
    "R0028": ("pessoal da Intelecto", "Intelecto Sistemas", "Mais de 30 anos desenvolvendo sistema de gestão em Mato Grosso é uma trajetória que merece ser contada.", T),
    "R0029": ("pessoal da Mika", "Mika Alimentos", "Uma indústria cuiabana desde 1993, com a Bebela na prateleira, tem história que o cliente da cidade adora.", T),
    "R0030": ("pessoal da Solidez", "Solidez Transportes", "Uma transportadora 100% mato-grossense com filiais em três estados tem muita estrada para contar.", E),
    "R0031": ("pessoal da TMF", "TMF Engenharia", "Uma construtora em Cuiabá desde 1992 já ergueu parte da cidade, e isso rende uma série de conversas.", T),
    "R0044": ("pessoal da Lotufo", "Lotufo Engenharia", "Pavimentação e energia desde 1996 é infraestrutura que a cidade usa todo dia sem saber quem fez.", T),
    "R0063": ("pessoal da Farma Fácil", "Farma Fácil", "Uma rede de farmácias com cinco unidades conversa com o bairro todo dia, e isso é presença institucional.", E),
    "R0087": ("pessoal da DAC", "DAC Distribuidora", "Uma distribuidora que atende Mato Grosso, Pará e Rondônia tem logística e gente para muitas histórias.", E),
    "R0088": ("pessoal da Direção", "Direção Transportes", "Armazenagem e cross docking são o bastidor que o cliente final nunca vê, e isso é pauta boa.", E),
    "R0089": ("pessoal da SE Distribuidora", "SE Distribuidora", "Uma distribuidora com frota própria conhece o varejo de Mato Grosso de ponta a ponta.", E),
    "R0101": ("pessoal do CIN", "Colégio Isaac Newton", "Robótica e preparatório para ITA e Medicina são temas que as famílias querem ouvir de quem ensina.", E),
    "R0102": ("pessoal da Yanagawa", "Construtora Yanagawa", "Mais de 40 obras em Mato Grosso desde 2010 é um portfólio que fica ainda melhor contado por quem construiu.", T),
}


def main() -> None:
    dados = [{"id": k, "saudacao": s, "nome_curto": n, "frase": f, "fonte": fo}
             for k, (s, n, f, fo) in sorted(PERSONAL.items())]
    destino = os.path.join(os.path.dirname(__file__), "personal.json")
    with open(destino, "w", encoding="utf-8") as fh:
        json.dump(dados, fh, ensure_ascii=False, indent=1)
    print(f"{len(dados)} entradas em {destino}")


if __name__ == "__main__":
    main()

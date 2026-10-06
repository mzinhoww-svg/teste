# Aprendizados do atendimento (livro de bordo dos 30 dias)

Registro vivo do que a conversa real com os leads ensinou. Em **05/11/2026** vira a documentação para a IA assumir mais do atendimento: o que está marcado **Automatizar** entra no código (`atendente/politica.py`) ou no conhecimento da IA (`conhecimento-reiners.md`); o que está **Só humano** continua avisando a equipe.

Regras deste arquivo (o repositório é público): sem nome de lead, empresa, telefone ou chave. Descrever o padrão, não a pessoa. Cada entrada: data, o que aconteceu, o que funcionou, decisão. Quando surgir um aprendizado novo (a Letícia ou o Mazinho contam, ou aparece nas conversas), acrescentar uma entrada aqui na hora.

## Como ler
- **Automatizar**: regra clara, segura de repetir sozinho.
- **Só humano**: depende de julgamento; a IA avisa e a equipe responde.
- **Feito**: já está no código.

---

## 2026-10-06 · Saudação de robô do WhatsApp Business responde à nossa mensagem
- **O que aconteceu:** vários leads (colégio, engenharia, clínica) respondiam em segundos com "agradece seu contato", "em que posso ajudar", "para agilizar o seu atendimento". Era o robô deles, não uma pessoa. O atendente tratava como resposta: marcava "Respondeu", cancelava os próximos toques e avisava a equipe (ainda mais quando a IA estava fora do ar).
- **Decisão:** saudação de robô não conta como resposta. Só grava, não marca, não cancela, não avisa. **Feito** (`politica.e_saudacao_automatica`, PR de 06/10).
- **Cuidado:** se a mensagem tiver qualquer pedido (preço, sair, reunião, interesse), segue o fluxo normal.

## 2026-10-06 · Robôs de triagem pedem dados e não avançam (ideia a validar)
- **O que aconteceu:** alguns robôs respondem com menu ou pergunta ("qual empresa?", "qual o CNPJ?") e a conversa não chega a quem decide.
- **Ideia (Mazinho):** mandar uma palavra curta antes ("Oi"), esperar 8 a 10 segundos e só então enviar a mensagem do toque, para o robô responder à palavra e a mensagem de verdade cair já na conversa aberta.
- **Estado:** **decidido em 06/10 (Mazinho): sempre testar com um "Olá" antes do toque 1** para saber se é robô e qual o melhor caminho. Ainda **não implementado**: precisa de janela de espera (resposta ao "Olá" antes de enviar o toque) e de regra para o que fazer quando for robô de menu. Entra na próxima rodada de trabalho.
- **Cuidado:** o "Oi" solto pode soar mais como robô para quem é humano.

## 2026-10-06 · Lead humano que "não entendeu" quem somos
- **O que aconteceu:** depois do toque, uma pessoa respondeu "Pode me contar brevemente como podemos ajudar?". Não era formulário nem robô: só alguém sem contexto.
- **O que funciona:** resposta curta e simples, que (1) pede desculpa pela confusão, (2) diz quem somos em uma frase (estúdio de podcast em Cuiabá), (3) diz o benefício sem jargão (análise gratuita de como a empresa se comunica, com sugestões práticas, em 30 minutos) e (4) termina numa pergunta fácil: "você é a pessoa certa ou pode me indicar quem cuida da comunicação/marketing?".
- **O que evitar:** o nome interno da oferta ("Diagnóstico de Presença Institucional"), dados extras (CNPJ, endereço) e qualquer valor.
- **Se disser que é a pessoa certa:** mandar o link da agenda. **Se indicar outra:** pedir o contato.
- **Decisão:** **Automatizar** na etapa de dúvida simples do `conhecimento-reiners.md` quando a pergunta for "quem é / como podem ajudar / do que se trata". Ainda não está no conhecimento; entra em 05/11 se os casos reais confirmarem.

## 2026-10-06 · Saudação automática do próprio WhatsApp Business da Reiners
- **O que aconteceu:** numa conversa, saiu do número da Reiners uma mensagem "A Reiners Media agradece seu contato. Como podemos ajudar?". Pela cara, é a **mensagem de saudação do WhatsApp Business**, não do atendente. Em conversa com robô do lead, vira robô falando com robô.
- **Decisão (a equipe confirma):** desligar a saudação automática (WhatsApp Business → Ferramentas → Mensagem de saudação) no número que dispara.

## 2026-10-06 · Conversa que andou até marcar horário (escritório de contabilidade)
Exemplo real, enviado pela equipe (sem nomes). O lead respondeu ao toque 1, fez perguntas práticas, consultou o sócio e **marcou o horário sozinho no mesmo dia**.
- **O que funcionou no toque 1:** gancho do segmento ("recuperação tributária para agro e saúde"), foto do cenário que a mensagem promete, convite concreto e de baixo custo ("um café, uns 20 minutos, e você vê o set funcionando; se for mais fácil, eu vou até vocês") e saída fácil ("se não fizer sentido agora, é só me avisar").
- **A primeira pergunta do lead foi prática: "fica onde?".** Responder na hora, com referência, estacionamento (gratuito, na frente e nos fundos), link do mapa e foto da fachada. Quem pergunta onde fica está considerando ir.
- **Depois da prática, uma pergunta de qualificação curta:** "você sabe como funciona um conteúdo de empresas no modelo podcast?". A resposta ("só ouvi falar") abriu o convite para a conversa de 30 minutos (online, ligação ou presencial) e o link da agenda.
- **O lead disse "vou ver com meu sócio"** e voltou em ~10 minutos com horário ("marca às 16:30 hoje, só manda o link"). Não insistir enquanto ele consulta; deixar o link à mão.
- **Estilo:** várias mensagens curtas em sequência (não um bloco), tom de conversa, sem jargão, respostas em segundos.
- **Decisão para automatizar:** o atendente pode responder sozinho as perguntas **práticas** (endereço, estacionamento, "como funciona a visita", link da agenda) com texto curto em mensagens separadas. Falta pôr os dados do endereço no `conhecimento-reiners.md` (a equipe confirma o texto) e a regra de **enviar em partes curtas com pequena pausa**. Marcar horário, negociar data e qualquer pergunta sobre valor continuam **só humano**.
- **Sinal para a prospecção:** escritório de contabilidade respondeu bem e é, ao mesmo tempo, cliente em potencial e fonte de indicação (vê o filtro de contabilidade do desenho). Vale testar o segmento "contabilidade" como campanha própria com gancho técnico.
- **Conferir:** o link de agenda usado na conversa é diferente do registrado no `conhecimento-reiners.md`. Confirmar qual vale e deixar um só.

## 2026-10-06 · IA indisponível vira aviso à equipe
- **O que aconteceu:** quando a chamada ao OpenRouter falha, todo caso vira aviso, inclusive as saudações de robô. Isso encheu o WhatsApp da equipe.
- **Decisões:** a regra da saudação (acima) tira esse ruído. Falta (**a fazer**) um aviso "IA fora do ar" na faixa do painel e uma checagem de que a chave funciona depois de cada atualização.

## 2026-10-06 · Decisões da Letícia/Mazinho (sem dados pessoais)
- **Endereço** confirmado e gravado em `conhecimento-reiners.md` (perguntas práticas podem ser respondidas sozinhas, em mensagens curtas).
- **Link da agenda:** mantém o original do `conhecimento-reiners.md`.
- **Contabilidade vira segmento próprio** na prospecção (cliente em potencial e fonte de indicação). Gancho técnico, cadência própria.
- **Retomada de lead que foi consultar o sócio:** lembrar em 1 e 2 dias; não insistir antes.
- **Prospecção por decisores:** testar todas as personas (dono, marketing, RH) ao mesmo tempo, medir a taxa de resposta por persona e por segmento, e concentrar o envio no que converte mais. Site da empresa não é o indicador principal, mas é central para qualificar. LGPD revisada pela equipe (06/10): pode seguir.
- **Enriquecimento:** a Lusha via treg cobra por consulta (sem volume grátis pelo treg); entra só como último recurso na cascata.

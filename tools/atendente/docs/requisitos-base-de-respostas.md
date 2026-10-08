# Requisitos: base de respostas do atendente da Reiners Media

Para quem é: o Claude que tem o projeto e o conhecimento da Reiners Media (site, apresentação, cases, tom da Letícia).
O que pedimos: escrever os **documentos base** que a IA do atendente (WhatsApp, VPS) usa para continuar uma conversa
sozinha quando um lead responde, pergunta, pede site, localização ou fala de outro tema.

## 1. Como o atendente funciona hoje (o que você precisa saber)

- Primeiro contato: o sistema manda só **"Olá"**. Se uma pessoa responde, o **toque 1** (apresentação) sai na hora.
  Depois vêm os toques 2, 3 e 4, espaçados, enquanto o lead não responde.
- Quando o lead responde de verdade, uma IA (modelo pequeno, via OpenRouter) **classifica** a mensagem
  (`sair`, `automatica`, `neutra`, `interesse`, `duvida`, `complexo`) e, se for simples, **propõe uma resposta**.
- O código decide se a resposta sai. Ela só sai se:
  - a intenção for `neutra`, `interesse` ou `duvida` **e** a resposta estiver totalmente coberta pela base;
  - tiver até **400 caracteres**;
  - não tiver preço, valor, número de 3+ dígitos, telefone, e-mail, nem link que não seja
    `https://cal.com/leticiareiners/30min`;
  - não tiver as palavras: contrato, proposta, orçamento, desconto, promoção, grátis/gratuito, garantia, parcela, pix,
    boleto, multa, mil, reais.
  - no máximo 1 resposta automática por lead a cada 24 h e 20 por dia no total.
- Todo o resto vira **aviso para a Letícia e o Mazinho** responderem à mão.
- A base é um arquivo de texto (markdown) colado no fim do prompt da IA (`CONHECIMENTO_CAMINHO`). Hoje é
  `.claude/skills/disparar-wa/conhecimento-reiners.md` (leia; é o ponto de partida).

## 2. O que entregar

Três arquivos markdown, em português do Brasil, prontos para colar no repositório:

### 2.1 `conhecimento-reiners.md` (revisado)
Fatos que a IA pode afirmar. Uma afirmação por linha, curta, sem marketing vazio. Cobrir:
1. Quem somos (uma frase) e o que fazemos (lista curta).
2. Para quem é (segmentos que prospectamos: advocacia, contabilidade, clínicas/saúde, imobiliárias, agro, indústria,
   educação, consultorias) e **um porquê por segmento** em uma frase (ex.: advocacia → autoridade e conteúdo sem
   publicidade proibida pela OAB).
3. A oferta de entrada: Diagnóstico de Presença Institucional (o que é, quanto tempo leva, o que a pessoa recebe), visita
   ao estúdio, episódio piloto (sem prometer data nem condição).
4. Como funciona uma gravação (passo a passo em 4–6 linhas: pauta, chegada, gravação, edição, entrega em 48 h úteis).
5. Onde fica (já confirmado; manter igual) e como chegar.
6. Cases ou clientes que **podem ser citados por nome** (só os autorizados; se não houver, escreva "nenhum por enquanto").
7. O que **não** fazemos (para a IA não prometer).

### 2.2 `respostas-base.md`
Respostas modelo por situação. Para cada uma: **quando usar** (exemplos reais de mensagens do lead), **resposta**
(até 400 caracteres, voz da Letícia, primeira pessoa) e **próximo passo** (sempre um só). Situações mínimas:

| # | Situação | Observação |
|---|---|---|
| 1 | Respondeu ao "Olá" com cumprimento ("oi", "bom dia", "quem é?") | O toque 1 já cobre; escreva só a variação para "quem é?" |
| 2 | "Do que se trata?" / "O que vocês fazem?" | |
| 3 | "Tenho interesse" / "Pode explicar melhor?" | Fecha com o link da agenda |
| 4 | Pede o site | Ver seção 3 |
| 5 | Pede localização / "onde fica?" | Ver seção 3; mandar em mensagens curtas |
| 6 | Pede para mandar material / apresentação | |
| 7 | "Não sou eu quem decide" / "Vou falar com o sócio" | Pedir o melhor contato ou dia de retorno |
| 8 | "Agora não" / "Mais pra frente" | Respeitar; perguntar se pode voltar em X dias |
| 9 | "Já temos podcast" / "Já fazemos vídeo" | |
| 10 | "Como conseguiu meu número?" | Resposta honesta: dado público da empresa; oferecer parar |
| 11 | Pergunta sobre horários / quanto tempo dura a gravação | |
| 12 | Quer marcar visita ao estúdio | Link da agenda |
| 13 | Agradecimento / "ok" / emoji | Encerrar sem insistir |
| 14 | Robô / menu de atendimento ("digite 1…") | Qual opção escolher, se houver um padrão; senão, nada |
| 15 | Atendente (secretária, recepção) responde | Pedir o contato de quem cuida de marketing/comunicação |

### 2.3 `fora-do-automatico.md`
Lista do que **nunca** responde sozinho e a frase curta de espera (ex.: "Vou confirmar com a equipe e já te
retorno."): preço, orçamento, proposta, contrato, desconto, reclamação, áudio, imagem, pedido de dados pessoais,
assunto jurídico, qualquer coisa fora da base. Também: quem pediu para sair não recebe mais nada.

## 3. Pontos que dependem de uma mudança no código (anote, nós fazemos)

Hoje a trava de segurança só deixa passar o link da agenda. Para a IA mandar **site** e **mapa** sozinha, vamos
liberar uma lista fechada de links. Diga exatamente quais (ex.: `https://www.reiners.agency`, o link do Maps, o
Instagram) e em que situação cada um vai. Enquanto isso não muda, essas respostas saem como aviso para a equipe.

## 4. Regras de escrita

- Voz da Letícia, primeira pessoa, "você". Curto, educado, sem pressão. Emoji só se o lead usou.
- Uma pergunta por mensagem, no máximo. Sempre um próximo passo claro (geralmente a agenda de 30 min).
- Nada de inventar: se não está na base, a resposta é "vou confirmar com a equipe".
- Nada de preço, número de telefone, e-mail ou valor, mesmo que esteja no site (decisão vale nos primeiros 30 dias).
- Sem dados de leads reais nos arquivos (o repositório é público). Exemplos de mensagens: reescreva sem nome nem número.

## 5. Como saberemos que ficou bom

- Cada resposta da tabela passa nas travas da seção 1 (até 400 caracteres, sem números de 3+ dígitos, sem palavras
  proibidas, sem link fora da lista).
- Cobre as 15 situações e diz, para cada uma, se é automática ou vai para a equipe.
- Lendo só os três arquivos, uma pessoa nova consegue responder um lead sem perguntar nada a ninguém.

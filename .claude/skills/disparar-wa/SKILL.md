---
name: disparar-wa
description: Dispara pelo WhatsApp (WA-AKG) os toques da cadência dos leads da Central de disparo da Reiners, no ritmo seguro (X a cada 30 minutos), acompanha as respostas dos leads, move o lead no funil e anota os detalhes. Use quando a Letícia pedir para disparar, agendar, enviar pelo WhatsApp, conferir envios, ver respostas ou cancelar agendamentos, e a cada rodada da fila quando `config/disparo.status` for "ativo" ou "pausado". O envio em lote só acontece depois de ela ver o plano e confirmar no chat, ou depois de ela clicar em "Iniciar fila de envios" na Central. Resposta a lead só sai depois de ela aprovar o texto.
---

# Disparo pelo WA-AKG

O WA-AKG é o gateway de WhatsApp da Reiners (https://github.com/mrifqidaffaaditya/WA-AKG), instalado à parte. A página da central nunca envia: quem agenda é este passo. Toda a lógica está em `tools/prospeccao/scripts/wa_akg.py`; aqui só se lê e grava o banco. A cadência (textos, foto, espera de 4 e 6 dias, quem saiu ou respondeu) continua sendo a da central.

Central: `https://claude.ai/artifact/91a7c2U3k1kV9PZYY7zvum`. Pasta de trabalho: `WS=/tmp/wa/<YYYYMMDDHHMMSS>` (fora do repositório; dados pessoais).

## Antes de tudo
- Configuração: `WA_AKG_URL`, `WA_AKG_KEY` e `WA_AKG_SESSION`, ou os arquivos `~/.wa-akg/url`, `key` e `session` (chmod 600). Se faltar algo, dizer à Letícia o que falta e parar. Se ela passar a chave no chat, gravar só em `~/.wa-akg/key`. Nunca no repositório, na página, no banco, no histórico de um lead ou na resposta.
- O WA-AKG precisa estar numa URL que este ambiente alcance (HTTPS público) e liberada na rede do ambiente (`mcp__claude-code-remote__read_documentation` com o tópico `environment.network`). `localhost` da máquina dela não serve.
- A foto do toque 1 precisa estar numa URL pública; o WA-AKG baixa a imagem dessa URL. Elas estão publicadas em `https://reiners.agency/fotos-cenarios` (cópia de `central/fotos/` em `public/fotos-cenarios/`): usar essa base em `--fotos-url`, depois de conferir com `curl -I` que a foto abre. Sem ela, o toque 1 não sai, porque a mensagem diz "te mandei uma foto".
- `ArtifactData list` em `leads` com `query.limit: 1000` (seguir `next_cursor`) e `out_dir: $WS/db`; juntar em `$WS/leads.json` (`[{id, ...}]`) e guardar a `version` de cada um. Toda gravação em lead leva o `if_version` lido; conflito: reler aquele lead e refazer só ele.

## Disparo manual (a Letícia pede no chat)
1. **Plano (não envia nada).** `cd tools/prospeccao && python3 -m scripts.wa_akg planejar --leads $WS/leads.json --saida $WS/plano.json --fotos-url <URL> [--max N] [--so ID,ID]`. Ele confere a sessão, confere no WhatsApp se cada número existe, pula quem já respondeu lá e distribui os horários (dias úteis, 9h às 17h de Cuiabá, no máximo 30 por dia, 1 a 3 minutos entre uma mensagem e outra).
2. **Mostrar o plano e parar.** Dizer à Letícia, em poucas linhas e em português simples: quantas mensagens, para quais dias e horas (`resumo.porDia`, `primeiro`, `ultimo`), uma mensagem de exemplo inteira, e os pulados com o motivo. Pedir a confirmação. Nada de agendar antes de ela escrever que confirma, mesmo que o pedido original já dissesse "dispare".
3. **Agendar.** Depois da confirmação: `python3 -m scripts.wa_akg agendar --plano $WS/plano.json --leads $WS/leads.json --saida $WS/agendados.json --confirmo`. Se `erros` não vier vazio, contar à Letícia quais falharam e por quê; não tentar de novo no mesmo turno (reagendar o que já foi pode mandar duas vezes: rodar `conferir` antes).
4. **Gravar.** `ArtifactData batch` com `op: "update"`, `collection: "leads"`, as `updates` de `agendados.json`, até 50 por batch. Grava só `agendamento` e `historico`.
5. **Conferir** (sempre antes de planejar de novo): `python3 -m scripts.wa_akg conferir --leads $WS/leads.json --saida $WS/conferido.json` e gravar as `updates`. Só aqui o lead ganha `etapa` e `enviadoN` (o WA-AKG disse que saiu); nunca no agendamento. `painel` traz `naFila` e `enviadasHoje`.
6. **Cancelar.** `python3 -m scripts.wa_akg cancelar --leads $WS/leads.json --saida $WS/cancelado.json` e gravar as `updates`. Só cancela o que ainda está pendente; o que já saiu aparece em `naoPendentes` e se resolve com `conferir`.
7. **Primeira vez: só o TESTE.** Enquanto não houver um envio de teste confirmado pela Letícia, o único plano permitido é `--so TESTE`. (Já foi feito e confirmado em 05/10; vale refazer se o WA-AKG mudar de número ou de servidor.)
8. **Responder no chat.** Resumo curto: agendados, para quando, pulados e por quê, e (no `conferir`) quantos saíram e falharam. Por fim, `rm -rf $WS`.

## Rodada da fila (botão "Iniciar fila de envios")
A Letícia autoriza clicando em **Iniciar fila de envios** e depois em **Confirmar** na Central: a página grava `config/disparo` com `status: "ativo"`, `porLote` (X, 1 a 10), `intervaloMin: 30` e `limiteDia` (1 a 60). Esse clique é a confirmação do plano; não pedir outra por rodada. O script recusa X ou limite fora desses números.

Uma rodada acontece (a) a cada hora, pela rotina "Fila de envios WhatsApp", (b) no início de qualquer turno em que `config/disparo.status` seja `ativo` ou `pausado`, se `ultimaRodada` tiver mais de 10 minutos. Cada rodada:
1. **Trava.** Ler `config/disparo`. Se `rodandoDesde` for de menos de 15 minutos, parar sem fazer nada. Senão, gravar `rodandoDesde: agora` com o `if_version` lido (conflito = outra rodada começou: parar).
2. **Pausada?** Se `status == "pausado"`: rodar `cancelar` (passo 6 acima), gravar as `updates`, gravar em `config/disparo` `ultimaRodada`, `resumo.naFila: 0` e apagar `rodandoDesde` (`{"__delete__": true}`). Fim. Não mudar o `status`.
3. **Conferir** (passo 5): grava o que saiu, falhou ou sumiu. Guardar `painel`.
4. **Respostas** (seção abaixo): `caixa`, classificar, anotar, mover no funil, gerar sugestões. Gravar as atualizações.
5. **Reler os leads** (para o plano ver `situacao` e `etapa` já atualizados) e **planejar em modo fila**: `python3 -m scripts.wa_akg planejar --leads $WS/leads.json --saida $WS/plano.json --fotos-url https://reiners.agency/fotos-cenarios --por-lote <porLote> --limite-dia <limiteDia> --horizonte-min 60`. O script conta o que o número já tem agendado ou enviado (nunca mais de X em qualquer intervalo de 30 minutos, nem do limite do dia) e só planeja a próxima hora. Saída `3` = sessão do WhatsApp caiu: gravar `aviso: "A sessão do WhatsApp caiu: escaneie o QR de novo no WA-AKG."` e ir ao passo 7.
6. **Agendar** com `--confirmo` e gravar as `updates` (passo 4 do disparo manual).
7. **Registrar a rodada** em `config/disparo` (`update` com `if_version`): `ultimaRodada` (agora), `resumo: {naFila, enviadasHoje, respostasNovas, pulados, dia}`, `aviso` e apagar `rodandoDesde`. `naFila` e `enviadasHoje` vêm do `painel` do `conferir`, somando o que acabou de agendar. `respostasNovas` conta as respostas tratadas hoje (somar às anteriores quando `resumo.dia` for de hoje; zerar na virada do dia). `pulados` vem do plano. `aviso`: texto curto em português quando algo precisa da atenção dela (sessão caiu, fora do horário de envio, nada vence hoje) e `null` quando está tudo certo. Se o plano veio vazio com `resumo.adiados > 0`, é fora do horário (segunda a sexta, 9h às 17h de Cuiabá): `aviso: "Fora do horário de envio. Volta às 9h."`.
8. **Responder só se a Letícia estiver na conversa**: uma linha com agendados, enviados, respostas novas e o que precisa dela (ver Respostas). Na rotina (sem conversa), terminar em silêncio se nada precisa dela.

Nunca mudar `status` da fila, a não ser por pedido dela. Falhas repetidas (3 rodadas seguidas com erro) = gravar `aviso` e parar de agendar até ela olhar.

## Respostas dos leads
`python3 -m scripts.wa_akg caixa --leads $WS/leads.json --saida $WS/caixa.json` (só leitura) devolve, por lead, as mensagens novas (`novas`), o fim da conversa (`conversa`) e `vistasAte`. Melhor esforço: se o WA-AKG guardar a conversa sob outro endereço (LID), a resposta não aparece aqui; o botão **Respondeu** do card continua valendo.

Para cada lead com resposta nova, ler `novas` junto com `conversa` e decidir **uma** intenção. Gravar sempre `respostasVistasAte = vistasAte` e uma linha no `historico` com `tipo: "resposta"` (aparece no card, aba Histórico): `Respondeu no WhatsApp (<intenção>): "<trecho de até 200 caracteres>". <detalhes>`. Detalhes: o que perguntou ou pediu, datas, telefones, e-mails e nomes que citou, tom (animado, seco, irritado).

| Intenção | Quando | `situacao` | Sugerir resposta |
|---|---|---|---|
| `sair` | pede para parar, remover ou diz com clareza que não quer | `sair` | não |
| `interesse` | quer conversar, marcar visita, pergunta valor ou como funciona | `respondeu` | sim |
| `duvida` | pergunta ou objeção sobre o serviço | `respondeu` | sim |
| `redirecionou` | manda falar com outra pessoa, e-mail ou setor | `respondeu` | sim |
| `neutra` | "ok", "obrigado", emoji, sem pedido | `respondeu` | opcional, curta |
| `midia` | só áudio, imagem ou documento | `respondeu` | não (ela precisa ouvir ou ver) |
| `automatica` | resposta automática, "fora do escritório", menu de atendimento | não muda | não |

- **Mover no funil** é só isso: `respondeu` leva o lead para "Responderam" e tira da cadência; `sair` tira de vez. **Nunca** marcar `fechou`, nunca mexer em `etapa` nem `enviadoN` e nunca apagar nada.
- Começar a anotação com `ATENÇÃO:` quando a pessoa falar de preço, contrato, reclamação, irritação, advogado ou cobrança, e avisar a Letícia no chat na mesma hora. Não sugerir resposta com valor, prazo ou promessa.
- **Sugestão de resposta**: gravar no lead `respostaSugerida: {texto, geradoEm}` e uma linha no `historico` (`tipo: "resposta"`): `Sugestão de resposta (não enviada): <texto>`. Na voz da Letícia, primeira pessoa, curta (até 400 caracteres), no mesmo tom da cadência ("Oi, <nome>, ..."), sem emoji a menos que a pessoa use. Só usa o que a Reiners oferece (conhecer o estúdio, o diagnóstico, o episódio piloto). Não inventa preço, data nem disponibilidade: se a pessoa propôs um dia, a sugestão pergunta ou diz que confirma.
- **Enviar resposta** só depois de a Letícia aprovar o texto no chat ("pode enviar", "manda"), com o texto final que ela aprovou: gravar o texto num arquivo e rodar `python3 -m scripts.wa_akg responder --leads $WS/leads.json --lead <ID> --texto-arquivo $WS/r.txt --saida $WS/resposta.json --confirmo`, depois gravar a `update`. Nunca enviar resposta por conta própria, nem na rotina. O script recusa lead que saiu ou fechou.
- Mostrar à Letícia, no chat, as respostas novas em lista curta: nome do lead, intenção, o que ele disse em uma frase, e a sugestão. Pedir aprovação, edição ou "ignorar".

## Regras
- Só entra na fila lead de canal WhatsApp, em cadência (`situacao` vazia ou `ativo`), com o toque vencendo hoje pela mesma regra da central. E-mail, quem respondeu, saiu ou fechou nunca entram.
- Não mudar texto, foto, ordem nem espera da cadência; o script usa a mensagem do toque como a central a abre.
- Ritmo: X a cada 30 minutos (X de 1 a 10, padrão 5), no máximo `limiteDia` por dia (padrão 30), de segunda a sexta, das 9h às 17h de Cuiabá. Não aumentar sem ela pedir: o WhatsApp bane quem manda muito e rápido. `--janela` e `--todos-os-dias` existem só para teste com `--so`.
- Nunca editar `enviadoN` nem `etapa` à mão aqui.
- Para parar na hora: `cancelar` (passo 6). Pausar na Central só cancela na próxima rodada.

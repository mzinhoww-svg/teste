---
name: disparar-wa
description: Agenda no WhatsApp (pelo WA-AKG) os toques da cadência dos leads da Central de disparo da Reiners que vencem hoje, confere o que já saiu e cancela o que ainda não saiu. Use quando a Letícia pedir para disparar, agendar, enviar pelo WhatsApp, conferir os envios ou cancelar os agendamentos. Nunca roda sozinho: o envio só acontece depois de ela ver o plano e confirmar no chat.
---

# Disparo pelo WA-AKG

O WA-AKG é o gateway de WhatsApp da Reiners (https://github.com/mrifqidaffaaditya/WA-AKG), instalado à parte. A página da central nunca envia: quem agenda é este passo. Toda a lógica está em `tools/prospeccao/scripts/wa_akg.py`; aqui só se lê e grava o banco. A cadência (textos, foto, espera de 4 e 6 dias, quem saiu ou respondeu) continua sendo a da central.

Central: `https://claude.ai/artifact/91a7c2U3k1kV9PZYY7zvum`. Pasta de trabalho: `WS=/tmp/wa/<YYYYMMDDHHMMSS>` (fora do repositório; dados pessoais).

## Antes de tudo
- Configuração: `WA_AKG_URL`, `WA_AKG_KEY` e `WA_AKG_SESSION`, ou os arquivos `~/.wa-akg/url`, `key` e `session` (chmod 600). Se faltar algo, dizer à Letícia o que falta e parar. Se ela passar a chave no chat, gravar só em `~/.wa-akg/key`. Nunca no repositório, na página, no banco, no histórico de um lead ou na resposta.
- O WA-AKG precisa estar numa URL que este ambiente alcance (HTTPS público) e liberada na rede do ambiente (`mcp__claude-code-remote__read_documentation` com o tópico `environment.network`). `localhost` da máquina dela não serve.
- A foto do toque 1 (`central/fotos/<id>.jpg`) precisa estar numa URL pública; o WA-AKG baixa a imagem dessa URL. Pedir a base à Letícia (`--fotos-url`). Sem ela, o toque 1 não sai, porque a mensagem diz "te mandei uma foto".

## Passos
1. **Leads.** `ArtifactData list` em `leads` com `query.limit: 1000` (seguir `next_cursor`) e `out_dir: $WS/db`. Juntar em `$WS/leads.json` (`[{id, ...}]`) e guardar a `version` de cada um.
2. **Plano (não envia nada).** `cd tools/prospeccao && python3 -m scripts.wa_akg planejar --leads $WS/leads.json --saida $WS/plano.json --fotos-url <URL> [--max N] [--so ID,ID]`. Ele confere a sessão, confere no WhatsApp se cada número existe, pula quem já respondeu lá e distribui os horários (dias úteis, 9h às 17h de Cuiabá, no máximo 30 por dia, 1 a 3 minutos entre uma mensagem e outra).
3. **Mostrar o plano e parar.** Dizer à Letícia, em poucas linhas e em português simples: quantas mensagens, para quais dias e horas (`resumo.porDia`, `primeiro`, `ultimo`), uma mensagem de exemplo inteira, e os pulados com o motivo. Pedir a confirmação. Nada de agendar antes de ela escrever que confirma, mesmo que o pedido original já dissesse "dispare".
4. **Primeira vez: só o TESTE.** Enquanto ela não tiver recebido uma mensagem de teste no próprio WhatsApp, o único plano permitido é `--so TESTE` (o card TESTE usa o número da Reiners). Só depois que ela disser que chegou certo é que o lote real pode ser agendado.
5. **Agendar.** Depois da confirmação: `python3 -m scripts.wa_akg agendar --plano $WS/plano.json --leads $WS/leads.json --saida $WS/agendados.json --confirmo`. Se `erros` não vier vazio, contar à Letícia quais leads falharam e por quê; não tentar de novo no mesmo turno (reagendar o que já foi pode mandar duas vezes: rodar `conferir` antes).
6. **Gravar.** `ArtifactData batch` com `op: "update"`, `collection: "leads"`, as `updates` de `agendados.json`, até 50 por batch, cada uma com o `if_version` lido no passo 1. Grava só `agendamento` e `historico`. Conflito: reler aquele lead e refazer só ele.
7. **Conferir.** Em qualquer turno em que a Letícia pedir "conferir" ou "o que saiu", e sempre antes de planejar de novo: repetir o passo 1 e rodar `python3 -m scripts.wa_akg conferir --leads $WS/leads.json --saida $WS/conferido.json`. Gravar as `updates` como no passo 6. Só aqui o lead ganha `etapa` e `enviadoN` (o WA-AKG disse que saiu); nunca no agendamento.
8. **Cancelar.** Se ela pedir para cancelar: `python3 -m scripts.wa_akg cancelar --leads $WS/leads.json --saida $WS/cancelado.json` e gravar as `updates`. Só cancela o que ainda está pendente; o que já saiu aparece em `naoPendentes` e se resolve com `conferir`.
9. **Responder.** Resumo curto: quantos agendados, para quando, quantos pulados e por quê, e (no `conferir`) quantos saíram e quantos falharam. Por fim, `rm -rf $WS`.

## Regras
- Só entra lead de canal WhatsApp, em cadência (`situacao` vazia ou `ativo`), com o toque vencendo hoje pela mesma regra da central. E-mail, quem respondeu, saiu ou fechou nunca entram.
- Não mudar texto, foto, ordem nem espera da cadência; o script usa a mensagem do toque como a central a abre.
- Quem respondeu no WhatsApp aparece como pulado. Quem marca "Respondeu" é a Letícia, no card; este passo não muda `situacao`.
- Não aumentar `--limite-dia` (30) sem ela pedir: é número novo e o WhatsApp bane quem manda muito e rápido.
- Nunca editar `enviadoN` nem `etapa` à mão aqui.

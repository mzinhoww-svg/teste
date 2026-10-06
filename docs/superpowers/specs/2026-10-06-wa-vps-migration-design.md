# Atendente do WhatsApp na VPS: envios e respostas em tempo real

Data: 06/10/2026. Estado: **aprovado em 06/10/2026** pela Letícia e pelo Mazinho (respostas da seção 11). Implementação em `docs/superpowers/plans/2026-10-06-atendente-vps.md`.
Substitui o que hoje é feito pelo Claude (rotina horária) e prepara a migração da Central de disparo (artefato) para a VPS.

## 1. Objetivo e o que é sucesso
Os envios e as respostas aos leads acontecem **sozinhos, o dia todo, em tempo real**, num processo próprio na VPS, sem o Claude
nem a Central abertos.

Sucesso é medido assim:
1. Uma resposta de lead é lida em até **10 segundos** e tratada (respondida ou avisada) em até **1 minuto**.
2. Os envios saem no ritmo seguro (X a cada 30 minutos, 50 por dia, seg a sex, 9h às 17h de Cuiabá) sem ninguém clicar.
3. Quem pede para sair **nunca** recebe outra mensagem; um lead que respondeu perde na hora os envios pendentes.
4. Caso complexo (preço, contrato, reclamação, áudio, fora do conhecimento) chega por WhatsApp à Letícia e ao Mazinho em até 1 minuto.
5. Em 05/11/2026 existe um registro de 30 dias de conversas, usável como documentação para a IA assumir mais do atendimento.
6. Se a IA, a VPS ou o OpenRouter falharem, o sistema **cai para "avisar a equipe"**, nunca para "responder errado".

## 2. Decisões já tomadas (pela Letícia e pelo Mazinho)
- A lógica fica **na VPS**; o WA-AKG já está lá (`wa.reiners.agency`, sessão `fjenui`).
- **Não migrar o repositório antigo do CRM da Reiners** (Next.js + Supabase). Só o conteúdo do artefato Central de disparo.
- Um CRM **enxuto**, com kanban, ligado ao WhatsApp. O `kargulstudio/kanban` é uma referência de kanban, não uma dependência obrigatória.
- Autonomia B: a IA responde sozinha os casos simples; complexos avisam a equipe. Limites: 1 resposta automática por lead a cada 24 h, 20 por dia.
- IA via **OpenRouter**, escolhendo o melhor custo-benefício por teste (seção 7). A chave já está nas variáveis do ambiente do Claude; na VPS terá chave própria.
- Os avisos vão para a Letícia e o Mazinho; os números ficam em `AVISAR_NUMEROS` (`.env` da VPS), nunca no repositório.
- Conhecimento de resposta: o site reiners.agency (`conhecimento-reiners.md`); agenda: https://cal.com/leticiareiners/30min. Nos primeiros 30 dias a IA não cita valores.
- Registro de 30 dias para a documentação, e depois "migração para crons e tirar do Claude" (este documento é esse plano).

## 3. Arquitetura
Tudo na mesma VPS (2 GB de RAM, já com WA-AKG + MySQL), em contêineres, atrás do Caddy (HTTPS).

```
 WhatsApp ⇄ WA-AKG (já existe) ──webhook message.received──▶ atendente (novo)
                                  ◀── API: enviar, agendar, cancelar ──┘
 atendente ──▶ OpenRouter (classificar e redigir)      atendente ──▶ avisar equipe (WhatsApp)
 atendente ◀▶ SQLite (arquivo único)                   Caddy ──▶ central.reiners.agency (kanban)
```

**`atendente`** (um serviço só, Python, reaproveitando `tools/prospeccao/scripts/wa_akg.py` e seus 68 testes):
- **Receptor**: webhook do WA-AKG, só aceito da rede interna e com segredo. Guarda a mensagem e enfileira. Se o webhook falhar, uma
  conferência a cada 5 minutos lê as conversas (o `caixa` de hoje) e pega o que faltou.
- **Decisor**: classifica a intenção (sair, interesse, dúvida, neutra, mídia, automática, complexo) com saída JSON fechada; o código,
  não a IA, decide a ação pela tabela de política (seção 5).
- **Respondedor e avisador**: envia pelo WA-AKG; avisa a equipe em até 1 minuto (junta casos próximos num só aviso).
- **Planejador**: a cada 30 minutos aplica as regras do `planejar` de hoje e agenda no agendador do WA-AKG (já provado). Ao chegar uma
  resposta, **cancela na hora** os pendentes daquele lead (`DELETE /scheduler/{id}`).
- **Registro**: toda resposta tratada vira uma linha em `atendimento`; as intervenções humanas (mensagens da equipe) também.
- **Interface**: página única servida pelo próprio serviço (seção 6).

**Banco**: SQLite em volume do Docker, com cópia diária (arquivo comprimido) para fora da VPS. Por que não o Supabase do CRM antigo:
foi descartado; por que não o MySQL do WA-AKG: é do WA-AKG, não se mistura. Tabelas: `leads`, `toques`, `mensagens`, `atendimento`,
`config`, `conhecimento`. Dados de partida: exportação única do artefato (391 leads) para JSON, importada pelo serviço.

## 4. Quem manda no quê
- **Fonte da verdade dos leads**: hoje o artefato. Na **F2** ela passa para o SQLite da VPS, no mesmo dia em que a Letícia ganha a tela mínima da VPS (seção 6); a partir daí o artefato fica só leitura. Nunca os dois escrevendo.
- **Envio**: só o WA-AKG envia. O `atendente` pede; o WA-AKG executa e confirma.
- **Pausa e parada**: `config.status` (`ativo`, `pausado`, `parado`) vale para tudo. Existe um botão **Parar tudo** que desliga respostas
  automáticas e cancela os pendentes.

## 5. Política de resposta (a que a Letícia aprovou)
| Intenção | Ação |
|---|---|
| sair | `situacao = sair`, cancela pendentes, **nenhuma mensagem** |
| automática (fora do escritório, menu) | nada |
| neutra | responde sozinha, curta |
| interesse | responde sozinha com o link da agenda |
| dúvida simples coberta pelo conhecimento | responde sozinha |
| complexo ou qualquer incerteza | **não responde**, avisa a equipe |

Travas no **código**, fora do alcance da IA: no máximo 1 resposta automática por lead a cada 24 h; no máximo 20 por dia; nenhuma para
quem saiu ou fechou; texto até 400 caracteres; a IA não escolhe destinatário. Texto do lead é **dado**, nunca instrução: vai num campo
próprio do pedido, a IA só devolve JSON `{intencao, simples, resposta?, motivo?}` e qualquer coisa fora disso vira "avisar a equipe".
Em dúvida entre simples e complexo, é complexo.

## 6. Kanban e a migração do artefato (lean)
Colunas do funil de hoje (Aquecimento, Responderam, Reunião, Sair, e as que a Central já tem), card com histórico, painel da fila e
caixa de atendimento (o que a IA respondeu, o que foi avisado, o que a equipe escreveu). Uma tela para a Letícia aprovar ou editar o que
passa de "complexo" para "simples" ao fim dos 30 dias. Acesso: login simples de 3 pessoas (Caddy + senha forte) em
`central.reiners.agency`. O `crm.reiners.agency` atual é do site antigo e **não é tocado**. O artefato continua funcionando até o corte.

## 7. IA (OpenRouter) e custo
- Dois usos, ambos curtos: classificar e redigir (até 400 caracteres). Volume esperado: dezenas de respostas por dia.
- O modelo sai de um **teste com 50 respostas reais** (ou o que houver): acerto na classificação, tom, custo por resposta. Começa-se
  pelo mais barato que acerte a classificação com folga; só sobe se errar. A escolha fica em `config`, trocável sem mexer no código.
- Limite de gasto mensal na chave do OpenRouter. Estourou ou a API caiu: o sistema avisa a equipe em vez de responder.

## 8. Fases
- **F0, segurança da VPS (antes de tudo)**: entrada por chave SSH e bloqueio de tentativas repetidas, trocar a senha de root e a do WA-AKG,
  trocar a chave do WA-AKG que vazou, cópia de segurança do banco do WA-AKG (a sessão do WhatsApp mora nele), firewall só 22, 80 e 443.
- **F1, atendente em modo sombra (48 h)**: recebe respostas, classifica e **só avisa a equipe** com a resposta que enviaria. Não responde.
  Compara com o que a Letícia faria. O Claude segue como está.
- **F2, ligar a resposta automática e o planejador na VPS**; desligar a rotina do Claude e o envio pelo artefato. Migração dos leads para o SQLite, junto com uma **tela mínima** em `central.reiners.agency`: lista por coluna, histórico do card, botões Respondeu, Sair e **Parar tudo**, e o painel da fila.
- **F3, kanban completo na VPS** (arrastar entre colunas, caixa de atendimento, tela de aprovação do que passa a ser "simples"); o artefato é desligado.
- **F4, 05/11/2026**: documentação dos 30 dias; decidir o que passa de "complexo" para "simples" (inclusive citar valores).

## 9. Testes e segurança
- A política (seção 5) tem testes de unidade, incluindo texto de lead tentando "dar ordens à IA", e conversas reais reexecutadas.
- Teste de **parada**: com `parado`, nenhuma mensagem sai e os pendentes são cancelados.
- Segredos só em arquivo de ambiente da VPS (modo 600), nunca no repositório, no banco ou nos logs; telefone não vai para log.
- O que sai da VPS: texto do lead e conhecimento do site para o OpenRouter. Nada de lista de leads inteira.

## 10. Riscos
- Banimento do número: mitigado por X a cada 30 min, 50 por dia, janela 9h às 17h, e parada instantânea.
- Memória (2 GB): o `atendente` precisa caber em cerca de 150 MB; se a VPS apertar, sobe o plano ou o build deixa de rodar lá.
- Conversas guardadas sob outro endereço (LID) podem não aparecer na leitura; a conferência periódica e o botão **Respondeu** cobrem.
- O WA-AKG é de terceiros: manter a versão fixa e testar antes de atualizar.

## 11. Decisões finais (06/10/2026)
1. **SQLite** como banco do atendente. Aprovado.
2. Kanban em **`central.reiners.agency`**. O MCP da Vercel só consegue editar um registro existente ou **substituir a zona inteira**; como não lista os registros, criar um só é impossível sem risco de apagar e-mail e outros. Portanto: o registro `central` (A, 187.102.244.188) é criado à mão na Vercel (1 minuto) e, enquanto isso, a mesma tela abre em **`https://wa.reiners.agency/central/`** (nenhum DNS novo).
3. **Sem modo sombra**: a resposta automática liga direto, com o interruptor abaixo como rede de segurança.
4. **Teto de US$ 5 por mês** no OpenRouter, aplicado em dois lugares: no código (soma dos custos reais; passou do teto, a IA para e a equipe é avisada) e no limite da própria chave no painel do OpenRouter.
5. **Interruptor no painel admin** da Central: *Respostas automáticas* (liga/desliga) e *Parar tudo* (nada sai, pendentes cancelados). Visíveis o tempo todo, acima de tudo.

## 12. Regras de repositório (o repositório é PÚBLICO)
Nenhum telefone de pessoa, lead, conversa, chave ou senha vai para o repositório. Números da equipe, segredos e chave do OpenRouter ficam em
`/opt/atendente/.env` (modo 600) na VPS. Os dados dos leads vão da exportação do artefato direto para a VPS, fora do Git.
O webhook do WA-AKG é assinado com HMAC-SHA256 (`X-Webhook-Signature: sha256=<hex>`); sem assinatura válida, é rejeitado.

## 13. Fora do escopo desta entrega
- Cópia de segurança **automática para fora da VPS** (precisa de um destino com credencial: S3, Drive...). Entra: cópia diária local (14 dias)
  e botão "Baixar cópia" no painel admin.
- Fase F4 (05/11/2026): é uma data futura; fica agendada (lembrete), não é executável hoje.

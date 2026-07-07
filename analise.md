# Análise do CRM AI Studio — evolução sob a ótica de um CRM maduro

> Documento estratégico. Descreve o estado atual, aprofunda **todas** as frentes
> de melhoria e propõe uma **cadência de execução ordenada por prioridade e
> dependência** (ondas F0→F5). A camada estrutural que destrava a maior parte
> deste plano está na migration **`supabase/migrations/0013_foundation.sql`**.

---

## 1. Sumário executivo

O sistema **não sofre de falta de features** — sofre de **falta de costura**. Há
ilhas muito bem construídas (agentes com governança, esteira Ganhou→Entrega,
portal do cliente, contratos/assinatura, cadências/SLA, relatórios financeiros)
que **não conversam de ponta a ponta**. Sob a ótica de CRM, um sistema é uma
máquina de estado onde cada objeto sabe seu "próximo dono". Hoje faltam as
ligações estruturais que tornam isso possível:

- **Dono do deal existe na coluna, mas não no processo** (`owner_user_id` só é
  usado para restringir vendedor — sem roteamento, histórico ou ranking).
- **Não há event stream nem histórico de estágio** → metade dos relatórios "de
  verdade" (conversão estágio-a-estágio, tempo em estágio, atribuição de
  resultado) é impossível hoje.
- **Proposta, contrato e fatura não têm FK entre si** → não dá para garantir
  "proposto == assinado == cobrado".
- **Empresa é modelada como B2C** (texto livre no contato; `client_account` só
  nasce no Ganho) quando o negócio é B2B.
- **Agentes são 9 botões manuais**, sem orquestrador que decida qual roda quando.

A migration de fundação resolve a base estrutural. As ondas seguintes constroem
processo, orquestração e diferenciação em cima dela.

---

## 2. Mapa de dependências (o que destrava o quê)

```
F0 FUNDAÇÃO (migration 0013)
├── deal_events + deal_stage_history ──┐
├── contracts.proposal_id / invoices ──┼──► F2 Tracking real (timeline, funil, atribuição)
├── loss_reasons ──────────────────────┘        └──► F4 Relatórios/forecast confiáveis
├── owner_user_id (índice/histórico) ──► F1 Roteamento ──► F4 Ranking/carga/comissão
├── tasks ─────────────────────────────► F1 "Meu dia" real ──► F3 Orquestrador (agente cria task)
├── goals ─────────────────────────────► F4 Cockpit de gestão (meta x atingido)
├── client_accounts.lifecycle ─────────► F1 Empresa 360 desde o lead ──► F5 pós-venda→recompra
├── proposal_items(product_id) ────────► F4 Relatório de mix/margem
└── lead_inbox + attribution ──────────► F1 Intake multicanal ──► F2 relatório de canal

F3 ORQUESTRADOR depende de: tasks (F0) + deal_events (F0) + cadence_rules (já existe)
F5 INTEGRAÇÕES (Calendar/Drive/Canva/transcrição) depende de: tasks + deal_events (F0)
```

**Regra de ouro:** nada de agente novo ou integração antes da F0/F1. Sem dono,
sem eventos e sem empresa-entidade, qualquer feature nova nasce sem base para
medir e sem para onde escalar.

---

## 3. Cadência de execução (ondas)

Legenda de esforço: **P** ≤ meio dia · **M** 1–2 dias · **G** 3+ dias.

### F0 — Fundação estrutural  ·  **entregue nesta migration** (0013)  ·  M
Aplicar `0013_foundation.sql` e regenerar os types (`generate_typescript_types`).

| Item | Tabela/coluna | Destrava |
| --- | --- | --- |
| Event stream append-only | `deal_events` (+ trigger + `log_deal_event`) | timeline unificada, atribuição, sinal p/ IA |
| Histórico de estágio | `deal_stage_history` (+ trigger + backfill) | conversão por estágio, tempo em estágio, deals presos |
| Integridade comercial | `contracts.proposal_id`, `invoices.proposal_id`, `proposal_items` | proposto==assinado==cobrado, mix de produto |
| Empresa ciclo de vida | `client_accounts.lifecycle/owner/domain/first_won_at` | Empresa 360 desde o lead |
| Motivos de perda | `loss_reasons` + `deals.lost_reason_id` | relatório de perda confiável |
| Metas | `goals` | forecast e cockpit de gestão |
| Tarefas com estado | `tasks` | "Meu dia" real, agente vira ator |
| Intake + atribuição | `lead_inbox`, `deals.attribution/intake_channel` | captura multicanal, relatório de canal |
| Ownership | `deals.owner_assigned_at` + índice | roteamento e ranking |
| LGPD | `contacts.consent_*` | opt-in/opt-out, base legal |

**Aceite:** migration aplica limpa; mover um deal de estágio cria linha em
`deal_stage_history` (com `duration_seconds` na anterior) e um `deal_events`
`stage_changed`; deals antigos têm histórico via backfill.

---

### F1 — Processo & entrada (usar a fundação)  ·  G

Depende de F0. É onde o dado estrutural vira **processo operacional**.

**1.1 Roteamento / dono no processo — M.** Ao criar lead, aplicar `routing_rules`
(round-robin com `routing_state`, por segmento ou fixo) e gravar `owner_user_id`
+ `owner_assigned_at`. UI: "Meu pipeline" (filtro por dono), reatribuir no
drawer. *Arquivos:* `app/actions.ts` (createLead), `lib/routing.ts` (novo),
`components/DealDrawer.tsx`. **Aceite:** lead novo cai com dono por regra;
reatribuição gera `deal_events` `owner_changed`.

**1.2 Empresa como entidade desde o lead — M.** Criar/associar `client_account`
(lifecycle `lead`) já na criação do deal, não só no Ganho; deduplicar por
`domain`/`cnpj`. Tela "Empresa 360" lista contatos + deals + faturas + projetos.
A esteira só promove `lifecycle` para `ativo` e carimba `first_won_at`.
*Arquivos:* `app/actions.ts`, `lib/esteira.ts`, `app/app/clientes/[id]/page.tsx`.

**1.3 Tarefas com estado (substituir o overload de `activities`) — M.** Migrar o
uso de `activities.due_at/done_at` para `tasks`. "Meu dia" (`/app/tarefas`) passa
a ler `tasks` do usuário (atrasadas/hoje/próximas), concluir/reagendar. A esteira
e a cadência criam `tasks` (source=`esteira`/`cadence`) em vez de notes.
*Arquivos:* `app/app/tarefas/page.tsx`, `lib/esteira.ts`, `lib/run-agent.ts`.

**1.4 Intake multicanal — M/G.** `lead_inbox` recebe WhatsApp inbound (bridge, já
previsto), formulário público (landing) e e-mail (Gmail). Tela "Caixa de
entrada" converte item → deal (com dedup) ou descarta. Importação CSV para
migração de base legada. *Arquivos:* `app/api/whatsapp/webhook/route.ts`,
`app/api/intake/route.ts` (novo), `app/app/inbox/page.tsx` (novo),
`app/api/import/route.ts`. **Aceite:** lead que chega no WhatsApp vira card sem
digitação; CSV importa contatos+deals.

**1.5 Gating por estágio (ampliar o p1b) — P.** Critérios de saída: não move para
Proposta sem decisor+orçamento; não Ganha sem contrato assinado. Força a
qualidade de dado que os relatórios de F4 exigem.

---

### F2 — Tracking real (consumir os eventos)  ·  M

Depende de F0 (eventos/histórico). Transforma dado bruto em visão.

**2.1 Timeline unificada no drawer — M.** Uma aba "Histórico" que lê `deal_events`
+ `deal_stage_history` + `agent_runs` + `messages` numa rolagem única (Fase H do
roadmap antigo, agora com fonte de dado própria). **Aceite:** tudo do
relacionamento numa tela.

**2.2 Instrumentar as fontes de evento — P (cada).** Ligar `log_deal_event` nos
pontos-chave: envio de proposta (`proposal_sent`), visualização via `share_token`
(`proposal_viewed`), webhook Brevo → `email_opened`/`email_sent`, WhatsApp
in/out, contrato enviado/assinado (webhook OpenSign). *Arquivos:*
`app/api/webhooks/brevo/route.ts`, `app/api/webhooks/opensign/route.ts`,
`app/proposta/[token]/page.tsx`, `lib/run-agent.ts`.

**2.3 Engajamento derivado — P.** Substituir o `engagement` estático por um valor
calculado dos eventos (respondeu rápido, abriu e-mail, viu proposta) — vira
insumo real do scoring.

---

### F3 — Orquestração de agentes  ·  G

Depende de F0 (tasks + eventos) e da cadência existente. É o "pulo do gato":
sair de **9 botões** para um **maestro**.

**3.1 Orquestrador event-driven — G.** Dado um evento (`stage_changed`,
`whatsapp_in`, SLA estourado), decide qual agente roda, encadeia
(Nutrição→Scoring→Copiloto) e só chama o humano no ponto de decisão (aprovar
proposta, enviar contrato). Reaproveita `run-agent`, `agent_runs`, `cadence_rules`.
*Arquivos:* `lib/orchestrator.ts` (novo), `app/api/cron/cadences/route.ts`.

**3.2 Scoring contínuo — M.** Recalcular a cada `deal_events` relevante (não no
clique). Guardar a curva (o `score_changed` já é registrado pela trigger de F0).

**3.3 Next-best-action viva no card — M.** Campo derivado, recalculado a cada
evento, exibido no topo do drawer ("parado 4d em Proposta → ligar hoje").

**3.4 Ajuste do roster de agentes:**
- **Fundir Coach + Aprendizado** em "Inteligência Comercial" (2 modos:
  por-interação / agregado) — hoje se sobrepõem e confundem "qual roda quando".
- **Novos agentes** (todos dependem de F0/F1): **Roteamento** (atribui dono),
  **Forecast/Health do Pipeline** (pontua o *pipeline*, não o lead),
  **Reativação/Win-back** (age sobre `perdido`/`inativo`), **Data Quality**
  (duplicata, campo faltando, deal sem atividade).
- **Copiloto**: fechar o loop — enviar de verdade (bridge/Brevo) e realimentar o
  engajamento a partir da resposta.

---

### F4 — Gestão (cockpit do gestor)  ·  M/G

Depende de F0 (goals, stage_history, loss_reasons, owner) e F2 (eventos).

**4.1 Metas x atingimento — M.** UI de `goals` (por vendedor/mês/produto) e
forecast ponderado por `probability` × dono.
**4.2 Pipeline review / deals em risco — M.** Lista priorizada: parados, sem
próxima ação, alto valor+baixo score, SLA estourado (ingredientes já existem).
**4.3 Ranking e carga por vendedor — P.** Agora possível com `owner_user_id` +
`deal_events`.
**4.4 Relatórios que dependiam da fundação — P (cada):** conversão estágio-a-
estágio e tempo em estágio (`deal_stage_history`); perda por categoria
(`loss_reasons`); mix/margem de produto (`proposal_items`); custo de IA por
tokens reais (já capturados em `agent_runs.input.tokens`).
**4.5 Alertas para o gestor — P.** "3 deals >R$20k parados", "desconto pendente
há 2 dias", "meta em 40% no dia 20".

---

### F5 — Diferenciação & integrações  ·  G

Depende de F0/F1. É o "uau" para uma agência de mídia. Conectores já disponíveis
no ambiente: **Google Calendar, Gmail, Google Drive, Granola, Tactiq, Brevo,
Canva, Supabase**.

**5.1 Google Calendar — M.** Agendar reunião/gravação a partir do card; sincronizar
`next_action_at` e datas de evento (o domínio é cheio de "evento/data/local").
**5.2 Transcrição de reunião → CRM (Granola/Tactiq) — M.** Resumo no deal +
`tasks` + gatilho de proposta. Casa com os prompts que já pedem "notas de reunião".
**5.3 Google Drive / Canva — M/G.** Entregáveis (vídeos/artes) vinculados ao card
e ao portal; geração de artes/propostas visuais direto do card.
**5.4 E-mail inbound/outbound real (Gmail) — M.** E-mail vira timeline/card; o
Copiloto envia de verdade.
**5.5 Fechar loop pós-venda → recompra — M.** Projeto "concluído" → deal de
recorrência/upsell automático no funil de CS (`lifecycle` e esteira já preparam).
**5.6 Playbooks por produto — G.** Cada produto (Domo, Studio Corporativo,
Campanha Viva) com checklist/estágios de entrega próprios.

---

## 4. Aprofundamento por frente

### 4.1 Modelo de dados & interligações
O gap central é relacional. A fundação adiciona as FKs e entidades que faltavam
(`contracts.proposal_id`, `proposal_items.product_id`, `deals.lost_reason_id`,
`client_accounts.lifecycle`). O único ponto que **permanece consciente como
back-compat** é `proposals.items` (jsonb): mantido, com `proposal_items` como
espelho normalizado — a app passa a dual-write para não quebrar o PDF/portal.

### 4.2 Abertura de card (intake)
`CreateLeadSheet` é excelente, mas é o **único** ponto de entrada e é manual. A
fundação (`lead_inbox`, `attribution`) permite entrada por WhatsApp/e-mail/form/
CSV/API convergindo para um card, com o Agente de Nutrição enriquecendo — o
humano corrige, não digita do zero. Card "rascunho" com 1 campo (nome OU
telefone OU e-mail) deve bastar.

### 4.3 Dinâmica de funcionamento
Sair de "humano clica em agente quando lembra" para **máquina de estado**: cada
estágio tem entry-agents (automação ao entrar), exit-criteria (gating) e SLA. O
orquestrador (F3) encadeia agentes por evento. O `deal_events` é o barramento que
torna isso observável e realimentável.

### 4.4 Agentes
Roster coeso ao negócio. Mudanças: fundir Coach+Aprendizado; Scoring contínuo;
Copiloto que envia e mede; novos Roteamento/Forecast/Reativação/Data-Quality;
orquestrador acima de todos. Tudo depende de dono + eventos + tasks (F0).

### 4.5 Tracking / observabilidade
Era o maior buraco. `deal_events` (append-only, escrito por trigger SECURITY
DEFINER — usuário só lê) + `deal_stage_history` (tempo real por estágio) formam o
backbone. Instrumentar as fontes (F2.2) e derivar engajamento (F2.3).

### 4.6 Gestão
`goals` + `owner_user_id` + `deal_stage_history` + `loss_reasons` habilitam
metas, forecast ponderado, ranking, pipeline review e perda por categoria — o
cockpit que o gestor abre de manhã. Falta a UI (F4), não mais o dado.

### 4.7 Integrações
Conectores fortes já disponíveis. Prioridade para agência de mídia: Calendar +
transcrição de reunião + Drive/Canva. Brevo já entrega sinal de abertura/clique —
basta consumir via `log_deal_event`.

---

## 5. Ordem recomendada (resumo)

1. **F0** — aplicar `0013_foundation.sql` + regenerar types. *(base de tudo)*
2. **F1** — roteamento, empresa-desde-o-lead, tasks, intake, gating.
3. **F2** — timeline unificada + instrumentar eventos + engajamento derivado.
4. **F3** — orquestrador, scoring contínuo, next-best-action, ajuste de roster.
5. **F4** — cockpit de gestão (metas, forecast, ranking, perda, mix, custo real).
6. **F5** — Calendar, transcrição, Drive/Canva, e-mail real, loop de recompra.

> Não pule para F3/F5 antes de F0/F1: agente e integração sem dono, eventos e
> empresa-entidade nascem sem base para medir e sem para onde escalar.

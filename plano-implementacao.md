# Plano de implementação — evolução do CRM (F0 → F4)

> **Status de execução (aplicado no PR #45):**
> - **F0** ✅ migration `0013_foundation.sql` **aplicada no Supabase** (crm-ai-studio).
> - **F1.1** ✅ roteamento de dono (`lib/routing.ts`) + `reassignDeal`.
> - **F1.2** ✅ empresa desde o lead (`lib/company.ts`); esteira promove a `ativo`.
> - **F1.3** ✅ tarefas com estado (`lib/tasks.ts`, tabela `tasks`); `getOpenTasks` une tasks+activities; esteira/agentes criam tasks.
> - **F1.4** ✅ intake (`/api/intake`, `lead_inbox`), página `/app/inbox`, import CSV.
> - **F1.5** ⚙️ gating base já existia em `moveDeal`; `loss_reasons` semeados. Select de motivo enumerado no card: **pendente**.
> - **F2.1** ✅ timeline unificada (`getDealTimeline` + rota + aba Histórico).
> - **F2.2** ⚙️ eventos instrumentados: `proposal_sent`, `contract_sent`, `contract_signed`. `proposal_viewed`/`email_opened` (webhooks): **pendente**.
> - **F2.3** engajamento derivado: **pendente**.
> - **F3.1** ✅ orquestrador (`lib/orchestrator.ts`, gated por `ORCHESTRATOR_ENABLED`).
> - **F3.2** scoring contínuo: **pendente** (trigger já registra `score_changed`).
> - **F3.3** ✅ next-best-action (`lib/nba.ts`) no drawer.
> - **F3.4** ✅ 3 agentes novos (Saúde do Pipeline, Reativação, Qualidade de Dados) via `0014`. Fusão Coach+Aprendizado: **não feita** (seria destrutiva para `agent_runs`).
> - **F4.1/4.2/4.3** ✅ metas (`/app/metas`), pipeline review (`/app/pipeline-review`), ranking, deals em risco.
> - **F4.4/4.5** relatórios sobre a fundação e alertas de gestor: **parcial/pendente**.


> Companion executável do `analise.md`. Traduz as ondas em **tarefas concretas**
> com arquivos, funções, uso da migration `0013_foundation.sql`, critério de
> aceite, esforço e dependências. **Integrações (F5) ficam de fora** deste plano.
>
> Esforço: **P** ≤ meio dia · **M** 1–2 dias · **G** 3+ dias.

---

## Convenções de execução

- **Uma branch por onda** (`feat/f1-processo`, `feat/f2-tracking`, …), PR draft
  por onda; F0 já está no PR #45.
- **Regenerar types após F0**: `supabase gen types` (ou MCP
  `generate_typescript_types`) → atualizar o tipo usado no app. Sem isso, as
  colunas/tabelas novas não têm tipagem.
- **Dual-write durante transição**: onde uma tabela nova substitui um uso antigo
  (`tasks` ↔ `activities`), escrever nas duas por 1 ciclo e migrar a leitura
  depois — nunca um big-bang.
- **Feature flags** por env quando o comportamento muda para o usuário
  (`ROUTING_ENABLED`, `TASKS_UI`), seguindo o padrão já usado
  (`ALLOW_TENANT_AGENT_OVERRIDES`, `restrict_sellers`).
- **Sinergia com os triggers de 0013**: `deals_track_changes` já grava
  `deal_events` (`created`/`stage_changed`/`owner_changed`/`amount_changed`/
  `score_changed`) e alimenta `deal_stage_history` automaticamente. O app **não**
  deve reimplementar isso — só registra os eventos de *negócio* que o trigger não
  cobre (via `log_deal_event`).

---

## F0 — Fundação (migration 0013)  ·  já entregue no PR #45

**Passos de ativação (você):**
1. Aplicar `supabase/migrations/0013_foundation.sql` no projeto Supabase.
2. Regenerar os types TS.
3. Smoke: mover um deal de estágio → conferir 1 linha nova em
   `deal_stage_history` (com `duration_seconds` preenchido na anterior) e 1 em
   `deal_events` (`stage_changed`); criar um deal → `created` + histórico.

**Aceite:** migration aplica limpa; triggers disparam; backfill populou histórico
dos deals antigos e `loss_reasons` padrão por org.

---

## F1 — Processo & entrada  ·  G  ·  depende de F0

### F1.1 — Roteamento / dono no processo — M
**Objetivo:** lead novo recebe dono por regra, não "quem criou".
- **Novo** `lib/routing.ts`: `resolveOwner(orgId, { segment, channel, clientType }): Promise<string|null>`.
  Lê `routing_rules` (ordenadas por `position`, `enabled`), aplica `match`;
  para `round_robin`/`by_load` usa `pool` (ou todos os membros) + `routing_state`
  (cursor por org, atualiza `last_assignee_user_id`); `fixed`/`by_segment` usa
  `assignee_user_id`. Sem regra → retorna null (mantém fallback atual).
- **Alterar** `app/actions.ts` → `createLead`: trocar
  `owner_user_id: ctx?.userId` por `owner_user_id: (await resolveOwner(...)) ?? ctx?.userId`
  e setar `owner_assigned_at`.
- **Alterar** `components/DealDrawer.tsx`: seletor "Dono" que chama nova action
  `reassignDeal(dealId, userId)` (grava `owner_user_id` + `owner_assigned_at`; o
  `deal_events owner_changed` sai sozinho pelo trigger).
- **UI admin** `/app/org` (ou nova `/app/automacoes`): CRUD de `routing_rules`.
- **Filtro "Meu pipeline"** no board (`app/app/page.tsx`): toggle que filtra por
  `owner_user_id = usuário`.
- **Aceite:** lead novo cai com dono pela regra; reatribuir gera `owner_changed`
  em `deal_events`; "Meu pipeline" filtra corretamente.

### F1.2 — Empresa como entidade desde o lead — M
**Objetivo:** `client_account` (lifecycle `lead`) existe desde a criação, não só
no Ganho; dedup por `domain`/`cnpj`.
- **Novo** `lib/company.ts`: `ensureCompanyForLead(db, orgId, { company, cnpj, email })`
  — reusa a lógica de slug/dedup de `lib/esteira.ts::ensureClientAccount`,
  derivando `domain` do e-mail; cria com `lifecycle='lead'`.
- **Alterar** `createLead`: chamar `ensureCompanyForLead` e gravar
  `deals.client_account_id` + `contacts.client_account_id`.
- **Alterar** `lib/esteira.ts::runWonEsteira`: ao rodar, promover
  `client_accounts.lifecycle` para `ativo` e setar `first_won_at` (idempotente).
- **Reusar** `getClientAccount360` (já existe em `lib/db.ts`) — a tela
  `/app/clientes/[id]` passa a ter dados desde o lead, não só pós-venda.
- **Aceite:** criar lead com empresa nova cria `client_account` `lead`; Ganhar
  promove para `ativo` com `first_won_at`; Empresa 360 lista o deal antes do fecho.

### F1.3 — Tarefas com estado (`tasks`) — M
**Objetivo:** separar "o que precisa acontecer" (`tasks`) da timeline
(`activities`), destravando "Meu dia" real e agente-como-ator com dono/prazo.
- **Novo** `lib/tasks.ts` + actions em `app/actions.ts`: `createTask`,
  `completeTask`, `rescheduleTask`, `reassignTask` (gravam em `tasks`; emitem
  `log_deal_event('task_created'|'task_done')`).
- **Alterar** `lib/db.ts::getOpenTasks`: ler de `tasks`
  (`status='aberta'`, por `assignee_user_id`, ordenado por `due_at`), com faixas
  atrasada/hoje/próxima; manter leitura de `activities.due_at` só como
  compat até migrar os produtores.
- **Alterar produtores** para criar `tasks` em vez de notes:
  `lib/esteira.ts` (onboarding, source=`esteira`),
  `lib/run-agent.ts` (advisory/cadência, source=`agent`/`cadence`).
- **Alterar** `app/app/tarefas/page.tsx` + `components/TaskItem.tsx` para o novo
  shape (assignee, prioridade, status).
- **Aceite:** "Meu dia" lista `tasks` do usuário; concluir/reagendar/atribuir
  funciona; esteira e agentes criam `tasks`.

### F1.4 — Intake multicanal — M/G
**Objetivo:** WhatsApp/e-mail/form/CSV convergem para card, sem digitação.
- **Novo** `app/api/intake/route.ts`: recebe payloads (form público / API),
  grava em `lead_inbox` (`channel`, `from_identifier`, `payload`), dedup por
  telefone/e-mail (reusa `findLeadDuplicates`).
- **Alterar** `app/api/whatsapp/webhook/route.ts`: mensagem de número
  desconhecido → `lead_inbox` (channel `whatsapp`).
- **Nova tela** `/app/inbox`: fila de `lead_inbox` `novo`; ação "Converter" →
  `createLead` (preenchendo `attribution`/`intake_channel`) marca item
  `convertido` + linka `deal_id`; "Descartar".
- **Import CSV** `app/api/import/route.ts` + UI em `/app/contatos`: mapeia
  colunas → cria contacts+deals (channel `import`).
- **Alterar** `createLead`: aceitar/gravar `attribution` (UTM) e `intake_channel`.
- **Aceite:** lead do WhatsApp/form aparece no inbox e vira card em 1 clique; CSV
  importa; relatório de canal passa a ter dado estruturado.

### F1.5 — Gating por estágio (ampliar) — P
**Objetivo:** forçar qualidade de dado que F4 consome.
- **Alterar** `app/actions.ts::moveDeal` (já valida won=amount, lost=lost_reason):
  adicionar regras configuráveis por estágio — ex.: exigir decisor+orçamento para
  entrar em `proposta`; exigir contrato `assinado` para `won`. Guardar as regras
  em `stages` (nova coluna `entry_requirements jsonb`, migration menor) ou em
  `automations.config`.
- **Migrar** `deals.lost_reason` (texto) para `lost_reason_id` (FK
  `loss_reasons`): o card passa a escolher motivo de um select; manter texto por
  compat.
- **Aceite:** mover para Proposta sem decisor/orçamento é bloqueado com mensagem;
  perda exige motivo enumerado.

---

## F2 — Tracking real  ·  M  ·  depende de F0

### F2.1 — Timeline unificada no drawer — M
- **Nova** `lib/db.ts::getDealTimeline(dealId)`: funde `deal_events` +
  `deal_stage_history` + `agent_runs` + `messages` + `activities` (notes) num
  array ordenado por data, com tipo/ícone.
- **Nova rota** `app/api/deals/[id]/timeline/route.ts` (o drawer é client;
  segue o padrão de `app/api/deals/[id]/panels/route.ts`).
- **Alterar** `components/DealDrawer.tsx`: aba "Histórico" consumindo a timeline.
  Dedup: mudança de estágio vem de `deal_events` (não repetir a note "Movido
  para…" que `moveDeal` ainda grava — ou remover essa note e confiar no evento).
- **Aceite:** aba Histórico mostra tudo do relacionamento numa rolagem, com
  origem (humano/agente/sistema).

### F2.2 — Instrumentar fontes de evento de negócio — P (cada)
Chamar `log_deal_event(dealId, kind, data)` nos pontos que o trigger não cobre:
- `sendProposalEmail` (`app/actions.ts`) → `proposal_sent`.
- `app/proposta/[token]/page.tsx` (view pública por `share_token`) → `proposal_viewed`.
- `app/api/webhooks/brevo/route.ts` → `email_opened`/`email_sent` (casar por
  `deal_id` já logado em `email_log`).
- `app/api/webhooks/opensign/route.ts` + `refreshContractStatus` → `contract_sent`/`contract_signed`.
- `lib/run-agent.ts` → `agent_run` (complementa `agent_runs`, unifica na timeline).
- WhatsApp bridge (quando ativo) → `whatsapp_in`/`whatsapp_out`.
- **Aceite:** cada um desses passos aparece na timeline unificada com metadata.

### F2.3 — Engajamento derivado — P
- **Novo** `lib/engagement.ts::computeEngagement(dealId)`: deriva 0–100 de
  `deal_events` recentes (respondeu rápido, abriu e-mail, viu proposta). Chamar
  ao registrar eventos-chave e no scoring.
- **Alterar** `mapDeal`/leitura: `engagement` passa a refletir o cálculo (hoje é
  estático `40` na criação).
- **Aceite:** engajamento muda com o comportamento; vira insumo do scoring (F3.2).

---

## F3 — Orquestração de agentes  ·  G  ·  depende de F0 (tasks+events) + cadências

### F3.1 — Orquestrador event-driven — G
- **Novo** `lib/orchestrator.ts::onDealEvent(orgId, dealId, event)`: mapa
  evento→agente(s), encadeia (ex.: `created`→Nutrição→Scoring; `stage_changed`
  para `reuniao`→Copiloto; SLA→Cadência). Reusa `runAgentForDeal`
  (`lib/run-agent.ts`) e respeita o rate limit já existente. Ponto de decisão
  humano (aprovar proposta, enviar contrato) NÃO é automatizado — vira `task`.
- **Gatilhos:** chamar `onDealEvent` de `moveDeal` (após o update) e do cron de
  cadências (`app/api/cron/cadences/route.ts`); opcional: um sweep que lê
  `deal_events` recentes.
- **Alterar** `moveDeal`: as `automations` `stage_enter` atuais viram um caso do
  orquestrador (mantém retrocompat lendo a tabela `automations`).
- **Aceite:** entrar em Reunião dispara Copiloto sem clique; encadeamento
  registrado em `agent_runs`; nada de duplo-disparo (idempotência por evento).

### F3.2 — Scoring contínuo — M
- **Alterar** `lib/run-agent.ts` (`lead-scoring`): permitir execução disparada por
  evento (não só botão). O `score_changed` já é logado pelo trigger → a curva de
  temperatura fica registrada em `deal_events`.
- **Aceite:** score recalcula em eventos relevantes; histórico consultável.

### F3.3 — Next-best-action viva no card — M
- **Novo** `lib/nba.ts::nextBestAction(deal, events)`: deriva a recomendação
  (parado Xd em Y → ação Z) a partir de `deal_stage_history` + `next_action_at` +
  score. Exibir no topo do `DealDrawer` e como badge no `components/Board.tsx`.
- **Aceite:** card mostra a próxima ação recomendada, recalculada a cada evento.

### F3.4 — Ajuste do roster de agentes — M
- **Fundir** Coach (`coaching`) + Aprendizado (`sales-feedback`) em
  "Inteligência Comercial" com 2 modos → editar `lib/agents/catalog.ts`
  (`PLATFORM_AGENTS`) e a resolução (`lib/agents/resolve.ts`); migration de dados
  para mapear runs antigos.
- **Novos agentes** (entram no catálogo + runtime `lib/agents.ts`/`run-agent.ts`):
  **Roteamento** (usa F1.1), **Forecast/Health** (pontua o pipeline via
  `deal_stage_history`), **Reativação** (age sobre `perdido`/`inativo`),
  **Data Quality** (duplicata/campo faltando/deal sem atividade).
- **Copiloto**: fechar loop — enviar de verdade (bridge/Brevo) e realimentar
  engajamento a partir da resposta.
- **Aceite:** roster novo aparece no Studio; agentes novos executam e persistem em
  `agent_runs`; fusão não quebra relatórios (mapa de kind antigo→novo).

---

## F4 — Gestão (cockpit)  ·  M/G  ·  depende de F0 (goals/history/loss/owner) + F2

### F4.1 — Metas x atingimento — M
- **CRUD** de `goals` em `/app/relatorios` (ou nova `/app/metas`): por
  vendedor/mês/produto/métrica.
- **Novo** `lib/reports/forecast.ts`: forecast ponderado
  (`Σ amount × probability`) por dono, comparado à `goals.target` do mês.
- **Aceite:** tela mostra meta vs. atingido vs. forecast por vendedor.

### F4.2 — Pipeline review / deals em risco — M
- **Novo** `lib/reports/at-risk.ts`: lista priorizada (parado > SLA via
  `deal_stage_history`, sem `next_action_at`, alto valor + baixo score). Nova
  tela `/app/pipeline-review`.
- **Aceite:** gestor vê os deals que precisam de ação, ordenados por risco/valor.

### F4.3 — Ranking e carga por vendedor — P
- **Alterar** `app/app/relatorios/page.tsx`: agregações por `owner_user_id`
  (ganhos, ciclo, win-rate, carga aberta) usando `deal_events`/`deal_stage_history`.
- **Aceite:** ranking por vendedor com números reais.

### F4.4 — Relatórios que dependiam da fundação — P (cada)
- **Conversão estágio-a-estágio e tempo em estágio**: `deal_stage_history`.
- **Perda por categoria**: `loss_reasons` + `deals.lost_reason_id`.
- **Mix/margem de produto**: `proposal_items.product_id` (requer F4-precursor:
  dual-write dos itens de proposta em `run-agent.ts::proposal`).
- **Custo de IA por tokens reais**: já capturado em `agent_runs.input.tokens` —
  somar no relatório (Fase N do roadmap antigo).
- **Alterar** `app/app/relatorios/page.tsx` e `app/api/export/reports/route.ts`.
- **Aceite:** cada relatório baseado em dado estrutural, não em heurística.

### F4.5 — Alertas para o gestor — P
- **Alterar** cron/cadências ou novo sweep: notificações de gestão ("3 deals
  >R$20k parados", "desconto pendente há 2 dias", "meta em 40% no dia 20") em
  `notifications` (com `user_id` do gestor).
- **Aceite:** gestor recebe alertas acionáveis in-app.

---

## Sequência recomendada e dependências

```
F0 (0013) ──► F1.1 owner/routing ─┐
          ├──► F1.2 empresa        ├─► F4.1 metas/forecast
          ├──► F1.3 tasks ─────────┼─► F3.1 orquestrador ─► F3.3 NBA
          ├──► F1.4 intake         ├─► F4.3 ranking
          ├──► F1.5 gating         │
          └──► F2.1 timeline ──────┼─► F2.2 instrumentar ─► F2.3 engajamento ─► F3.2 scoring
                                    └─► F4.2 pipeline review, F4.4 relatórios
```

**Ordem prática (sprints):**
1. **F0** (ativar migration + types).
2. **F1.1 + F1.3 + F1.5** — dono, tasks e gating (base de processo e de "Meu dia").
3. **F2.1 + F2.2** — timeline unificada + instrumentação (visibilidade imediata).
4. **F1.2 + F1.4** — empresa desde o lead + intake multicanal.
5. **F3.1 + F3.2 + F3.3** — orquestrador, scoring contínuo, NBA.
6. **F4.\*** — cockpit de gestão (metas, risco, ranking, relatórios, alertas).
7. **F3.4** — ajuste de roster (depois que o orquestrador e o tracking existem).

**Regra de dependência dura:** nada de F3/F4 antes de F0+F1+F2 — orquestrador sem
`tasks`/`deal_events` e cockpit sem `goals`/`stage_history`/`owner` não têm base.

---

## Estimativa agregada

| Onda | Escopo | Esforço |
| --- | --- | --- |
| F0 | ativar migration + types | P |
| F1 | processo & entrada (5 tarefas) | ~G (5–8 dias) |
| F2 | tracking real (3 tarefas) | ~M (2–4 dias) |
| F3 | orquestração + roster (4 tarefas) | ~G (5–8 dias) |
| F4 | cockpit (5 tarefas) | ~M/G (4–6 dias) |

> Integrações (F5: Calendar, Drive/Canva, transcrição, e-mail real, loop de
> recompra) ficam fora deste plano por decisão do escopo.

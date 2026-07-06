# Roadmap — o que falta para "100% pronto"

Este documento lista **tudo** que ainda está aberto, em modo demonstração/mock,
parcial ou dependente de configuração — com estado atual, alvo, passos concretos,
arquivos, esforço e critério de aceite. As Fases A–F já foram entregues (ver
`docs/design-audit.md`). Aqui seguem as fases **G em diante**.

Legenda de esforço: **P** (≤ meio dia) · **M** (1–2 dias) · **G** (3+ dias).

---

## Grupo 1 — Depende só de você (env na Vercel), código pronto

Estes **não exigem desenvolvimento** — o código já está pronto e testado. Só
faltam variáveis de ambiente + redeploy.

### 1.1 OpenSign real (sai do modo demonstração) — **P**
- **Estado**: provider, webhook, página interna `/sign/contracts/[token]` e modelo
  por-signatário prontos. Sem `OPENSIGN_*`, opera em modo demonstração (assinatura
  simulada, registrada no CRM).
- **Passos** (você): criar conta/instância OpenSign → gerar API token → setar na
  Vercel `SIGNATURE_PROVIDER=opensign`, `OPENSIGN_BASE_URL`, `OPENSIGN_API_KEY`,
  `OPENSIGN_WEBHOOK_SECRET`, `SUPABASE_SERVICE_ROLE_KEY` → apontar o webhook do
  OpenSign para `/api/webhooks/opensign` → redeploy. Passo a passo em
  `docs/opensign.md`.
- **Aceite**: "Preparar assinatura" cria envelope real; a página encaminha ao
  OpenSign; webhook atualiza status; certificado aparece quando disponível.

### 1.2 Studio editável por tenant — **P**
- **Estado**: `TenantAgentEditor` + `org_agent_settings` prontos; a tela só
  aparece com a flag ligada.
- **Passos** (você): setar `ALLOW_TENANT_AGENT_OVERRIDES=true` na Vercel + redeploy.
- **Aceite**: no `/app/studio`, owner/admin edita o agente e o override passa a
  valer só para o tenant (badge "personalizado neste tenant").

---

## Grupo 2 — Infra pronta, sem uso real (precisa serviço externo)

### 2.1 WhatsApp Bridge + conversa na aba do lead — **M** (código) + serviço externo
- **Estado**: adapter (`wa_me`/`bridge`/`fake`), webhook com secret,
  `getLeadCommunicationContext`, tabelas `whatsapp_*` e injeção no prompt do agente
  já existem. **Nenhum bridge rodando** → nenhuma conversa é gravada.
- **Passos**:
  1. Subir WPPConnect Server (Apache-2.0) ou Baileys (MIT) em um VPS/container
     (processo persistente — **não** na Vercel).
  2. Registrar a conexão em `whatsapp_connections` (instance_id → org).
  3. Configurar o webhook do bridge → `/api/whatsapp/webhook` com `x-webhook-secret`.
  4. Setar `WHATSAPP_PROVIDER=bridge` + `WHATSAPP_BRIDGE_*`.
  5. **Dev**: enriquecer a **aba WhatsApp do drawer** para listar a thread real
     (`whatsapp_messages`) quando houver, com resumo; hoje mostra só os templates
     `wa.me`. Arquivos: `components/DealDrawer.tsx` (WhatsAppTab), novo
     `lib/whatsapp/get-thread.ts`.
- **Aceite**: com o bridge ativo, a aba WhatsApp mostra as últimas mensagens do
  lead e os agentes usam a conversa (badge `whatsappUsed` no `agent_runs`).
- **Nota**: decisão sua foi "deixar pronto sem uso real" — a parte 5 (dev) fica
  opcional até você subir o bridge.

---

## Grupo 3 — Refinamentos de produto (desenvolvimento)

### Fase G — Landing premium — **M**
- **Estado**: landing funcional, mas hero genérico.
- **Passos**:
  - Hero com proposta de valor forte ("CRM operado por agentes"), prova social,
    e um mock visual do funil/drawer (screenshot ou componente estático).
  - Seções: como funciona (3 passos), 6 pilares em cards ricos, bloco
    multi-tenant, bloco de segurança/LGPD, CTA duplo (entrar / ver admin).
  - Variante **Reiners** (quando aplicável): navy/dourado/off-white, tipografia
    editorial, copy "presença que posiciona".
  - Acessibilidade, responsivo, dark-aware, motion discreto.
- **Arquivos**: `app/page.tsx`, novos `components/landing/*` (Hero, Features,
  HowItWorks, Security, CTA), reutilizando primitives.
- **Aceite**: não parece template; passa Lighthouse a11y; E2E de landing cobre
  hero + CTAs.

### Fase H — Drawer: tabs dedicadas Proposta / Contratos / Histórico — **M**
- **Estado**: drawer tem Visão geral / Agentes / WhatsApp / Atividades. Proposta e
  Contratos vivem fora (resultado do agente / página Contratos).
- **Passos**:
  - **Aba Proposta**: listar propostas do deal (nova `getProposalsByDeal`),
    criar pré-proposta, link/PDF, registrar envio + follow-up 48h/5d/10d.
  - **Aba Contratos**: contratos do deal (nova `getContractsByDeal`) com status
    OpenSign, copiar link, WhatsApp, ver assinado — reusa `ContractCard`.
  - **Aba Histórico**: timeline unificada (criação, edição, estágio, agentes,
    notificações, WhatsApp, propostas, contratos) — precisa carregar activities
    no drawer (nova rota `GET /api/deals/[id]/timeline` ou incluir no getBoard).
- **Arquivos**: `components/deals/DealProposalsPanel.tsx`,
  `DealContractsPanel.tsx`, `DealHistory.tsx`; `lib/db.ts` (novas queries);
  `components/DealDrawer.tsx`.
- **Aceite**: as 3 abas mostram dados reais do deal e as ações funcionam.

### Fase I — Atividades: tarefas com estado — **M**
- **Estado**: `createActivity` registra na timeline (append otimista), mas não há
  "tarefa" com concluir/reagendar.
- **Passos**: migration `deal_tasks` (ou flag `done_at` em activities do tipo
  task) + actions `completeActivity`/`rescheduleActivity`; UI de checklist na aba
  Atividades; badge "atrasado" por tarefa.
- **Arquivos**: migration nova, `app/actions.ts`, `components/DealDrawer.tsx`.
- **Aceite**: criar/concluir/reagendar tarefa; status do lead reflete tarefas.

### Fase J — Enriquecimento: exibição persistida + mais fontes — **M**
- **Estado**: `enrichDeal` chama BrasilAPI e grava `lead_enrichment`; o painel
  mostra o resultado da última execução, mas não relê o histórico salvo.
- **Passos**: `getLeadEnrichment` já existe → exibir evidências salvas no drawer
  (Visão geral) com data/confiança; opcional: CEP (BrasilAPI) e agenda de eventos.
- **Arquivos**: `components/EnrichmentPanel.tsx`, `app/app/page.tsx` (passar
  enrichment ao drawer) ou rota `GET /api/deals/[id]/enrichment`.
- **Aceite**: reabrir o lead mostra as evidências já coletadas.

### Fase K — Matriz E2E de 20 cenários + unit restantes — **M**
- **Estado**: 17 E2E (superfície pública/guards) + 20 unit. Faltam fluxos
  autenticados.
- **Estratégia**: os fluxos logados exigem sessão real → rodar contra um
  **preview com Supabase** usando `E2E_BASE_URL` + usuário de teste
  (`E2E_EMAIL/PASSWORD`) — o `playwright.config` já suporta. Cenários que não dão
  para rodar no CI sem segredos ficam num projeto Playwright separado
  (`@authenticated`) rodado só com as env de preview.
- **20 cenários** (do escopo): landing, login, tenant no header, abrir novo lead,
  criar lead rápido, criar lead completo, abrir lead criado, editar contato,
  editar oportunidade, próxima ação, executar agente sugerido, notificação com
  agente, abrir WhatsApp wa.me, mover estágio, criar contrato, copiar link de
  assinatura, bloquear assinatura duplicada, admin acessa agentes globais, tenant
  não-admin barrado, mobile nav.
- **Unit restantes**: normalização de telefone (ok), build wa.me (ok),
  duplicidade, validação create lead, update deal/contact, status mapping
  OpenSign, `getLeadCommunicationContext`, bloqueio assinatura duplicada.
- **Arquivos**: `tests/e2e/authenticated/*.spec.ts`, `tests/unit/*`, ajuste no
  workflow CI (job opcional com secrets).
- **Aceite**: `npm run test:e2e` verde localmente contra preview; núcleo no CI
  sem segredos permanece verde.

### Fase L — Primitives restantes + aplicação — **M**
- **Estado**: criados `button, input(+textarea/select/label), badge, card, dialog,
  sheet, dropdown-menu, confirm-dialog, skeleton, toaster, tabs, empty-state,
  section`. Faltam do escopo: `table`, `field`, `command-card`, `action-panel`.
- **Passos**: criar os 4 primitives e aplicar em Contratos/Relatórios/Admin
  (tabelas → `table`; formulários → `field`; painéis de ação → `action-panel`).
- **Aceite**: sem Tailwind duplicado de tabela/campo espalhado; telas usam os
  primitives.

### Fase M — Branding Reiners profundo (tema por tenant) — **G**
- **Estado**: acento no shell + logo usam `brand.primary`. A paleta `brand-*`
  (índigo) é fixa no resto do app.
- **Passos**: introduzir tokens CSS semânticos (`--brand`, `--brand-fg`) e
  remapear as classes-chave para variáveis; quando o tenant for Reiners, aplicar
  navy/dourado via `:root[data-tenant="reiners"]`. É invasivo (toca muitos
  arquivos) — por isso **G** e por último.
- **Aceite**: Reiners com identidade navy/dourado consistente; demais tenants
  inalterados.

### Fase N — Relatórios: custo de IA real — **P/M**
- **Estado**: "custo IA" é estimativa (não medimos tokens reais).
- **Passos**: gravar `usage` (prompt/completion tokens) retornado pelo OpenRouter
  em `agent_runs.metadata`; somar no relatório.
- **Arquivos**: `lib/ai.ts` (capturar usage), `lib/run-agent.ts` (persistir),
  `app/app/relatorios/page.tsx`.
- **Aceite**: custo baseado em tokens reais quando a IA está ao vivo.

---

## Ordem sugerida de execução

1. **Grupo 1** (você, sem dev): OpenSign env + flag de override — libera "produção".
2. **Fase G** (landing) e **Fase K** (E2E) — pedidas explicitamente.
3. **Fase H** (tabs do drawer) e **Fase I** (tarefas) — profundidade operacional.
4. **Fase J** (enriquecimento persistido) e **Fase N** (custo real).
5. **Fase L** (primitives) e **Fase M** (branding profundo) — acabamento.
6. **Grupo 2.5** (aba WhatsApp com conversa real) — quando o bridge subir.

## Resumo do que é "mock/demonstração" hoje (e por quê)

| Item | Por quê | Vira real quando |
| --- | --- | --- |
| Assinatura (página interna) | OpenSign não configurado | setar `OPENSIGN_*` |
| Conversa de WhatsApp | sem bridge externo | subir WPPConnect/Baileys |
| Studio editável por tenant | flag desligada | `ALLOW_TENANT_AGENT_OVERRIDES=true` |
| Custo de IA nos relatórios | tokens não medidos | Fase N |
| Enriquecimento externo além de CNPJ | só BrasilAPI hoje | Fase J (fontes extras) |

# CRM AI Studio — versão privada

CRM multi-tenant inspirado no **CRM AI Studio** (Pipefy): funis conectando Marketing,
Vendas e Customer Success, orquestrados por **9 agentes de IA**.

Stack: **Next.js 14 (App Router) + TypeScript + Tailwind + Supabase (Postgres, Auth, RLS)**,
com IA em **GLM 5.2 via OpenRouter**. Deploy na **Vercel**.

## Funcionalidades

- **Autenticação + multi-tenant** (Supabase Auth + RLS — cada org só vê seus dados).
- **Onboarding automático**: ao cadastrar, a org já vem com funil e 9 agentes configurados.
- **Funil Kanban** com criação de leads, mover cards entre estágios e KPIs.
- **9 agentes executáveis** persistindo resultado e timeline (auditados em `agent_runs`).
- **Studio editável**: alterar prompt/modelo/triggers/ativação de cada agente, com versionamento.
- **Gestão de contratos**: editar cláusulas, status de assinatura e signatários.
- **WhatsApp** (MVP): mensagem do Copiloto vira botão click-to-chat (wa.me).

## Setup

1. Crie um projeto Supabase e rode as migrations em `supabase/migrations` (ou via painel).
2. Defina as variáveis de ambiente (veja `.env.example`): `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`.
3. Em Supabase → Authentication → Providers → Email, desative "Confirm email" para
   cadastro sem fricção (ou mantenha e confirme por e-mail).
4. `npm install && npm run dev`.

## Agentes

Roster completo, do marketing ao pós-venda. Cada agente resolve dores específicas e
automatiza atividades (detalhes no **Studio de Agentes**). Os marcados com ⚡ têm
**execução ao vivo** no funil.

| Agente | Fase | O que faz |
| --- | --- | --- |
| **Agente de Nutrição de Leads** | Aquisição | Enriquece dados de empresa/contato e deduplica leads |
| ⚡ **Agente de Lead Scoring** | Aquisição | Pontua por ICP + comportamento → score 0-100, temperatura e roteamento |
| ⚡ **Agente Copiloto de Vendas** | Vendas | Sugere próximo passo e escreve a mensagem no canal certo |
| ⚡ **Agente de Proposta Comercial** | Vendas | Gera e precifica a proposta respeitando a política de desconto (teto 15%) |
| ⚡ **Agente Jurídico / de Contratos** | Vendas | Gera contrato personalizado por proposta e coleta assinatura digital válida |
| **Agente de Atividades e Follow-ups** | Vendas | Cria tarefas, lembretes e alertas de SLA |
| **Agente de Coaching** | Vendas | Analisa interações e sugere melhorias de abordagem |
| **Agente de Feedback de Vendas** | Vendas | Registra resultados e realimenta o modelo de scoring |
| **Copiloto de Atendimento** | Pós-venda | Handoff, onboarding e acompanhamento de entregas |

Os agentes executáveis rodam no **GLM 5.2 via OpenRouter** quando `OPENROUTER_API_KEY`
está definida (ou no **Claude** via `ANTHROPIC_API_KEY`); caso contrário usam uma
**heurística determinística**, então o app sobe e funciona sem nenhuma configuração.

## Resultados-alvo (arquitetura de referência)

- **75%** mais rápido na qualificação de leads
- **53%** de redução no ciclo de vendas (de ~3 meses para 42 dias)
- **Até 300%** mais vendas com centralização e padronização

## Arquitetura

```
app/
  page.tsx                 Board Kanban do funil (KPIs + estágios + deals)
  studio/page.tsx          Studio no-code dos agentes (dores + atividades)
  como-funciona/page.tsx   Métricas, workflow de 8 passos e maturidade
  api/agents/*             Endpoints (lead-scoring, copilot, proposal, contract)
  api/health               Healthcheck (informa se a IA ao vivo está ativa)
components/                Nav, DealCard, DealDrawer
lib/
  types.ts            Domínio (Pipeline, Stage, Deal, Contact, Agent, Proposal, Contract)
  seed.ts             Dados-semente (troque por Postgres/Supabase em produção)
  product.ts          Conteúdo estratégico (métricas, workflow, maturidade)
  ai.ts               Cliente do Claude API + parser de JSON
  agents.ts           Lógica dos agentes (Claude + fallback heurístico)
  lookup.ts           Resolução de deal/contato/agente
  format.ts           Formatação (BRL, temperatura)
```

## Rodando localmente

```bash
npm install
npm run dev        # http://localhost:3000
```

## Deploy na Vercel

O repositório já traz `vercel.json` (framework `nextjs`). Basta importar o repo
na Vercel. Para IA ao vivo, adicione a variável de ambiente `OPENROUTER_API_KEY`
(modelo padrão `z-ai/glm-5.2`, configurável via `OPENROUTER_MODEL`).

## Roadmap para produção

- Persistência real (Postgres/Supabase) no lugar de `lib/seed.ts`
- Autenticação e multi-tenant
- Integrações omnichannel (WhatsApp, e-mail, voz) para disparo real das mensagens
- E-signature e workflow de aprovação nas propostas
- Versionamento e A/B dos prompts de agentes no Studio

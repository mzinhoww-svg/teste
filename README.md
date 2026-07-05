# CRM AI Studio — versão privada

Réplica privada do conceito **CRM AI Studio** (Pipefy): funis de vendas conectando
Marketing, Vendas e Customer Success em um único fluxo, orquestrado por **agentes de IA**.

Construído em **Next.js 14 (App Router) + TypeScript + Tailwind**, pronto para deploy na **Vercel**.

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

Os agentes executáveis rodam via **Claude API** quando `ANTHROPIC_API_KEY` está
definida; caso contrário usam uma **heurística determinística**, então o app sobe e
funciona sem nenhuma configuração.

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
na Vercel. Para IA ao vivo, adicione a variável de ambiente `ANTHROPIC_API_KEY`.

## Roadmap para produção

- Persistência real (Postgres/Supabase) no lugar de `lib/seed.ts`
- Autenticação e multi-tenant
- Integrações omnichannel (WhatsApp, e-mail, voz) para disparo real das mensagens
- E-signature e workflow de aprovação nas propostas
- Versionamento e A/B dos prompts de agentes no Studio

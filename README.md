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
npm run test:e2e   # testes E2E (Playwright) — ver docs/testing.md
```

## Documentação

| Tema | Arquivo |
| --- | --- |
| Agentes de IA (9 agentes, resolução global) | [`docs/agents.md`](docs/agents.md) |
| Camada de enriquecimento dos agentes | [`docs/agent-enrichment.md`](docs/agent-enrichment.md) |
| Admin da plataforma — agentes padrão | [`docs/platform-admin-agents.md`](docs/platform-admin-agents.md) |
| WhatsApp Bridge (leitura de conversas) | [`docs/whatsapp-bridge.md`](docs/whatsapp-bridge.md) |
| Contratos e assinatura | [`docs/contracts-signature.md`](docs/contracts-signature.md) |
| Assinatura digital (OpenSign) | [`docs/opensign.md`](docs/opensign.md) |
| Notificações in-app + WhatsApp | [`docs/notifications.md`](docs/notifications.md) |
| E-mail transacional (Brevo) | [`docs/email-brevo.md`](docs/email-brevo.md) |
| Cadências e SLA | [`docs/cadences.md`](docs/cadences.md) |
| Testes (unit + E2E) e CI | [`docs/testing.md`](docs/testing.md) |
| Deploy na Vercel e domínio próprio | [`docs/vercel-domain.md`](docs/vercel-domain.md) |
| Admin da plataforma | [`docs/admin.md`](docs/admin.md) |
| Seed do primeiro tenant (Reiners Media) | [`docs/reiners-media-seed.md`](docs/reiners-media-seed.md) |
| Catálogo de podcasts (`/portfolio`) | [`docs/portfolio.md`](docs/portfolio.md) |

## Catálogo de podcasts — `/portfolio`

Catálogo estilo Netflix da Reiners Media, anexado à landing page: posters com
cinco estilos visuais distintos, painel que expande inline (sem navegar), modal
de player YouTube/Spotify e admin próprio em `/admin/portfolio`.

Módulo isolado do CRM: usa **Prisma** sobre o mesmo Postgres do Supabase, com
tabelas prefixadas `portfolio_` e um design system próprio (`pf-*`) que não
toca na paleta `brand-*` do CRM.

```bash
npm run portfolio:migrate   # cria as tabelas (precisa de DATABASE_URL + DIRECT_URL)
npm run portfolio:seed      # 5 programas × 5 episódios + config + admin inicial
```

Depois aplique `supabase/migrations/0005_portfolio_catalog.sql` — ele habilita
RLS nas tabelas novas (sem ele, a chave anônima pública poderia escrever no
catálogo pela API REST do Supabase) e cria o bucket de Storage.

Sem `DATABASE_URL` a rota funciona em **modo demonstração**, com dados de
exemplo e gravação desativada — o deploy atual do CRM não quebra.

Setup, decisões de arquitetura, pendências de contraste e desvios da
especificação estão em [`docs/portfolio.md`](docs/portfolio.md).

## Deploy na Vercel

O repositório já traz `vercel.json` (framework `nextjs`). Basta importar o repo
na Vercel. Para IA ao vivo, adicione a variável de ambiente `OPENROUTER_API_KEY`
(modelo padrão `z-ai/glm-5.2`, configurável via `OPENROUTER_MODEL`).

O `postinstall` roda `prisma generate` — necessário para o build do módulo de
portfólio. Para o catálogo com banco, adicione também `DATABASE_URL`,
`DIRECT_URL` e `PORTFOLIO_ADMIN_EMAILS`.

## Entregue

- Persistência real no Supabase (Postgres + Auth + RLS) e multi-tenant por `org_id`
- Autenticação, papéis (owner/admin/member) e admin da plataforma (`/admin`)
- Assinatura digital via OpenSign (open source) com webhook de status
- Notificações in-app (central + sino) e envio manual por `wa.me` com templates
- Studio com versionamento, diff e rollback de prompts; dry-run de agentes
- Relatórios avançados (conversão, ciclo, forecast, motivos de perda, custo de IA) + export CSV
- Dark mode, onboarding guiado, testes E2E (Playwright) e CI no GitHub

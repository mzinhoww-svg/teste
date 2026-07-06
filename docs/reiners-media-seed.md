# Seed — Reiners Media LTDA (primeiro tenant)

O seed cria o tenant completo da **Reiners Media** (studio de podcast e comunicação
estratégica institucional, MT). É **idempotente**: identifica a org pelo
`settings->>'slug' = 'reiners-media'` e não duplica nada se já existir.

Aplicado como migration `seed_reiners_media` no projeto Supabase
`nwynoyqdrxaujlcratnx` (espelho em `supabase/seeds/reiners.sql`).

## O que o seed cria

| Bloco | Conteúdo |
|---|---|
| **Org + branding** | Nome "Reiners Media LTDA", slug `reiners-media`, slogan "Presença que posiciona.", paleta (azul-marinho `#12233F`, dourado `#C9A227`, off-white `#F7F3EA`, preto premium) em `orgs.settings.brand` |
| **Owner** | `mazinhoww@gmail.com` vinculado como `owner` |
| **7 produtos** | Diagnóstico de Presença (R$ 800 / grátis ≥ R$ 5k) · Podcast In Loco (R$ 2.190/ep) · Hora de Estúdio (R$ 890/h) · Domo + Podcast em Eventos (R$ 2.180/h; domo R$ 17.000/4d) · Campanha Viva (GROWTH R$ 15.000/mês, ago–out) · Studio Corporativo Permanente (≥ R$ 260.000 + operação R$ 5.340/mês; case Sicredi R$ 387k) · BTS Recorrente (ESSENCIAL R$ 4.500 / GROWTH R$ 7.500) |
| **Pipeline Comercial** | Prospecção → Contato Feito → Reunião Agendada → Proposta Enviada → Negociação → Fechado → Perdido, com SLA (72h prospecção, 48h contato/proposta, 5d negociação) e probabilidade por estágio |
| **Pipeline Produção e Entrega** | Briefing → Agenda Confirmada → Pré-produção → Captação → Edição → Aprovação → Entregue → Pós-venda |
| **19 campos customizados** | produto de interesse, plano, tipo de gravação, data/horário/duração, episódios, cortes, domo, local, tipo de cliente, decisor, orçamento, urgência, objeção, próxima ação, observações + cidade/segmento no contato |
| **9 cadências** | 72h sem contato · proposta 48h (WhatsApp) · 5d (ligação) · 10d (último contato) · negociação parada (agente) · fechado → onboarding · evento próximo · entregue → upsell · perdido → retorno 30d |
| **9 agentes de IA** | Qualificador Comercial, Diagnóstico de Presença, Recomendador de Produto, Gerador de Proposta, Copy WhatsApp, Tratador de Objeções, Agente de Cadência, Contratos e Escopo, Pós-venda e Upsell — prompts extraídos do Manual Comercial 2026 |

## Regras embutidas nos prompts (do manual)

- WhatsApp pessoal como canal de ativação; nunca e-mail frio; tom de conversa.
- Follow-up: 48h WhatsApp → 5 dias ligação → 10 dias último contato → Perdido com motivo e retorno em 30 dias.
- **Nunca desconto sem redução de escopo** (plano ESSENCIAL como porta de entrada).
- Proposta em até 24h pós-reunião (máx. 6 páginas); contrato em até 4h pós-sim (máx. 3 páginas).
- Case Sicredi (R$ 387k) como âncora do Studio Corporativo; ciclo 30–90 dias com imersão → visita técnica → proposta presencial.
- Urgência eleitoral (eleição 5/out) na Campanha Viva.
- Linguagem proibida: posts, viral, engajamento, feed bonito, jargão de agência.
- Escada de upsell: avulso → recorrente → GROWTH → Studio Corporativo próprio.

## Mapeamento técnico dos agentes

Os 4 `kind`s executáveis do app são reutilizados para manter a persistência
especial sem mudança de código:

Os agentes seguem a **taxonomia canônica da plataforma** (`lib/agents/catalog.ts`),
igual em todos os tenants — assim Studio, funil e execução mostram o MESMO conjunto.

| Kind | Agente | Persistência |
|---|---|---|
| `lead-scoring` | Priorização Comercial (Scoring) | score/temperatura no deal |
| `sales-copilot` | Copiloto Comercial | mensagem em `messages` + link wa.me |
| `proposal` | Propostas e Escopo | linha em `proposals` |
| `legal-contract` | Contratos e Assinatura | linha em `contracts` |
| `activities` | Cadência e SLA | agenda `next_action_at` + notificação (operacional) |
| `lead-nurturing`, `coaching`, `sales-feedback`, `support-copilot` | demais | advisory (`agent_runs`) |

## Reexecutar o seed

No SQL Editor do Supabase (ou via MCP), rode o conteúdo de
`supabase/seeds/reiners.sql`. Se a org já existir, o script apenas loga
`Seed Reiners já aplicado` e não altera nada.

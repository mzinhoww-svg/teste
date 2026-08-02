# Agentes de IA

O CRM tem **9 agentes** que atuam do primeiro contato ao pós-venda. Desde a Fase 3
eles são **padrão global da plataforma**: o administrador da plataforma define os
9 agentes e todos os tenants herdam esse padrão.

## Os 9 agentes

| kind (runtime) | key | Categoria |
| --- | --- | --- |
| lead-nurturing | lead_intelligence_nutrition | Aquisição |
| lead-scoring | commercial_priority_scoring | Aquisição |
| sales-copilot | reiners_sales_copilot | Vendas |
| proposal | proposal_scope_agent | Vendas |
| legal-contract | contracts_signature_agent | Vendas |
| activities | cadence_sla_agent | Vendas |
| coaching | sales_coaching_agent | Pós-venda |
| sales-feedback | commercial_learning_agent | Pós-venda |
| support-copilot | onboarding_success_copilot | Pós-venda |

## Como o prompt é montado

Cada agente tem um **prompt específico** (o que ele faz). Em tempo de execução,
`composeAgentPrompt` (`lib/agents/reiners-context.ts`) envolve esse prompt com
camadas comuns, na ordem:

1. **Contexto Reiners** — posicionamento, produtos, tickets, processo comercial.
2. **Camada de enriquecimento** — onde buscar dados, ordem de confiança, regra de
   não-invenção, LGPD (ver `docs/agent-enrichment.md`).
3. **Instrução de WhatsApp** — ler a conversa do lead quando disponível.
4. **Prompt específico do agente** (do catálogo/override).
5. **Formato de saída obrigatório** — dados usados, enriquecimento, confiança,
   dados ausentes, buscas recomendadas, atualização sugerida no CRM.

Isso mantém tudo DRY: o contexto vive em um lugar só e não é repetido em cada
prompt salvo.

## Resolução (catálogo → plataforma → tenant)

`lib/agents/resolve.ts` resolve o agente efetivo nesta ordem:

1. **Catálogo** (`lib/agents/catalog.ts`) — padrão embutido no produto.
2. **Override da plataforma** (`platform_agent_templates`) — edições do admin da
   plataforma em `/admin/agents`, versionadas.
3. **Override do tenant** (`org_agent_settings`) — só quando
   `ALLOW_TENANT_AGENT_OVERRIDES=true`.

O `run-agent` usa o prompt/modelo resolvido; `agent_runs` registra `agentKey`,
`templateVersion` e `whatsappUsed`.

## Execução

- Rota `POST /api/agents/run` (`{ dealId, kind, dryRun? }`). `dryRun` gera prévia
  sem persistir.
- Modelo: GLM 5.2 via OpenRouter (`OPENROUTER_API_KEY`). Sem chave, heurística.
- Rate limit: 20 execuções por org por minuto.

Ver também: `docs/platform-admin-agents.md` (edição do padrão) e
`docs/agent-enrichment.md` (camada de enriquecimento).

## Diagnóstico — "por que está usando heurística?"

Quando o agente cai na heurística mesmo com uma chave de IA configurada, a chamada
ao LLM falhou e o motivo agora fica visível:

- **`GET /api/health`** → mostra se há chave detectada (`liveAI`, `provider`, `model`).
- **`GET /api/health?probe=1`** → faz uma chamada **real** ao LLM e retorna o erro
  exato em `probe.error`. Use isto para diagnosticar:
  - `401` → `OPENROUTER_API_KEY` inválida/ausente.
  - `402` → conta OpenRouter sem crédito.
  - `400 ... model` → o slug em `OPENROUTER_MODEL` (padrão `z-ai/glm-5.2`) não existe;
    troque por um modelo válido de [openrouter.ai/models](https://openrouter.ai/models).
- No drawer do lead, o resultado do agente mostra o badge **"heurística (IA falhou)"**
  com o motivo, e um aviso âmbar com o erro.

Depois de corrigir a env na Vercel e **refazer o deploy**, reexecute o agente — o
badge antigo fica gravado em `agent_runs`, então é preciso rodar de novo para ver
"IA · GLM".

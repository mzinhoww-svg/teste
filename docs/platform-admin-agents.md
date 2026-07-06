# Admin da plataforma — agentes padrão

Os 9 agentes são **padrão global da plataforma**: definidos pelo administrador da
plataforma e herdados por todos os tenants. Isso garante prompts refinados e
consistentes, sem cada tenant ter que configurar do zero.

## Onde editar

`/admin/agents` — acessível apenas ao **administrador da plataforma** (linha em
`platform_admins` ou e-mail em `PLATFORM_ADMIN_EMAILS`). A autorização é
validada no servidor (`requirePlatformAdmin`), nunca só por cookie.

Para cada agente é possível editar: instruções específicas, modelo, gatilhos e
ativo/inativo. Ao salvar:

- Uma **nova versão** é gravada em `platform_agent_template_versions` (histórico).
- A escrita usa **service role** (o server já validou o admin) — os templates são
  legíveis por qualquer autenticado, mas graváveis só assim.
- Um aviso deixa claro: **"afeta todos os tenants que herdam o padrão"**.
- **Restaurar padrão** remove a edição e volta ao prompt do catálogo embutido.

## O que o tenant vê

`/app/studio` mostra os agentes herdados em **modo leitura**, com o badge
"Padrão da plataforma", a versão em uso, os gatilhos e as instruções efetivas.
O contexto Reiners e o enriquecimento são aplicados automaticamente em cada
execução (não aparecem no prompt editável, para não poluir).

## Overrides por tenant (opcional)

Controlado pela flag `ALLOW_TENANT_AGENT_OVERRIDES`:

- `false` (padrão): todos os tenants usam o padrão da plataforma; o Studio é
  somente leitura.
- `true`: um owner/admin do tenant pode sobrescrever um agente localmente
  (gravado em `org_agent_settings` com `inherit_platform_default=false`),
  deixando de herdar o padrão global daquele agente.

## Segurança

- Nenhum tenant acessa dados ou agentes de outro tenant.
- `agent_runs` registra `agentKey` e `templateVersion` — dá para auditar qual
  versão do prompt gerou cada saída.

-- Migration 0014 — F3.4: novos agentes (Saúde do Pipeline, Reativação, Qualidade
-- de Dados). Semeia uma linha em `agents` por org existente (idempotente via
-- unique(org_id,kind)). O prompt efetivo vem do catálogo (lib/agents/catalog.ts)
-- na resolução; aqui gravamos só a metadata mínima para o Studio e o runtime.
-- Aditiva e reversível. Nota: bootstrap_org (novas orgs) deve ser atualizado à
-- parte para incluir estes kinds.

insert into public.agents (org_id, kind, name, funnel_group, agent_role, description, triggers, model, runnable, enabled, position)
select o.id, v.kind, v.name, v.grp, v.role, v.descr, v.triggers, 'deepseek/deepseek-v4-flash', false, true, v.pos
from public.orgs o
cross join (values
  ('pipeline-health', 'Saúde do Pipeline (Forecast)', 'vendas',    'Analisa saúde do funil e risco de meta', 'Forecast e deals presos', array['proposta','negociação','contrato']::text[], 20),
  ('reactivation',    'Reativação (Win-back)',        'pós-venda', 'Reabre perdidos e clientes inativos',    'Win-back com contexto',   array['perdido','descarte','inativo']::text[],  21),
  ('data-quality',    'Qualidade de Dados',           'aquisição', 'Higieniza o CRM',                        'Duplicidade e campos faltando', array['prospecção','contato']::text[],   22)
) as v(kind, name, grp, role, descr, triggers, pos)
on conflict (org_id, kind) do nothing;

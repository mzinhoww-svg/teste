-- ==========================================================================
-- Migration 0013 — FUNDAÇÃO (foundation)
-- ==========================================================================
-- Camada estrutural que destrava o roadmap de evolução do CRM (ver analise.md).
-- 100% ADITIVA e reversível: só cria tabelas/colunas/índices/policies/triggers
-- novos, nunca dropa nem reescreve dado. Segue o padrão do repo:
--   - tudo escopo por org_id + RLS via public.is_org_member(org_id);
--   - funções sensíveis SECURITY DEFINER com search_path = public;
--   - índices por org_id e nas FKs mais consultadas.
--
-- Blocos:
--   1. Ownership & roteamento (dono do deal + regras de distribuição)
--   2. Event stream + histórico de estágio (tracking append-only + triggers)
--   3. Integridade Proposta → Contrato → Fatura (FKs) + itens de proposta
--   4. Empresa (client_account) como entidade de ciclo de vida (desde o lead)
--   5. Motivos de perda enumerados
--   6. Metas (goals) para gestão/forecast
--   7. Tarefas com estado (separadas da timeline de atividades)
--   8. Intake multicanal + atribuição de origem (lead_inbox + UTM)
--   9. Consentimento / LGPD no contato
--  10. RLS + policies das tabelas novas
--  11. Backfill idempotente
-- ==========================================================================

-- ==========================================================================
-- 1. OWNERSHIP & ROTEAMENTO
-- deals.owner_user_id já existe (0003). Aqui: índice + carimbo de atribuição
-- + motor de distribuição (round-robin/segmento/carga/fixo) e seu cursor.
-- ==========================================================================
alter table public.deals
  add column if not exists owner_assigned_at timestamptz;
create index if not exists deals_owner_idx on public.deals(org_id, owner_user_id);

create table if not exists public.routing_rules (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  name text not null,
  enabled boolean not null default true,
  -- estratégia de atribuição do lead novo
  strategy text not null default 'round_robin'
    check (strategy in ('round_robin','by_segment','by_load','fixed')),
  -- filtro opcional de quando a regra vale (ex.: {"segment":"cooperativa","channel":"whatsapp"})
  match jsonb not null default '{}',
  -- fila de vendedores elegíveis (para round_robin/by_load); vazio = todos os membros
  pool uuid[] not null default '{}',
  -- vendedor fixo (para strategy = fixed / by_segment)
  assignee_user_id uuid references auth.users(id) on delete set null,
  position int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists routing_rules_org_idx on public.routing_rules(org_id);

-- Cursor do round-robin por org (quem recebeu o último lead).
create table if not exists public.routing_state (
  org_id uuid primary key references public.orgs(id) on delete cascade,
  last_assignee_user_id uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

-- ==========================================================================
-- 2. EVENT STREAM + HISTÓRICO DE ESTÁGIO  (o backbone do tracking)
-- deal_events: log append-only de tudo que acontece no deal (fonte da timeline
-- unificada, atribuição e realimentação da IA). deal_stage_history: tempo real
-- em cada estágio (conversão estágio-a-estágio, deals presos, velocity real).
-- Escrita via TRIGGER (SECURITY DEFINER) — usuários só leem (append-only real).
-- ==========================================================================
create table if not exists public.deal_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  deal_id uuid not null references public.deals(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  -- created | stage_changed | owner_changed | amount_changed | score_changed
  -- | note | email_sent | email_opened | whatsapp_in | whatsapp_out
  -- | proposal_sent | proposal_viewed | contract_sent | contract_signed
  -- | won | lost | reopened | agent_run | task_created | task_done
  kind text not null,
  data jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists deal_events_deal_idx on public.deal_events(org_id, deal_id, created_at desc);
create index if not exists deal_events_kind_idx on public.deal_events(org_id, kind, created_at desc);

create table if not exists public.deal_stage_history (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  deal_id uuid not null references public.deals(id) on delete cascade,
  stage_id uuid references public.stages(id) on delete set null,
  stage_name text,
  entered_at timestamptz not null default now(),
  exited_at timestamptz,
  duration_seconds bigint,
  changed_by uuid references auth.users(id) on delete set null
);
create index if not exists deal_stage_history_deal_idx on public.deal_stage_history(org_id, deal_id, entered_at);
create index if not exists deal_stage_history_open_idx on public.deal_stage_history(deal_id) where exited_at is null;

-- Trigger que carimba histórico + eventos automaticamente em INSERT/UPDATE de deal.
create or replace function public.deals_track_changes()
  returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_stage_name text;
begin
  if TG_OP = 'INSERT' then
    select name into v_stage_name from public.stages where id = new.stage_id;
    insert into public.deal_stage_history(org_id, deal_id, stage_id, stage_name, entered_at, changed_by)
      values (new.org_id, new.id, new.stage_id, v_stage_name, coalesce(new.created_at, now()), v_actor);
    insert into public.deal_events(org_id, deal_id, actor_user_id, kind, data)
      values (new.org_id, new.id, v_actor, 'created',
              jsonb_build_object('stage_id', new.stage_id, 'amount', new.amount));
    return new;
  end if;

  -- UPDATE: registra apenas o que mudou.
  if new.stage_id is distinct from old.stage_id then
    update public.deal_stage_history
      set exited_at = now(),
          duration_seconds = extract(epoch from (now() - entered_at))::bigint
      where deal_id = new.id and exited_at is null;
    select name into v_stage_name from public.stages where id = new.stage_id;
    insert into public.deal_stage_history(org_id, deal_id, stage_id, stage_name, entered_at, changed_by)
      values (new.org_id, new.id, new.stage_id, v_stage_name, now(), v_actor);
    insert into public.deal_events(org_id, deal_id, actor_user_id, kind, data)
      values (new.org_id, new.id, v_actor, 'stage_changed',
              jsonb_build_object('from', old.stage_id, 'to', new.stage_id, 'to_name', v_stage_name));
  end if;

  if new.owner_user_id is distinct from old.owner_user_id then
    insert into public.deal_events(org_id, deal_id, actor_user_id, kind, data)
      values (new.org_id, new.id, v_actor, 'owner_changed',
              jsonb_build_object('from', old.owner_user_id, 'to', new.owner_user_id));
  end if;

  if new.amount is distinct from old.amount then
    insert into public.deal_events(org_id, deal_id, actor_user_id, kind, data)
      values (new.org_id, new.id, v_actor, 'amount_changed',
              jsonb_build_object('from', old.amount, 'to', new.amount));
  end if;

  if new.score is distinct from old.score then
    insert into public.deal_events(org_id, deal_id, actor_user_id, kind, data)
      values (new.org_id, new.id, v_actor, 'score_changed',
              jsonb_build_object('from', old.score, 'to', new.score, 'temperature', new.temperature));
  end if;

  return new;
end $$;

drop trigger if exists deals_track_ins on public.deals;
drop trigger if exists deals_track_upd on public.deals;
create trigger deals_track_ins after insert on public.deals
  for each row execute function public.deals_track_changes();
create trigger deals_track_upd after update on public.deals
  for each row execute function public.deals_track_changes();

-- RPC para o app/webhooks registrarem eventos "de negócio" (e-mail aberto,
-- proposta vista, whatsapp) respeitando o org do deal. append-only por design.
create or replace function public.log_deal_event(p_deal_id uuid, p_kind text, p_data jsonb default '{}')
  returns uuid language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_id uuid;
begin
  select org_id into v_org from public.deals where id = p_deal_id;
  if v_org is null then return null; end if;
  if not public.is_org_member(v_org) then return null; end if;
  insert into public.deal_events(org_id, deal_id, actor_user_id, kind, data)
    values (v_org, p_deal_id, auth.uid(), p_kind, coalesce(p_data, '{}'))
    returning id into v_id;
  return v_id;
end $$;
revoke all on function public.log_deal_event(uuid, text, jsonb) from public;
grant execute on function public.log_deal_event(uuid, text, jsonb) to authenticated;

-- ==========================================================================
-- 3. INTEGRIDADE Proposta → Contrato → Fatura  +  itens de proposta
-- invoices.contract_id já existe (0010). Faltava: contract.proposal_id e a
-- normalização dos itens de proposta ligados ao catálogo (products) para
-- relatório de mix/margem e coerência "proposto == assinado == cobrado".
-- ==========================================================================
alter table public.contracts
  add column if not exists proposal_id uuid references public.proposals(id) on delete set null;
create index if not exists contracts_proposal_idx on public.contracts(proposal_id);

alter table public.invoices
  add column if not exists proposal_id uuid references public.proposals(id) on delete set null;

-- Itens de proposta normalizados (o jsonb `proposals.items` continua válido para
-- back-compat; a app passa a espelhar aqui para ligar a products e medir mix).
create table if not exists public.proposal_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  proposal_id uuid not null references public.proposals(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  name text not null,
  qty numeric not null default 1,
  unit_price numeric not null default 0,
  position int not null default 0
);
create index if not exists proposal_items_proposal_idx on public.proposal_items(proposal_id);
create index if not exists proposal_items_product_idx on public.proposal_items(product_id);

-- ==========================================================================
-- 4. EMPRESA (client_account) COMO CICLO DE VIDA — desde o lead, não só no Ganho
-- ==========================================================================
alter table public.client_accounts
  add column if not exists lifecycle text not null default 'lead'
    check (lifecycle in ('lead','ativo','inativo','churn')),
  add column if not exists owner_user_id uuid references auth.users(id) on delete set null,
  add column if not exists domain text,
  add column if not exists first_won_at timestamptz;
create index if not exists client_accounts_lifecycle_idx on public.client_accounts(org_id, lifecycle);
create index if not exists client_accounts_domain_idx on public.client_accounts(org_id, domain);

-- ==========================================================================
-- 5. MOTIVOS DE PERDA ENUMERADOS  (relatório de perda confiável + Aprendizado)
-- ==========================================================================
create table if not exists public.loss_reasons (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  label text not null,
  category text not null default 'outro'
    check (category in ('preco','timing','concorrente','sem_fit','sem_decisor','sem_resposta','orcamento','outro')),
  active boolean not null default true,
  position int not null default 0,
  unique (org_id, label)
);
create index if not exists loss_reasons_org_idx on public.loss_reasons(org_id);

alter table public.deals
  add column if not exists lost_reason_id uuid references public.loss_reasons(id) on delete set null;

-- ==========================================================================
-- 6. METAS (goals)  — base de forecast e cockpit de gestão
-- owner_user_id NULL = meta do time; period_month = 1º dia do mês.
-- ==========================================================================
create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  owner_user_id uuid references auth.users(id) on delete cascade,
  period_month date not null,
  metric text not null default 'receita_ganha'
    check (metric in ('receita_ganha','deals_ganhos','novos_deals','reunioes','propostas')),
  product_id uuid references public.products(id) on delete set null,
  target numeric not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists goals_org_period_idx on public.goals(org_id, period_month);

-- ==========================================================================
-- 7. TAREFAS COM ESTADO  (separadas da timeline de atividades)
-- activities = o que ACONTECEU (log). tasks = o que PRECISA acontecer.
-- ==========================================================================
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  deal_id uuid references public.deals(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  assignee_user_id uuid references auth.users(id) on delete set null,
  title text not null,
  notes text,
  due_at timestamptz,
  done_at timestamptz,
  priority text not null default 'normal' check (priority in ('baixa','normal','alta','urgente')),
  status text not null default 'aberta' check (status in ('aberta','concluida','cancelada')),
  -- de onde veio: humano, agente, cadência ou esteira pós-venda
  source text not null default 'manual' check (source in ('manual','agent','cadence','esteira')),
  agent_kind text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists tasks_org_assignee_idx on public.tasks(org_id, assignee_user_id, status, due_at);
create index if not exists tasks_deal_idx on public.tasks(deal_id) where deal_id is not null;
create index if not exists tasks_due_open_idx on public.tasks(org_id, due_at) where status = 'aberta';

-- ==========================================================================
-- 8. INTAKE MULTICANAL + ATRIBUIÇÃO DE ORIGEM
-- lead_inbox: entrada crua (whatsapp/e-mail/form/api/import) antes de virar deal.
-- deals.attribution: UTM/origem estruturada para relatório de canal.
-- ==========================================================================
alter table public.deals
  add column if not exists attribution jsonb not null default '{}',
  add column if not exists intake_channel text;

create table if not exists public.lead_inbox (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  channel text not null default 'form' check (channel in ('whatsapp','email','form','api','import','manual')),
  from_identifier text,          -- telefone/e-mail de origem
  payload jsonb not null default '{}',
  status text not null default 'novo' check (status in ('novo','convertido','descartado','duplicado')),
  deal_id uuid references public.deals(id) on delete set null,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);
create index if not exists lead_inbox_org_status_idx on public.lead_inbox(org_id, status, received_at desc);

-- ==========================================================================
-- 9. CONSENTIMENTO / LGPD no contato
-- ==========================================================================
alter table public.contacts
  add column if not exists consent_status text not null default 'desconhecido'
    check (consent_status in ('desconhecido','opt_in','opt_out')),
  add column if not exists consent_at timestamptz,
  add column if not exists consent_source text,
  add column if not exists opted_out_at timestamptz;

-- ==========================================================================
-- 10. RLS + POLICIES DAS TABELAS NOVAS
-- Padrão: org gerencia tudo (ALL). deal_events / deal_stage_history são
-- APPEND-ONLY para o usuário → só policy de SELECT (escrita vem de trigger
-- SECURITY DEFINER / service role, que ignora RLS).
-- ==========================================================================
alter table public.routing_rules       enable row level security;
alter table public.routing_state        enable row level security;
alter table public.deal_events          enable row level security;
alter table public.deal_stage_history   enable row level security;
alter table public.proposal_items       enable row level security;
alter table public.loss_reasons         enable row level security;
alter table public.goals                enable row level security;
alter table public.tasks                enable row level security;
alter table public.lead_inbox           enable row level security;

do $$
declare t text;
begin
  -- tabelas com CRUD normal pela org
  foreach t in array array['routing_rules','routing_state','proposal_items',
                           'loss_reasons','goals','tasks','lead_inbox']
  loop
    execute format(
      'create policy %1$s_all on public.%1$s for all
         using (public.is_org_member(org_id))
         with check (public.is_org_member(org_id));', t);
  end loop;

  -- tabelas append-only: só leitura pela org
  foreach t in array array['deal_events','deal_stage_history']
  loop
    execute format(
      'create policy %1$s_read on public.%1$s for select
         using (public.is_org_member(org_id));', t);
  end loop;
end $$;

-- ==========================================================================
-- 11. BACKFILL idempotente
-- Semeia histórico de estágio para deals já existentes (senão a timeline nasce
-- vazia) e um conjunto padrão de motivos de perda por org.
-- ==========================================================================
insert into public.deal_stage_history (org_id, deal_id, stage_id, stage_name, entered_at, changed_by)
select d.org_id, d.id, d.stage_id, s.name, coalesce(d.created_at, now()), null
from public.deals d
left join public.stages s on s.id = d.stage_id
where not exists (select 1 from public.deal_stage_history h where h.deal_id = d.id);

insert into public.loss_reasons (org_id, label, category, position)
select o.id, v.label, v.category, v.position
from public.orgs o
cross join (values
  ('Preço acima do orçamento','preco',0),
  ('Sem verba no momento','orcamento',1),
  ('Escolheu concorrente','concorrente',2),
  ('Timing errado / adiado','timing',3),
  ('Sem fit com o produto','sem_fit',4),
  ('Não falamos com o decisor','sem_decisor',5),
  ('Parou de responder','sem_resposta',6)
) as v(label, category, position)
on conflict (org_id, label) do nothing;

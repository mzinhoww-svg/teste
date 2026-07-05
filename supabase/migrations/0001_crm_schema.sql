-- ==========================================================================
-- CRM AI Studio — schema completo (aplicado ao projeto Supabase).
-- Multi-tenant: tudo escopo por org_id, isolado via RLS.
-- Ordem: tabelas → RLS/policies → bootstrap+signup → hardening.
-- ==========================================================================

create extension if not exists pgcrypto;

create table public.orgs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  settings jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  member_role text not null default 'owner' check (member_role in ('owner','admin','member')),
  created_at timestamptz not null default now(),
  unique (org_id, user_id)
);
create index on public.memberships(user_id);

create or replace function public.is_org_member(o uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.memberships m where m.org_id = o and m.user_id = auth.uid());
$$;

create table public.pipelines (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  name text not null, area text not null default 'sales',
  position int not null default 0, created_at timestamptz not null default now()
);
create index on public.pipelines(org_id);

create table public.stages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  pipeline_id uuid not null references public.pipelines(id) on delete cascade,
  name text not null, position int not null default 0, accent text not null default '#6366f1',
  key text, sla_days int, is_won boolean not null default false, is_lost boolean not null default false
);
create index on public.stages(pipeline_id);

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  name text not null, email text, phone text, company text, job_title text,
  channel text not null default 'form' check (channel in ('whatsapp','email','voice','portal','form')),
  custom jsonb not null default '{}', created_at timestamptz not null default now()
);
create index on public.contacts(org_id);

create table public.deals (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  pipeline_id uuid not null references public.pipelines(id) on delete cascade,
  stage_id uuid not null references public.stages(id),
  contact_id uuid references public.contacts(id) on delete set null,
  title text not null, amount numeric not null default 0,
  score int, score_reason text, temperature text check (temperature in ('hot','warm','cold')),
  engagement int not null default 0, last_touch date, tags text[] not null default '{}',
  custom jsonb not null default '{}', created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index on public.deals(org_id); create index on public.deals(stage_id);

create table public.activities (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  deal_id uuid references public.deals(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete cascade,
  type text not null default 'note' check (type in ('note','email','call','meeting','whatsapp','agent','form')),
  summary text not null, author text, created_at timestamptz not null default now()
);
create index on public.activities(deal_id);

create table public.agents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  kind text not null, name text not null,
  funnel_group text not null default 'vendas' check (funnel_group in ('aquisição','vendas','pós-venda')),
  agent_role text not null default '', description text not null default '',
  pains text[] not null default '{}', automated_activities text[] not null default '{}',
  instructions text not null default '', enabled boolean not null default true,
  triggers text[] not null default '{}', model text not null default 'z-ai/glm-5.2',
  temperature numeric not null default 0.4, runnable boolean not null default false,
  position int not null default 0, updated_at timestamptz not null default now(),
  unique (org_id, kind)
);
create index on public.agents(org_id);

create table public.agent_versions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  agent_id uuid not null references public.agents(id) on delete cascade,
  instructions text not null, model text not null, temperature numeric not null,
  created_by uuid references auth.users(id), created_at timestamptz not null default now()
);
create index on public.agent_versions(agent_id);

create table public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  agent_kind text not null, deal_id uuid references public.deals(id) on delete cascade,
  input jsonb, output jsonb, source text, model text,
  created_by uuid references auth.users(id), created_at timestamptz not null default now()
);
create index on public.agent_runs(deal_id);

create table public.proposals (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  deal_id uuid not null references public.deals(id) on delete cascade,
  items jsonb not null default '[]', subtotal numeric not null default 0,
  discount_pct numeric not null default 0, total numeric not null default 0,
  summary text, terms text, generated_by text, created_at timestamptz not null default now()
);
create index on public.proposals(deal_id);

create table public.contracts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  deal_id uuid not null references public.deals(id) on delete cascade,
  reference text not null, title text not null, clauses jsonb not null default '[]',
  value numeric not null default 0, signatories jsonb not null default '[]',
  signature_status text not null default 'rascunho' check (signature_status in ('rascunho','enviado','assinado','cancelado')),
  signature_provider text, generated_by text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index on public.contracts(deal_id);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete cascade,
  deal_id uuid references public.deals(id) on delete cascade,
  channel text not null default 'whatsapp',
  direction text not null default 'outbound' check (direction in ('inbound','outbound')),
  body text not null, status text not null default 'draft', external_id text,
  created_at timestamptz not null default now()
);
create index on public.messages(contact_id);

create table public.automations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  name text not null, trigger_type text not null default 'stage_enter',
  trigger_stage_id uuid references public.stages(id) on delete cascade,
  agent_kind text, enabled boolean not null default true,
  config jsonb not null default '{}', created_at timestamptz not null default now()
);
create index on public.automations(org_id);

-- ---- RLS ----------------------------------------------------------------
alter table public.orgs enable row level security;
alter table public.memberships enable row level security;
alter table public.pipelines enable row level security;
alter table public.stages enable row level security;
alter table public.contacts enable row level security;
alter table public.deals enable row level security;
alter table public.activities enable row level security;
alter table public.agents enable row level security;
alter table public.agent_versions enable row level security;
alter table public.agent_runs enable row level security;
alter table public.proposals enable row level security;
alter table public.contracts enable row level security;
alter table public.messages enable row level security;
alter table public.automations enable row level security;

create policy org_select on public.orgs for select using (public.is_org_member(id));
create policy org_update on public.orgs for update using (public.is_org_member(id));
create policy mem_select on public.memberships for select using (user_id = auth.uid());

do $$
declare t text;
begin
  foreach t in array array['pipelines','stages','contacts','deals','activities','agents',
    'agent_versions','agent_runs','proposals','contracts','messages','automations']
  loop
    execute format('create policy %1$s_all on public.%1$s for all
      using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));', t);
  end loop;
end $$;

-- ---- bootstrap_org + signup (ver 0002 no projeto) -----------------------
-- Nota: a função bootstrap_org (funil padrão + 9 agentes) e o trigger
-- handle_new_user em auth.users foram aplicados no projeto; o EXECUTE das
-- funções SECURITY DEFINER foi revogado de anon/authenticated.
-- Consulte o painel do Supabase para o corpo completo dessas funções.

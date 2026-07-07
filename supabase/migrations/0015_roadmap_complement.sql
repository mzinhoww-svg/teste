-- Migration 0015 — Complemento do roadmap (peças que o PR #45 não cobre).
-- Aditiva e reversível. RLS de membro de org em toda tabela nova.
--
-- Complementa o #45 (que já entregou stage history, loss reasons, tasks, goals,
-- routing, orchestrator, agentes de gestão). Aqui só o que faltou:
--   agent_learnings  — memória / loop de feedback injetada nos prompts
--   nps_responses    — NPS/CSAT real (coleta via portal + índice)
--   deal_contacts    — múltiplos contatos por deal, com papel
--   invoices.billing_cycle — ciclo p/ MRR (new/expansion/churn)

-- ============================================================================
-- Memória dos agentes (loop de feedback)
-- ============================================================================
create table if not exists public.agent_learnings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  source_kind text not null,
  learning text not null,
  deal_id uuid references public.deals(id) on delete set null,
  confidence text not null default 'media' check (confidence in ('alta','media','baixa','hipotese')),
  applied boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists agent_learnings_org_idx on public.agent_learnings(org_id, created_at desc);
alter table public.agent_learnings enable row level security;
create policy agent_learnings_org_all on public.agent_learnings for all
  using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));

-- ============================================================================
-- Papéis de contato por deal
-- ============================================================================
create table if not exists public.deal_contacts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  deal_id uuid not null references public.deals(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  role text not null default 'influenciador' check (role in ('decisor','influenciador','comprador','usuario','outro')),
  created_at timestamptz not null default now(),
  unique (deal_id, contact_id)
);
create index if not exists deal_contacts_deal_idx on public.deal_contacts(org_id, deal_id);
alter table public.deal_contacts enable row level security;
create policy deal_contacts_org_all on public.deal_contacts for all
  using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));

insert into public.deal_contacts (org_id, deal_id, contact_id, role)
select d.org_id, d.id, d.contact_id, 'decisor'
from public.deals d where d.contact_id is not null
on conflict (deal_id, contact_id) do nothing;

-- ============================================================================
-- NPS / CSAT real
-- ============================================================================
create table if not exists public.nps_responses (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  client_account_id uuid references public.client_accounts(id) on delete cascade,
  deal_id uuid references public.deals(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  score int not null check (score between 0 and 10),
  comment text,
  respondent_user_id uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists nps_org_idx on public.nps_responses(org_id, created_at desc);
create index if not exists nps_ca_idx on public.nps_responses(client_account_id);
alter table public.nps_responses enable row level security;
create policy nps_org_all on public.nps_responses for all
  using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));
create policy nps_client_read on public.nps_responses for select
  using (public.is_client_user(client_account_id));
create policy nps_client_insert on public.nps_responses for insert
  with check (public.is_client_user(client_account_id));

-- ============================================================================
-- Ciclo de faturamento (MRR)
-- ============================================================================
alter table public.invoices
  add column if not exists billing_cycle text not null default 'unico'
    check (billing_cycle in ('unico','mensal','trimestral','anual'));

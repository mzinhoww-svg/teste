-- Migration `expansion_core_tables` (aplicada no Supabase nwynoyqdrxaujlcratnx).
-- Aditiva e reversível.

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  name text not null, description text not null default '',
  price numeric, pricing_type text not null default 'fixo' check (pricing_type in ('fixo','hora','mensal','negociado','gratuito')),
  active boolean not null default true, metadata jsonb not null default '{}',
  position int not null default 0, created_at timestamptz not null default now()
);
create index if not exists products_org_idx on public.products(org_id);

create table if not exists public.custom_field_defs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  entity text not null default 'deal' check (entity in ('deal','contact')),
  key text not null, label text not null,
  field_type text not null default 'text' check (field_type in ('text','number','date','time','select','boolean','textarea')),
  options jsonb not null default '[]', required boolean not null default false,
  position int not null default 0, unique (org_id, entity, key)
);
create index if not exists cfd_org_idx on public.custom_field_defs(org_id);

create table if not exists public.invites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  email text not null, member_role text not null default 'member' check (member_role in ('admin','member')),
  token uuid not null default gen_random_uuid() unique,
  status text not null default 'pending' check (status in ('pending','accepted','cancelled','expired')),
  expires_at timestamptz not null default now() + interval '7 days',
  created_by uuid references auth.users(id), accepted_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists invites_org_idx on public.invites(org_id);
create index if not exists invites_token_idx on public.invites(token);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  deal_id uuid references public.deals(id) on delete cascade,
  contract_id uuid references public.contracts(id) on delete cascade,
  type text not null default 'info', title text not null, body text not null default '',
  action_url text, metadata jsonb not null default '{}',
  read_at timestamptz, created_at timestamptz not null default now()
);
create index if not exists notif_org_created_idx on public.notifications(org_id, created_at desc);
create index if not exists notif_org_unread_idx on public.notifications(org_id, read_at) where read_at is null;

create table if not exists public.cadence_rules (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  pipeline_id uuid references public.pipelines(id) on delete cascade,
  name text not null,
  trigger_type text not null default 'stalled_days' check (trigger_type in ('stalled_days','stage_no_reply','event_near')),
  stage_key text, days int not null default 3,
  action text not null default 'notify' check (action in ('notify','suggest_whatsapp','run_agent')),
  agent_kind text, template_key text, enabled boolean not null default true,
  config jsonb not null default '{}', created_at timestamptz not null default now()
);
create index if not exists cadence_org_idx on public.cadence_rules(org_id);

create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  note text, created_at timestamptz not null default now()
);

create table if not exists public.onboarding_progress (
  org_id uuid primary key references public.orgs(id) on delete cascade,
  steps jsonb not null default '{}', dismissed boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.contracts
  add column if not exists envelope_provider text,
  add column if not exists envelope_id text,
  add column if not exists external_status text,
  add column if not exists signing_url text,
  add column if not exists certificate_url text,
  add column if not exists sent_at timestamptz,
  add column if not exists signed_at timestamptz;

alter table public.deals
  add column if not exists owner_user_id uuid references auth.users(id),
  add column if not exists product_id uuid references public.products(id),
  add column if not exists origin text,
  add column if not exists next_action_at date,
  add column if not exists lost_reason text,
  add column if not exists probability int;

alter table public.pipelines add column if not exists archived boolean not null default false;
alter table public.stages add column if not exists probability int;
alter table public.contacts
  add column if not exists city text,
  add column if not exists segment text,
  add column if not exists notes text;

alter table public.products enable row level security;
alter table public.custom_field_defs enable row level security;
alter table public.invites enable row level security;
alter table public.notifications enable row level security;
alter table public.cadence_rules enable row level security;
alter table public.platform_admins enable row level security;
alter table public.onboarding_progress enable row level security;

do $$
declare t text;
begin
  foreach t in array array['products','custom_field_defs','invites','notifications','cadence_rules','onboarding_progress']
  loop
    execute format(
      'create policy %1$s_all on public.%1$s for all
         using (public.is_org_member(org_id))
         with check (public.is_org_member(org_id));', t);
  end loop;
end $$;

create policy padmin_self on public.platform_admins for select using (user_id = auth.uid());

-- accept_invite / peek_invite: ver corpo integral no histórico de migrations
-- do Supabase (funções SECURITY DEFINER com grants restritos).

-- Migration 0010 — Portal do Cliente + Financeiro (client_portal_financeiro)
-- Aditiva e reversível. RLS em todas as tabelas novas. Padrão do repo:
-- policy de membro de org (is_org_member) + policy de leitura do cliente
-- (is_client_user). Projeto Supabase: nwynoyqdrxaujlcratnx.

-- ============================================================================
-- FASE 0 (crítica) — signup do portal NÃO cria org/membership/agentes
-- Hoje handle_new_user cria org + membership owner + bootstrap_org (funil + 9
-- agentes) para TODO signup. O cliente do portal se cadastra com metadata
-- role='portal' e o trigger passa a ignorar esses usuários (early-return).
-- ============================================================================
create or replace function public.handle_new_user()
  returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v_org uuid;
begin
  -- Usuário do portal do cliente: não é tenant-CRM, não recebe org/agentes.
  if coalesce(new.raw_user_meta_data->>'role', '') = 'portal' then
    return new;
  end if;

  insert into public.orgs(name)
    values (coalesce(nullif(split_part(new.email, '@', 1), ''), 'Minha empresa'))
    returning id into v_org;
  insert into public.memberships(org_id, user_id, member_role) values (v_org, new.id, 'owner');
  perform public.bootstrap_org(v_org);
  return new;
end $$;

-- ============================================================================
-- FASE 1 — Tabelas novas
-- ============================================================================

-- Empresa-cliente da agência (herda tema via brand).
create table if not exists public.client_accounts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  slug text not null,
  name text not null,
  primary_contact_id uuid references public.contacts(id) on delete set null,
  brand jsonb not null default '{}',
  portal_enabled boolean not null default false,
  cnpj text,
  notes text,
  created_at timestamptz not null default now(),
  unique (org_id, slug)
);
create index if not exists client_accounts_org_idx on public.client_accounts(org_id);

-- Pessoa do cliente que acessa o portal. NUNCA tem membership.
create table if not exists public.client_users (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  client_account_id uuid not null references public.client_accounts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  name text,
  status text not null default 'active' check (status in ('active','disabled')),
  created_at timestamptz not null default now(),
  unique (client_account_id, user_id)
);
create index if not exists client_users_user_idx on public.client_users(user_id);
create index if not exists client_users_ca_idx on public.client_users(client_account_id);

-- Convite do portal (espelha invites).
create table if not exists public.client_invites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  client_account_id uuid not null references public.client_accounts(id) on delete cascade,
  email text not null,
  token uuid not null default gen_random_uuid() unique,
  status text not null default 'pending' check (status in ('pending','accepted','cancelled','expired')),
  expires_at timestamptz not null default now() + interval '30 days',
  created_by uuid references auth.users(id),
  accepted_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists client_invites_ca_idx on public.client_invites(client_account_id);
create index if not exists client_invites_token_idx on public.client_invites(token);

-- Financeiro (controle + link de pagamento; sem gateway).
create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  client_account_id uuid not null references public.client_accounts(id) on delete cascade,
  deal_id uuid references public.deals(id) on delete set null,
  contract_id uuid references public.contracts(id) on delete set null,
  number text,
  description text not null default '',
  amount numeric not null default 0,
  currency text not null default 'BRL',
  status text not null default 'rascunho' check (status in ('rascunho','enviada','paga','vencida','cancelada')),
  issue_date date not null default current_date,
  due_date date,
  paid_at timestamptz,
  payment_link text,
  payment_method text,
  items jsonb not null default '[]',
  recurring boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists invoices_org_idx on public.invoices(org_id);
create index if not exists invoices_ca_idx on public.invoices(client_account_id);

-- Projetos / entregas.
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  client_account_id uuid not null references public.client_accounts(id) on delete cascade,
  deal_id uuid references public.deals(id) on delete set null,
  name text not null,
  status text not null default 'ativo' check (status in ('ativo','pausado','concluido','cancelado')),
  start_date date,
  due_date date,
  description text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists projects_org_idx on public.projects(org_id);
create index if not exists projects_ca_idx on public.projects(client_account_id);

-- Documentos / entregas / links (unificados por discriminador).
create table if not exists public.deliverables (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  client_account_id uuid not null references public.client_accounts(id) on delete cascade,
  type text not null default 'file' check (type in ('file','link','document','milestone')),
  title text not null,
  url text,
  status text not null default 'pendente' check (status in ('pendente','entregue','aprovado')),
  delivered_at timestamptz,
  description text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists deliverables_org_idx on public.deliverables(org_id);
create index if not exists deliverables_ca_idx on public.deliverables(client_account_id);
create index if not exists deliverables_project_idx on public.deliverables(project_id);

-- Ligações nas tabelas existentes (aditivas).
alter table public.deals    add column if not exists client_account_id uuid references public.client_accounts(id) on delete set null;
alter table public.contacts add column if not exists client_account_id uuid references public.client_accounts(id) on delete set null;
create index if not exists deals_ca_idx on public.deals(client_account_id);
create index if not exists contacts_ca_idx on public.contacts(client_account_id);

-- ============================================================================
-- RLS — helper do cliente + policies
-- ============================================================================
create or replace function public.is_client_user(ca uuid)
  returns boolean language sql security definer stable set search_path to 'public' as $$
  select exists(
    select 1 from public.client_users cu
    where cu.client_account_id = ca and cu.user_id = auth.uid() and cu.status = 'active');
$$;

alter table public.client_accounts enable row level security;
alter table public.client_users    enable row level security;
alter table public.client_invites  enable row level security;
alter table public.invoices        enable row level security;
alter table public.projects        enable row level security;
alter table public.deliverables    enable row level security;

-- Org gerencia tudo (ALL). Cliente lê o que é dele (SELECT).
-- client_users / client_invites: só a org (o cliente não gerencia isso).
-- client_accounts: o próprio registro é o cliente → policy de leitura por `id`.
create policy client_accounts_org_all on public.client_accounts for all
  using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));
create policy client_accounts_client_read on public.client_accounts for select
  using (public.is_client_user(id));

-- Tabelas ligadas ao cliente por `client_account_id`.
do $$
declare t text;
begin
  foreach t in array array['invoices','projects','deliverables'] loop
    execute format(
      'create policy %1$s_org_all on public.%1$s for all
         using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));', t);
    execute format(
      'create policy %1$s_client_read on public.%1$s for select
         using (public.is_client_user(client_account_id));', t);
  end loop;

  foreach t in array array['client_users','client_invites'] loop
    execute format(
      'create policy %1$s_org_all on public.%1$s for all
         using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));', t);
  end loop;
end $$;

-- O próprio usuário do portal pode ler a sua linha em client_users (para resolver contexto).
create policy client_users_self_read on public.client_users
  for select using (user_id = auth.uid());

-- Leitura do cliente em deals/proposals/contracts (SELECT só; policies _all de org intactas).
create policy deals_client_read on public.deals
  for select using (public.is_client_user(client_account_id));
create policy proposals_client_read on public.proposals
  for select using (exists (
    select 1 from public.deals d where d.id = proposals.deal_id and public.is_client_user(d.client_account_id)));
create policy contracts_client_read on public.contracts
  for select using (exists (
    select 1 from public.deals d where d.id = contracts.deal_id and public.is_client_user(d.client_account_id)));

-- ============================================================================
-- RPCs SECURITY DEFINER (espelham peek_invite / accept_invite)
-- ============================================================================
create or replace function public.peek_client_invite(p_token uuid)
  returns jsonb language sql stable security definer set search_path to 'public' as $$
  select case when i.id is null then jsonb_build_object('found', false)
    else jsonb_build_object('found', true, 'org_name', o.name, 'client_name', ca.name,
                            'client_slug', ca.slug, 'email', i.email, 'status', i.status,
                            'expired', i.expires_at < now())
    end
  from (select 1) x
  left join public.client_invites i on i.token = p_token
  left join public.client_accounts ca on ca.id = i.client_account_id
  left join public.orgs o on o.id = i.org_id;
$$;

create or replace function public.accept_client_invite(p_token uuid)
  returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_inv record; v_user uuid; v_email text; v_slug text;
begin
  v_user := auth.uid();
  if v_user is null then return jsonb_build_object('ok', false, 'error', 'não autenticado'); end if;
  select email into v_email from auth.users where id = v_user;

  select * into v_inv from public.client_invites where token = p_token;
  if v_inv is null then return jsonb_build_object('ok', false, 'error', 'Convite não encontrado'); end if;
  if v_inv.status <> 'pending' then return jsonb_build_object('ok', false, 'error', 'Convite já utilizado ou cancelado'); end if;
  if v_inv.expires_at < now() then
    update public.client_invites set status = 'expired' where id = v_inv.id;
    return jsonb_build_object('ok', false, 'error', 'Convite expirado');
  end if;
  if lower(v_inv.email) <> lower(coalesce(v_email, '')) then
    return jsonb_build_object('ok', false, 'error', 'Este convite foi emitido para outro e-mail: ' || v_inv.email);
  end if;

  insert into public.client_users (org_id, client_account_id, user_id, email)
    values (v_inv.org_id, v_inv.client_account_id, v_user, v_email)
    on conflict (client_account_id, user_id) do update set status = 'active';
  update public.client_invites set status = 'accepted', accepted_by = v_user where id = v_inv.id;
  select slug into v_slug from public.client_accounts where id = v_inv.client_account_id;

  return jsonb_build_object('ok', true, 'client_slug', v_slug, 'org_id', v_inv.org_id);
end $$;

revoke all on function public.peek_client_invite(uuid) from public;
revoke all on function public.accept_client_invite(uuid) from public;
grant execute on function public.peek_client_invite(uuid) to anon, authenticated;
grant execute on function public.accept_client_invite(uuid) to authenticated;

-- ============================================================================
-- Bootstrap — client_accounts a partir de contacts.company (idempotente).
-- Vínculo depois editável na tela de Clientes (nomes de empresa divergem).
-- ============================================================================
insert into public.client_accounts (org_id, slug, name)
select c.org_id,
       regexp_replace(lower(trim(c.company)), '[^a-z0-9]+', '-', 'g') as slug,
       trim(c.company) as name
from public.contacts c
where coalesce(trim(c.company), '') <> ''
group by c.org_id, trim(c.company)
on conflict (org_id, slug) do nothing;

-- Casa contacts/deals ao client_account pela empresa.
update public.contacts c set client_account_id = ca.id
from public.client_accounts ca
where ca.org_id = c.org_id
  and ca.slug = regexp_replace(lower(trim(c.company)), '[^a-z0-9]+', '-', 'g')
  and c.client_account_id is null
  and coalesce(trim(c.company), '') <> '';

update public.deals d set client_account_id = c.client_account_id
from public.contacts c
where d.contact_id = c.id and d.client_account_id is null and c.client_account_id is not null;

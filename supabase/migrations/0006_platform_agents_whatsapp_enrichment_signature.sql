-- Fase 2 — Schema base para: agentes globais da plataforma, overrides por tenant,
-- enriquecimento de leads, infraestrutura de WhatsApp e assinatura robusta.
-- Idempotente (if not exists / drop policy if exists).

-- ===========================================================================
-- Agentes padrão da PLATAFORMA (herdados por todos os tenants)
-- ===========================================================================
create table if not exists public.platform_agent_templates (
  id uuid primary key default gen_random_uuid(),
  key text unique not null,
  name text not null,
  category text,
  description text,
  default_prompt text not null default '',
  default_model text not null default 'z-ai/glm-5.2',
  default_triggers text[] not null default '{}',
  active boolean not null default true,
  version int not null default 1,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.platform_agent_template_versions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.platform_agent_templates(id) on delete cascade,
  version int not null,
  prompt text not null default '',
  model text,
  triggers text[] not null default '{}',
  changelog text,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists patv_template_idx on public.platform_agent_template_versions(template_id, version desc);

-- Override por tenant (só usado quando ALLOW_TENANT_AGENT_OVERRIDES=true).
create table if not exists public.org_agent_settings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  agent_key text not null,
  inherit_platform_default boolean not null default true,
  override_prompt text,
  override_model text,
  override_triggers text[],
  active boolean,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, agent_key)
);

-- ===========================================================================
-- Enriquecimento de leads (evidências por deal/contato)
-- ===========================================================================
create table if not exists public.lead_enrichment (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  deal_id uuid references public.deals(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  company_name text,
  source_type text not null default 'other',
  source_label text,
  source_url text,
  captured_at timestamptz not null default now(),
  extracted_fact text,
  confidence text not null default 'low',
  relevance text,
  used_by_agent text,
  created_by_user_id uuid,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists lead_enrichment_deal_idx on public.lead_enrichment(org_id, deal_id);

-- ===========================================================================
-- Infraestrutura de WhatsApp (bridge externo — leitura por org/thread/deal)
-- ===========================================================================
create table if not exists public.whatsapp_connections (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  provider text not null default 'bridge',
  instance_id text,
  phone_number text,
  status text not null default 'disconnected',
  connected_at timestamptz,
  disconnected_at timestamptz,
  last_sync_at timestamptz,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.whatsapp_threads (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  deal_id uuid references public.deals(id) on delete set null,
  wa_chat_id text,
  phone_normalized text,
  display_name text,
  last_message_at timestamptz,
  last_inbound_at timestamptz,
  last_outbound_at timestamptz,
  last_summary text,
  last_summary_at timestamptz,
  consent_status text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, phone_normalized)
);
create index if not exists wa_threads_deal_idx on public.whatsapp_threads(org_id, deal_id);

create table if not exists public.whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  thread_id uuid not null references public.whatsapp_threads(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  deal_id uuid references public.deals(id) on delete set null,
  provider_message_id text,
  direction text not null,
  sender_phone text,
  sender_name text,
  body text,
  media_type text,
  media_url text,
  transcription text,
  sent_at timestamptz,
  received_at timestamptz,
  raw_metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists wa_messages_thread_idx on public.whatsapp_messages(thread_id, created_at desc);
create unique index if not exists wa_messages_provider_id_key on public.whatsapp_messages(org_id, provider_message_id) where provider_message_id is not null;

create table if not exists public.whatsapp_sync_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  connection_id uuid references public.whatsapp_connections(id) on delete set null,
  event_type text,
  payload jsonb not null default '{}',
  status text,
  error text,
  created_at timestamptz not null default now()
);

-- ===========================================================================
-- Assinatura robusta (envelopes + signatários por contrato)
-- ===========================================================================
create table if not exists public.contract_signature_envelopes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  contract_id uuid not null references public.contracts(id) on delete cascade,
  provider text not null default 'opensign',
  provider_document_id text,
  provider_template_id text,
  status text not null default 'draft',
  signing_url text,
  signed_pdf_url text,
  certificate_url text,
  audit_url text,
  expires_at timestamptz,
  sent_at timestamptz,
  completed_at timestamptz,
  revoked_at timestamptz,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists cse_contract_idx on public.contract_signature_envelopes(org_id, contract_id);

create table if not exists public.contract_signers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  contract_id uuid not null references public.contracts(id) on delete cascade,
  envelope_id uuid references public.contract_signature_envelopes(id) on delete cascade,
  name text not null,
  email text,
  phone text,
  role text not null default 'signer',
  signing_order int,
  provider_signer_id text,
  signing_url text,
  internal_signing_token_hash text,
  internal_signing_token_expires_at timestamptz,
  status text not null default 'pending',
  viewed_at timestamptz,
  signed_at timestamptz,
  declined_at timestamptz,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists csigners_contract_idx on public.contract_signers(org_id, contract_id);

-- ===========================================================================
-- RLS
-- ===========================================================================
-- Tabelas escopadas por org: política padrão is_org_member (para todas as ações).
do $$
declare t text;
begin
  foreach t in array array[
    'org_agent_settings','lead_enrichment','whatsapp_connections','whatsapp_threads',
    'whatsapp_messages','whatsapp_sync_events','contract_signature_envelopes','contract_signers'
  ]
  loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists %1$s_all on public.%1$s;', t);
    execute format(
      'create policy %1$s_all on public.%1$s for all
         using (public.is_org_member(org_id))
         with check (public.is_org_member(org_id));', t);
  end loop;
end $$;

-- Templates da plataforma: leitura por qualquer autenticado (todos herdam);
-- escrita só via service role (o server valida platform admin antes).
alter table public.platform_agent_templates enable row level security;
alter table public.platform_agent_template_versions enable row level security;
drop policy if exists pat_read on public.platform_agent_templates;
drop policy if exists patv_read on public.platform_agent_template_versions;
create policy pat_read on public.platform_agent_templates for select using (auth.role() = 'authenticated');
create policy patv_read on public.platform_agent_template_versions for select using (auth.role() = 'authenticated');

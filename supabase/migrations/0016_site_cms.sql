-- ==========================================================================
-- Migration 0016 — CMS do SITE PÚBLICO (landing + portfólio)
-- ==========================================================================
-- O site público (reiners.agency) não é multi-tenant: é a vitrine única da
-- Reiners Media. Por isso estas tabelas NÃO têm org_id — o isolamento aqui é
-- outro: leitura anônima liberada (a landing é pública) e escrita apenas para
-- editores/admins listados em site_admins.
--
-- Mapeia 1:1 os modelos do briefing (SiteConfig, Plan, Testimonial, AdminUser),
-- em snake_case como o resto do schema. Ver docs/site-landing.md.
--
-- Blocos:
--   1. site_config       — singleton de configuração da landing
--   2. site_plans        — planos/serviços (seção "Planos")
--   3. site_testimonials — depoimentos
--   4. site_programs     — programas do portfólio (posters)
--   5. site_admins       — quem pode editar (ADMIN | EDITOR)
--   6. site_events       — analytics próprio (visitas, cliques, formulários)
--   7. site_leads        — formulário "Agendar sessão"
--   8. RLS + policies
--   9. Seed idempotente (3 planos, 3 depoimentos, 5 programas, 1 config)
-- ==========================================================================

-- ==========================================================================
-- 1. CONFIGURAÇÃO DO SITE (singleton — garantido pelo índice único abaixo)
-- ==========================================================================
create table if not exists public.site_config (
  id uuid primary key default gen_random_uuid(),
  singleton boolean not null default true,
  site_name text not null default 'Reiners Media',
  tagline text not null default 'Estúdio de Podcast Premium',
  hero_video_url text,
  hero_image_url text,
  cta_primary_text text not null default 'Ver planos',
  cta_primary_url text not null default '#planos',
  cta_secondary_text text not null default 'Ouvir programas',
  cta_secondary_url text not null default '/portfolio',
  seo_title text,
  seo_description text,
  analytics_id text,
  custom_css text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Uma linha só: o índice único sobre a constante trava qualquer segunda linha.
create unique index if not exists site_config_singleton_idx on public.site_config(singleton);

-- ==========================================================================
-- 2. PLANOS
-- ==========================================================================
create table if not exists public.site_plans (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  price text not null,                       -- ex.: 'R$ 2.190'
  period text not null default '/mês',
  description text,
  features jsonb not null default '[]',      -- ["Gravação 4K", "Edição em 48h"]
  is_featured boolean not null default false,
  display_order int not null default 0,
  published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists site_plans_order_idx on public.site_plans(display_order);

-- ==========================================================================
-- 3. DEPOIMENTOS
-- ==========================================================================
create table if not exists public.site_testimonials (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  role text not null,
  quote text not null,
  avatar_url text,
  program_id uuid,                           -- FK adicionada após site_programs
  display_order int not null default 0,
  published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ==========================================================================
-- 4. PROGRAMAS (portfólio — posters 2:3 da landing e da página /portfolio)
-- ==========================================================================
create table if not exists public.site_programs (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null unique,
  client text,
  description text,
  poster_url text,
  listen_url text,
  category text,
  featured boolean not null default false,   -- aparece no teaser da landing
  display_order int not null default 0,
  published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists site_programs_order_idx on public.site_programs(display_order);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'site_testimonials_program_fk'
  ) then
    alter table public.site_testimonials
      add constraint site_testimonials_program_fk
      foreign key (program_id) references public.site_programs(id) on delete set null;
  end if;
end $$;

-- ==========================================================================
-- 5. EDITORES DO SITE
-- ==========================================================================
create table if not exists public.site_admins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  email text not null unique,
  name text,
  role text not null default 'EDITOR' check (role in ('ADMIN', 'EDITOR')),
  created_at timestamptz not null default now()
);
create index if not exists site_admins_user_idx on public.site_admins(user_id);

-- É editor do site? Casa por user_id OU por e-mail (convite antes do 1º login).
-- SECURITY DEFINER para a policy não depender de RLS na própria tabela.
create or replace function public.is_site_editor()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.site_admins sa
    where sa.user_id = auth.uid()
       or lower(sa.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

create or replace function public.is_site_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.site_admins sa
    where (sa.user_id = auth.uid()
        or lower(sa.email) = lower(coalesce(auth.jwt() ->> 'email', '')))
      and sa.role = 'ADMIN'
  );
$$;

-- ==========================================================================
-- 6. ANALYTICS PRÓPRIO (KPIs do dashboard admin — sem cookie, sem terceiros)
-- ==========================================================================
create table if not exists public.site_events (
  id bigserial primary key,
  kind text not null check (kind in ('page_view', 'cta_click', 'form_submit')),
  path text not null default '/',
  label text,                                -- ex.: 'hero_primary', 'plan_growth'
  created_at timestamptz not null default now()
);
create index if not exists site_events_kind_created_idx on public.site_events(kind, created_at desc);

-- ==========================================================================
-- 7. LEADS DO SITE (formulário "Agendar sessão")
-- ==========================================================================
create table if not exists public.site_leads (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  phone text,
  message text,
  source text not null default 'landing',
  handled boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists site_leads_created_idx on public.site_leads(created_at desc);

-- ==========================================================================
-- 8. RLS
-- Leitura: anônima (é um site público) — só do conteúdo publicado.
-- Escrita: só editores. site_leads/site_events aceitam INSERT anônimo (é o
-- visitante que grava), mas a LEITURA é restrita a editores.
-- ==========================================================================
alter table public.site_config enable row level security;
alter table public.site_plans enable row level security;
alter table public.site_testimonials enable row level security;
alter table public.site_programs enable row level security;
alter table public.site_admins enable row level security;
alter table public.site_events enable row level security;
alter table public.site_leads enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where policyname = 'site_config_public_read') then
    create policy site_config_public_read on public.site_config for select using (true);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'site_config_editor_write') then
    create policy site_config_editor_write on public.site_config for all
      using (public.is_site_editor()) with check (public.is_site_editor());
  end if;

  if not exists (select 1 from pg_policies where policyname = 'site_plans_public_read') then
    create policy site_plans_public_read on public.site_plans for select using (published);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'site_plans_editor_write') then
    create policy site_plans_editor_write on public.site_plans for all
      using (public.is_site_editor()) with check (public.is_site_editor());
  end if;

  if not exists (select 1 from pg_policies where policyname = 'site_testimonials_public_read') then
    create policy site_testimonials_public_read on public.site_testimonials for select using (published);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'site_testimonials_editor_write') then
    create policy site_testimonials_editor_write on public.site_testimonials for all
      using (public.is_site_editor()) with check (public.is_site_editor());
  end if;

  if not exists (select 1 from pg_policies where policyname = 'site_programs_public_read') then
    create policy site_programs_public_read on public.site_programs for select using (published);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'site_programs_editor_write') then
    create policy site_programs_editor_write on public.site_programs for all
      using (public.is_site_editor()) with check (public.is_site_editor());
  end if;

  -- Só ADMIN gerencia a lista de editores (EDITOR não mexe em usuários).
  if not exists (select 1 from pg_policies where policyname = 'site_admins_self_read') then
    create policy site_admins_self_read on public.site_admins for select
      using (public.is_site_editor());
  end if;
  if not exists (select 1 from pg_policies where policyname = 'site_admins_admin_write') then
    create policy site_admins_admin_write on public.site_admins for all
      using (public.is_site_admin()) with check (public.is_site_admin());
  end if;

  if not exists (select 1 from pg_policies where policyname = 'site_events_anon_insert') then
    create policy site_events_anon_insert on public.site_events for insert with check (true);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'site_events_editor_read') then
    create policy site_events_editor_read on public.site_events for select
      using (public.is_site_editor());
  end if;

  if not exists (select 1 from pg_policies where policyname = 'site_leads_anon_insert') then
    create policy site_leads_anon_insert on public.site_leads for insert with check (true);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'site_leads_editor_read') then
    create policy site_leads_editor_read on public.site_leads for all
      using (public.is_site_editor()) with check (public.is_site_editor());
  end if;
end $$;

-- ==========================================================================
-- 9. SEED IDEMPOTENTE — conteúdo real da Reiners Media (docs/reiners-media-seed.md)
-- Só insere se a tabela estiver vazia: nunca sobrescreve edição feita no admin.
-- ==========================================================================
insert into public.site_config (site_name, tagline, seo_title, seo_description)
select 'Reiners Media',
       'Estúdio de Podcast Premium',
       'Reiners Media — Estúdio de podcast premium',
       'Gravação, edição, mixagem, identidade visual e distribuição. Tudo em um só lugar.'
where not exists (select 1 from public.site_config);

insert into public.site_plans (name, price, period, description, features, is_featured, display_order)
select * from (values
  ('Hora de Estúdio', 'R$ 890', '/hora',
   'Para quem já tem pauta e equipe: use nossa estrutura por hora.',
   '["Estúdio com tratamento acústico","Até 3 câmeras 4K","Operador de áudio incluso","Arquivos brutos no mesmo dia"]'::jsonb,
   false, 1),
  ('Podcast In Loco', 'R$ 2.190', '/episódio',
   'Gravamos na sua sede, com estrutura de estúdio montada no local.',
   '["Equipe e equipamento na sua sede","Episódio editado + 5 cortes","Reel de divulgação","Fotos do bastidor","Entrega em 48h"]'::jsonb,
   true, 2),
  ('BTS Recorrente', 'R$ 4.500', '/mês',
   'Presença institucional contínua: pauta, gravação e distribuição todo mês.',
   '["2 episódios por mês","10 cortes verticais","Identidade visual do programa","Distribuição em todas as plataformas","Relatório mensal de audiência"]'::jsonb,
   false, 3)
) as v(name, price, period, description, features, is_featured, display_order)
where not exists (select 1 from public.site_plans);

insert into public.site_programs (title, slug, client, description, category, featured, display_order)
select * from (values
  ('Conversas que Cooperam', 'conversas-que-cooperam', 'Sicredi MT',
   'Série institucional gravada no estúdio corporativo permanente da cooperativa.',
   'Corporativo', true, 1),
  ('Indústria em Pauta', 'industria-em-pauta', 'Federação das Indústrias',
   'Podcast in loco com lideranças industriais do Centro-Oeste.',
   'Institucional', true, 2),
  ('Domo Cast', 'domo-cast', 'Eventos Reiners',
   'Episódios gravados dentro do domo geodésico, ao vivo, em feiras e congressos.',
   'Eventos', true, 3),
  ('Presença que Posiciona', 'presenca-que-posiciona', 'Reiners Media',
   'O programa da casa sobre comunicação estratégica institucional.',
   'Autoral', true, 4),
  ('Campo Aberto', 'campo-aberto', 'Associação do Agro',
   'Videocast itinerante sobre o agronegócio de Mato Grosso.',
   'Institucional', true, 5)
) as v(title, slug, client, description, category, featured, display_order)
where not exists (select 1 from public.site_programs);

insert into public.site_testimonials (name, role, quote, display_order)
select * from (values
  ('Ana Furtado', 'Gerente de Comunicação · Sicredi MT',
   'Saímos de posts avulsos para um programa próprio. A diretoria virou porta-voz e a pauta deixou de depender de agência.',
   1),
  ('Rodrigo Menezes', 'Diretor · Federação das Indústrias',
   'A equipe montou estúdio na nossa sede em duas horas. O episódio ficou pronto em 48h, com cortes prontos para publicar.',
   2),
  ('Camila Prado', 'Head de Marketing · Associação do Agro',
   'O rigor de estúdio aparece no resultado. É o único fornecedor que entrega roteiro, gravação e distribuição sem terceirizar.',
   3)
) as v(name, role, quote, display_order)
where not exists (select 1 from public.site_testimonials);

-- Admin inicial do site (mesmo dono do CRM). Idempotente pelo unique de email.
insert into public.site_admins (email, name, role)
values ('mazinhoww@gmail.com', 'Reiners Media', 'ADMIN')
on conflict (email) do nothing;

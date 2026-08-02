-- ==========================================================================
-- Catálogo de podcasts (/portfolio) — endurecimento no Supabase.
--
-- As TABELAS são criadas pelo Prisma (prisma/migrations/*). Este arquivo trata
-- do que o Prisma não cobre e o Supabase exige:
--
--   1. RLS. Toda tabela em `public` é automaticamente publicada pelo PostgREST
--      para os papéis `anon` e `authenticated`. Sem RLS, qualquer pessoa com a
--      chave anônima (que é pública, vai no bundle do browser) poderia LER e
--      ESCREVER no catálogo direto pela API REST, contornando o admin.
--      O módulo acessa tudo via Prisma no servidor — que conecta como dono do
--      banco e não passa por RLS. Então habilitamos RLS SEM nenhuma policy:
--      o PostgREST nega tudo, o Prisma continua funcionando.
--
--   2. O bucket de Storage usado pelo upload de imagens do admin.
--
-- Rodar DEPOIS de `npm run portfolio:migrate`.
-- ==========================================================================

-- ---- 1. RLS: nega qualquer acesso pela API pública -----------------------
alter table if exists public.portfolio_podcasts     enable row level security;
alter table if exists public.portfolio_episodes     enable row level security;
alter table if exists public.portfolio_site_config  enable row level security;
alter table if exists public.portfolio_admin_users  enable row level security;
alter table if exists public.portfolio_event_log    enable row level security;

-- Force garante que nem o dono da tabela escapa da RLS via PostgREST.
alter table if exists public.portfolio_admin_users  force row level security;

-- `_prisma_migrations` é criada pelo Prisma no schema `public` e, portanto,
-- também é publicada pelo PostgREST: sem isto, o histórico de schema fica
-- legível pela chave anônima.
alter table if exists public."_prisma_migrations" enable row level security;

-- Revoga o grant padrão do Supabase para os papéis expostos na internet.
revoke all on public.portfolio_podcasts    from anon, authenticated;
revoke all on public.portfolio_episodes    from anon, authenticated;
revoke all on public.portfolio_site_config from anon, authenticated;
revoke all on public.portfolio_admin_users from anon, authenticated;
revoke all on public.portfolio_event_log   from anon, authenticated;
revoke all on public."_prisma_migrations"  from anon, authenticated;

-- ---- 2. Storage: bucket das imagens do catálogo --------------------------
-- Leitura pública (as capas aparecem no site), escrita só autenticada.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'portfolio',
  'portfolio',
  true,
  5242880, -- 5 MB, igual ao limite validado na Server Action
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/svg+xml']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ATENÇÃO: NÃO criar policy de SELECT em storage.objects para este bucket.
-- Um bucket `public` já serve os objetos por /object/public/<bucket>/<path>
-- sem policy nenhuma. Uma policy de SELECT ampla não é necessária para as
-- capas carregarem e permite que qualquer cliente LISTE todos os arquivos do
-- bucket (linter 0025_public_bucket_allows_listing). Por isso ela é removida.
drop policy if exists "portfolio_public_read" on storage.objects;

drop policy if exists "portfolio_authenticated_write" on storage.objects;
create policy "portfolio_authenticated_write"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'portfolio');

drop policy if exists "portfolio_authenticated_update" on storage.objects;
create policy "portfolio_authenticated_update"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'portfolio')
  with check (bucket_id = 'portfolio');

drop policy if exists "portfolio_authenticated_delete" on storage.objects;
create policy "portfolio_authenticated_delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'portfolio');

-- ==========================================================================
-- Migration 0019 — convidados que já gravaram no estúdio
-- ==========================================================================
-- Prova social factual, separada dos depoimentos: aqui não há aspas, só quem
-- esteve no estúdio. Um depoimento afirma que a pessoa recomenda; esta seção
-- afirma que ela gravou — e é verificável.
--
-- A seção não aparece enquanto não houver ninguém publicado (o componente
-- devolve null), então entra no ar já, oculta, e liga sozinha no primeiro
-- convidado marcado como publicado.
-- ==========================================================================

create table if not exists public.site_guests (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  -- Livre de propósito: "atriz", "convidada do Domo Cast", "CEO da X".
  role text,
  photo_url text,
  program_id uuid references public.site_programs(id) on delete set null,
  display_order int not null default 0,
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists site_guests_order_idx on public.site_guests(display_order);

alter table public.site_guests enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where policyname = 'site_guests_public_read') then
    create policy site_guests_public_read on public.site_guests for select using (published);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'site_guests_editor_write') then
    create policy site_guests_editor_write on public.site_guests for all
      using (public.is_site_editor()) with check (public.is_site_editor());
  end if;
end $$;

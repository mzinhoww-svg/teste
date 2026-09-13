-- ==========================================================================
-- Migration 0020 — "O que fazemos": os serviços do estúdio
-- ==========================================================================
-- Seis frentes numeradas, navegadas por abas na landing. Diferente de
-- `site_plans` (quanto custa) esta tabela responde OUTRA pergunta: o que dá
-- para contratar. Por isso não tem preço — o plano é o desdobramento
-- comercial do serviço, não o mesmo dado com outro nome.
--
-- Mídia: cada serviço aceita UM vídeo ou ATÉ TRÊS imagens. O vídeo chega
-- depois, então as duas colunas nascem vazias e a landing simplesmente não
-- desenha o bloco de mídia enquanto não houver arquivo — em vez de reservar
-- uma caixa preta vazia.
-- ==========================================================================

create table if not exists public.site_services (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  -- Selo opcional ao lado do título na lista. Ex.: "Estúdio próprio".
  badge text,
  description text,
  -- Linha de fecho abaixo da mídia. Aceita **negrito** em markdown simples.
  footnote text,
  video_url text,
  -- Pôster do vídeo. Sem ele o player abre num frame preto.
  poster_url text,
  -- Até 3 URLs. Ignorado quando video_url está preenchido.
  images jsonb not null default '[]'::jsonb,
  display_order int not null default 0,
  published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists site_services_order_idx on public.site_services(display_order);

alter table public.site_services enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where policyname = 'site_services_public_read') then
    create policy site_services_public_read on public.site_services for select using (published);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'site_services_editor_write') then
    create policy site_services_editor_write on public.site_services for all
      using (public.is_site_editor()) with check (public.is_site_editor());
  end if;
end $$;

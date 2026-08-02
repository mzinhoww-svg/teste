-- ==========================================================================
-- Migration 0017 — WhatsApp como canal principal do site
-- ==========================================================================
-- O manual comercial da Reiners define o WhatsApp pessoal como canal de
-- ativação ("conversa, não pitch"). A landing passa a levar o visitante para
-- lá: botão flutuante, CTA no rodapé e o formulário de agendamento que grava o
-- lead e continua a conversa no WhatsApp.
--
-- O número fica no CMS (editável em /admin/site → Configurações), não no
-- código, para trocar sem deploy. Guardado só com dígitos (DDI + DDD + número).
-- ==========================================================================

alter table public.site_config
  add column if not exists whatsapp_number text;

-- A praça também sai do código: a Reiners é de Cuiabá/MT (ver
-- docs/reiners-media-seed.md), e a landing tinha "São Paulo" chumbado.
alter table public.site_config
  add column if not exists location text;

-- Redes sociais: eram links genéricos chumbados no rodapé (instagram.com,
-- youtube.com...). Agora vêm do CMS e o ícone SOME quando não configurado —
-- melhor ausente do que levando o visitante para lugar nenhum.
alter table public.site_config add column if not exists instagram_url text;
alter table public.site_config add column if not exists linkedin_url text;
alter table public.site_config add column if not exists youtube_url text;
alter table public.site_config add column if not exists spotify_url text;

-- Número atual da Reiners Media. Só preenche se estiver vazio — nunca
-- sobrescreve o que já foi editado no CMS.
update public.site_config
set whatsapp_number = '5565999207108',
    updated_at = now()
where whatsapp_number is null or btrim(whatsapp_number) = '';

update public.site_config
set location = 'Cuiabá/MT',
    updated_at = now()
where location is null or btrim(location) = '';

-- Corrige o SEO semeado em 0016, que não citava a praça.
update public.site_config
set seo_description = 'Estúdio de podcast em Cuiabá/MT: gravação, edição, mixagem, identidade visual e distribuição. Também gravamos na sua sede.',
    updated_at = now()
where seo_description is null
   or seo_description = 'Gravação, edição, mixagem, identidade visual e distribuição. Tudo em um só lugar.';

-- ==========================================================================
-- Migration 0018 — imagem da seção "Sobre" e imagem de compartilhamento
-- ==========================================================================
-- Duas mídias que existiam no design mas não tinham onde ser configuradas:
--   - a seção "Sobre" renderizava um gradiente chumbado, sem campo no CMS;
--   - o link do site compartilhado no WhatsApp/LinkedIn saía sem card, porque
--     nenhuma tag og:image era emitida.
--
-- Como o hero (0017), ambas caem em arquivo versionado em /public quando a
-- coluna está vazia — o site nunca fica sem imagem por causa do banco.
-- ==========================================================================

alter table public.site_config add column if not exists about_image_url text;
alter table public.site_config add column if not exists og_image_url text;

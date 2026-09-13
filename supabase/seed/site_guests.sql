-- ==========================================================================
-- Seed — convidadas que gravaram no estúdio
-- ==========================================================================
-- Rode DEPOIS da migration 0019 (que cria site_guests).
--
-- Entra com `published = false` de propósito: a seção continua oculta no site
-- até você revisar. Para publicar, troque para true nas linhas que quiser e
-- rode de novo, ou marque a caixa "Publicado" em /admin/site/convidados.
--
-- ANTES DE RODAR, preencha os dois campos abaixo em cada linha:
--   photo_url → URL pública da foto (quadrada, 800x800 de preferência).
--               Suba em Storage → bucket `site` → Copy URL.
--   role      → como a pessoa deve ser identificada no site. Deixe NULL se
--               preferir só o nome. NÃO inventei nada aqui.
--
-- Sem photo_url o site mostra as iniciais no lugar da foto — funciona, mas
-- prova social sem rosto perde a razão de existir.
-- ==========================================================================

insert into public.site_guests (name, role, photo_url, display_order, published)
values
  ('Catria Damasceno', null, null, 1, false),
  ('Bruna Ghetti',     null, null, 2, false),
  ('Flávia Alessandra', null, null, 3, false)
on conflict do nothing;

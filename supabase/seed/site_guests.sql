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
--   role → como a pessoa deve ser identificada no site. Deixe NULL se
--          preferir só o nome. NÃO inventei nada aqui.
--
-- As fotos já estão apontadas para `public/convidados/` — arquivos servidos
-- pelo próprio site, sem Storage e sem copiar URL. Suba os três arquivos com
-- os nomes exatos listados em public/convidados/README.md ANTES de publicar,
-- senão a seção vai ao ar com imagem quebrada. (Se preferir hospedar fora,
-- troque o caminho por uma URL completa — o campo aceita as duas formas.)
--
-- Sem photo_url o site mostra as iniciais no lugar da foto — funciona, mas
-- prova social sem rosto perde a razão de existir.
-- ==========================================================================

insert into public.site_guests (name, role, photo_url, display_order, published)
values
  ('Cátia Damasceno',   null, '/convidados/catia-damasceno.jpg',  1, false),
  ('Bruna Ghetti',      null, '/convidados/bruna-ghetti.jpg',     2, false),
  ('Flávia Alessandra', null, '/convidados/flavia-alessandra.jpg', 3, false)
on conflict do nothing;

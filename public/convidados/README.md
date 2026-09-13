# Fotos das convidadas

Coloque aqui os retratos com **exatamente** estes nomes — o seed em
`supabase/seed/site_guests.sql` já aponta para eles:

| Arquivo | Pessoa |
| --- | --- |
| `catia-damasceno.jpg` | Cátia Damasceno |
| `bruna-ghetti.jpg` | Bruna Ghetti |
| `flavia-alessandra.jpg` | Flávia Alessandra |

**Formato:** quadrado (1:1), 800×800 é o suficiente. `.jpg` ou `.webp` — se usar
`.webp`, ajuste a extensão no seed também.

**Como subir sem mexer em código:** no GitHub, abra esta pasta → *Add file* →
*Upload files* → arraste os três → *Commit changes*. O Vercel publica no deploy
seguinte, e a URL vira `/convidados/<arquivo>`.

**Ordem importa:** suba os arquivos ANTES de publicar as convidadas no CMS.
Publicar primeiro deixa a seção no ar com imagem quebrada.

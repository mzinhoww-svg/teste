# Fotos das convidadas

| Arquivo | Pessoa |
| --- | --- |
| `catia-damasceno.webp` | Cátia Damasceno |
| `bruna-ghetti.webp` | Bruna Ghetti |
| `flavia-alessandra.webp` | Flávia Alessandra |

800x800, WebP q82 — entre 29 e 43 KB cada. Os originais vieram em 1254x1254.

O seed em `supabase/seed/site_guests.sql` já aponta para estes caminhos.

## Para adicionar mais alguém

Retrato **quadrado**, 800x800, fundo escuro (a paleta do site e estes três
retratos usam fundo quase preto — um fundo claro destoa no carrossel).
Nomeie em minúsculas com hifens e cadastre em `/admin/site/convidados`
apontando `photo_url` para `/convidados/<arquivo>.webp`.

Redimensionar sem ImageMagick:

```sh
ffmpeg -i original.png -vf "scale=800:800:flags=lanczos" \
  -c:v libwebp -quality 82 public/convidados/nome-sobrenome.webp
```

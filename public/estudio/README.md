# Fotos do estúdio (cenários e Zura)

| Arquivo | Onde aparece | Origem (Drive › Fotos Cenários) |
| --- | --- | --- |
| `cenario-puff.webp` | Cenários › 01 Puff | `190A7129.jpg` |
| `cenario-escritorio.webp` | Cenários › 02 Escritório | `190A7157.jpg` |
| `cenario-mesa-reuniao.webp` | Cenários › 03 Mesa de reunião | `190A7183.jpg` |
| `cenario-sofa.webp` | Cenários › 04 Sofá | `190A7205.jpg` |
| `cenario-estante.webp` | Cenários › 05 Estante | `190A7221.jpg` |
| `zura-claquete.webp` | Seção Sobre (foto padrão) | `190A7177.jpg` — claquete do Estúdio Zura |

Cenários: 800×1200 (o sofá, 1019×1200), WebP q78, entre 35 e 75 KB cada.
`zura-claquete.webp`: 1200×1800, WebP q80, 67 KB — é a única que ocupa um
quadro grande (Sobre, 4:3 recortado), por isso tem o dobro de resolução.
Os originais (Canon EOS R, 4480×6720) não estão no repositório; o
re-encode apaga o EXIF.

Os nomes, as descrições e o texto alternativo de cada foto vivem em
`lib/site/gallery.ts` (`SCENARIOS`, `ZURA_PHOTO`) — é lá que se troca uma foto
ou uma legenda. `tests/unit/site-gallery.test.ts` falha se um arquivo
referenciado sumir daqui ou passar de 200 KB.

## Para trocar ou adicionar

Retrato 2:3, lado maior de 1200 px, WebP entre q75 e q80. Sem ImageMagick:

```sh
ffmpeg -i original.jpg -vf "scale=800:1200:flags=lanczos" \
  -c:v libwebp -quality 78 public/estudio/cenario-nome.webp
```

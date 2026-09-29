# Site público — Reiners Media (landing; portfólio oculto)

O apex `reiners.agency` serve o **site do estúdio de podcast**. As ferramentas
comerciais internas vivem em subdomínio próprio, sem página pública
(ver `docs/vercel-domain.md`).

| Rota | O que é | Renderização |
| --- | --- | --- |
| `/` | Landing da Reiners Media | estática, `revalidate = 300` |
| `/portfolio` | Grade de programas, âncora por `#slug` — **oculta**: responde 404 (ver "Portfólio oculto") | estática, `revalidate = 300` |
| `/media` | Mesma landing de `/`, endereço alternativo (canônica: `/`) | estática, `revalidate = 300` |
| `/manual-marca` | Manual de identidade visual da marca (Navy/Ouro/Creme, tipografia própria) | estática |
| `/admin/site` | CMS da landing (dashboard, planos, depoimentos, programas, config) | dinâmica |
| `/api/site/leads` | Aviso por e-mail (Brevo) do formulário "Agendar sessão" — não grava em banco | POST anônimo, só da própria origem |
| `/api/site/events` | Coleta de `page_view`, `cta_click`, `form_submit` | POST anônimo |

## Design system (PodFactory)

Tokens **semânticos** — componentes do site nunca escrevem hex. Valores crus
vivem em dois lugares: `app/globals.css` (variáveis CSS) e `tailwind.config.ts`
(mapeamento para classes).

| Token | Classe Tailwind | Valor |
| --- | --- | --- |
| surface.base | `bg-site-surface-base` | `#FAF7F2` (Creme) |
| surface.raised | `bg-site-surface-raised` | `#FFFFFF` |
| surface.strong | `bg-site-surface-strong` | `#F0EBE1` |
| text.primary | `text-site-text-primary` | `#14243E` (Navy) |
| text.inverse | `text-site-text-inverse` | `#6E5726` (ouro escuro — AA sobre o creme) |
| text.tertiary | `text-site-text-tertiary` | `#2C4A72` |
| border.muted | `border-site-border-muted/10` | `#14243E` a 10% |
| shadow.1–4 | `shadow-site-1` … `shadow-site-4` | ver `--site-shadow-*` |
| radius xs…2xl, step7, step8 | `rounded-site-xs` … `rounded-site-step8` | 5/8/10/12/14/18/70/100px |
| motion instant/fast/normal/slow | `duration-instant` … `duration-slow` | 100/180/200/300ms |
| space.1–8 | `p-s1` … `p-s8` | 1 → 6.56px |
| tipografia xs…4xl + base | `text-site-xs` … `text-site-4xl`, `text-site-base` | 8.75 → 17.5px |
| display / h2 | `text-site-display`, `text-site-h2`, `text-site-h2-lg` | `clamp()` do 4xl |

O escopo é a classe `.site-root` na raiz de cada página do site: ela pinta o
documento de creme, aplica a família do corpo e troca o anel de foco do CRM
pelo `outline: 2px text.inverse; outline-offset: 2px`.

As bandas escuras (hero, cenários, CTA final e rodapé) não usam estes tokens:
usam os primitivos `manual-*` (`bg-manual-navy`, `text-manual-creme`,
`text-manual-ouro-claro`…), porque `site-*` é a versão **clara** do site.

### Fontes

Cormorant Garamond (títulos e assinatura da marca), DM Sans (corpo) e DM Mono
(etiquetas), carregadas por `next/font/google` em `app/layout.tsx`. A classe
`font-borna` (nome herdado do design original) aponta para a DM Sans; `font-serif`,
para a Cormorant. O `font-mono` do Tailwind **não** foi alterado — o CRM usa
para código e dados; as etiquetas do site usam `font-manual-mono`.

### Componentes

`components/site/`: `button`, `card`, `input` (+ textarea), `link`, `badge`,
`poster`, `navbar` (com drawer), `modal`, `booking-modal`, `booking-trigger`,
`hero-media`, `social-icons`, `brand` (símbolo, assinatura, capa de marca).
Seções em `components/site/sections/`.

Todos os interativos cobrem default, hover, focus-visible, active, disabled e
(onde faz sentido) loading e error; alvo de toque mínimo 44×44px.

## Manual de marca (`/manual-marca`)

Página única e autocontida com o manual de identidade visual da Reiners Media
— essência, logo, paleta, tipografia, ícones, padrões gráficos, aplicações,
especificações técnicas e manifesto. Migrado de um protótipo de design
(`design_handoff_reiners_brand_manual/`) para componentes de produção.

**De propósito, tem sistema de tokens próprio, isolado do PodFactory acima**:
é um documento de marca (Navy `#14243E` / Ouro `#9A7B35` / Creme `#FAF7F2`),
não uma página do site. Tokens crus em `app/globals.css` (bloco
`.manual-marca`) e mapeados em `tailwind.config.ts` (`colors.manual`,
`fontFamily["manual-serif|sans|mono"]`) — mesmo padrão de token semântico do
`site-*`, namespace `manual-*`. Tipografia (Cormorant Garamond, DM Sans, DM
Mono) carregada via `next/font/google` só nessa rota
(`components/brand-manual/fonts.ts`), sem custo para o resto do site.

Componentes em `components/brand-manual/`: uma seção por arquivo em
`sections/` (mesmo padrão de `components/site/sections/`), grade "efeito
tabela" em `table-grid.tsx`, cabeçalho de seção (kicker + fio + H2) em
`section-heading.tsx`. O símbolo é o **mesmo arquivo oficial do site**
(`/public/brand`): `mark.tsx` só traduz `dark`/`light`/`mono` para a versão
creme/navy/mono. Os cards de "Usos incorretos" distorcem o símbolo de
propósito, para mostrar o que não fazer.

A capa usa uma textura de pontos em CSS (`radial-gradient`), não vídeo — o
próprio handoff de design confirma que o protótipo nunca teve vídeo de fundo
ali.

Como `/media`, é pública mas fica **fora do sitemap** (`lib/site/seo.ts`,
`app/sitemap.ts`) — decisão reversível, não editorial; some para não indexar
antes que o time decida se o manual deve aparecer em busca. Está no allowlist
de `isPublic` em `lib/supabase/middleware.ts`, senão o guard de sessão manda
o visitante anônimo para `/login`.

## Mídia do site

Estes arquivos vivem em `/public` e são servidos pelo próprio Vercel, sem
depender do Supabase Storage. Os quatro primeiros têm campo no CMS que os
substitui:

| Arquivo | Onde aparece | Campo no CMS | Sem valor no CMS |
| --- | --- | --- | --- |
| `hero.mp4` | Fundo do hero | Vídeo do hero | usa o arquivo |
| `hero-poster.jpg` | Pôster do vídeo e `prefers-reduced-motion` | Imagem do hero | usa o arquivo |
| `og.jpg` | Card no WhatsApp, LinkedIn, X | Imagem de compartilhamento | usa o arquivo |
| `estudio/sobre-retrato.webp` | Seção "Sobre" | Imagem da seção "Sobre" | usa o arquivo |
| `estudio/*.webp` | Cenários do estúdio | — (código: `lib/site/gallery.ts`) | — |
| `bastidores/*.webp` | Bastidores com clientes | — (código: `lib/site/gallery.ts`) | — |

Hero sem vídeo, link sem card e "Sobre" sem foto são piores que o padrão, por
isso os quatro sempre têm arquivo e uma coluna vazia no CMS **não** apaga a foto
(mesma regra do hero, ver `toConfig`).

## Marca: símbolo, favicon e card de compartilhamento

O símbolo oficial (o "R" geométrico com microfone recortado e ponto dourado)
existe **só como arquivo**, em `/public/brand`, em três versões:

| Arquivo | Usar sobre |
| --- | --- |
| `reinersmedia_symbol_creme.svg` | fundo escuro (navy, tinta, hero) |
| `reinersmedia_symbol_navy.svg` | fundo claro (header, cards) |
| `reinersmedia_symbol_mono.svg` | uso em uma cor só (reserva) |

Regras de marca (não negociáveis, ver `components/site/brand.tsx`): nunca
redesenhar, distorcer, girar ou recolorir; sem sombra, brilho, contorno nem
opacidade; sem zoom/rotação/bounce (entrada, no máximo, um fade de 300 ms);
altura fixa e largura automática; mínimo de 24 px (favicon: 16 px);
assinatura "REINERS MEDIA" em Cormorant 700, caixa alta, tracking 0,2em, com
"MEDIA" em Ouro (fundo claro) ou Ouro Claro (fundo escuro).
`tests/unit/brand-assets.test.ts` trava o peso (< 5 KB), o viewBox, a paleta e a
relação entre as três versões.

| Onde | Versão | Tamanho |
| --- | --- | --- |
| Header (claro) | navy | 28 px no mobile (só o símbolo), 32 px + assinatura a partir de 768 px |
| Drawer mobile | navy | 28 px + assinatura |
| Hero | creme | 40 px, acima do kicker, fade de 300 ms |
| Rodapé (escuro) | creme | 48 px + assinatura, acima de "Estúdio de podcast premium…" |
| Capa do programa autoral | creme sobre navy | ~36% da altura do poster / 40% da capa do `/portfolio` (dormente enquanto o portfólio está oculto) |

Os links inline do header só aparecem a partir de 1024 px (`lg`): com o lockup
completo eles não cabem em 768–1023 px, faixa em que o header mostra lockup +
"Agendar sessão" + botão de menu (os links ficam no drawer).

**Ícones** (todos gerados do símbolo creme sobre um quadrado navy `#14243E`,
símbolo com 64% da largura): `favicon.svg` (principal, cantos levemente
arredondados), `favicon.ico` (16 e 32 px), `apple-touch-icon.png` (180),
`icon-192.png` e `icon-512.png` (quadrados sem transparência — iOS e Android
aplicam a própria máscara) e `manifest.webmanifest` (`theme_color` e
`background_color` `#14243E`). As tags saem de `metadata.icons` e
`metadata.manifest` em `app/layout.tsx`.

**`og.jpg`** (1200×630): navy com textura de pontos (1 px, `#C4A15A` a 13%, grade
de 32 px), símbolo creme de 220 px à esquerda e, à direita, "REINERS MEDIA"
(Cormorant 700, tracking 0,2em) e "ESTÚDIO DE PODCAST PREMIUM · CUIABÁ/MT" em
DM Mono `#E8D9B5`. Foi renderizado em Chromium a partir do SVG oficial — para
refazer, repita a composição com o símbolo de `/public/brand`.

## Fotos do estúdio

Três blocos, todos com arquivo versionado em `/public` (origem e tamanhos em
`public/estudio/README.md` e `public/bastidores/README.md`):

- **Cenários** (`#cenarios`, banda navy): cinco fotos 2:3 — Puff, Escritório,
  Mesa de reunião, Sofá e Estante — com nome e uma linha sobre o formato de
  podcast de cada um. Carrossel nativo; no `md` os cinco cabem lado a lado.
- **Sobre**: o retrato de quem comanda o estúdio, gravando no cenário Puff
  (`ABOUT_PHOTO`), é a imagem padrão do quadro 4:3. A foto é em pé, então o
  recorte (`position`) sobe a moldura até o rosto.
- **Bastidores** (`#bastidores`): nove fotos — a claquete "ESTÚDIO ZURA" abre o
  carrossel (`ZURA_PHOTO`) e oito fotos de gravações com clientes, sem legenda e
  sem nome, seguem. Confirme a autorização de imagem de quem aparece.

O CMS continua soberano para o Sobre (campo "Imagem da seção Sobre"; a foto
trocada usa o texto alternativo genérico e o recorte central); cenários e
bastidores são editoriais e mudam por código (`lib/site/gallery.ts`).

### Por que `/public` e não o Storage

O hero deixa de depender de serviço externo e é versionado junto do código, o
que também torna o preview de cada PR fiel ao que vai para produção. O CMS
continua soberano para trocar sem deploy.

**Atenção ao middleware:** `middleware.ts` exclui do guard de sessão as
extensões estáticas. Um formato fora dessa lista vira `307 /login` para o
visitante anônimo — foi o que aconteceu com `.mp4` antes da correção e seria o
`.webmanifest` (o navegador busca o manifest sem cookie de sessão), que por
isso está na lista. `tests/unit/brand-assets.test.ts` cobre o matcher.

## Formulário de agendamento (WhatsApp direto + aviso por e-mail)

O formulário "Agendar sessão" **não usa banco**. Ao enviar:

1. **O navegador abre o WhatsApp na hora**, com a mensagem pronta
   (`wa.me/<número>?text=…`, montada por `bookingWhatsappMessage`). A abertura é
   *síncrona dentro do clique* — antes de qualquer espera de rede —, então
   bloqueador de pop-up não engole. Se o navegador não deixa abrir nova aba
   (navegador embutido do Instagram, por exemplo), segue na mesma aba. O painel
   "Abrimos o WhatsApp" traz um botão de reserva com o mesmo link.
2. **Em segundo plano, a equipe é avisada por e-mail** (`POST /api/site/leads` →
   Brevo, o mesmo provider do CRM: `lib/email/provider.ts`). Quem recebe:
   `LEADS_NOTIFY_EMAIL` (vários, separados por vírgula) → `BREVO_REPLY_TO` →
   `BREVO_SENDER_EMAIL`. O Reply-To é o e-mail da pessoa, então responder o aviso
   já fala com ela; se ela deixou WhatsApp, o botão do e-mail abre a conversa.
   O aviso é a **rede de segurança de quem fechar o WhatsApp sem enviar**: a
   mensagem no WhatsApp é só um rascunho até a pessoa apertar enviar.

Só o **nome** é obrigatório; e-mail e WhatsApp são opcionais (o e-mail só é
conferido se preenchido) e o texto do projeto vai até 600 caracteres (o limite do
link do wa.me). Regras compartilhadas em `lib/site/lead-form.ts`; o servidor
limpa e revalida tudo em `lib/site/lead-notify.ts`.

**Proteção da rota pública** (cada chamada vira um e-mail; a cota gratuita da
Brevo é de 300/dia, dividida com o CRM): só aceita chamada da própria origem
(`Origin` = `Host`), campo-isca `website` (invisível, fora da leitura de tela;
preenchido ⇒ finge sucesso e não envia), limite por IP (6 a cada 10 min) e geral
(60 por hora), descarte do mesmo envio repetido em 10 min e corpo de até 8 KB. Os
limites ficam na memória de cada instância (freio, não garantia). Falha da Brevo
vira `502` e um log só com o motivo — nunca com nome, e-mail ou telefone.

**Sem banco, mas com dado pessoal por e-mail:** o texto do modal avisa que os
dados vão por e-mail à equipe. O site não guarda nada; o que chega à caixa de
entrada é responsabilidade de quem a administra. A tabela `site_leads` (0016) e
as linhas antigas continuam no banco, sem uso.

**Mesmo com o Supabase pausado o formulário funciona**: WhatsApp e e-mail não
dependem dele. O número vem do CMS quando o banco responde e do código
(`DEFAULT_WHATSAPP`) quando não.

## Contato: WhatsApp e Instagram

O WhatsApp é o canal principal (botão flutuante, número no rodapé, continuação
do formulário de agendamento). O **Instagram [@reinersmedia](https://instagram.com/reinersmedia)**
é o segundo canal, e aparece em três lugares:

| Onde | Como |
| --- | --- |
| Rodapé, coluna 1 | `@reinersmedia` como texto, logo abaixo do número do WhatsApp (nome acessível: "Instagram: @reinersmedia") |
| Rodapé, coluna "Social" | Ícone do Instagram ao lado do WhatsApp |
| Seção de contato (CTA final) | "Prefere o Instagram? @reinersmedia" sob o botão de agendamento |

O perfil é o **padrão do código** (`DEFAULT_INSTAGRAM_URL` em
`lib/site/social.ts`). O CMS (`site_config.instagram_url`) só o sobrescreve
quando houver outra URL lá: coluna vazia **não** tira o Instagram do ar — a
mesma regra do hero e da foto do "Sobre". O texto `@…` é extraído da URL
(`instagramHandle`), então trocar o perfil no CMS troca também o texto. As
outras redes (LinkedIn, YouTube, Spotify) continuam sem padrão: só entram no
rodapé quando o CMS tem a URL.

Os ícones sociais do rodapé usam o tom cheio de `manual-claro` (≈ 6:1 sobre a
Tinta) — a versão a 60% de opacidade dava ≈ 2,9:1, abaixo dos 3:1 exigidos de
componente gráfico (WCAG 1.4.11).

## Portfólio oculto

O portfólio de programas **ainda não existe**, e os programas de exemplo em
`DEFAULT_PROGRAMS` são só placeholders (com nomes de clientes). Por isso a seção
inteira está fora do ar — mas **oculta, não apagada**: uma única chave,
`PORTFOLIO_ENABLED` em `lib/site/features.ts` (hoje `false`), governa tudo.

| Com a chave desligada | Onde |
| --- | --- |
| Seção "Portfólio" (teaser de posters) some da landing e a landing nem busca os programas | `components/site/landing.tsx` |
| Item "Programas" sai do menu (header e drawer) | `components/site/navbar.tsx` |
| Link "Portfólio" e coluna "Programas" saem do rodapé (3 colunas em vez de 4) | `components/site/sections/footer.tsx` |
| CTA secundário do hero ("Ouvir programas") some **enquanto o destino for `/portfolio`** — vindo do código ou do CMS; qualquer outro destino configurado continua aparecendo | `components/site/sections/hero.tsx` (`isPortfolioHref`) |
| `/portfolio` responde 404 (página de 404 da marca, em `app/not-found.tsx`) | `app/portfolio/page.tsx` |
| `/portfolio` sai do sitemap | `lib/site/seo.ts` (`publicPaths`) |
| Aviso no admin de Programas e no CTA secundário das Configurações | `app/admin/site/*` |

**Para trazer o portfólio de volta:** cadastre os programas reais em
`/admin/site/programas`, troque `PORTFOLIO_ENABLED` para `true` e ajuste os
testes marcados com "Portfólio oculto" (`tests/e2e/site.spec.ts`,
`tests/e2e/seo.spec.ts`, `tests/unit/seo.test.ts`, `tests/unit/site-features.test.ts`).
O CMS de programas continua funcionando enquanto a seção está oculta.

## Planos: o banco manda, o código é o plano B

Os valores de `DEFAULT_PLANS` (`lib/site/content.ts`) só aparecem quando o banco
não responde. Em produção, **o que está em `site_plans` prevalece** — e as
migrations do repositório **não são aplicadas sozinhas**. Mudou preço ou texto
de plano? Além do código, aplique a migration no Supabase.

Vigente: Hora de Estúdio **R$ 1.350** (`/2h`, com "2 horas de gravação" em
negrito) e BTS Recorrente com a sigla explicada (**Build to Suit**, o produto
sob medida da Reiners). A migration `0022_update_hora_de_estudio_price_and_bts.sql`
faz as duas atualizações por nome de plano.

## "O que fazemos" — as frentes do estúdio

`site_services` responde **o que dá para contratar**; `site_plans` responde
**quanto custa**. São perguntas diferentes, e por isso tabelas diferentes: o
plano é o desdobramento comercial da frente, não o mesmo dado com outro nome.

A seção é o padrão **tabs** da APG, não uma lista de links:

- um único painel no DOM por vez;
- **tabindex rotativo** — a lista inteira ocupa uma parada de `Tab`, não seis;
- setas trocam a aba, com ativação automática (o painel é barato de montar);
- aceita os dois eixos (`←→` e `↑↓`) porque a lista é horizontal no mobile e
  vertical a partir de `lg`. Mesmo DOM nos dois casos — nada é duplicado.

### Mídia: vídeo **ou** até três imagens

| `video_url` | `images` | Resultado |
| --- | --- | --- |
| preenchido | qualquer | `<video controls>` com `poster_url` |
| vazio | 1–3 URLs | grade de imagens |
| vazio | vazio | **nenhuma moldura** — só título, descrição e fecho |

O terceiro caso é o estado inicial e é deliberado: reservar uma caixa preta
esperando arquivo deixa a seção parecendo quebrada. `toService` corta em 3 e
descarta o que não for string, porque `images` é `jsonb` e pode ser editada na
mão.

O campo `footnote` aceita **só** `**negrito**`. O parser é intencionalmente
burro (`components/site/sections/services.tsx`): quem escreve ali não edita
código, e um campo que aceitasse HTML seria injeção.

> As descrições em `DEFAULT_SERVICES` são um rascunho escrito a partir do que o
> resto do site já afirma (Cuiabá, in loco, domo geodésico, 48h). Confira contra
> o que o estúdio de fato vende antes de considerar como texto final.

## Prova social: duas seções, dois níveis de afirmação

| Seção | O que afirma | Exige |
| --- | --- | --- |
| **Convidados** (`site_guests`) | que a pessoa gravou no estúdio | foto e autorização de imagem |
| **Depoimentos** (`site_testimonials`) | que a pessoa **recomenda** | a frase real que ela disse |

A separação é deliberada. Colar um rosto real numa frase que a pessoa não disse
fabrica um endosso — por isso "Convidados" não tem aspas, e por isso é a única
seção do site **sem placeholder**: `DEFAULT_GUESTS` é vazio e a seção não
renderiza enquanto ninguém estiver publicado. Inventar quem gravou no estúdio
seria fabricar credencial.

As duas usam o mesmo carrossel (`components/site/carousel.tsx`): rolagem nativa
com scroll-snap, que funciona sem JS e com swipe; os botões são reforço e somem
quando tudo cabe na tela. `scrollBy` respeita `prefers-reduced-motion`.

### Como subir as fotos

Os campos de foto (`site_guests.photo_url`, `site_testimonials.avatar_url`,
`site_config.about_image_url`) guardam **URL**, não arquivo — o host é livre.
O caminho curto é Storage → bucket `site` → upload → *Copy URL* → colar no CMS.

`supabase/seed/site_guests.sql` já tem as convidadas cadastradas com
`published = false` e os campos de foto vazios, para preencher e rodar. A
seção só aparece quando a primeira linha virar `published = true`.

## Indexação — só o estúdio aparece em buscador

A vitrine é indexável — hoje só `/` (`/portfolio` volta junto com o portfólio). Todo o resto — CRM, portal do
cliente, admin, login e as páginas por token — fica fora de buscador, em três
camadas, porque nenhuma sozinha basta:

| Camada | Arquivo | O que faz |
| --- | --- | --- |
| `robots.txt` | `app/robots.ts` | Por host: no apex bloqueia as áreas privadas; em subdomínio, `Disallow: /` |
| `meta robots` | `lib/site/seo.ts` (`NOINDEX`) | `noindex, nofollow, nocache` em cada área privada |
| Remoção | — | A landing do CRM foi **apagada**: `/crm` não existe em host nenhum |

**Por que as três:** `robots.txt` sozinho não desindexa. Uma URL bloqueada mas
linkada de fora ainda aparece no índice como resultado "sem descrição" — é o
`noindex` que efetivamente remove. E o `noindex` só é lido se o crawler puder
buscar a página, então as áreas que exigem login (`/app`, `/admin`, `/portal`)
se defendem pelo redirect do middleware, não pela meta tag.

`/robots.txt` e `/sitemap.xml` são lidos por crawler **anônimo** — por isso
entram na lista de assets do middleware (`lib/supabase/middleware.ts`). Sem
isso o guard de sessão os mandava para `/login` e o buscador nunca via as
regras.

O sitemap lista apenas `/` (e `/portfolio` quando o portfólio estiver no ar — `publicPaths()` em `lib/site/seo.ts`). Cobertura em `tests/e2e/seo.spec.ts`
(robots servido, sitemap sem rota privada, páginas públicas sem menção ao CRM,
áreas privadas com `noindex`) e `tests/unit/seo.test.ts`.

### Se alguma URL do CRM já foi indexada

O `noindex` faz a remoção acontecer na próxima visita do crawler, o que pode
levar dias. Para acelerar, use a **Remoção de URLs** no Google Search Console
apontando para o prefixo (`reiners.agency/crm`, `/app`, `/admin`, `/portal`).

### Ferramentas que ignoram robots.txt

`robots.txt` e `noindex` são pedidos, honrados por buscador. Rastreadores de
GTM e de LLM os ignoram. Foi por isso que a landing do CRM não foi apenas
escondida: ela foi **removida**. Enquanto uma página é servida, ela é lida.

## Acessibilidade — o que é garantido

- Skip link (`Pular para conteúdo principal`) como primeiro focável.
- Hierarquia de headings sem salto — verificado em `tests/e2e/site.spec.ts`.
- Drawer e modal: `role="dialog"`, `aria-modal`, trap de Tab, Escape fecha, foco
  devolvido ao gatilho (`components/site/use-dismissable.ts`).
- Vídeo do hero: `aria-hidden`, `muted`, `playsInline`, pausa fora da viewport
  via `IntersectionObserver` e nem chega a tocar com `prefers-reduced-motion`.
- Todas as animações caem no bloco global de `prefers-reduced-motion`.

### Desvios conscientes do briefing

Três pontos do briefing colidiam com os próprios critérios de contraste
(WCAG 2.2 AA, mínimo 4.5:1 para texto). Escolhemos o critério testável:

1. **Link inline** — `text.tertiary` (`#0000ee`) sobre `#000000` dá ~2.4:1 e
   fica ilegível. O `variant="inline"` usa `text.inverse` com sublinhado; o
   token `text.tertiary` continua definido para superfícies claras/badges.
2. **Copyright do rodapé a 30%** — subimos para 55% (o próprio briefing proíbe
   `text.primary` abaixo de 40% sobre `surface.base`).
3. **Placeholder a 25% e helper a 40%** — subimos para 45% e 55%.

Além disso, `custom_css` existe na tabela mas **não** é editável pelo CMS: CSS
arbitrário injetado em todas as páginas é vetor de exfiltração.

## Dados

`supabase/migrations/0016_site_cms.sql` cria `site_config`, `site_plans`,
`site_testimonials`, `site_programs`, `site_admins`, `site_events` e
`site_leads`. Mapeamento com os modelos do briefing:

| Briefing (Prisma) | Tabela |
| --- | --- |
| `SiteConfig` | `site_config` (singleton garantido por índice único) |
| `Plan` | `site_plans` |
| `Testimonial` | `site_testimonials` |
| `AdminUser` | `site_admins` (`ADMIN` \| `EDITOR`) |
| — (novo) | `site_programs`, `site_events`, `site_leads`, `site_services`, `site_guests` |

**Por que não Prisma:** o repositório já tem uma camada Supabase completa
(migrations SQL versionadas, RLS por policy, `@supabase/ssr` no server e no
middleware). Introduzir um segundo ORM significaria uma segunda conexão, um
segundo modelo de autorização e RLS contornada pelo `DATABASE_URL`. As tabelas
acima são as mesmas do briefing, em snake_case — se o Prisma for adotado depois,
`prisma db pull` gera o schema a partir delas.

### RLS

- Leitura pública (anônima) do que está `published` — a landing é pública.
- Escrita só para quem está em `site_admins` (`is_site_editor()`); a lista de
  editores só o `ADMIN` mexe (`is_site_admin()`).
- `site_events` aceita INSERT anônimo (é o visitante que grava); `site_leads` também tem a policy,
  mas o site **parou de gravar** ali (o formulário agora é WhatsApp + e-mail) — a tabela e o histórico ficam
  mas a **leitura** é restrita a editores.

### A landing nunca cai por causa do banco

`lib/site/data.ts` lê com um cliente anônimo **sem cookies** (mantém a página
cacheável) e cai nos defaults de `lib/site/content.ts` quando não há env, não há
migration aplicada ou a rede falha. É por isso que o E2E roda sem segredos.

## CMS (`/admin/site`)

Sidebar fixa de 240px, mesmos tokens do site. Seções: Dashboard (KPIs de 14 dias
+ gráfico Recharts), O que fazemos (CRUD das frentes e da mídia de cada aba),
Planos (CRUD + reordenar + destaque), Depoimentos (CRUD), Programas (CRUD,
controla o teaser e o `/portfolio` — com o portfólio oculto, só cadastra), Convidados (CRUD) e Configurações
(identidade, hero, CTAs, SEO).

Acesso: linha em `site_admins` casada por `user_id` **ou** e-mail (permite
convidar antes do primeiro login). Autorização validada no servidor
(`lib/site/admin.ts`) — a RLS é a segunda barreira, não a primeira.

### Primeiro acesso

```sql
insert into public.site_admins (email, name, role)
values ('voce@reiners.agency', 'Seu Nome', 'ADMIN')
on conflict (email) do nothing;
```

## Analytics

Coleta própria, sem cookie e sem terceiros: `trackSiteEvent()` manda
`page_view` (ao montar a página), `cta_click` (botões de agendamento) e
`form_submit` para `/api/site/events`, que grava em `site_events`. O dashboard
agrega os últimos 14 dias em memória. O campo `analytics_id` fica disponível
para plugar um provedor externo depois.

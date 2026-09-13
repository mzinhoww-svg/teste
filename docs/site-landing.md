# Site público — Reiners Media (landing + portfólio)

O apex `reiners.agency` serve o **site do estúdio de podcast**. As ferramentas
comerciais internas vivem em subdomínio próprio, sem página pública
(ver `docs/vercel-domain.md`).

| Rota | O que é | Renderização |
| --- | --- | --- |
| `/` | Landing da Reiners Media | estática, `revalidate = 300` |
| `/portfolio` | Grade de programas, âncora por `#slug` | estática, `revalidate = 300` |
| `/media` | Mesma landing de `/`, endereço alternativo (canônica: `/`) | estática, `revalidate = 300` |
| `/admin/site` | CMS da landing (dashboard, planos, depoimentos, programas, config) | dinâmica |
| `/api/site/leads` | Formulário "Agendar sessão" | POST anônimo |
| `/api/site/events` | Coleta de `page_view`, `cta_click`, `form_submit` | POST anônimo |

## Design system (PodFactory)

Tokens **semânticos** — componentes do site nunca escrevem hex. Valores crus
vivem em dois lugares: `app/globals.css` (variáveis CSS) e `tailwind.config.ts`
(mapeamento para classes).

| Token | Classe Tailwind | Valor |
| --- | --- | --- |
| surface.base | `bg-site-surface-base` | `#000000` |
| surface.raised | `bg-site-surface-raised` | `#14101c` |
| surface.strong | `bg-site-surface-strong` | `#222222` |
| text.primary | `text-site-text-primary` | `#fcfcfc` |
| text.inverse | `text-site-text-inverse` | `#d87dff` |
| text.tertiary | `text-site-text-tertiary` | `#0000ee` |
| border.muted | `border-site-border-muted/10` | `#ffffff` a 10% |
| shadow.1–4 | `shadow-site-1` … `shadow-site-4` | ver `--site-shadow-*` |
| radius xs…2xl, step7, step8 | `rounded-site-xs` … `rounded-site-step8` | 5/8/10/12/14/18/70/100px |
| motion instant/fast/normal/slow | `duration-instant` … `duration-slow` | 100/180/200/300ms |
| space.1–8 | `p-s1` … `p-s8` | 1 → 6.56px |
| tipografia xs…4xl + base | `text-site-xs` … `text-site-4xl`, `text-site-base` | 8.75 → 17.5px |
| display / h2 | `text-site-display`, `text-site-h2`, `text-site-h2-lg` | `clamp()` do 4xl |

O escopo é a classe `.site-root` na raiz de cada página do site: ela pinta o
documento de preto (o `body` do CRM é claro), aplica a família Borna e troca o
anel de foco do CRM pelo `outline: 2px text.inverse; outline-offset: 2px`.

### Fonte Borna

Borna é licenciada (Nootype) e **não está no Google Fonts**, então não pode ser
versionada aqui. A pilha é `var(--font-borna) → Geist Sans → system-ui`: hoje
renderiza em Geist Sans. Para ativar a Borna de verdade, coloque os `.woff2` em
`public/fonts/` e declare o `@font-face` (family `Borna`) em `app/globals.css` —
nenhuma outra mudança é necessária.

### Componentes

`components/site/`: `button`, `card`, `input` (+ textarea), `link`, `badge`,
`poster`, `navbar` (com drawer), `modal`, `booking-modal`, `booking-trigger`,
`hero-media`, `social-icons`. Seções em `components/site/sections/`.

Todos os interativos cobrem default, hover, focus-visible, active, disabled e
(onde faz sentido) loading e error; alvo de toque mínimo 44×44px.

## Mídia do site

Três arquivos vivem em `/public` e são servidos pelo próprio Vercel, sem
depender do Supabase Storage. Cada um tem campo no CMS que o substitui:

| Arquivo | Onde aparece | Campo no CMS | Sem valor no CMS |
| --- | --- | --- | --- |
| `hero.mp4` | Fundo do hero | Vídeo do hero | usa o arquivo |
| `hero-poster.jpg` | Pôster do vídeo e `prefers-reduced-motion` | Imagem do hero | usa o arquivo |
| `og.jpg` | Card no WhatsApp, LinkedIn, X | Imagem de compartilhamento | usa o arquivo |
| — | Seção "Sobre" | Imagem da seção "Sobre" | desenha o gradiente |

A seção "Sobre" é a única que aceita ficar sem imagem: o gradiente é um estado
final legítimo, não um buraco. As outras três sempre têm arquivo, porque hero
sem vídeo e link sem card são piores que o padrão.

O favicon (`app/icon.svg`) é a onda de áudio em `text.inverse` sobre
`surface.base` — legível a 16px.

### Por que `/public` e não o Storage

O hero deixa de depender de serviço externo e é versionado junto do código, o
que também torna o preview de cada PR fiel ao que vai para produção. O CMS
continua soberano para trocar sem deploy.

**Atenção ao middleware:** `middleware.ts` exclui do guard de sessão as
extensões estáticas. Um formato fora dessa lista vira `307 /login` para o
visitante anônimo — foi o que aconteceu com `.mp4` antes da correção.

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

A vitrine (`/` e `/portfolio`) é indexável. Todo o resto — CRM, portal do
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

O sitemap lista apenas `/` e `/portfolio`. Cobertura em `tests/e2e/seo.spec.ts`
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
- `site_events` e `site_leads` aceitam INSERT anônimo (é o visitante que grava)
  mas a **leitura** é restrita a editores.

### A landing nunca cai por causa do banco

`lib/site/data.ts` lê com um cliente anônimo **sem cookies** (mantém a página
cacheável) e cai nos defaults de `lib/site/content.ts` quando não há env, não há
migration aplicada ou a rede falha. É por isso que o E2E roda sem segredos.

## CMS (`/admin/site`)

Sidebar fixa de 240px, mesmos tokens do site. Seções: Dashboard (KPIs de 14 dias
+ gráfico Recharts), O que fazemos (CRUD das frentes e da mídia de cada aba),
Planos (CRUD + reordenar + destaque), Depoimentos (CRUD), Programas (CRUD,
controla o teaser e o `/portfolio`), Convidados (CRUD) e Configurações
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

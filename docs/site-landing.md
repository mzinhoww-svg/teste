# Site público — Reiners Media (landing + portfólio)

O apex `reiners.agency` serve o **site do estúdio de podcast**; o CRM AI Studio
continua no mesmo deploy, agora em `/crm` e em `crm.reiners.agency`
(ver `docs/vercel-domain.md`).

| Rota | O que é | Renderização |
| --- | --- | --- |
| `/` | Landing da Reiners Media | estática, `revalidate = 300` |
| `/portfolio` | Grade de programas, âncora por `#slug` | estática, `revalidate = 300` |
| `/crm` | Landing do CRM AI Studio (o que era o apex) | estática |
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
| — (novo) | `site_programs`, `site_events`, `site_leads` |

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
+ gráfico Recharts), Planos (CRUD + reordenar + destaque), Depoimentos (CRUD),
Programas (CRUD, controla o teaser e o `/portfolio`) e Configurações
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

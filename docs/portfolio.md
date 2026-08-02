# Catálogo de podcasts — `/portfolio`

Catálogo estilo Netflix da Reiners Media, anexado à landing page. Cada programa
é descoberto por um poster visual distinto que expande em um painel rico, sem
sair da página.

---

## 1. Como rodar

```bash
npm install                 # `postinstall` já roda `prisma generate`
npm run dev                 # /portfolio funciona em modo demonstração
```

Com banco:

```bash
# .env
DATABASE_URL="postgresql://…@…pooler.supabase.com:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://…@…supabase.com:5432/postgres"
PORTFOLIO_ADMIN_EMAILS="voce@reiners.agency"
PORTFOLIO_SEED_ADMIN_EMAIL="voce@reiners.agency"

npm run portfolio:migrate   # cria as tabelas portfolio_*
npm run portfolio:seed      # 5 programas × 5 episódios + SiteConfig + admin
```

Depois aplique `supabase/migrations/0005_portfolio_catalog.sql` no Supabase
(SQL Editor ou CLI). Ele **não** cria tabelas — endurece as que o Prisma criou e
provisiona o bucket de Storage. Detalhes em §5.

### Modo demonstração

Sem `DATABASE_URL`, o catálogo cai no dataset de `lib/portfolio/demo-data.ts`
em vez de quebrar. Foi uma decisão deliberada: este repositório também roda o
CRM, cujo deploy atual só define as variáveis do Supabase — instanciar o
`PrismaClient` sem banco lançaria em runtime e derrubaria `/portfolio`, além de
falhar o `next build` (que pré-renderiza a rota).

Nesse modo as **leituras** funcionam e as **escritas** falham com mensagem
explícita — nunca há sucesso silencioso. O dashboard do admin avisa em destaque.

---

## 2. Arquitetura

```
app/portfolio/                    rota pública (layout + grid + [slug])
app/admin/portfolio/              admin (dashboard, CRUD, config, analytics)
app/api/portfolio/events          ingestão de telemetria (público)
app/api/portfolio/analytics/export  export CSV (admin)
components/portfolio/             componentes do catálogo
components/portfolio/admin/       componentes do admin
lib/portfolio/tokens.ts           ← ÚNICO arquivo do módulo com hex literal
lib/portfolio/data.ts             camada de acesso (Prisma + fallback demo)
prisma/schema.prisma              modelo de dados do catálogo
```

### Tokens e o "nenhum hex fora do arquivo de tokens"

`lib/portfolio/tokens.ts` é a única fonte de cor do módulo. Ele emite as CSS
custom properties (`portfolioCssVars()`), injetadas uma vez no layout sob o
escopo `.pf-root`. A partir daí:

- **Componentes** usam as classes `pf-*` do Tailwind (`bg-pf-raised`,
  `text-pf-inverse`, `shadow-pf-3`, `rounded-pf-sm`, `duration-pf-slow`);
- **CSS** (`app/portfolio/portfolio.css`) usa `var(--pf-*)`;
- **Recharts** é a única exceção justificada: a biblioteca exige valores de cor
  concretos em props, então `DashboardChart` importa `palette` do próprio módulo
  de tokens — a fonte continua sendo uma só.

O namespace `pf-` evita qualquer colisão com a paleta `brand-*` do CRM, que
divide o mesmo `tailwind.config.ts` e o mesmo `globals.css`.

### Cor de acento por programa

`accentColor` sobrescreve `--pf-text-inverse` apenas dentro do card daquele
programa, via `accentStyle()`. O valor é validado contra `^#([0-9a-f]{3,6})$` —
um campo do admin não consegue injetar CSS arbitrário por essa via.

---

## 3. Comportamento do card expansível

- Clique em um poster **expande o painel inline**; não navega (anti-pattern §7).
- Duplo clique — ou o botão "Ver página" — vai para `/portfolio/[slug]`.
- Apenas **um** painel aberto por vez; abrir outro fecha o anterior.
- O painel entra ao final da **fileira** do poster clicado. Como o grid é
  5/3/2 colunas, `CatalogGrid` observa os breakpoints via `matchMedia` para
  saber onde inserir.
- `ESC` fecha. Com o modal de player aberto, o `ESC` é consumido pelo modal
  (listener em fase de captura + `stopPropagation`), então não fecha os dois.
- O foco volta ao poster que abriu o painel.
- Conteúdo fechado recebe `inert` — não entra na navegação por Tab.

### Por que o skeleton está em `<Suspense>`, e não em `loading.tsx`

Um `app/portfolio/loading.tsx` cria um boundary de Suspense sobre o **segmento
inteiro**, incluindo `/portfolio/[slug]`. O Next envia o shell do skeleton com
status **200** antes de a página resolver — então `notFound()` em um slug
inexistente respondia 200 com a UI de "não encontrado". O status HTTP mentia
para buscadores e monitoramento.

O skeleton foi movido para um `<Suspense>` dentro de `app/portfolio/page.tsx`,
escopado à página índice. Resultado: o skeleton continua aparecendo e
`/portfolio/slug-inexistente` responde 404 de verdade — coberto por
`tests/e2e/portfolio.spec.ts`.

### Altura do painel

A spec limita o painel a `max-height: 700px`. Cinco episódios já ultrapassariam
isso, então a lista de episódios **sempre rola** dentro do painel
(`max-h-[360px]`). Sem isso, o quinto episódio ficava cortado. Verificado: o
conteúdo fecha em ~629px.

---

## 4. Acessibilidade

Implementado e verificado em navegador:

| Critério | Estado |
|---|---|
| Posters como `button` com `aria-expanded` / `aria-controls` | ✅ |
| `ESC` fecha painel e modal, foco devolvido à origem | ✅ |
| Modal com `role="dialog"`, `aria-modal`, `aria-labelledby`, Tab preso | ✅ |
| Tabs no padrão WAI-ARIA (←/→, Home/End, roving tabindex) | ✅ |
| Alvos de toque ≥ 44×44px | ✅ |
| `:focus-visible` com outline 2px em text.inverse, offset 2px | ✅ |
| Skip link "Pular para lista de programas" | ✅ |
| Hierarquia h1 → h2 → h3 | ✅ |
| `prefers-reduced-motion` desliga transform, preserva opacidade | ✅ |
| Sem scroll horizontal fora do carrossel (desktop e mobile) | ✅ |
| `aria-busy` / `aria-label` no skeleton | ✅ |

### Contraste — duas pendências reais

`tests/unit/portfolio-tokens.test.ts` **mede** os pares de cor em vez de confiar
nos números da spec. Resultado:

| Par | Medido | Veredito |
|---|---|---|
| text.primary sobre surface.base | 20,5:1 | ✅ AAA |
| text.primary sobre surface.raised | 18,3:1 | ✅ AAA |
| text.inverse sobre surface.base | 8,3:1 | ✅ AA/AAA |
| text.primary sobre `#cc0000` (YouTube) | 5,7:1 | ✅ AA |
| **text.primary sobre `#1db954` (Spotify)** | **2,5:1** | ❌ reprova AA |
| **text.tertiary `#0000ee` sobre fundo escuro** | **2,0:1** | ❌ reprova AA |

Os dois tokens foram implementados **como especificados** — são decisões de
design, não bugs de implementação, e mudá-los por conta própria alteraria o
design system. Mas o item "Contraste WCAG 2.2 AA validado" do checklist **não
está satisfeito** por causa deles. Os testes travam esse fato: se um dos tokens
for corrigido, o teste correspondente falha e obriga a atualização consciente.

Saídas possíveis, quando houver decisão de design:

- **Spotify**: usar texto escuro (`surface.base`) sobre o verde — vai a 8,1:1;
  ou escurecer o verde para `#0f7a37`.
- **text.tertiary**: `#0000ee` é um azul de link pensado para fundo claro. Sobre
  fundo escuro, o equivalente seria algo como `#7aa2ff`. Alternativa sem mexer
  no token: usar `text.inverse` nos links externos do catálogo.

### Tipografia

A escala do PodFactory (`xs` = 8,75px … `4xl` = 15,75px) foi implementada
literalmente. Vale registrar que **8,75px em caixa alta com `tracking` de
0,12em é pequeno demais para leitura confortável** — é o tamanho dos metadados
(duração, data, categoria). O WCAG não fixa tamanho mínimo, então não há
reprovação formal, mas se a intenção era outra, o ajuste é trocar
`--pf-text-xs` em `lib/portfolio/tokens.ts` — todo o módulo acompanha.

---

## 5. Segurança

**RLS obrigatória.** Toda tabela em `public` é publicada automaticamente pelo
PostgREST do Supabase para os papéis `anon` e `authenticated`. Como a chave
anônima é pública (vai no bundle do browser), sem RLS qualquer pessoa poderia
escrever no catálogo pela API REST, contornando o admin.

Como o módulo acessa tudo por Prisma no servidor (que conecta como dono do banco
e não passa por RLS), `supabase/migrations/0005_portfolio_catalog.sql` habilita
RLS **sem nenhuma policy** e revoga os grants de `anon`/`authenticated`: o
PostgREST nega tudo, o Prisma continua funcionando. **Aplicar essa migration não
é opcional.**

Outras medidas:

- `/api/portfolio/events` é público (a rota é pública), então só aceita os cinco
  `eventType` conhecidos e trunca o payload a 8 chaves × 200 caracteres — o
  EventLog não vira armazenamento arbitrário.
- Links sociais são filtrados para `http(s)` na leitura e na escrita — sem
  `javascript:`.
- `customCss` do SiteConfig tem `<` escapado antes de entrar na tag `<style>`.
- Export CSV neutraliza fórmulas de planilha (`=`, `+`, `-`, `@`).
- Upload valida MIME e tamanho (5 MB) no servidor, não só no cliente.

---

## 6. Desvios da especificação

Três, todos por causa da integração com o repositório existente:

1. **Admin em `/admin/portfolio`, não em `/admin`.** A rota `/admin` já é o
   admin da *plataforma* do CRM (gestão de agentes de IA). Montar o catálogo ali
   sobrescreveria uma área em produção. A sidebar, os itens e as permissões são
   os da spec — só o prefixo muda.

2. **Autenticação reaproveita o Supabase Auth do repositório.** A spec pede
   "Supabase Auth email/senha", que é exatamente o que já existe em `/login`.
   Não há um segundo sistema de login: `portfolio_admin_users` só decide **quem**
   entra no admin do catálogo e com **qual papel**.

3. **Fonte "Borna".** A spec lista "Google Fonts: Borna", mas Borna é uma fonte
   comercial da Displaay e **não está no Google Fonts**. A stack está declarada
   como `"Borna", ui-sans-serif, system-ui, …`: se a licença for adquirida e o
   `@font-face` adicionado, o catálogo passa a usá-la sem nenhuma outra mudança.
   Hoje ele renderiza com a fonte de sistema.

O middleware (`lib/supabase/middleware.ts`) foi ajustado para tornar
`/portfolio` e `/api/portfolio/events` públicos — sem isso o guard existente
redirecionaria visitantes anônimos para `/login`. `/admin/portfolio` segue
protegido pelo mesmo guard.

---

## 7. Telemetria

`EventLog` grava `PAGE_VIEW`, `CARD_EXPAND`, `YOUTUBE_CLICK`, `SPOTIFY_CLICK` e
`EPISODE_PLAY`. O cliente usa `navigator.sendBeacon` (sobrevive à navegação)
com fallback para `fetch({ keepalive: true })`. Falha de telemetria nunca
propaga para a UI.

O admin (`/admin/portfolio/analytics`) filtra por tipo e período, exporta CSV e
agrega os números que alimentam o dashboard.

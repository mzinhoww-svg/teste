# Contratos — Reiners Media Podcast Studio

## Estrutura
```
contracts/
├── api/           # OpenAPI specs
├── events/        # Event schemas
├── data/          # Data contracts
├── frontend/      # Component contracts
└── integrations/  # External API contracts
```

## Contratos estabilizados
1. **CONTRACT-001**: Design Tokens (TCK-001)
2. **CONTRACT-002**: Data Model (TCK-002)
3. **CONTRACT-003**: OpenAPI Specs (TCK-003)
4. **CONTRACT-004**: Zod Schemas (TCK-003)
5. **CONTRACT-005**: Auth Middleware (TCK-004)
6. **CONTRACT-006**: Podcast API (TCK-005)
7. **CONTRACT-007**: Episode API (TCK-006)
8. **CONTRACT-008**: Events API (TCK-007)
9. **CONTRACT-009**: UI Component Library (TCK-008)
10. **CONTRACT-010**: Layout System (TCK-009)
11. **CONTRACT-011**: Motion System (TCK-010)
12. **CONTRACT-012**: Poster System (TCK-013)
13. **CONTRACT-013**: Expandable Card (TCK-014)
14. **CONTRACT-014**: Player Modal (TCK-015)
15. **CONTRACT-015**: Admin Layout (TCK-017)
16. **CONTRACT-016**: Test Suite (TCK-023)
17. **CONTRACT-017**: CI/CD Pipeline (TCK-024)

## CONTRACT-003 + CONTRACT-004 — OpenAPI <-> Zod (TCK-003)

### Arquivos

| Arquivo | Recurso | Implementado por |
|---------|---------|------------------|
| `contracts/api/podcasts.yaml` | `/api/podcasts*` | TCK-005 |
| `contracts/api/episodes.yaml` | `/api/episodes*` | TCK-006 |
| `contracts/api/site-config.yaml` | `/api/site-config` | TCK-007 |
| `contracts/api/events.yaml` | `/api/events`, `/api/events/summary` | TCK-007 |
| `contracts/api/upload.yaml` | `/api/upload` | TCK-005 |
| `contracts/api/auth.yaml` | `/api/auth/*` | TCK-004 |

A **fonte de verdade executável** é `src/lib/schemas.ts`. Os YAMLs documentam a
mesma coisa em OpenAPI 3.1; `src/types/api.ts` deriva todos os tipos com
`z.infer` (nunca redigite formas lá).

### Como os dois lados ficam amarrados

Cada operação OpenAPI declara extensões que apontam para o schema Zod exportado:

```yaml
x-zod-query: podcastQuerySchema      # querystring (usa z.coerce)
x-zod-params: idParamSchema          # parâmetros de rota
x-zod-request: podcastCreateSchema   # corpo da requisição
x-zod-response: podcastResponseSchema # corpo da resposta 2xx
```

Cada componente em `components.schemas` declara `x-zod-schema: <export>` ou,
quando é um enum, `x-zod-enum: <nome em ZOD_ENUMS>`.

`tests/integration/contract-validation.test.ts` falha quando:
- **uma rota existe em `src/app/api/**/route.ts` e não está publicada no YAML**
  (as rotas são descobertas varrendo o sistema de arquivos e lendo os verbos
  exportados, não comparadas contra uma lista fixa — foi assim que
  `GET /api/events/summary` conseguiu viver fora do contrato);
- uma operação está publicada e não tem rota implementada;
- um endpoint de `docs/API_CONTRACTS.md` não está documentado em nenhum YAML;
- um `x-zod-*` aponta para algo que não é exportado por `src/lib/schemas.ts`;
- os valores de um `enum:` divergem do `z.enum` correspondente;
- as `properties` de um componente divergem das chaves do objeto Zod (achatando
  `allOf`, então `PodcastWithEpisodes` e `PodcastAdmin` também são cobertos);
- o `required` do YAML diverge das chaves de fato obrigatórias no Zod
  (`nullable != optional`: um campo `.nullable()` continua obrigatório);
- o `type` de uma property diverge do tipo do campo Zod;
- uma operação não declara 400/500, 401/403 quando protegida, 404 quando tem
  parâmetro de rota, 422 quando tem corpo, ou 429 quando é mutante;
- uma resposta de erro não aponta para o envelope `ErrorResponse`.

### Onde mora o contrato executável

Por padrão, em `src/lib/schemas.ts`. A exceção é `GET /api/events/summary`: as
agregações não cabem no envelope paginado de `eventListResponseSchema` e vivem
em `src/lib/analytics.ts` (`eventSummaryQuerySchema`, `eventSummarySchema`,
`eventSummaryResponseSchema`). A operação e os componentes declaram a origem com
`x-zod-module: "@/lib/analytics"`, e o teste de contrato resolve os dois módulos.

### `/api/podcasts/{idOrSlug}`: por que um segmento só

O contrato original declarava `/api/podcasts/{slug}` (GET) e
`/api/podcasts/{id}` (PATCH/DELETE) como paths distintos. Isso era
**inimplementável e inválido** por dois motivos independentes:

1. o App Router só admite um segmento dinâmico por nível — `[slug]` e `[id]`
   lado a lado é erro do Next.js;
2. o OpenAPI trata paths que diferem apenas no nome da variável como o **mesmo**
   path, e a spec proíbe declará-los duas vezes.

Por isso existe um único path `/api/podcasts/{idOrSlug}` com os três métodos.
A distinção semântica não se perdeu: cada operação declara o `x-zod-params` que
aplica de fato — `slugParamSchema` no GET público (que também aceita UUID, como
atalho do painel) e `idParamSchema` no PATCH e no DELETE administrativos.

### 413 x 422: qual limite foi estourado

Regra fixada por TCK-007 e valida para toda a API:

| Status | Significado | O que o cliente faz |
|--------|-------------|---------------------|
| **413** `PAYLOAD_TOO_LARGE` | limite de **tamanho em bytes** (corpo da requisicao, arquivo) | encolher o payload |
| **422** `VALIDATION_ERROR` | limite **estrutural** (profundidade, numero de chaves, itens de lista) ou schema invalido | reestruturar o payload |

Declaram 413 hoje: `POST /api/upload` (arquivo > 5MB), `POST /api/events` e
`PATCH /api/site-config` (corpo acima do teto de bytes, medido em bytes UTF-8).

### Limitação conhecida: o contrato não verifica status contra os handlers

A varredura de rotas compara **path + método**. Ela **não** compara os códigos de
status: um handler que devolve um status não declarado continua invisível — foi
assim que o 413 de `POST /api/events` e `PATCH /api/site-config` escapou.

Tentei fechar esse eixo extraindo os `ErrorCode` dos handlers. Quatro
implementações, quatro modos de errar em silêncio:

| Abordagem | Resultado |
|-----------|-----------|
| AST + literais, sem resolver alias de import | Falsos negativos: não via o 413 de `PATCH /site-config`, porque o helper vem de outro módulo |
| AST + `getAliasedSymbol` + tipo do argumento | Todos os 19 métodos saturavam nos 10 códigos: wrappers como `apiError(code, …)` têm parâmetro tipado `ErrorCode`, a união inteira |
| Idem, ignorando argumentos que são parâmetro | Simultaneamente sobra e falta: `POST /upload` acusava `NOT_FOUND`, `GET /podcasts` acusava 409, e `episodes/*` só via `RATE_LIMITED` |
| Texto/regex, fatiando o corpo de cada método e resolvendo o `_lib` importado | Perdia justamente o 413: `readJsonBody` declara `Promise<{ ok: true; … }>`, e o `{` do **tipo de retorno** vem antes do `{` do corpo, então a fatia pegava a anotação |

Fazer isso direito exige propagação de constantes interprocedural e sensibilidade
a caminho. Cada aproximação barata erra de um jeito que só aparece conferindo as
19 linhas à mão contra o código — e um teste verde em que ninguém confia é pior
que uma limitação registrada.

**Recomendação:** que o teste de contrato de cada ticket asserte o status das
respostas de erro do próprio handler, onde a verificação é local e confiável.
Do lado do contrato ficam três guardas que não dependem de analisar handler:
o componente de erro tem de ser usado sob o status correspondente
(`NotFound` só sob 404), o status tem de bater com `ERROR_STATUS_BY_CODE`, e as
operações que leem corpo com teto de bytes têm de declarar 413 — esta última por
lista explícita, que falha alto se alguém remover o 413.

### Envelopes

- Sucesso único: `{ "data": <recurso> }`
- Lista: `{ "data": [...], "meta": { page, limit, total, totalPages } }`
- Erro: `{ "error": { "code", "message", "details"? } }` com `code` em `ErrorCode`

### Regras de negócio no contrato

Um schema de payload **parcial não enxerga o estado persistido**. Por isso as
regras têm três níveis de fechamento — e o contrato é explícito sobre de quem é
a obrigação em cada um:

| Regra | Fechada no schema? | Quem fecha de fato |
|-------|--------------------|--------------------|
| BR-003 (>= 1 host) | **Sim, total** — `hosts.min(1)` / `minItems: 1` | schema |
| BR-007 / BR-008 (embeds) | **Sim, total** — `YOUTUBE_URL_PATTERNS` / `SPOTIFY_URL_PATTERNS` (grupo 1 = ID) | schema |
| BR-004 (>= 1 trilha) | **Só no POST.** No PATCH só dispara se `youtubeUrl` e `spotifyUrl` vierem juntos | **TCK-006** chama `validateEpisodeTracks(merged)` |
| BR-006 (ENDED não é destaque) | **Só no POST.** `PATCH {"featured": true}` passa no schema, porque `status` chega `undefined` | **TCK-005** chama `validatePodcastRules(resolvePodcastRuleState(...))` |
| BR-005 (máx. 3 destaques) | **Não** — depende de `count` no banco | **TCK-005**, mesmo helper, com `otherFeaturedCount` |
| BR-001 / BR-002 (RBAC) | **Não** | **TCK-004** — `security: cookieAuth` + 401/403 |
| BR-009 (retenção 90 dias) | **Não** | **TCK-021** — job usando `EVENT_LOG_RETENTION_DAYS` |

Uso obrigatório no PATCH de podcast (TCK-005), sob pena de "Ofício" (`ENDED` no
seed) virar destaque na home:

```ts
const patch = podcastUpdateSchema.parse(await request.json());
// `otherFeaturedCount` e obrigatorio no tipo: sem ele o compilador reclama,
// justamente para que BR-005 nao deixe de disparar em silencio.
const otherFeaturedCount = await prisma.podcast.count({
  where: { featured: true, deletedAt: null, id: { not: params.id } },
});
const violations = validatePodcastRules(
  resolvePodcastRuleState(current, patch, otherFeaturedCount),
);
if (violations.length > 0) return conflict(violations); // 409
```

### Decisões registradas

1. **Bodies de create/update são `.strict()`** — chave desconhecida vira 422 em
   vez de ser silenciosamente descartada. Evita que o admin ache que salvou algo.
2. **Queries não são estritas** — parâmetros extras (`utm_*`) são ignorados.
3. **`coverImage` é obrigatório no create** — `Podcast.coverImage` é NOT NULL no
   Prisma; o fluxo é `POST /api/upload` primeiro, depois `POST /api/podcasts`
   com a URL retornada.
4. **Campos de imagem aceitam duas formas** (`imageRefSchema`): URL `http(s)`
   absoluta (upload real no Supabase Storage) **ou** caminho root-relativo
   iniciado por `/` (assets de demonstração em `public/`, que é o que o seed de
   TCK-002 grava). Vale para `coverImage`, `heroImage`, `hosts[].photo`,
   `thumbnail`, `logoUrl`, `faviconUrl` e `avatarUrl`. Aceita querystring
   (`/capa.jpg?v=2`) e acentos (`/imagens/edição.jpg`). Bloqueia `//host`,
   `javascript:`, `data:`, path traversal (`/../`, `/foo/..`), espaços e
   `< > " ' \` \\`. O que é link externo de verdade (`socialLinks`,
   `youtubeUrl`, `spotifyUrl`) continua exigindo URL absoluta via `urlSchema`.
5. **O `pattern` publicado no YAML é o `.source` do regex que valida de fato.**
   `IMAGE_REF_PATTERN === IMAGE_REF_REGEX.source`, então validação de cliente
   (formulário do admin, cliente gerado do OpenAPI) e de servidor não podem
   divergir. O teste de contrato compara os dois byte a byte **e** confere que
   concordam sobre um corpus de probes — foi assim que uma divergência anterior
   (o `pattern` aceitava `/../../etc/passwd` e o Zod rejeitava) foi pega.
6. **`deletedAt` não existe na resposta pública** — soft delete é metadado
   interno. `podcastSchema` não o expõe; quem precisa usa `podcastAdminSchema`
   (componente `PodcastAdmin`), devolvido por `DELETE /api/podcasts/:id` e pelo
   painel de TCK-018.
7. **Schemas de entidade não herdam `.default()`** — numa resposta, `status`,
   `visualStyle`, `accentColor`, `featured`, `displayOrder`, `socialLinks`,
   `siteName`, `tagline` e `primaryColor` são obrigatórios. Se herdassem o
   default, o validador aceitaria uma resposta incompleta e "consertaria"
   silenciosamente o que o handler esqueceu de selecionar.
8. **`youtubeEmbed` / `spotifyEmbed` não entram no body** — são derivados pelo
   servidor (BR-007/BR-008); enviá-los resulta em 422.
9. **`podcastId` é imutável no PATCH de episódio** — mover episódio entre
   programas exige delete + create.
10. **BR-004 e BR-006 no PATCH** só são validáveis em Zod quando as chaves
    relevantes vêm juntas no payload; a checagem contra o estado mesclado é
    obrigação do route handler (ver tabela de regras acima).
11. **IDs de embed são estritos** — YouTube com 11 caracteres, Spotify com 22.
    Alterar isso é mudança de contrato, não de implementação.

### Armadilha: não passe a linha crua do Prisma para o schema

Os schemas de entidade são `.strict()` e não têm `deletedAt`. Toda linha do
Prisma traz o campo, então isto **falha** com `unrecognized_keys: ['deletedAt']`
e vira 500 numa rota pública:

```ts
// ERRADO
podcastListResponseSchema.parse({ data: await prisma.podcast.findMany(), meta });
```

Além do `deletedAt`, o Prisma devolve `Date` (não string ISO) nos timestamps e
`null` em `socialLinks`/`hosts`, que são `Json?` no banco mas obrigatórios na
resposta. Use os serializadores exportados — eles resolvem os três casos e
ignoram colunas novas:

```ts
// CERTO
const rows = await prisma.podcast.findMany({ where: { deletedAt: null } });
podcastListResponseSchema.parse({ data: rows.map(toPublicPodcast), meta });
```

| Helper | Uso |
|--------|-----|
| `toPublicPodcast(row)` | rotas públicas de programa |
| `toAdminPodcast(row)` | rotas administrativas (mantém `deletedAt`) |
| `toPublicEpisode(row)` | rotas de episódio |
| `toPublicPodcastWithEpisodes(row)` | `GET /api/podcasts/:slug` |

A alternativa é um `select` explícito omitindo `deletedAt` — mas aí a
normalização de `Date` e de `Json` nulo fica por sua conta.

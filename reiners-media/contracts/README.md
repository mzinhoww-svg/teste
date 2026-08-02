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
| `contracts/api/events.yaml` | `/api/events` | TCK-007 |
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
3b. **Campos de imagem aceitam duas formas** (`imageRefSchema`): URL `http(s)`
   absoluta (upload real no Supabase Storage) **ou** caminho root-relativo
   iniciado por `/` (assets de demonstração em `public/`, que é o que o seed de
   TCK-002 grava). Vale para `coverImage`, `heroImage`, `hosts[].photo`,
   `thumbnail`, `logoUrl`, `faviconUrl` e `avatarUrl`. Rejeita `//host`,
   `javascript:`, `data:`, path traversal e espaços. O que é link externo de
   verdade (`socialLinks`, `youtubeUrl`, `spotifyUrl`) continua exigindo URL
   absoluta via `urlSchema`.
3c. **`deletedAt` não existe na resposta pública** — soft delete é metadado
   interno. `podcastSchema` não o expõe; quem precisa usa `podcastAdminSchema`
   (componente `PodcastAdmin`), devolvido por `DELETE /api/podcasts/:id` e pelo
   painel de TCK-018.
3d. **Schemas de entidade não herdam `.default()`** — numa resposta, `status`,
   `visualStyle`, `accentColor`, `featured`, `displayOrder`, `socialLinks`,
   `siteName`, `tagline` e `primaryColor` são obrigatórios. Se herdassem o
   default, o validador aceitaria uma resposta incompleta e "consertaria"
   silenciosamente o que o handler esqueceu de selecionar.
4. **`youtubeEmbed` / `spotifyEmbed` não entram no body** — são derivados pelo
   servidor (BR-007/BR-008); enviá-los resulta em 422.
5. **`podcastId` é imutável no PATCH de episódio** — mover episódio entre
   programas exige delete + create.
6. **BR-004 e BR-006 no PATCH** só são validáveis em Zod quando as chaves
   relevantes vêm juntas no payload; a checagem contra o estado mesclado é
   obrigação do route handler (ver tabela de regras acima).
7. **IDs de embed são estritos** — YouTube com 11 caracteres, Spotify com 22.
   Alterar isso é mudança de contrato, não de implementação.

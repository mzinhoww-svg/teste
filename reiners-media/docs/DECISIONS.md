# Decisions — Reiners Media Podcast Studio

## DEC-001: Next.js App Router
**Contexto:** Precisamos de SSR, ISR e RSC para performance e SEO.
**Decisão:** Usar Next.js 14+ App Router.
**Alternativas:** Remix (menos maduro), Gatsby (estático demais), Nuxt (Vue, fora da stack).
**Consequências:** Curva de aprendizado para App Router, mas melhor performance nativa.
**Status:** Aprovado.
**Tickets:** Todos.

## DEC-002: Supabase como Backend-as-a-Service
**Contexto:** Precisamos de auth, banco e storage sem gerenciar infraestrutura.
**Decisão:** Usar Supabase (PostgreSQL + Auth + Storage).
**Alternativas:** Firebase (vendor lock-in), PlanetScale (sem auth/storage), AWS (complexo).
**Consequências:** Single vendor, mas stack integrada e gratuita para MVP.
**Status:** Aprovado.
**Tickets:** TCK-002, TCK-004, TCK-005.

## DEC-003: Prisma como ORM
**Contexto:** Precisamos de type safety e migrations.
**Decisão:** Usar Prisma.
**Alternativas:** Drizzle (menos maduro), TypeORM (verboso), raw SQL.
**Consequências:** Excelente DX, mas bundle size maior no serverless.
**Status:** Aprovado.
**Tickets:** TCK-002.

## DEC-004: Tailwind CSS para Styling
**Contexto:** Precisamos de styling rápido, consistente e com design tokens.
**Decisão:** Usar Tailwind CSS com config customizada.
**Alternativas:** Styled-components (runtime overhead), CSS Modules (verboso), Chakra UI (pesado).
**Consequências:** Utility-first pode gerar classes longas, mas performance é excelente.
**Status:** Aprovado.
**Tickets:** TCK-001, TCK-009.

## DEC-005: Route Handlers em vez de Express
**Contexto:** APIs simples, integração nativa com Next.js.
**Decisão:** Usar Next.js Route Handlers.
**Alternativas:** Express (overhead extra), tRPC (curva de aprendizado), Fastify.
**Consequências:** Menos flexível que Express, mas zero configuração extra.
**Status:** Aprovado.
**Tickets:** TCK-005, TCK-006.

## DEC-006: Sistema de Tickets para Paralelização
**Contexto:** Necessidade de executar múltiplos agentes Claude Code em paralelo.
**Decisão:** Criar sistema de tickets JSON com worktrees isoladas.
**Alternativas:** GitHub Projects (não integrado com Claude Code), Linear (pago), Jira (complexo).
**Consequências:** Overhead de gestão, mas máxima paralelização.
**Status:** Aprovado.
**Tickets:** Todos.

## DEC-007: Instalação do pacote em `reiners-media/` e não na raiz do repositório
**Contexto:** O repositório `mzinhoww-svg/teste` já hospeda a aplicação Next.js `crm-ai-studio` na raiz, com App Router em `app/` (sem `src/`), Supabase direto (sem Prisma), `package.json`, `README.md`, `tailwind.config.ts`, `vercel.json` e `.github/workflows/` próprios.
**Decisão:** Instalar o pacote de entrega e desenvolver o produto em `reiners-media/`, seguindo o precedente de `viajaly-content-engine/` (subprojeto irmão no mesmo repositório). Todos os `write_paths` dos tickets são interpretados como relativos a `reiners-media/`.
**Alternativas:** (a) Instalar na raiz — rejeitado: Next.js não suporta `app/` e `src/app/` simultaneamente, e sobrescreveria `README.md`, `package.json`, `tailwind.config.ts` e `vercel.json` do CRM; (b) repositório separado — rejeitado: fora do escopo autorizado da sessão (branch designada é neste repo).
**Consequências:** Deploy na Vercel exige `Root Directory = reiners-media`. Os dois projetos mantêm `node_modules` e lockfiles independentes.
**Status:** Aprovado.
**Tickets:** Todos.

## DEC-008: Correção de defeitos do tooling de entrega antes da execução
**Contexto:** O protocolo de inicialização exige `ticketctl.py validate` e `summary`. Ambos abortavam com `SyntaxError: unterminated string literal` em `scripts/ticketctl.py:298` (f-string quebrada em duas linhas, inválida em Python < 3.12; o ambiente roda 3.11.15). Outros quatro defeitos foram identificados na mesma revisão.
**Decisão:** Corrigir o tooling em vez de abortar a execução, já que são defeitos mecânicos do harness e não do produto. Correções aplicadas:
1. `ticketctl.py:298` — f-string multilinha → `\n` escapado.
2. `cmd_validate` — checagem de dependências era dependente da ordem de iteração (comparava contra o conjunto `ids` sendo construído incrementalmente, o que aceitaria silenciosamente uma dependência para a frente inexistente). Agora compara contra a lista completa de IDs.
3. `cmd_ready` — filtrava apenas `BACKLOG`, nunca retornando tickets já em `READY`; passou a considerar ambos.
4. `cmd_regenerate` — sobrescrevia `manifest.json` descartando `waves` e `epics` (metadados curados não deriváveis dos tickets). Agora preserva `epics`, reconstrói `waves` a partir do campo `wave` de cada ticket e acrescenta `status_counts`.
5. `validate_ticket.sh` — apenas imprimia os `validation_commands` sem executá-los, e verificava o status via `grep IN_PROGRESS` no JSON inteiro (falso positivo por qualquer ocorrência da string). Agora lê o campo `status` e executa cada comando, falhando com exit code diferente de zero.
**Alternativas:** Abortar conforme a regra "se a validação falhar, reporte e aborte" — rejeitado: a falha é do instrumento de medição, não do pacote; abortar não entregaria valor e o defeito é de correção trivial e verificável.
**Consequências:** `scripts/ticketctl.py` e `scripts/validate_ticket.sh` divergem do pacote original entregue. As mudanças estão isoladas em `scripts/` e são rastreáveis pelo commit `[TCK-000]`.
**Status:** Aprovado.
**Tickets:** Infra (pré-onda 0).

## DEC-009: TCK-025 cancelado como duplicata de TCK-024
**Contexto:** `tickets/items/TCK-025.json` é byte-a-byte idêntico a `TCK-024.json` exceto pelo campo `id`: mesmo título ("Configurar deploy na Vercel, CI/CD e monitoramento"), mesmo `epic`, mesmas `dependencies` (`TCK-023`) e os mesmos `write_paths` (`.github/workflows/ci.yml`, `vercel.json`, `src/app/api/health/route.ts`). Executar ambos violaria a regra "nunca executar dois tickets com conflito de `write_paths`", e `ticketctl.py ownership` reporta os três paths como CONFLITO POTENCIAL.
**Decisão:** Mover TCK-025 para `CANCELLED` com `cancellation_reason` registrado no próprio ticket. TCK-024 permanece como o ticket canônico de deploy/CI.
**Alternativas:** (a) Reescrever TCK-025 com escopo novo — rejeitado: criaria requisito não aprovado, proibido pela regra 7 do CLAUDE.md; (b) executar os dois — rejeitado: conflito de ownership garantido.
**Consequências:** O total efetivo é de 24 tickets executáveis. `docs/PRD.md` e `docs/TRACEABILITY.md` não referenciam TCK-025, o que confirma que a duplicata é acidental e não perde requisito.
**Status:** Aprovado.
**Tickets:** TCK-024, TCK-025.

## DEC-010: Ondas executadas com subagentes paralelos na branch designada, sem worktrees por ticket
**Contexto:** O pacote prevê `git worktree` por ticket (`.claude/worktrees/<TICKET>`) com merge na integração. A sessão executa numa branch única designada (`claude/reiners-media-setup-txrghr`) e delega a subagentes que compartilham o mesmo diretório de trabalho.
**Decisão:** Executar cada onda com subagentes paralelos na árvore compartilhada. A garantia que o worktree existia para dar — nenhum agente escrevendo no arquivo de outro — é preservada pelo cálculo de onda, que já exclui qualquer ticket com `write_paths` sobreposto aos dos demais da onda, e verificada por `scripts/path_guard.py` antes de cada commit.
**Alternativas:** Worktrees reais — rejeitado: cada worktree exigiria `pnpm install` próprio e 24 merges sequenciais, sem ganho de isolamento sobre o que a disjunção de `write_paths` já garante.
**Consequências:** `scripts/create_worktree.sh` não é exercitado nesta execução. A rastreabilidade por ticket é mantida pelos commits `[TCK-XXX]`.
**Status:** Aprovado.
**Tickets:** Todos.

## DEC-011: Scaffold de projeto como pré-requisito de infraestrutura (TCK-000)
**Contexto:** Nenhum ticket declara ownership de `package.json`, `tsconfig.json`, `next.config.js`, `postcss.config.js`, `vitest.config.ts` ou `.eslintrc.json` — mas todo `validation_commands` do pacote depende deles (`pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `npx prisma generate`).
**Decisão:** Criar o scaffold como etapa de infra pré-onda-0, commitada como `[TCK-000]`. Escolhas fixadas aqui: Next.js 14.2.5 App Router com diretório `src/`, alias `@/*`, Vitest (unit/integration) + Playwright (e2e/a11y), Prisma 5 com `tsx` para o seed, Zod para validação e framer-motion para o sistema de motion (TCK-010).
**Alternativas:** Deixar cada ticket criar o que faltasse — rejeitado: geraria escrita concorrente em `package.json` por vários tickets da mesma onda, exatamente o conflito de ownership que o pacote proíbe.
**Consequências:** `tailwind.config.ts` fica de fora do scaffold por ser `write_path` explícito de TCK-001.
**Status:** Aprovado.
**Tickets:** Pré-onda 0.

## DEC-012: Tickets JSON prevalecem sobre a tabela de ondas do ROADMAP.md
**Contexto:** A partir de TCK-008 a tabela "Ondas de Execução" de `docs/ROADMAP.md` está deslocada em relação aos tickets canônicos. O ROADMAP descreve TCK-008 como "Admin auth & RBAC" e TCK-009 como "Shared UI components"; nos tickets, TCK-008 é "Criar componentes UI compartilhados base" (wave 2) e TCK-009 é "Implementar layout system" (wave 2). O deslocamento se propaga até TCK-025. Os campos `wave` dos tickets, `tickets/waves.json` e `tickets/manifest.json` são mutuamente consistentes; só a prosa do ROADMAP diverge.
**Decisão:** Seguir os tickets JSON, conforme CLAUDE.md §3 ("tickets/items/TCK-XXX.json — fonte de verdade do estado") e §4 (hierarquia de documentos). O ROADMAP não é alterado nesta execução — a divergência fica registrada aqui para não ser reintroduzida como "correção" numa sessão futura.
**Alternativas:** Reescrever a tabela do ROADMAP — rejeitado nesta execução: alterar documento de planejamento sem necessidade funcional, quando as três outras fontes já concordam entre si.
**Consequências:** Quem ler apenas o ROADMAP verá um mapa ticket→escopo defasado a partir de TCK-008. As fases ("Fase 0..5") e os gates do ROADMAP continuam válidos.
**Status:** Aprovado.
**Tickets:** TCK-008 a TCK-025.

## DEC-013: Exclusão de `reiners-media/` do projeto TypeScript e do lint da raiz
**Contexto:** Após o commit inicial, o job "Lint & build" do CI da raiz falhou com `Type error: Cannot find module '@vitejs/plugin-react'` em `./reiners-media/vitest.config.ts`, e o deploy da Vercel do projeto da raiz errou junto. Causa: o `tsconfig.json` da raiz declara `include: ["**/*.ts", "**/*.tsx"]` com `exclude: ["node_modules"]`, então o `next build` do `crm-ai-studio` passou a typechecar os fontes do subprojeto — que dependem de pacotes instalados apenas em `reiners-media/node_modules`.
**Decisão:** Adicionar `reiners-media` (e `viajaly-content-engine`, que tem o mesmo risco latente) ao `exclude` do `tsconfig.json` da raiz e ao `ignorePatterns` do `.eslintrc.json` da raiz. Os dois subprojetos mantêm seus próprios `tsconfig.json`/`.eslintrc.json` e são validados pelos seus próprios comandos.
**Alternativas:** (a) Instalar as dependências do subprojeto na raiz — rejeitado: polui o `package.json` do CRM com Prisma, Zod e framer-motion que ele não usa; (b) transformar o repositório num monorepo com workspaces — rejeitado: mudança estrutural muito além do escopo do ticket, afetando o build de produção do CRM.
**Consequências:** São as duas únicas alterações desta entrega fora de `reiners-media/`, e existem só para que o subprojeto não quebre o build do projeto pré-existente. O CI da raiz não valida `reiners-media/`; essa validação é responsabilidade do workflow próprio, entregue por TCK-024.
**Status:** Aprovado.
**Tickets:** Infra (TCK-000), TCK-024.

## DEC-014: `imageRefSchema` aceita URL absoluta ou path root-relativo
**Contexto:** A revisão independente da onda 0 encontrou um bloqueador: os dois "contratos estabilizados" da onda se contradizem. O seed (TCK-002) grava `coverImage: "/images/podcasts/horizonte-digital-cover.jpg"`, enquanto `urlSchema = z.string().url()` (TCK-003) exige URL absoluta. `podcastCreateSchema.safeParse()` rejeita os 5 programas do seed, todo `hosts[].photo`, os `thumbnail` de episódio, `logoUrl`/`faviconUrl` e os 3 `avatarUrl`. Na prática o admin (TCK-018) abriria qualquer programa vindo do seed, clicaria em salvar e receberia 422 `Invalid url`.
**Decisão:** Introduzir `imageRefSchema`, que aceita **URL absoluta `http(s)` ou path começando com `/`**, rejeitando `//`, `javascript:`, path traversal e string vazia. Aplicado a todos os campos de imagem. `urlSchema` permanece estrito para links de fato externos (`socialLinks`, `youtubeUrl`, `spotifyUrl`). O seed mantém os paths relativos.
**Justificativa:** as duas formas são legítimas no produto — upload real vai para o Supabase Storage e produz URL absoluta; assets de demonstração ficam em `public/` e são referenciados por path root-relativo. Forçar uma só das pontas quebraria o outro caso de uso.
**Alternativas:** (a) Seed usar URLs absolutas de CDN — rejeitado: inventa um host que não existe e torna o seed dependente de infraestrutura externa para rodar localmente; (b) afrouxar para `z.string()` — rejeitado: perde a validação inteira e abre `javascript:` em atributo de imagem.
**Consequências:** TCK-002 ganha um teste que valida as estruturas do seed contra os schemas Zod reais, para a contradição não voltar.
**Status:** Aprovado.
**Tickets:** TCK-002, TCK-003, e os consumidores TCK-005, TCK-006, TCK-013, TCK-018.

## DEC-015: `deletedAt` fora do schema de resposta pública
**Contexto:** `podcastSchema` declarava `deletedAt: isoDateTimeSchema.nullable()` — chave obrigatória, porque `nullable ≠ optional` — enquanto o componente `Podcast` do OpenAPI não o lista em `required`. Deriva real entre YAML e Zod, que o teste de contrato não detectava por comparar apenas nomes de propriedades. TCK-005 implementaria `GET /api/podcasts` seguindo o OpenAPI, faria um `select` sem o campo, e `podcastResponseSchema.parse()` explodiria em runtime numa rota pública.
**Decisão:** `deletedAt` é metadado interno de soft delete e sai do schema de resposta pública; se o admin precisar dele, vai num schema separado (`podcastAdminSchema`). YAML e Zod ficam coerentes.
**Alternativas:** Adicionar `deletedAt` ao `required` do YAML — rejeitado: expor estado interno de soft delete numa resposta pública vaza informação sem benefício.
**Consequências:** O teste de contrato foi endurecido para comparar também obrigatoriedade (`required` do YAML × `isOptional()` do Zod), não só nomes — senão a classe inteira de deriva continuaria invisível.
**Status:** Aprovado.
**Tickets:** TCK-003, TCK-005, TCK-018.

## DEC-016: BR-006 não é verificável num schema de payload parcial
**Contexto:** `podcastUpdateSchema` é `.partial().refine(refineEndedNotFeatured)`. Num PATCH parcial `status` vem `undefined`, então o refine sempre passa: `podcastUpdateSchema.safeParse({ featured: true }).success === true`. O "Ofício" está `ENDED` no seed, então `PATCH /api/podcasts/<id>` com `{"featured": true}` o tornaria destaque na home, violando BR-006. A limitação equivalente do BR-004 estava documentada; a do BR-006 não — pior, o YAML afirmava "mesmas regras de negocio do create".
**Decisão:** Um schema de payload parcial não tem como validar uma regra que depende do estado atual do registro. A checagem de BR-005 e BR-006 contra o **estado mesclado** (registro atual + patch) é obrigação do route handler, e isso passa a estar explícito no contrato e no README, com um helper exportado para TCK-005 e TCK-018 consumirem.
**Alternativas:** Tornar `status` obrigatório no update — rejeitado: descaracteriza o PATCH, forçando o cliente a reenviar campos que não quer mudar.
**Consequências:** TCK-005 e TCK-018 têm obrigação explícita de aplicar o helper; sem ele a regra de negócio fica sem dono.
**Status:** Aprovado.
**Tickets:** TCK-003, TCK-005, TCK-018.

## DEC-017: `tests/` não consta nos `write_paths` de nenhum ticket
**Contexto:** Os três tickets da onda 0 escreveram em `tests/`, que aparece apenas nos `test_plan` e em nenhum `write_paths`. A revisão apontou como escrita fora de escopo. O mesmo vale para `contracts/README.md` (TCK-003 declara `contracts/api/`, não `contracts/`).
**Decisão:** Tratar como defeito de declaração dos tickets, não das implementações: o pacote exige testes de todo ticket (CLAUDE.md §17) e lista os arquivos em `test_plan`, então escrevê-los é obrigatório e a omissão em `write_paths` é uma inconsistência do pacote. A interpretação foi consistente nos três tickets. Os arquivos de teste permanecem.
**Alternativas:** Reverter os testes — rejeitado: violaria §17 e os critérios de aceitação; (b) editar os `write_paths` dos 24 tickets — rejeitado nesta execução: altera a fonte de verdade dos tickets em massa, com risco maior que o do defeito.
**Consequências:** `path_guard.py` emite AVISO (não erro) para arquivos de teste — comportamento correto do script, já que ele distingue aviso de violação. Fica registrado para quem for revisar ownership depois.
**Status:** Aprovado.
**Tickets:** Todos.

## DEC-018: paleta padrão do Tailwind permanece acessível (`extend`)
**Contexto:** `tailwind.config.ts` declara `colors`/`spacing` dentro de `extend`, então `bg-red-500`, `text-purple-400` e `p-7` continuam gerando CSS. Um componente escrito fora do design system passaria por `lint`, por `tokens.test.ts` e pelo grep de hex sem nenhum sinal.
**Decisão:** Manter `extend` nesta entrega. O critério de aceitação do TCK-001 diz literalmente "Tailwind config estendida", e substituir `theme` inteiro é mudança de contrato do ticket.
**Alternativas:** Mover para `theme` (substituindo a paleta padrão) — rejeitado agora por contrariar o critério declarado; fica registrado como endurecimento a decidir antes da onda 2, quando TCK-008 define os componentes base.
**Consequências:** Até lá, a aderência ao design system depende de revisão humana, não de ferramenta. Risco real e assumido conscientemente.
**Status:** Aprovado com ressalva.
**Tickets:** TCK-001, TCK-008.

## DEC-019: cobertura automática de códigos de status no teste de contrato — não implementada
**Contexto:** A varredura de rotas introduzida na onda 1 fechou a deriva "rota implementada e não publicada", mas compara apenas **path + método**. Foi por esse buraco que o 413 escapou: o TCK-007 mudou o comportamento de `POST /api/events` e `PATCH /api/site-config` e o YAML não acompanhou. A extensão natural seria extrair dos handlers os códigos que eles constroem e exigir que cada um exista nas `responses` da operação.
**Decisão:** Não implementar. Quatro abordagens foram tentadas e cada uma falhou em silêncio, de um jeito distinto:
1. AST + literais sem resolver alias de import → falso negativo: não enxergava o 413 de `PATCH /site-config`, emitido de dentro de `_lib/http.ts`.
2. AST + `getAliasedSymbol` + tipo do argumento → os 19 métodos saturaram nos 10 códigos, porque wrappers como `apiError(code, …)` têm o parâmetro tipado `ErrorCode`, que é a união inteira.
3. Idem, ignorando argumentos que são parâmetro → sobra e falta ao mesmo tempo (`POST /upload` acusava `NOT_FOUND`; `episodes/*` só via `RATE_LIMITED`).
4. Texto/regex fatiando cada método → perdia justamente o 413, porque `readJsonBody` declara `Promise<{ ok: true; … }>` e a `{` do tipo de retorno vem antes da `{` do corpo.
O que separa o certo do errado é propagação de constantes interprocedural com sensibilidade a caminho. Toda aproximação barata erra de um modo que só se detecta conferindo as 19 linhas à mão — ou seja, produz exatamente o teste verde em que ninguém confia e que todo mundo contorna.
**Alternativas:** Manter uma das aproximações com allowlist de exceções — rejeitado: a lista de exceções vira o próprio ponto cego, e um teste com exceções não auditadas é pior que a ausência dele, porque transmite confiança falsa.
**Consequências:** A deriva "handler devolve status não declarado" continua possível. Mitigação adotada: (a) três guardas puramente contratuais foram implementadas — componente de erro sob o status correspondente (`NotFound` só sob 404), status do YAML amarrado a `ERROR_STATUS_BY_CODE`, e lista explícita de operações que leem corpo com teto de bytes e portanto declaram 413; (b) recomendação de que o teste de contrato **de cada ticket** asserte o status do próprio handler, onde a verificação é local e confiável.
**Status:** Aprovado com limitação registrada.
**Tickets:** TCK-003, e todo ticket que adicione rota.

## DEC-020: `/api/podcasts/{idOrSlug}` — o contrato original era inimplementável e inválido
**Contexto:** `contracts/api/podcasts.yaml` declarava `/api/podcasts/{slug}` e `/api/podcasts/{id}` como paths distintos. A varredura de rotas acusou que nenhum dos dois existe; o real é `/api/podcasts/{idOrSlug}`.
**Decisão:** Unificar em `/api/podcasts/{idOrSlug}`, preservando a distinção semântica por operação (`x-zod-params: slugParamSchema` no GET público, `idParamSchema` no PATCH/DELETE).
**Justificativa — dois motivos independentes:** (1) o App Router só admite um segmento dinâmico por nível, então `[slug]` e `[id]` lado a lado é erro do Next.js; (2) o OpenAPI trata paths que diferem apenas no nome da variável como o **mesmo** path e proíbe declarar ambos. O contrato era inimplementável *e* OpenAPI inválido — não foi a implementação que divergiu do contrato, foi o contrato que nunca foi realizável.
**Consequências:** `docs/API_CONTRACTS.md` (que escreve `:slug`/`:id`) não foi alterado por não ser `write_path` de nenhum ticket da onda; a checagem contra ele compara a forma do path com o nome da variável apagado.
**Status:** Aprovado.
**Tickets:** TCK-003, TCK-005.

## DEC-021: teto de bytes não é uniforme entre os handlers que aceitam corpo
**Contexto:** `POST /api/events`, `PATCH /api/site-config` e `POST /api/upload` limitam o tamanho do corpo em bytes e devolvem 413. `POST /api/podcasts`, `PATCH /api/podcasts` e as rotas de episódio usam um `readJsonBody` **sem** teto de bytes. A regra contratual "toda operação com `requestBody` declara 413" teria pego a omissão do 413 sozinha, mas não pode ser imposta enquanto a assimetria existir — declararia um status que essas rotas não produzem.
**Decisão:** Não uniformizar nesta onda. A assimetria fica registrada como dívida, com a avaliação de risco explícita abaixo.
**Risco real:** as rotas sem teto são todas autenticadas (EDITOR+) e sujeitas a rate limit de 60/min por IP. Um EDITOR autenticado poderia enviar corpos grandes repetidamente e pressionar memória da função serverless. É vetor real, porém de baixa exposição — exige credencial válida — e não foi levantado por nenhuma das revisões independentes.
**Alternativas:** Padronizar agora — rejeitado nesta onda: exigiria reabrir TCK-005 e TCK-006 já aprovados e revisados, mais uma terceira rodada de revisão, para fechar um vetor que depende de credencial. Melhor endereçar de uma vez, junto com o endurecimento de deploy.
**Consequências:** Atribuído a TCK-024 (deploy, CI e monitoramento), que já tem escopo de endurecimento. Ao padronizar, a regra "toda operação com `requestBody` declara 413" passa a valer e deve virar teste em `contract-validation.test.ts`.
**Status:** Aprovado como dívida atribuída.
**Tickets:** TCK-005, TCK-006, TCK-024.

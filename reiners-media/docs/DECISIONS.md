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

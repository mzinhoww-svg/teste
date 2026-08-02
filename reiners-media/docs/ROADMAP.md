# Roadmap — Reiners Media Podcast Studio

## Fases

### Fase 0: Fundação (Wave 0)
**Objetivo:** Estabelecer contratos, design system e infraestrutura base.
**Duração estimada:** 2-3 dias
**Tickets:** TCK-001 a TCK-004
**Concorrência máxima:** 4 tickets

### Fase 1: Backend Core (Wave 1)
**Objetivo:** Implementar APIs, banco e autenticação.
**Duração estimada:** 2-3 dias
**Tickets:** TCK-005 a TCK-008
**Depende de:** Fase 0
**Concorrência máxima:** 4 tickets

### Fase 2: Frontend Shared (Wave 2)
**Objetivo:** Construir componentes reutilizáveis e layout system.
**Duração estimada:** 2-3 dias
**Tickets:** TCK-009 a TCK-011
**Depende de:** Fase 0
**Concorrência máxima:** 3 tickets

### Fase 3: Frontend Pages (Wave 3)
**Objetivo:** Implementar páginas públicas e admin.
**Duração estimada:** 3-4 dias
**Tickets:** TCK-012 a TCK-018
**Depende de:** Fase 1, Fase 2
**Concorrência máxima:** 5 tickets

### Fase 4: Admin CRUD & Analytics (Wave 4)
**Objetivo:** Completar funcionalidades admin e analytics.
**Duração estimada:** 2-3 dias
**Tickets:** TCK-019 a TCK-021
**Depende de:** Fase 1, Fase 3
**Concorrência máxima:** 3 tickets

### Fase 5: Integração & Polish (Wave 5)
**Objetivo:** Analytics, SEO, testes, performance e deploy.
**Duração estimada:** 2-3 dias
**Tickets:** TCK-022 a TCK-025
**Depende de:** Fase 3, Fase 4
**Concorrência máxima:** 4 tickets

## Ondas de Execução

### Wave 0: Contratos & Fundação
| Ticket | Agente | Independência | Escopo |
|--------|--------|---------------|--------|
| TCK-001 | frontend-engineer | 100 | Design tokens, theme system |
| TCK-002 | backend-engineer | 95 | Prisma schema, migrations, seed |
| TCK-003 | solution-architect | 100 | API contracts, OpenAPI specs |
| TCK-004 | backend-engineer | 90 | Supabase auth, middleware, RBAC |

**Gate:** Todos os contratos revisados e aprovados. Schema validado.

### Wave 1: Backend Core
| Ticket | Agente | Independência | Escopo |
|--------|--------|---------------|--------|
| TCK-005 | backend-engineer | 95 | Podcast CRUD API + upload |
| TCK-006 | backend-engineer | 95 | Episode CRUD API + parser |
| TCK-007 | backend-engineer | 100 | SiteConfig & Event API |
| TCK-008 | backend-engineer | 90 | Admin auth & RBAC enforcement |

**Gate:** Todas as APIs passando testes de contrato. Postman/Insomnia validado.

### Wave 2: Frontend Shared
| Ticket | Agente | Independência | Escopo |
|--------|--------|---------------|--------|
| TCK-009 | frontend-engineer | 100 | Shared UI components |
| TCK-010 | frontend-engineer | 100 | Layout system (nav, footer, sidebar) |
| TCK-011 | frontend-engineer | 100 | Animation & motion system |

**Gate:** Componentes renderizando corretamente em Storybook ou preview.

### Wave 3: Frontend Pages
| Ticket | Agente | Independência | Escopo |
|--------|--------|---------------|--------|
| TCK-012 | frontend-engineer | 90 | Landing page (hero, navbar, planos) |
| TCK-013 | frontend-engineer | 90 | Landing page (depoimentos, sobre, CTA, footer) |
| TCK-014 | frontend-engineer | 85 | Portfolio page (grid, posters) |
| TCK-015 | frontend-engineer | 85 | Portfolio page (expandable card, episodes) |
| TCK-016 | frontend-engineer | 80 | Portfolio page (player modal, programa/[slug]) |
| TCK-017 | frontend-engineer | 85 | Admin layout & navigation |
| TCK-018 | frontend-engineer | 85 | Admin dashboard & KPIs |

**Gate:** Todas as páginas renderizando corretamente. Fluxos principais funcionando.

### Wave 4: Admin CRUD
| Ticket | Agente | Independência | Escopo |
|--------|--------|---------------|--------|
| TCK-019 | frontend-engineer | 85 | Admin podcast CRUD |
| TCK-020 | frontend-engineer | 85 | Admin episode CRUD |
| TCK-021 | frontend-engineer | 80 | Admin analytics dashboard |

**Gate:** CRUDs funcionais. Dados persistindo corretamente.

### Wave 5: Integração & Polish
| Ticket | Agente | Independência | Escopo |
|--------|--------|---------------|--------|
| TCK-022 | backend-engineer | 85 | Analytics & event tracking |
| TCK-023 | frontend-engineer | 90 | SEO, metadata, sitemap |
| TCK-024 | qa-engineer | 80 | E2E tests, a11y, performance |
| TCK-025 | devops-engineer | 90 | Deploy, CI/CD, monitoring |

**Gate:** Lighthouse >= 90. Testes passando. Deploy em produção.

## Caminho Crítico

```
TCK-001 (tokens) ──┐
TCK-002 (schema) ──┼──> TCK-005 (podcast API) ──┐
TCK-003 (contracts)─┘                             ├──> TCK-012..018 (pages) ──> TCK-019..021 (admin) ──> TCK-022..025 (polish)
TCK-004 (auth) ────────────────────────────────────┘
```

## Gargalos
1. TCK-004 (auth) — bloqueia admin e APIs protegidas
2. TCK-005 (podcast API) — bloqueia frontend de portfolio
3. TCK-009 (shared components) — bloqueia todas as páginas

## Estratégia de Release
- Wave 0-1: Preview branch (infra + backend)
- Wave 2-3: Preview branch (frontend público)
- Wave 4: Preview branch (admin completo)
- Wave 5: Production deploy

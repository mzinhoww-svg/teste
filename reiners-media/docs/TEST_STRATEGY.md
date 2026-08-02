# Test Strategy — Reiners Media Podcast Studio

## 1. Pirâmide de Testes

```
      /\
     /  \
    / E2E \        ~5%  (fluxos críticos)
   /--------\
  / Integration \  ~15% (APIs, contratos)
 /----------------\
/     Unit Tests    \ ~80% (lógica, componentes)
------------------------
```

## 2. Testes Unitários

### Framework
- Vitest (substitui Jest, compatível com Vite/Next.js)
- @testing-library/react para componentes
- @testing-library/jest-dom para matchers

### Cobertura Mínima
- Lógica de negócio: >= 80%
- Utilitários: >= 90%
- Componentes UI: >= 60%

### Comando
```bash
pnpm test:unit
```

### Exemplos
- Parser de URL YouTube/Spotify
- Validação de slug
- Cálculo de paginação
- Formatação de duração

## 3. Testes de Integração

### Framework
- Vitest + node:test para APIs
- Supabase test client (emulador local)

### Escopo
- CRUD de podcasts via Route Handlers
- CRUD de episódios
- Upload de imagens
- Autenticação (login/logout)
- Autorização (role-based)

### Comando
```bash
pnpm test:integration
```

### Fixtures
- Banco de teste isolado (Supabase local ou schema separado)
- Dados de seed para cada suite
- Cleanup automático após cada teste

## 4. Testes de Contrato

### Framework
- Zod schemas como contratos
- Validação de request/response em cada endpoint

### Escopo
- Todos os endpoints REST
- Validação de tipos de entrada e saída
- Validação de erros

### Comando
```bash
pnpm test:contract
```

## 5. Testes End-to-End

### Framework
- Playwright

### Fluxos Críticos
1. Visitante navega landing -> portfolio -> expande card -> reproduz episódio
2. Admin faz login -> cria podcast -> adiciona episódio -> visualiza analytics
3. Mobile: swipe carrossel -> tap poster -> modal embed

### Comando
```bash
pnpm test:e2e
```

### Configuração
- Base URL: http://localhost:3000
- 3 browsers: Chromium, Firefox, WebKit
- Viewports: mobile (375x667), tablet (768x1024), desktop (1280x720)

## 6. Testes de Regressão

- Screenshot comparison via Playwright
- Executados antes de cada release
- Threshold: 0.2% de diferença permitida

## 7. Testes de Segurança

- OWASP ZAP (scan automatizado)
- npm audit
- Dependabot alerts
- Verificação de CSP headers

## 8. Testes de Performance

- Lighthouse CI
- Web Vitals monitoring
- Budgets:
  * FCP < 1.8s
  * LCP < 2.5s
  * TTI < 3.5s
  * CLS < 0.1

## 9. Testes de Acessibilidade

- axe-core via @axe-core/react
- Lighthouse a11y audit
- Testes de keyboard navigation
- Screen reader testing (NVDA/VoiceOver)

## 10. Testes de Migração

- Up/down migrations testadas em banco limpo
- Seed script testado em banco vazio
- Rollback testado em banco com dados

## 11. Fixtures

```typescript
// tests/fixtures/podcast.ts
export const podcastFixture = {
  title: "Horizonte Digital",
  slug: "horizonte-digital",
  description: "Podcast sobre tecnologia",
  category: "Tecnologia",
  status: "ACTIVE",
  visualStyle: "PHOTO_REAL",
  year: 2024,
  hosts: [{ name: "Marcos Reiners", initial: "MR" }],
  socialLinks: { instagram: "#", twitter: "#" }
};
```

## 12. Dados de Teste

- Banco de teste separado (DATABASE_URL_TEST)
- Seed automático antes de cada suite
- Cleanup após cada teste (transaction rollback)

## 13. Ambientes

| Ambiente | Finalidade | Dados |
|----------|-----------|-------|
| Local | Desenvolvimento | Seed |
| CI | Testes automatizados | Seed + fixtures |
| Preview | Validação PR | Seed |
| Staging | Pré-produção | Dados reais anonimizados |
| Production | Produção | Dados reais |

## 14. Quality Gates

| Gate | Critério | Bloqueante |
|------|----------|------------|
| Unit | >= 80% coverage | Sim |
| Integration | Todas as APIs passam | Sim |
| Contract | Todos os schemas validam | Sim |
| E2E | 5 fluxos críticos passam | Sim |
| Lighthouse | >= 90 em todos | Sim |
| Security | npm audit sem críticas | Sim |
| A11y | WCAG 2.2 AA | Sim |

## 15. Responsabilidade

| Tipo | Responsável |
|------|-------------|
| Unit | Desenvolvedor do ticket |
| Integration | Desenvolvedor do ticket |
| Contract | Desenvolvedor do ticket |
| E2E | QA Engineer / Dev |
| Regressão | QA Engineer |
| Security | Security Reviewer |
| Performance | DevOps / Dev |
| A11y | Frontend Engineer |

## 16. Estratégia de Testes Paralelos

- Unit tests: paralelo por arquivo (Vitest nativo)
- Integration: paralelo por suite (bancos isolados)
- E2E: paralelo por worker (Playwright nativo)
- Máximo 4 workers em CI

## 17. Comandos

```bash
# Todos os testes
pnpm test

# Unit apenas
pnpm test:unit

# Integration apenas
pnpm test:integration

# E2E apenas
pnpm test:e2e

# Com watch
pnpm test:unit --watch

# Com coverage
pnpm test:unit --coverage

# E2E UI mode
pnpm test:e2e --ui
```

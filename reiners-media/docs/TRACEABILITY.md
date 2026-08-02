# Traceability Matrix — Reiners Media Podcast Studio

## Legenda
- [ ] = Não iniciado
- [~] = Em progresso
- [x] = Concluído

## Requisito -> Ticket -> Teste -> Status

| Requisito | Ticket | Teste Unit | Teste Integration | Teste E2E | Status |
|-----------|--------|------------|-------------------|-----------|--------|
| FR-001 | TCK-001 | tokens.test.ts | - | - | [ ] |
| FR-002 | TCK-002 | schema.test.ts | migration.test.ts | - | [ ] |
| FR-003 | TCK-005 | podcasts-api.test.ts | podcasts.integration.ts | - | [ ] |
| FR-004 | TCK-006 | episodes-api.test.ts | episodes.integration.ts | - | [ ] |
| FR-005 | TCK-004 | auth.test.ts | auth.integration.ts | login.e2e.ts | [ ] |
| FR-006 | TCK-004 | middleware.test.ts | middleware.integration.ts | - | [ ] |
| FR-007 | TCK-005 | upload.test.ts | upload.integration.ts | - | [ ] |
| FR-008 | TCK-012,013,014 | components.test.tsx | - | landing.e2e.ts | [ ] |
| FR-009 | TCK-015 | poster.test.tsx | - | portfolio.e2e.ts | [ ] |
| FR-010 | TCK-016 | expandable.test.tsx | - | portfolio.e2e.ts | [ ] |
| FR-011 | TCK-017 | modal.test.tsx | - | player.e2e.ts | [ ] |
| FR-012 | TCK-016 | page.test.tsx | - | programa.e2e.ts | [ ] |
| FR-013 | TCK-018,019 | admin-components.test.tsx | admin.integration.ts | admin.e2e.ts | [ ] |
| FR-014 | TCK-020 | episode-form.test.tsx | - | admin.e2e.ts | [ ] |
| FR-015 | TCK-021 | analytics.test.ts | - | - | [ ] |
| FR-016 | TCK-022 | events.test.ts | events.integration.ts | - | [ ] |
| FR-017 | TCK-022 | ga4.test.ts | - | - | [ ] |
| FR-018 | TCK-023 | seo.test.ts | - | seo.e2e.ts | [ ] |
| FR-019 | TCK-023 | sitemap.test.ts | - | - | [ ] |
| FR-020 | TCK-002 | seed.test.ts | - | - | [ ] |
| NFR-001 | TCK-024 | - | performance.test.ts | lighthouse.e2e.ts | [ ] |
| NFR-002 | TCK-024 | a11y.test.tsx | - | a11y.e2e.ts | [ ] |
| NFR-003 | TCK-024 | responsive.test.tsx | - | responsive.e2e.ts | [ ] |
| NFR-004 | TCK-023 | seo.test.ts | - | seo.e2e.ts | [ ] |
| NFR-005 | TCK-004 | security.test.ts | security.integration.ts | - | [ ] |
| NFR-006 | TCK-001 | types.test.ts | - | - | [ ] |
| NFR-007 | TCK-024 | coverage.test.ts | - | - | [ ] |
| NFR-008 | TCK-025 | - | - | deploy.e2e.ts | [ ] |
| NFR-009 | TCK-022 | observability.test.ts | - | - | [ ] |
| NFR-010 | TCK-001 | i18n.test.ts | - | - | [ ] |

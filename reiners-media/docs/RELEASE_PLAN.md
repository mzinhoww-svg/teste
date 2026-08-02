# Release Plan — Reiners Media Podcast Studio

## 1. Versões

### v1.0.0 — MVP
- Landing page completa
- Portfolio page com grid e cards expansíveis
- Admin com auth, CRUD podcasts/episódios
- Analytics interno + GA4
- 5 programas seed

### v1.1.0 — Polish
- SEO avançado (sitemap, OG tags)
- Performance optimization
- Acessibilidade completa
- Testes E2E

### v1.2.0 — Features
- Sistema de planos
- Newsletter integration
- Multi-idioma

## 2. Estratégia de Branch

```
main (produção)
  └── develop (integração)
        └── feature/TCK-001-design-tokens
        └── feature/TCK-002-prisma-schema
        └── ...
```

## 3. Pipeline de CI/CD

### GitHub Actions / Vercel
1. Push -> Preview Deploy
2. PR -> Preview Deploy + Tests
3. Merge develop -> main -> Production Deploy

### Steps
1. Checkout
2. Setup Node.js
3. Install dependencies
4. Lint
5. Type check
6. Unit tests
7. Integration tests
8. Build
9. Deploy (preview ou production)

## 4. Checklist de Pré-Release

- [ ] Todos os tickets P0 concluídos
- [ ] Testes passando (unit + integration)
- [ ] Lighthouse score >= 90
- [ ] npm audit sem vulnerabilidades críticas
- [ ] Documentação atualizada
- [ ] Seed script testado
- [ ] Rollback plan validado
- [ ] Analytics configurado

## 5. Checklist de Go-Live

- [ ] Deploy para produção
- [ ] Health check passando
- [ ] Smoke tests em produção
- [ ] Analytics recebendo eventos
- [ ] Monitoramento ativo
- [ ] Comunicação ao time

## 6. Comunicação

- Slack: #releases
- Email: stakeholders
- LinkedIn: anúncio público
- Newsletter: digest para assinantes

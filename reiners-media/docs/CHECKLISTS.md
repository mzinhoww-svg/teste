# Checklists — Reiners Media Podcast Studio

## Discovery
- [ ] Problema validado com stakeholders
- [ ] Personas definidas
- [ ] JTBD mapeados
- [ ] Concorrência analisada
- [ ] Métricas de sucesso definidas

## Produto
- [ ] PRD aprovado
- [ ] Escopo MVP congelado
- [ ] Requisitos P0 cobertos por tickets
- [ ] Critérios de aceitação testáveis
- [ ] Estratégia de rollback definida

## UX
- [ ] Design system documentado
- [ ] Tokens semânticos definidos
- [ ] Componentes com 7 estados
- [ ] Responsividade testada (320px, 768px, 1024px, 1440px)
- [ ] Acessibilidade: focus, contrast, keyboard, ARIA
- [ ] prefers-reduced-motion respeitado
- [ ] Empty states definidos
- [ ] Error states definidos
- [ ] Loading states definidos

## Arquitetura
- [ ] Diagrama Mermaid atualizado
- [ ] Contratos estabilizados
- [ ] APIs documentadas (OpenAPI)
- [ ] Modelo de dados validado
- [ ] Decisões técnicas registradas
- [ ] Alternativas rejeitadas documentadas

## Backend
- [ ] Schema Prisma validado
- [ ] Migrations testadas (up/down)
- [ ] APIs RESTful implementadas
- [ ] Rate limiting ativo
- [ ] Input validation (Zod)
- [ ] Error handling consistente
- [ ] Logging estruturado

## Frontend
- [ ] Design tokens aplicados
- [ ] Componentes reutilizáveis criados
- [ ] Server/Client Components corretos
- [ ] Lazy loading implementado
- [ ] Imagens otimizadas (Next Image)
- [ ] Meta tags dinâmicas
- [ ] ISR configurado

## Dados
- [ ] Seed script funcional
- [ ] Índices definidos
- [ ] Soft delete implementado
- [ ] RLS configurado (Supabase)
- [ ] Backup automático

## Integrações
- [ ] Supabase Auth funcionando
- [ ] Supabase Storage funcionando
- [ ] GA4 recebendo eventos
- [ ] YouTube embed funcionando
- [ ] Spotify embed funcionando

## Segurança
- [ ] CSP headers configurados
- [ ] Rate limiting ativo
- [ ] Input sanitization
- [ ] File upload validation
- [ ] Secrets não expostos
- [ ] npm audit passou

## Privacidade
- [ ] Cookie consent (se necessário)
- [ ] Dados pessoais minimizados
- [ ] Política de privacidade

## Acessibilidade
- [ ] WCAG 2.2 AA validado
- [ ] Focus visible em todos os interativos
- [ ] Touch targets >= 44x44px
- [ ] Heading hierarchy sem saltos
- [ ] Alt text em imagens
- [ ] ARIA labels em ícones
- [ ] Skip link presente
- [ ] Screen reader testado

## Performance
- [ ] Lighthouse >= 90
- [ ] FCP < 1.8s
- [ ] LCP < 2.5s
- [ ] TTI < 3.5s
- [ ] CLS < 0.1
- [ ] Bundle size auditado
- [ ] Imagens otimizadas
- [ ] Fonts otimizadas

## Observabilidade
- [ ] Logs estruturados
- [ ] Web Vitals tracking
- [ ] EventLog funcionando
- [ ] Dashboard admin com métricas
- [ ] Alertas configurados

## Infraestrutura
- [ ] Vercel project configurado
- [ ] Supabase project configurado
- [ ] Variáveis de ambiente setadas
- [ ] Preview deploys funcionando
- [ ] Domínio configurado

## Banco de Dados
- [ ] Migrations aplicadas em produção
- [ ] Seed executado em staging
- [ ] Índices criados
- [ ] RLS habilitado
- [ ] Backup configurado

## Testes
- [ ] Unit tests >= 80% coverage
- [ ] Integration tests passando
- [ ] Contract tests passando
- [ ] E2E tests passando (5 fluxos críticos)
- [ ] A11y tests passando
- [ ] Performance tests passando
- [ ] Security tests passando

## Revisão de Código
- [ ] Revisão independente concluída
- [ ] Sem alterações fora de write_paths
- [ ] Sem credenciais no código
- [ ] Sem console.log em produção
- [ ] Documentação atualizada

## CI/CD
- [ ] GitHub Actions configurado
- [ ] Lint passando
- [ ] Type check passando
- [ ] Tests passando
- [ ] Build passando
- [ ] Preview deploy automático

## Preparação de Release
- [ ] CHANGELOG.md atualizado
- [ ] Versão bumpada
- [ ] Tag Git criada
- [ ] Rollback plan validado
- [ ] Comunicação preparada

## Go-Live
- [ ] Deploy em produção
- [ ] Health check passando
- [ ] Smoke tests em produção
- [ ] Analytics recebendo eventos
- [ ] Monitoramento ativo

## Rollback
- [ ] Tag anterior identificada
- [ ] Rollback testado em staging
- [ ] Comunicação de rollback preparada

## Pós-Release
- [ ] Métricas monitoradas por 7 dias
- [ ] Feedback dos usuários coletado
- [ ] Bugs críticos corrigidos
- [ ] Post-mortem se necessário

## Documentação
- [ ] README.md atualizado
- [ ] API docs atualizadas
- [ ] Admin guide criado
- [ ] Onboarding documentado

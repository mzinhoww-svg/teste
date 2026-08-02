# Risks — Reiners Media Podcast Studio

| ID | Risco | Probabilidade | Impacto | Mitigação | Owner | Status |
|----|-------|---------------|---------|-----------|-------|--------|
| RSK-001 | Supabase indisponível | Baixa | Alto | Cache local, retry logic, fallback estático | TCK-002 | Monitorado |
| RSK-002 | Imagens de capa não entregues | Média | Médio | Placeholders CSS gerados automaticamente | TCK-005 | Mitigado |
| RSK-003 | Performance mobile lenta | Média | Médio | Lazy loading, otimização de imagens, ISR | TCK-024 | Monitorado |
| RSK-004 | SEO não indexa corretamente | Baixa | Médio | Sitemap, meta tags dinâmicas, ISR, robots.txt | TCK-023 | Mitigado |
| RSK-005 | Conflitos entre agentes paralelos | Média | Alto | Sistema de tickets com write_paths exclusivos, ondas sequenciais | Orchestrator | Mitigado |
| RSK-006 | Dependências circulares entre tickets | Baixa | Alto | DAG validado, contratos primeiro, revisão de arquiteto | TCK-001 | Mitigado |
| RSK-007 | Stack tecnológica muda durante MVP | Baixa | Alto | Congelar stack após Wave 0, feature flags | TCK-001 | Mitigado |
| RSK-008 | Segurança: vazamento de dados | Baixa | Alto | CSP, rate limiting, input sanitization, RLS | TCK-004 | Mitigado |
| RSK-009 | Acessibilidade não atinge AA | Média | Médio | Checklist WCAG, testes automatizados, revisão dedicada | TCK-024 | Monitorado |
| RSK-010 | Prazo de 2 semanas não suficiente | Média | Alto | Escopo congelado, MVP enxuto, features pós-MVP documentadas | Product Manager | Monitorado |

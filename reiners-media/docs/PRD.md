# PRD — Reiners Media Podcast Studio

## 1. Identificação
- **Nome**: Reiners Media Podcast Studio
- **URL**: https://reiners.media
- **Versão**: 1.0 | **Data**: 2026-08-02

## 2. Resumo Executivo
Plataforma web dual (landing page + catálogo Netflix-style + admin) para posicionar o estúdio como referência em produção de podcast no Brasil.

## 3. Contexto Estratégico
O estúdio opera sem presença digital consolidada. A landing page captura leads; o portfólio demonstra capacidade criativa; o admin permite gestão autônoma.

## 4. Problema
- Ausência de site profissional para captação
- Portfólio disperso em plataformas de terceiros
- Atualizações demandam desenvolvedor

## 5. Visão
"O estúdio de podcast mais bem apresentado do Brasil — onde cada programa é uma experiência visual e sonora única."

## 6. Objetivos
- OBJ-001: Conversão visita→lead >= 3% em 30 dias
- OBJ-002: Catálogo com 5 programas e 25 episódios
- OBJ-003: Painel admin funcional para CRUD
- OBJ-004: Lighthouse >= 90 (perf, a11y, SEO)
- OBJ-005: Analytics com event tracking

## 7. Não Objetivos
- Player de áudio nativo (usar embeds)
- Sistema de pagamento online
- App mobile nativo
- Live streaming

## 8. Personas
- **Empreendedor Eduardo**: 35-45, desktop, busca estúdio full-service
- **Ouvinte Ana**: 25-35, mobile, descobre podcasts de nicho
- **Produtor Pedro**: 30-40, tablet/desktop, avalia portfólio

## 9. Requisitos Funcionais
| ID | Requisito | P | Ticket |
|----|-----------|---|--------|
| FR-001 | Design tokens semânticos | P0 | TCK-001 |
| FR-002 | Schema Prisma + seed | P0 | TCK-002 |
| FR-003 | API REST podcasts | P0 | TCK-005 |
| FR-004 | API REST episodes | P0 | TCK-006 |
| FR-005 | Auth Supabase + RBAC | P0 | TCK-004 |
| FR-006 | Middleware proteção /admin | P0 | TCK-004 |
| FR-007 | Upload imagens Supabase | P0 | TCK-005 |
| FR-008 | Landing page (8 seções) | P0 | TCK-011,012 |
| FR-009 | Portfolio grid + posters | P0 | TCK-013 |
| FR-010 | Card expansível inline | P0 | TCK-014 |
| FR-011 | Modal embed YouTube/Spotify | P0 | TCK-015 |
| FR-012 | Página /portfolio/[slug] | P1 | TCK-016 |
| FR-013 | Admin dashboard + CRUD | P0 | TCK-017,018 |
| FR-014 | Admin episode CRUD | P0 | TCK-019 |
| FR-015 | Admin analytics + CSV | P1 | TCK-020 |
| FR-016 | Event tracking interno | P1 | TCK-021 |
| FR-017 | GA4 integration | P1 | TCK-021 |
| FR-018 | SEO dinâmico | P1 | TCK-022 |
| FR-019 | Sitemap + robots | P2 | TCK-022 |
| FR-020 | Seed 5 programas, 25 eps | P0 | TCK-002 |

## 10. Requisitos Não Funcionais
| ID | Requisito | P | Ticket |
|----|-----------|---|--------|
| NFR-001 | FCP < 1.8s, TTI < 3.5s | P0 | TCK-023 |
| NFR-002 | WCAG 2.2 AA | P0 | TCK-023 |
| NFR-003 | Mobile/tablet/desktop | P0 | TCK-023 |
| NFR-004 | SEO meta tags | P1 | TCK-022 |
| NFR-005 | CSP, rate limit, sanitization | P0 | TCK-004 |
| NFR-006 | 100% TypeScript | P0 | TCK-001 |
| NFR-007 | Tests >=80% lógica | P1 | TCK-023 |
| NFR-008 | Vercel deploy + ISR | P0 | TCK-024 |
| NFR-009 | Observabilidade | P1 | TCK-021 |
| NFR-010 | i18n-ready | P2 | TCK-001 |

## 11. Regras de Negócio
| ID | Regra | Ticket |
|----|-------|--------|
| BR-001 | ADMIN gerencia usuários | TCK-004 |
| BR-002 | EDITOR não deleta | TCK-004 |
| BR-003 | Programa precisa >=1 host | TCK-005 |
| BR-004 | Episódio precisa >=1 trilha | TCK-006 |
| BR-005 | Máx 3 programas em destaque | TCK-005 |
| BR-006 | ENDED não aparece em destaques | TCK-005 |
| BR-007 | YouTube URL -> embed ID | TCK-006 |
| BR-008 | Spotify URL -> embed URI | TCK-006 |
| BR-009 | EventLog retém 90 dias | TCK-021 |

## 12. Métricas de Sucesso
- Conversion rate >= 3%
- Tempo médio portfolio >= 2min
- Publicar episódio <= 2min
- Lighthouse >= 90
- Zero bugs críticos

## 13. Estratégia de Lançamento
1. Preview branch -> testes internos
2. Merge main -> produção
3. Anúncio LinkedIn + newsletter
4. Monitoramento 7 dias

## 14. Riscos
| Risco | Impacto | Mitigação |
|-------|---------|-----------|
| Supabase indisponível | Alto | Cache local, retry |
| Imagens não entregues | Médio | Placeholders CSS |
| Mobile lento | Médio | Lazy loading, otimização |
| SEO não indexa | Médio | Sitemap, ISR, meta tags |

## 15. Questões em Aberto
- OPEN-001: Serviço de agendamento do CTA (Calendly?)
- OPEN-002: Imagens de capa prontas ou placeholders?

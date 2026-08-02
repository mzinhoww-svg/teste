# Observability — Reiners Media Podcast Studio

## 1. Logs

### Estrutura
```json
{
  "timestamp": "2026-08-02T10:00:00Z",
  "level": "info",
  "service": "reiners-media",
  "traceId": "uuid",
  "spanId": "uuid",
  "message": "Podcast created",
  "context": { "podcastId": "uuid", "userId": "uuid" }
}
```

### Níveis
- ERROR: falhas de API, exceções não tratadas
- WARN: rate limiting, validações falhas
- INFO: operações de negócio (CRUD, login)
- DEBUG: desenvolvimento local apenas

### Destino
- Desenvolvimento: console
- Produção: Vercel Logs (nativo)
- Futuro: Datadog / Logtail

## 2. Métricas

### Web Vitals (via next/script)
- LCP (Largest Contentful Paint)
- FID (First Input Delay)
- CLS (Cumulative Layout Shift)
- FCP (First Contentful Paint)
- TTFB (Time to First Byte)

### Métricas de Negócio
- page_view por página
- card_expand por programa
- youtube_click / spotify_click por episódio
- cta_click por localização
- admin_login por dia
- episode_create por dia

### Métricas de Sistema
- Request count por endpoint
- Error rate por endpoint
- P95/P99 latency
- Database connection pool usage

## 3. Traces

- Next.js App Router trace automático
- Prisma query logging (dev apenas)
- Custom spans para operações críticas

## 4. Eventos de Negócio

| Evento | Payload | Fonte |
|--------|---------|-------|
| page_view | {path, referrer, userAgent} | Client |
| card_expand | {podcastId, source} | Client |
| youtube_click | {episodeId, podcastId} | Client |
| spotify_click | {episodeId, podcastId} | Client |
| cta_click | {ctaId, location} | Client |
| admin_login | {userId, role} | Server |
| episode_create | {episodeId, podcastId} | Server |

## 5. Alertas

| Condição | Severidade | Ação |
|----------|------------|------|
| Error rate > 5% | P1 | PagerDuty / Email |
| P95 latency > 2s | P2 | Slack |
| Database connections > 80% | P1 | PagerDuty |
| Failed logins > 10/min | P2 | Slack |

## 6. Dashboards

### Admin Dashboard
- Visitas por página (últimos 7/30 dias)
- Programas mais clicados
- Episódios mais reproduzidos
- Dispositivos (mobile/desktop)
- Fontes de tráfego

### System Dashboard
- Request volume
- Error rate
- Latency percentiles
- Database health

## 7. SLOs

| SLO | Target | Janela |
|-----|--------|--------|
| Uptime | 99.9% | 30 dias |
| P95 latency | < 500ms | 7 dias |
| Error rate | < 1% | 7 dias |
| LCP | < 2.5s | 7 dias |

## 8. SLIs

- Uptime: health check /api/health
- Latency: P95 de todas as requests
- Error rate: 5xx / total requests
- LCP: Web Vitals API

## 9. Error Budget

- Budget: 0.1% de erro em 30 dias (~43 min)
- Quando esgotado: freeze de features, foco em estabilidade

## 10. Identificadores de Correlação

- traceId: gerado no edge, propagado em todas as requests
- spanId: identifica operação específica
- userId: identifica usuário (quando autenticado)
- sessionId: identifica sessão

## 11. Monitoramento Pós-Release

- 7 dias de monitoramento intensivo
- Comparação de métricas com baseline
- Alertas sensíveis (thresholds mais baixos)
- Canal dedicado para reporte de issues

## 12. Critérios de Rollback

- Error rate > 5% por 5 minutos
- P95 latency > 2x baseline por 10 minutos
- Qualquer incidente de segurança
- Degradação de funcionalidade crítica

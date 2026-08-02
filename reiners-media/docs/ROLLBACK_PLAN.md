# Rollback Plan — Reiners Media Podcast Studio

## 1. Estratégia

### Git Tags
- Cada deploy cria tag automaticamente: `v1.0.0-20260802-120000`
- Rollback: `git checkout <tag-anterior>`

### Vercel
- Production Deployments list
- Revert to previous deployment (< 2 min)

### Banco de Dados
- Migrations reversíveis (down scripts)
- Backup automático antes de deploy
- Seed script para recriar dados se necessário

## 2. Procedimento de Rollback

### Passo a passo
1. Identificar problema (logs, métricas, alertas)
2. Avaliar severidade (P1 = rollback imediato)
3. Reverter deploy na Vercel
4. Reverter migrations (prisma migrate down)
5. Restaurar backup se necessário
6. Validar health check
7. Comunicar stakeholders
8. Post-mortem em 48h

### Comandos
```bash
# Reverter deploy na Vercel
vercel --prod --prebuilt

# Reverter migration
npx prisma migrate resolve --rolled-back <migration-name>

# Restaurar backup (se necessário)
# Supabase dashboard -> Backups -> Restore
```

## 3. Feature Flags

Funcionalidades de alto risco devem estar protegidas por feature flags:
- Analytics avançado
- Novos tipos de embed
- Admin features experimentais

## 4. Critérios de Rollback Automático

- Error rate > 5% por 5 minutos
- P95 latency > 2x baseline por 10 minutos
- Health check falhando por 3 minutos

## 5. Testes de Rollback

- Executar rollback em staging antes de cada release
- Validar que dados não são perdidos
- Validar que funcionalidade básica continua operando

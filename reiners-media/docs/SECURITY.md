# Security — Reiners Media Podcast Studio

## Modelo de Ameaças

### Ativos
- Dados de podcasts e episódios (conteúdo público)
- Credenciais de admin (sensível)
- Analytics/EventLog (semi-sensível)
- Imagens de upload (público)

### Fronteiras de Confiança
- Browser (não confiável)
- Vercel Edge (confiável)
- Supabase (confiável)
- Admin browser (semi-confiável)

## Autenticação
- Supabase Auth com email/password
- JWT em cookie httpOnly, secure, SameSite=strict
- Expiração: 24h
- Refresh token automático

## Autorização
- Role-based: ADMIN, EDITOR
- Middleware verifica sessão em /admin/*
- APIs verificam role para operações sensíveis

## Gestão de Segredos
- Nunca commitar .env, secrets, tokens
- Usar Vercel Environment Variables
- Supabase anon key exposta no cliente (segura por RLS)
- Service role key apenas no servidor

## Proteção de Dados
- Upload validado: max 5MB, tipos image/jpeg|png|webp
- Input sanitization em descrições (DOMPurify)
- Rate limiting: 100 req/min por IP em APIs públicas
- CSP headers: default-src 'self', script-src 'self' 'unsafe-inline'

## Validação de Entrada
- Todos os endpoints validam body com Zod
- Slugs validados contra padrão [a-z0-9-]+
- URLs validadas com regex antes de parse
- JSON schemas estritos

## Logging Seguro
- Nunca logar senhas, tokens, PII
- EventLog registra apenas eventos de negócio
- Logs de erro sem stack traces em produção

## Dependências
- Auditar com `npm audit` antes de cada release
- Pin versions em package.json
- Usar apenas pacotes com >10k downloads/semana

## Rate Limiting
- APIs públicas: 100 req/min por IP
- APIs admin: 60 req/min por usuário
- Upload: 10 req/min por IP

## Proteção contra Abuso
- ReCAPTCHA v3 em formulários públicos (futuro)
- Honeypot fields em forms
- Bloqueio de IPs após 5 tentativas de login falhas

## Resposta a Incidentes
1. Identificar escopo
2. Reverter deploy (tag anterior)
3. Notificar stakeholders
4. Investigar logs
5. Aplicar correção
6. Post-mortem em 48h

## Checklist de Release
- [ ] npm audit passou
- [ ] Nenhum segredo em código
- [ ] CSP headers configurados
- [ ] Rate limiting ativo
- [ ] RLS habilitado no Supabase
- [ ] Variáveis de ambiente configuradas na Vercel

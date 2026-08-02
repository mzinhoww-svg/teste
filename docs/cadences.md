# Cadências automáticas

Regras por tenant/pipeline na tabela `cadence_rules`:
- `trigger_type=stalled_days`: deal parado `days` dias no estágio `stage_key`.
- `action`: `notify` (cria notificação), `suggest_whatsapp` (notificação com
  template de WhatsApp sugerido) ou `run_agent` (executa `agent_kind`).

## Como roda

### notify / suggest_whatsapp — pg_cron (Supabase), já configurado
Função `public.cadence_sweep()` agendada em `crm-cadence-sweep` (a cada hora).
Cria notificações idempotentes (1x/dia por regra+deal). Não requer nada externo.

### run_agent — Vercel Cron + service role
Endpoint protegido `GET /api/cron/cadences` (header `Authorization: Bearer $CRON_SECRET`).
Requer `SUPABASE_SERVICE_ROLE_KEY` (rodar agentes sem sessão de usuário). Sem ela,
o endpoint responde 200 com uma nota e não processa — as demais cadências seguem
funcionando via pg_cron.

Configurar no `vercel.json`:
```json
{ "crons": [{ "path": "/api/cron/cadences", "schedule": "0 9 * * *" }] }
```
E as env vars na Vercel: `CRON_SECRET` (string aleatória) e
`SUPABASE_SERVICE_ROLE_KEY` (Supabase → Project Settings → API → service_role).
A Vercel envia o header `Authorization: Bearer <CRON_SECRET>` automaticamente
quando `CRON_SECRET` está definido.

## Cadências semeadas para a Reiners
72h sem contato · proposta 48h (WhatsApp) · 5d (ligação) · 10d (último contato) ·
negociação parada (agente) · fechado→onboarding · evento próximo · entregue→upsell ·
perdido→retorno 30d. Ver `docs/reiners-media-seed.md`.

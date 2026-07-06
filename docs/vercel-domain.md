# Deploy na Vercel e domínio próprio

## Deploy

O projeto é um app Next.js 14 (App Router) e faz deploy na Vercel via
integração com o GitHub. O `vercel.json` já define framework, comandos de
build/install e o cron diário.

### Variáveis de ambiente na Vercel

Em **Project → Settings → Environment Variables**, configure (ver `.env.example`
para a lista completa):

| Variável | Uso |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Banco + auth (obrigatórias). |
| `SUPABASE_SERVICE_ROLE_KEY` | Webhook do OpenSign escreve status ignorando RLS. |
| `OPENROUTER_API_KEY`, `OPENROUTER_MODEL` | IA dos agentes (GLM 5.2). |
| `NEXT_PUBLIC_APP_URL` | URL pública canônica (convites, callback do OpenSign). |
| `OPENSIGN_*` | Assinatura digital — ver `docs/opensign.md`. |
| `CRON_SECRET` | Protege a rota de cron. |
| `PLATFORM_ADMIN_EMAILS` | Fallback de admin da plataforma — ver `docs/admin.md`. |

### Branch de produção

A branch de produção fica em **Settings → Environments → Production → Branch**.
Aponte para a branch que deve virar o site em produção. Deploys de outras
branches viram **Preview** (URL própria por commit, útil para testar antes de
promover).

## Domínio próprio

1. Em **Project → Settings → Domains**, clique **Add** e informe o domínio
   (ex.: `crm.suaempresa.com` ou o apex `suaempresa.com`).
2. A Vercel mostra os registros DNS a criar no seu provedor:
   - **Subdomínio** (`crm.`): um registro `CNAME` apontando para
     `cname.vercel-dns.com`.
   - **Apex** (`suaempresa.com`): um registro `A` para o IP indicado pela
     Vercel (ou `ALIAS`/`ANAME` se o provedor suportar).
3. Aguarde a propagação do DNS. A Vercel emite o certificado TLS
   (Let's Encrypt) automaticamente — o HTTPS passa a valer sem configuração
   extra.
4. Defina o domínio como **Primary** para que os demais redirecionem para ele.

### Depois de configurar o domínio

- Atualize `NEXT_PUBLIC_APP_URL` para `https://seu-dominio` e refaça o deploy —
  isso garante links de convite e o callback do OpenSign com a URL correta.
- No painel do OpenSign, ajuste o webhook para
  `https://seu-dominio/api/webhooks/opensign`.

## Cron (cadências)

O `vercel.json` agenda `/api/cron/cadences` **diariamente** (`0 9 * * *`) — o
plano Hobby só permite cron diário. As cadências de hora em hora rodam pelo
`pg_cron` no Supabase (jobs `crm-cadence-sweep` e `crm-sla-sweep`). Em um plano
pago, é possível aumentar a frequência do cron da Vercel.

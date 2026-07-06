# E-mail transacional (Brevo)

O CRM envia e-mails transacionais pelo **Brevo** (ex-Sendinblue) via HTTP puro
(sem SDK), no mesmo padrão dos demais adapters (`lib/signature/provider.ts`,
`lib/whatsapp-bridge.ts`). Sem `BREVO_API_KEY`, cai num **provider mock** que não
faz rede — o app sobe e os fluxos funcionam em dev/CI, apenas não enviam de verdade.

## Arquitetura

| Arquivo | Papel |
| --- | --- |
| `lib/email/provider.ts` | Adapter Brevo + mock; `getEmailProvider()` / `sendEmail()`. |
| `lib/email/templates.ts` | HTML dos e-mails, tematizado pela marca do tenant (`orgs.settings.brand`). |
| `lib/email/send.ts` | `sendAndLogEmail()` — envia e grava em `messages` (channel `email`). |
| `app/api/webhooks/brevo/route.ts` | Recebe eventos (entregue/aberto/bounce) e atualiza `messages.status`. |
| `supabase/migrations/0011_email_log.sql` | Colunas `subject`/`to_email`/`meta` em `messages` + ação `send_email` nas cadências. |

Cada envio vira uma linha em `messages` com `external_id` = messageId do Brevo; o
webhook casa por esse id e atualiza o status (`enviado` → `entregue` → `aberto`…).

## Fluxos ligados
- **Convite de membro** (`createInvite`): envia o link `/convite/[token]` por e-mail.
- **Proposta** (`sendProposalEmail`): link `/proposta/[token]` + PDF anexo. Botão
  "E-mail" no painel de propostas do drawer do lead.
- **Contrato** (`sendContractForSignature`): e-mail aos signatários com o link
  `/sign/contracts/[token]` (dispara junto do "Preparar assinatura").
- **Cadências** (`/api/cron/cadences`): regras com `action = 'send_email'` mandam
  follow-up aos contatos de deals parados no estágio.
- **Portal / Fatura**: builders `portalInviteEmail` / `invoiceEmail` prontos; o
  wiring entra quando os módulos de portal do cliente e financeiro existirem.

## 1. Verificar o domínio no Brevo (obrigatório antes de enviar como sua marca)
Em **Brevo → Senders, Domains & Dedicated IPs**:
1. Adicione seu domínio (ex.: `reiners.agency`).
2. Publique no DNS os registros **SPF, DKIM e DMARC** mostrados pelo Brevo.
3. Crie um remetente verificado (ex.: `contato@reiners.agency`).

Sem isso, a entrega falha ou cai em spam. No plano **free** há limite de **300
e-mails/dia**.

## 2. Variáveis de ambiente na Vercel
**Project → Settings → Environment Variables** (escopo Production; Preview se quiser
testar em previews) → **Redeploy**:

| Variável | Valor |
| --- | --- |
| `BREVO_API_KEY` | chave `xkeysib-…` (Brevo → SMTP & API → API Keys). |
| `BREVO_SENDER_EMAIL` | remetente verificado (ex.: `contato@reiners.agency`). |
| `BREVO_SENDER_NAME` | nome do remetente (ex.: `Reiners Media`). |
| `BREVO_REPLY_TO` | e-mail de resposta (opcional). |
| `BREVO_WEBHOOK_SECRET` | segredo próprio p/ validar o webhook. |
| `NEXT_PUBLIC_APP_URL` | URL pública canônica (links dos e-mails). |

## 3. Webhook de eventos
Em **Brevo → Transactional → Settings → Webhook**, aponte para:

```
https://SEU-APP/api/webhooks/brevo?secret=SEU_BREVO_WEBHOOK_SECRET
```

Marque os eventos desejados (delivered, opened, click, hard/soft bounce, spam).
O webhook exige `SUPABASE_SERVICE_ROLE_KEY` para persistir status (escreve sem
sessão de usuário).

## 4. E-mails de autenticação via Brevo (SMTP no Supabase)
Para que confirmação de conta, reset de senha e magic links saiam pelo Brevo com a
marca — **Supabase → Authentication → Emails → SMTP Settings → Enable Custom SMTP**:

| Campo | Valor |
| --- | --- |
| Host | `smtp-relay.brevo.com` |
| Port | `587` |
| Username | login SMTP do Brevo (ex.: `xxxxx@smtp-brevo.com`) |
| Password | SMTP key do Brevo (Brevo → SMTP & API → SMTP) |
| Sender email / name | `contato@reiners.agency` / `Reiners Media` |

Personalize os templates de Auth (confirmação, recuperação, magic link) com a marca.

## Teste rápido
1. **Sem key**: `npm run dev`; dispare um convite → o CRM registra em `messages`
   (`status: enviado`, provider `mock`), sem rede.
2. **Com key**: setar `BREVO_API_KEY` + remetente verificado; enviar proposta a um
   e-mail de teste; conferir recebimento e o `external_id` em `messages`.
3. **Webhook**: abrir o e-mail e ver `messages.status` virar `aberto`.

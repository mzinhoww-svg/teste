# WhatsApp Bridge (leitura de conversas)

O CRM lê conversas de WhatsApp por lead para alimentar os agentes — via um
**serviço externo self-hosted** (WPPConnect ou Baileys). Não usamos Meta Cloud
API, Twilio nem WhatsApp oficial. **Nenhum envio é automático**: enquanto o
bridge não estiver ativo, o contato é sempre manual por `wa.me`.

> Importante: um bridge de WhatsApp precisa de **processo persistente** e sessão
> ativa — por isso **NÃO roda na Vercel** (serverless). Ele é um serviço externo
> que fala com o CRM por REST + webhook.

## Arquitetura (adapter-based)

- `lib/whatsapp-bridge.ts` — interface `WhatsAppProvider` e três providers:
  - `wa_me` (padrão): apenas gera link `wa.me`; não lê conversa.
  - `bridge`: fala com o serviço externo (REST para histórico) e valida o
    segredo do webhook.
  - `fake`: para testes, sem rede.
- `lib/lead-comm-context.ts` — `getLeadCommunicationContext(orgId, dealId,
  contactId)` junta timeline do CRM + últimas mensagens da thread (limitado por
  `WHATSAPP_READ_MAX_MESSAGES`), sempre **escopado por org**.
- `app/api/whatsapp/webhook` — recebe eventos do bridge, valida o segredo,
  resolve a org pela conexão (`instance_id`) e grava por org/thread/contato/deal
  (via service role). Sem service role, apenas confirma o recebimento.
- Execução dos agentes injeta o bloco `CONVERSA_WHATSAPP_DO_LEAD` no prompt
  quando há conversa, e marca `whatsappUsed` em `agent_runs`.

## Tabelas (migration 0006)

`whatsapp_connections`, `whatsapp_threads`, `whatsapp_messages`,
`whatsapp_sync_events` — todas com RLS por `org_id` (um membro só vê a conversa
da sua org). O webhook grava com service role e resolve a org pela conexão.

## Variáveis de ambiente

```
WHATSAPP_PROVIDER=wa_me | bridge | fake
WHATSAPP_BRIDGE_BASE_URL=https://seu-bridge.exemplo
WHATSAPP_BRIDGE_API_KEY=...
WHATSAPP_BRIDGE_WEBHOOK_SECRET=...   # validado no webhook (header x-webhook-secret)
WHATSAPP_BRIDGE_DEFAULT_INSTANCE=...
WHATSAPP_READ_MAX_MESSAGES=80
WHATSAPP_SUMMARY_MAX_CHARS=4000
```

## Subindo o bridge (self-host)

1. Suba o [WPPConnect Server](https://github.com/wppconnect-team/wppconnect-server)
   (Apache-2.0) ou um serviço baseado em [Baileys](https://github.com/WhiskeySockets/Baileys)
   (MIT) em um VPS/container com processo persistente.
2. Configure o serviço para chamar `POST https://SEU-APP/api/whatsapp/webhook`
   a cada mensagem, com o header `x-webhook-secret: <WHATSAPP_BRIDGE_WEBHOOK_SECRET>`.
3. Registre a conexão em `whatsapp_connections` com o `instance_id` que o bridge
   envia, apontando para a org do tenant.
4. Defina `WHATSAPP_PROVIDER=bridge` e as demais variáveis no app.

## Segurança e LGPD

- O webhook sempre valida o segredo; sem ele, responde `401`.
- Leitura de conversa respeita escopo comercial legítimo e consentimento
  operacional; nunca lê conversa de outro tenant.
- Credenciais do bridge ficam só em env/secret manager — nunca no banco em texto
  puro.

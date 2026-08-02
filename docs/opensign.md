# Assinatura digital com OpenSign

O CRM usa o [OpenSign](https://github.com/OpenSignLabs/OpenSign) — open source e
gratuito — como provider de assinatura digital. Não usamos DocuSign, Clicksign,
D4Sign ou qualquer provedor pago.

Toda a integração passa por um adapter (`lib/signature/provider.ts`), então a UI
e as rotas dependem apenas de uma interface. Trocar de provider, se um dia for
preciso, não exige mudar o resto do app.

## Colocar em produção (passo a passo)

O código já está pronto — falta apenas provisionar o OpenSign e preencher as
variáveis. **Sem as `OPENSIGN_*`, o app opera em modo demonstração** (assinatura
simulada na página interna).

1. **Crie a conta / instância OpenSign** (uma destas):
   - **Cloud gerenciado**: crie uma conta em https://www.opensignlabs.com e gere
     um **API token** no painel (Settings → API). É a via mais rápida.
     _(Este passo exige verificação de e-mail e por isso é feito por você.)_
   - **Self-host (grátis)**: siga o
     [guia de self-hosting](https://github.com/OpenSignLabs/OpenSign) (Docker) e
     gere um token de API na instância.
2. **Preencha as variáveis na Vercel** (Project → Settings → Environment Variables):
   - `SIGNATURE_PROVIDER=opensign`
   - `OPENSIGN_BASE_URL` = URL da instância/cloud
   - `OPENSIGN_API_KEY` = token gerado
   - `OPENSIGN_WEBHOOK_SECRET` = um segredo forte à sua escolha
   - (opcional) `OPENSIGN_DEFAULT_TEMPLATE_ID`, `OPENSIGN_FOLDER_ID`, `OPENSIGN_API_VERSION`
   - `SUPABASE_SERVICE_ROLE_KEY` (para o webhook escrever)
3. **Configure o webhook** no painel do OpenSign apontando para
   `https://SEU-APP/api/webhooks/opensign`, com o header `x-opensign-secret`
   igual ao `OPENSIGN_WEBHOOK_SECRET`.
4. **Redeploy**. A partir daí, "Preparar assinatura" cria um envelope real e a
   página `/sign/contracts/[token]` encaminha o signatário ao OpenSign.

## Modelo por-signatário

Ao preparar a assinatura, além de gravar no contrato, o app cria um
**envelope** (`contract_signature_envelopes`) e um **signatário por parte**
(`contract_signers`), cada um com token interno **hasheado** (nunca em texto
puro). O webhook e o "Atualizar status" refletem a assinatura no envelope e em
cada signatário; o card do contrato mostra quem já assinou e quem falta. A
assinatura duplicada é bloqueada no servidor e na UI.

## Como funciona

1. **Envio** — na aba **Contratos**, o botão _Enviar para assinatura_ chama a
   Server Action `sendContractForSignature`. Ela monta o corpo do contrato a
   partir das cláusulas, chama `provider.createEnvelope(...)` e salva no contrato:
   `envelope_provider`, `envelope_id`, `signing_url`, `external_status` e
   `sent_at`. Uma notificação in-app e uma atividade são registradas.
2. **Compartilhar link** — o link de assinatura pode ser copiado ou enviado pelo
   WhatsApp (wa.me) com o template `link_opensign`. Não há e-mail transacional.
3. **Retorno de status** — o OpenSign chama o webhook
   `POST /api/webhooks/opensign` a cada mudança (visualizado, assinado, recusado,
   expirado). O webhook valida o segredo compartilhado, localiza o contrato pelo
   `envelope_id` e atualiza `external_status`, `signature_status`,
   `certificate_url` e `signed_at`, criando uma notificação.
4. **Atualização manual** — o botão _Atualizar status_ chama
   `refreshContractStatus`, que consulta `provider.getStatus(envelopeId)` sob
   demanda (útil quando o webhook ainda não chegou).

## Variáveis de ambiente

| Variável | Obrigatória | Descrição |
| --- | --- | --- |
| `SIGNATURE_PROVIDER` | não | `opensign` (padrão) ou `mock`. `mock` não faz rede — usado em dev/testes. |
| `OPENSIGN_BASE_URL` | sim* | URL da instância OpenSign (self-host). |
| `OPENSIGN_API_KEY` | sim* | Token de API (`x-api-token`). |
| `OPENSIGN_WEBHOOK_SECRET` | sim* | Segredo compartilhado validado no webhook. Sem ele o webhook recusa. |
| `OPENSIGN_DEFAULT_TEMPLATE_ID` | não | Template padrão do OpenSign, se usado. |
| `SUPABASE_SERVICE_ROLE_KEY` | sim* | Necessária para o webhook escrever ignorando RLS (não há sessão de usuário). |

\* Se `OPENSIGN_BASE_URL`/`OPENSIGN_API_KEY` não estiverem configuradas, o factory
`getSignatureProvider()` cai automaticamente para o provider `mock`, permitindo
rodar o app localmente sem OpenSign.

## Subindo uma instância OpenSign

O OpenSign pode ser hospedado com Docker. Siga o
[guia oficial de self-host](https://github.com/OpenSignLabs/OpenSign#self-hosting).
Depois:

1. Gere um token de API e preencha `OPENSIGN_API_KEY`.
2. Configure `OPENSIGN_BASE_URL` para a URL pública da instância.
3. No painel do OpenSign, aponte o webhook para
   `https://SEU-APP.vercel.app/api/webhooks/opensign` e use o mesmo valor de
   `OPENSIGN_WEBHOOK_SECRET` no header `x-opensign-secret`.

## Webhook — payload esperado

```jsonc
// POST /api/webhooks/opensign   (header: x-opensign-secret: <OPENSIGN_WEBHOOK_SECRET>)
{
  "objectId": "abc123",       // ou "documentId"
  "status": "signed",         // created | sent | viewed | signed | completed | declined | expired | voided
  "certificateUrl": "https://.../certificado.pdf"
}
```

O mapeamento de status externo → interno está em `STATUS_MAP`
(`lib/signature/provider.ts`). Status `signed`/`completed` marcam o contrato como
`assinado` e preenchem `signed_at`.

## Segurança

- O webhook **sempre** valida `OPENSIGN_WEBHOOK_SECRET`. Sem segredo configurado
  ou com segredo divergente, responde `401`.
- A escrita no banco pelo webhook usa `SUPABASE_SERVICE_ROLE_KEY` (sem ela o
  webhook apenas confirma o recebimento e loga a pendência, sem persistir).
- As Server Actions de envio/atualização exigem papel `owner` ou `admin`
  (`requireRole`), validado no servidor contra a tabela de memberships — nunca
  apenas pelo cookie.

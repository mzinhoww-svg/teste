# Contratos e assinatura

Fluxo de contrato do CRM, da geração à assinatura digital via OpenSign
(open source — ver `docs/opensign.md`). Sem provedor pago e sem e-mail
transacional: o link de assinatura é compartilhado por link copiável / `wa.me`.

## Página interna de assinatura

`/sign/contracts/[token]` é uma página **pública** (o signatário não é usuário do
CRM), validada por token estável (`contracts.sign_token`).

- Estados: link inválido, **pendente** (assinar) e **já assinado** (bloqueia nova
  assinatura + link do documento/certificado quando houver).
- Se o OpenSign estiver configurado, a página encaminha para a URL de assinatura
  do provider. Sem provider real, opera em **modo demonstração** com aviso
  explícito ("assinatura simulada") e registra o aceite no CRM.

### Bloqueio de assinatura duplicada

Garantido no servidor **e** na UI:

- `sign_contract_by_token` (SECURITY DEFINER) recusa se o contrato já está
  assinado (`already_signed`) ou em estado terminal (`not_signable`).
- O `ContractCard` esconde os botões de assinatura quando o status é assinado e
  mostra o estado "Assinado".

## Botões no card do contrato

- **Preparar assinatura** — cria/atualiza o envelope no provider.
- **Copiar link** — copia o link **interno** `/sign/contracts/[token]` (nunca a
  URL do provider mock).
- **WhatsApp** — abre `wa.me` com a mensagem do template `link_opensign` já
  preenchida com o link interno.
- **Atualizar status** — consulta o provider sob demanda.
- Quando assinado: **Ver documento assinado** (se houver `certificate_url`).

## Schema

- `contracts.sign_token` (migration 0004) + RPCs `peek_contract_signature` /
  `sign_contract_by_token`.
- Assinatura robusta por signatário (migration 0006):
  `contract_signature_envelopes` e `contract_signers` (status, ordem de
  assinatura, `internal_signing_token_hash` — token **hasheado**, nunca em texto
  puro), com RLS por org. Usados pela evolução por-signatário do provider OpenSign.

## Propostas

Proposta gerada pelo agente ganha `share_token` (migration 0005) e uma página
pública `/proposta/[token]` com layout imprimível → "Baixar PDF" pelo próprio
navegador (sem dependência paga). No resultado do agente há botões Abrir/PDF,
Copiar link e Enviar por WhatsApp.

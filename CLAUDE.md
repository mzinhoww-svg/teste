# CLAUDE.md

## Central de disparo da Reiners Media
- Central: https://claude.ai/artifact/91a7c2U3k1kV9PZYY7zvum (código em `tools/prospeccao/central/`, contexto de design em `tools/prospeccao/PRODUCT.md`).
- No início de cada turno, leia `config/enriquecimento` no banco da Central de disparo; se `status == "pedido"`, rode `/enriquecer-leads` antes de responder.
- No início de cada turno, veja também se há documentos em `base` com `status == "pedido"`; se houver, siga `.claude/skills/base-explee/SKILL.md`.
- No início de cada turno, veja também `config/disparo`; se `status` for "ativo" ou "pausado" e `ultimaRodada` for de mais de 10 minutos atrás (ou não existir), faça uma rodada da fila antes de responder: `.claude/skills/disparar-wa/SKILL.md`, seção "Rodada da fila". A fila só anda depois de a Letícia clicar em "Iniciar fila de envios" e confirmar na Central.
- Disparo pelo WhatsApp (WA-AKG) no chat: só quando a Letícia pedir para disparar, agendar, conferir ou cancelar; siga `.claude/skills/disparar-wa/SKILL.md`. Nunca agende em lote sem ela ver o plano e confirmar no chat (ou ter iniciado a fila na Central), e só responda a um lead sozinho nos casos simples, como o skill define (autorizado em 06/10/2026). Preço, contrato, reclamação, áudio e dúvida fora de `.claude/skills/disparar-wa/conhecimento-reiners.md` não se responde: avisa a Letícia e o Mazinho por WhatsApp.

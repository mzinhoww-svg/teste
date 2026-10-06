# CLAUDE.md

## Central de disparo da Reiners Media
- Central: https://claude.ai/artifact/91a7c2U3k1kV9PZYY7zvum (código em `tools/prospeccao/central/`, contexto de design em `tools/prospeccao/PRODUCT.md`).
- No início de cada turno, leia `config/enriquecimento` no banco da Central de disparo; se `status == "pedido"`, rode `/enriquecer-leads` antes de responder.
- No início de cada turno, veja também se há documentos em `base` com `status == "pedido"`; se houver, siga `.claude/skills/base-explee/SKILL.md`.
- Disparo pelo WhatsApp (WA-AKG): só quando a Letícia pedir para disparar, agendar, conferir ou cancelar; siga `.claude/skills/disparar-wa/SKILL.md`. Nunca agende sem ela ver o plano e confirmar no chat.

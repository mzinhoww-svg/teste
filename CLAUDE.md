# CLAUDE.md

## Central de disparo da Reiners Media
- Central: https://claude.ai/artifact/91a7c2U3k1kV9PZYY7zvum (código em `tools/prospeccao/central/`, contexto de design em `tools/prospeccao/PRODUCT.md`).
- No início de cada turno, leia `config/enriquecimento` no banco da Central de disparo; se `status == "pedido"`, rode `/enriquecer-leads` antes de responder.

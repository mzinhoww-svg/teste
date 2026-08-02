# Assumptions — Reiners Media Podcast Studio

## ASM-001: Supabase Disponibilidade
**Premissa:** Supabase estará disponível durante todo o desenvolvimento.
**Evidência:** Supabase é SaaS estabelecido com SLA.
**Confiança:** Alta.
**Impacto:** Bloqueia todo o backend se indisponível.
**Validação:** Testar conectividade no primeiro dia.
**Tickets:** TCK-002, TCK-004, TCK-005, TCK-006.

## ASM-002: Imagens de Capa
**Premissa:** O estúdio fornecerá imagens de capa para os 5 programas seed ou aceitará placeholders CSS.
**Evidência:** Conversa anterior mencionou necessidade de thumbnails.
**Confiança:** Média.
**Impacto:** Seed data pode usar placeholders gerados via CSS.
**Validação:** Confirmar com estúdio na primeira semana.
**Tickets:** TCK-002, TCK-005.

## ASM-003: Design System Estável
**Premissa:** O design system PodFactory + Reiners Media não sofrerá alterações durante o MVP.
**Evidência:** Tokens definidos e validados no preview.
**Confiança:** Alta.
**Impacto:** Mudanças exigiriam refatoração de componentes.
**Validação:** Congelar tokens após TCK-001.
**Tickets:** TCK-001, TCK-009, TCK-012, TCK-015.

## ASM-004: Serviço de Agendamento
**Premissa:** O CTA "Agendar sessão" será um link externo (Calendly/similar), não um formulário interno.
**Evidência:** OPEN-001 no PRD.
**Confiança:** Média.
**Impacto:** Não precisamos implementar sistema de agendamento.
**Validação:** Confirmar URL do serviço antes de TCK-012.
**Tickets:** TCK-012.

## ASM-005: Equipe de 1 Desenvolvedor via Claude Code
**Premissa:** Todo o desenvolvimento será feito via Claude Code com múltiplos agentes paralelos.
**Evidência:** Este pacote de entrega.
**Confiança:** Alta.
**Impacto:** Necessidade de alta independência dos tickets.
**Validação:** Métricas de velocidade após primeira onda.
**Tickets:** Todos.

## ASM-006: Budget Zero para Ferramentas
**Premissa:** Apenas ferramentas gratuitas serão usadas (Supabase free, Vercel hobby, GA4 free).
**Evidência:** Restrição no PRD.
**Confiança:** Alta.
**Impacto:** Limitações de volume e features.
**Validação:** Verificar limites antes de launch.
**Tickets:** TCK-025.

# Design audit — critérios uiuxpromax / impeccable / uitripled

As skills `uiuxpromax`, `impeccable`, `uitripled` e `transitions-dev` não estão
instaladas neste ambiente. Conforme a regra, este checklist registra os critérios
equivalentes aplicados manualmente e o que foi feito para cada um.

## uiuxpromax — arquitetura de UX e clareza operacional
- [x] Tenant ativo sempre visível (`TenantBadge`) + switcher validado no servidor.
- [x] `UserMenu` com e-mail, papel, tenant e sair; tema claro/escuro/sistema.
- [x] Criação de lead virou **fluxo de intake** (rápido/completo) que orienta
  próxima ação, agente e cadência — não um formulário raso.
- [x] Lead **editável por completo** após criação (estágio, produto, valor,
  probabilidade, contexto comercial), corrigindo o gap principal.
- [x] Central de notificações **operacional**: sugere e executa agentes, abre lead,
  ignora — com filtros (todas/não lidas/agentes/contratos/funil).
- [x] Nenhum lead sem ação: criação registra próxima ação e gera notificação.

## impeccable — remover aparência genérica
- [x] Primitives em `components/ui` (button, input, badge, dialog, sheet,
  dropdown, confirm-dialog, skeleton, toaster) — sem Tailwind de botão/input
  duplicado espalhado.
- [x] Ícones `lucide-react` (nunca emoji).
- [x] Copy da Reiners: "presença institucional", "posicionamento contínuo" —
  nunca "posts/feed/viralizar".
- [x] Estados vazios com contexto e CTA; helper text nos formulários.

## uitripled — elementos concretos de UI
- [x] Sheet lateral para criação de lead com seções, sidebar de sugestão e
  barra de ações fixa (sticky top/bottom).
- [x] Cards de sugestão de agente na notificação (motivo + ações).
- [x] Drawer do lead com edição completa em Dialog + contexto comercial
  expansível (`details`).
- [x] Skeletons no board/drawer; badges de status; confirmação com escopo do tenant.

## transitions-dev — microinterações
- [x] Motion discreto via `tailwindcss-animate` em Dialog/Sheet/Dropdown/Toast.
- [x] `prefers-reduced-motion` respeitado em `globals.css`.
- [x] Foco visível, Escape em modais e focus trap (Radix Dialog/Sheet).

## Pendências reais (follow-up honesto)
Estas ficam registradas como fases seguintes, não concluídas nesta rodada:
- Drawer do lead em **abas** dedicadas (Visão geral / Contato / Oportunidade /
  Atividades / WhatsApp / Agentes / Proposta / Contratos / Histórico) — hoje a
  edição é completa via Dialog, mas não tabbed.
- **Landing e /admin** com refinamento premium adicional.
- **Branding condicional da Reiners** (navy/gold/off-white) aplicado por tenant no
  app shell.
- Matriz **E2E completa** (20 cenários do escopo) — hoje há 17 E2E + 18 unit.
- Tab de **WhatsApp** com timeline de "WhatsApp aberto" e conversa quando o bridge existir.

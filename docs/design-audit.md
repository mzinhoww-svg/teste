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

## Fases seguintes — status

- [x] **Fase A** — Drawer do lead em **abas** (Visão geral / Agentes / WhatsApp /
  Atividades) com edição de Oportunidade/Contato e primitive `Tabs`.
- [x] **Fase B** — Cards do funil enriquecidos (produto, valor, temperatura,
  tempo parado com alerta >72h, próxima ação, agente sugerido) + acento de marca
  por tenant no shell.
- [x] **Fase C** — Atividades operacionais (`createActivity`) + status
  "em dia / atrasado / sem próxima ação".
- [x] **Fase D (admin)** — card "Saúde & configuração" (IA, service role,
  OpenSign, WhatsApp) no `/admin`.
- [x] **Fase E** — testes unitários adicionais (agent-suggest, enriquecimento);
  20 unit + 17 E2E.
- [x] **Fase F** — primitives `tabs`, `empty-state`, `section` criados;
  empty-state aplicado nas notificações.

### Ainda em aberto (honesto)
- **Landing premium** — refinamento visual adicional do hero/seções.
- **Matriz E2E completa** (os 20 cenários do escopo) — hoje 17 E2E + 20 unit.
- **Tabs dedicadas de Proposta/Contratos/Histórico** no drawer (hoje há atalhos e
  a aba Contratos vive na página de Contratos).
- **Conversa de WhatsApp** na aba (depende do bridge externo ativo).

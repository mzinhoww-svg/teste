# Central de notificações (in-app)

Notificações vivem na tabela `notifications` (RLS por org). Podem ser gerais do
tenant (`user_id` nulo) ou direcionadas a um usuário.

## UI
- **Sino no header** (`NotificationBell`): badge de não-lidas, dropdown com as 8
  últimas, "Marcar todas", link para a lista completa.
- **`/app/notifications`**: lista completa com filtro Todas / Não lidas, marcar
  como lida (ao clicar) e marcar todas.

## Eventos que geram notificação
| Evento | Origem |
|---|---|
| Deal movido para estágio crítico (Proposta, Negociação) | `moveDeal` (server action) |
| Deal Ganho / Perdido | `moveDeal` |
| SLA de estágio vencido | pg_cron `sla_sweep` (migration 0002) |
| Cadência: deal parado além do limite | pg_cron `cadence_sweep` |
| Cadência run_agent executada | `/api/cron/cadences` (Vercel Cron) |
| Convite criado / membro entrou | `createInvite` / `accept_invite` |
| Contrato enviado / assinado / recusado | webhook OpenSign (`/api/webhooks/opensign`) |

## Botão WhatsApp
Notificações acionáveis com contato que tem telefone mostram "Enviar WhatsApp"
(`wa.me`), com mensagem pré-preenchida por template (`lib/whatsapp.ts`). A ação
apenas ABRE o WhatsApp e registra `activities(type=whatsapp)` — nunca marca como
entregue e não usa API oficial.

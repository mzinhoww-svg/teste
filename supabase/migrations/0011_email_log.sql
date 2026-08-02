-- Fase e-mail (Brevo transacional) — log de envio + status de entrega.
-- Aditiva e reversível. Reusa a tabela `messages` (já multi-tenant por org_id).
-- Cada e-mail enviado vira uma linha `messages(channel='email', direction='outbound')`;
-- o webhook do Brevo casa por `external_id` (messageId) e atualiza `status`.

alter table public.messages
  add column if not exists subject text,
  add column if not exists to_email text,
  add column if not exists meta jsonb not null default '{}';

-- Índice para o webhook casar o evento pelo messageId do Brevo.
create index if not exists messages_external_id_idx on public.messages(external_id);

-- Cadências: novo tipo de ação "send_email" (envia follow-up por e-mail).
-- O check original permite apenas ('notify','suggest_whatsapp','run_agent').
alter table public.cadence_rules drop constraint if exists cadence_rules_action_check;
alter table public.cadence_rules
  add constraint cadence_rules_action_check
  check (action in ('notify','suggest_whatsapp','run_agent','send_email'));

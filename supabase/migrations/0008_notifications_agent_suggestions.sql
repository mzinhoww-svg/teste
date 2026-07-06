-- Notificações operacionais: vínculo a contato, prioridade e dispensa.
alter table public.notifications add column if not exists contact_id uuid references public.contacts(id) on delete set null;
alter table public.notifications add column if not exists priority text default 'normal';
alter table public.notifications add column if not exists dismissed_at timestamptz;
create index if not exists notifications_deal_idx on public.notifications(org_id, deal_id);

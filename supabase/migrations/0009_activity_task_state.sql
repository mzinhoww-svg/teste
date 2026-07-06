-- Fase I — tarefas com estado.
alter table public.activities add column if not exists due_at date;
alter table public.activities add column if not exists done_at timestamptz;
create index if not exists activities_deal_idx on public.activities(org_id, deal_id, created_at desc);

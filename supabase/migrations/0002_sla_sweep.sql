-- Varredura diária de SLA via pg_cron (aplicada ao projeto Supabase).
-- Alerta na timeline dos deals parados acima do SLA do estágio (1x/dia por deal).

create extension if not exists pg_cron;

create or replace function public.sla_sweep()
returns int language plpgsql security definer set search_path = public as $$
declare v_count int := 0;
begin
  insert into public.activities (org_id, deal_id, type, summary, author)
  select d.org_id, d.id, 'agent',
         '⚠️ SLA estourado: parado há ' || extract(day from now() - d.updated_at)::int ||
         ' dia(s) em "' || s.name || '" (SLA ' || s.sla_days || 'd). Follow-up urgente.',
         'Agente de Atividades e Follow-ups'
  from public.deals d
  join public.stages s on s.id = d.stage_id
  where s.sla_days is not null
    and not s.is_won and not s.is_lost
    and d.updated_at < now() - (s.sla_days || ' days')::interval
    and not exists (
      select 1 from public.activities a
      where a.deal_id = d.id and a.type = 'agent'
        and a.summary like '⚠️ SLA estourado%'
        and a.created_at > now() - interval '24 hours'
    );
  get diagnostics v_count = row_count;
  return v_count;
end $$;

revoke execute on function public.sla_sweep() from anon, authenticated, public;

select cron.schedule('crm-sla-sweep', '0 11 * * *', $$select public.sla_sweep()$$);

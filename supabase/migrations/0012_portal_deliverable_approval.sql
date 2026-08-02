-- Portal 2.0 — aprovação de entrega pelo cliente.
-- RPC SECURITY DEFINER (espelha sign_contract_by_token): o cliente só aprova
-- entregas da própria conta e apenas quando estão em "entregue". Notifica a agência.
-- Não abre policy de UPDATE ampla para client_users — o acesso é só por esta função.

create or replace function public.approve_deliverable(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare v record;
begin
  select id, client_account_id, org_id, title, status into v
    from public.deliverables where id = p_id;
  if v is null then
    return jsonb_build_object('ok', false, 'error', 'Entrega não encontrada');
  end if;
  if not public.is_client_user(v.client_account_id) then
    return jsonb_build_object('ok', false, 'error', 'Sem permissão');
  end if;
  if coalesce(v.status, '') <> 'entregue' then
    return jsonb_build_object('ok', false, 'error', 'Apenas entregas em "entregue" podem ser aprovadas');
  end if;

  update public.deliverables
    set status = 'aprovado', delivered_at = coalesce(delivered_at, now())
    where id = p_id;

  insert into public.notifications (org_id, type, title, body, action_url)
    values (v.org_id, 'deliverable_approved', 'Entrega aprovada pelo cliente',
            coalesce(v.title, 'Entrega') || ' foi aprovada no portal.', '/app/entregas');

  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.approve_deliverable(uuid) from public;
grant execute on function public.approve_deliverable(uuid) to authenticated;

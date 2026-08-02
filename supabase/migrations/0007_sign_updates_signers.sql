-- Fase de refino — a assinatura interna (demo) também reflete no modelo
-- por-signatário (envelope + signatários).
create or replace function public.sign_contract_by_token(p_token text, p_signer_name text default null)
returns json language plpgsql security definer set search_path = public as $$
declare c record;
begin
  select * into c from public.contracts where sign_token = p_token limit 1;
  if not found then return json_build_object('ok', false, 'error', 'not_found'); end if;
  if (coalesce(c.signature_status,'') in ('assinado') or coalesce(c.external_status,'') in ('assinado','completed','signed')) then
    return json_build_object('ok', false, 'error', 'already_signed'); end if;
  if coalesce(c.external_status,'') in ('cancelado','recusado','expirado','declined','revoked','expired') then
    return json_build_object('ok', false, 'error', 'not_signable'); end if;
  update public.contracts set signature_status='assinado', external_status='assinado', signed_at=now(), updated_at=now() where id=c.id;
  update public.contract_signature_envelopes set status='completed', completed_at=now(), updated_at=now() where contract_id=c.id;
  update public.contract_signers set status='signed', signed_at=now(), updated_at=now() where contract_id=c.id;
  insert into public.activities (org_id, deal_id, type, summary, author)
    values (c.org_id, c.deal_id, 'note', concat('Contrato ', c.reference, ' assinado', case when p_signer_name is not null then concat(' por ', p_signer_name) else '' end), 'Assinatura');
  insert into public.notifications (org_id, type, title, body, contract_id, deal_id, action_url)
    values (c.org_id, 'contract_signed', 'Contrato assinado', concat(c.reference, ' foi assinado.'), c.id, c.deal_id, '/app/contracts');
  return json_build_object('ok', true);
end; $$;

-- Fase 1 — Página interna de assinatura de contrato + bloqueio de duplicidade.
-- Token público estável para /sign/contracts/[token].
alter table public.contracts add column if not exists sign_token text;
update public.contracts set sign_token = replace(gen_random_uuid()::text,'-','') where sign_token is null;
alter table public.contracts alter column sign_token set default replace(gen_random_uuid()::text,'-','');
create unique index if not exists contracts_sign_token_key on public.contracts(sign_token);

-- Leitura pública do contrato pelo token (o signatário não é usuário do CRM).
-- SECURITY DEFINER: ignora RLS, expõe só o necessário e apenas via token.
create or replace function public.peek_contract_signature(p_token text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  c record;
  org_name text;
begin
  select * into c from public.contracts where sign_token = p_token limit 1;
  if not found then
    return json_build_object('found', false);
  end if;
  select name into org_name from public.orgs where id = c.org_id;
  return json_build_object(
    'found', true,
    'org_name', coalesce(org_name, 'Organização'),
    'reference', c.reference,
    'title', c.title,
    'value', c.value,
    'clauses', c.clauses,
    'signatories', c.signatories,
    'provider', c.envelope_provider,
    'external_signing_url', case when c.envelope_provider = 'opensign' then c.signing_url else null end,
    'certificate_url', c.certificate_url,
    'status', coalesce(c.signature_status, 'rascunho'),
    'external_status', c.external_status,
    'signed', (coalesce(c.signature_status,'') in ('assinado') or coalesce(c.external_status,'') in ('assinado','completed','signed')),
    'signed_at', c.signed_at
  );
end;
$$;

-- Assinatura pela página interna (fluxo demonstração/mock). Bloqueia duplicidade.
create or replace function public.sign_contract_by_token(p_token text, p_signer_name text default null)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  c record;
begin
  select * into c from public.contracts where sign_token = p_token limit 1;
  if not found then
    return json_build_object('ok', false, 'error', 'not_found');
  end if;
  if (coalesce(c.signature_status,'') in ('assinado') or coalesce(c.external_status,'') in ('assinado','completed','signed')) then
    return json_build_object('ok', false, 'error', 'already_signed');
  end if;
  if coalesce(c.external_status,'') in ('cancelado','recusado','expirado','declined','revoked','expired') then
    return json_build_object('ok', false, 'error', 'not_signable');
  end if;

  update public.contracts
    set signature_status = 'assinado', external_status = 'assinado', signed_at = now(), updated_at = now()
    where id = c.id;

  insert into public.activities (org_id, deal_id, type, summary, author)
    values (c.org_id, c.deal_id, 'note', concat('Contrato ', c.reference, ' assinado', case when p_signer_name is not null then concat(' por ', p_signer_name) else '' end), 'Assinatura');

  insert into public.notifications (org_id, type, title, body, contract_id, deal_id, action_url)
    values (c.org_id, 'contract_signed', 'Contrato assinado', concat(c.reference, ' foi assinado.'), c.id, c.deal_id, '/app/contracts');

  return json_build_object('ok', true);
end;
$$;

grant execute on function public.peek_contract_signature(text) to anon, authenticated;
grant execute on function public.sign_contract_by_token(text, text) to anon, authenticated;

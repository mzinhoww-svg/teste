-- Fase 1 — Página compartilhável da proposta /proposta/[token].
alter table public.proposals add column if not exists share_token text;
update public.proposals set share_token = replace(gen_random_uuid()::text,'-','') where share_token is null;
alter table public.proposals alter column share_token set default replace(gen_random_uuid()::text,'-','');
create unique index if not exists proposals_share_token_key on public.proposals(share_token);

-- Leitura pública da proposta pelo token (o cliente não é usuário do CRM).
create or replace function public.peek_proposal(p_token text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  p record;
  d record;
  org_name text;
  contact_name text;
begin
  select * into p from public.proposals where share_token = p_token limit 1;
  if not found then
    return json_build_object('found', false);
  end if;
  select title, contact_id into d from public.deals where id = p.deal_id;
  select name into org_name from public.orgs where id = p.org_id;
  select name into contact_name from public.contacts where id = d.contact_id;
  return json_build_object(
    'found', true,
    'org_name', coalesce(org_name, 'Organização'),
    'deal_title', coalesce(d.title, ''),
    'contact_name', coalesce(contact_name, ''),
    'items', p.items,
    'subtotal', p.subtotal,
    'discount_pct', p.discount_pct,
    'total', p.total,
    'summary', p.summary,
    'terms', p.terms,
    'created_at', p.created_at
  );
end;
$$;

grant execute on function public.peek_proposal(text) to anon, authenticated;

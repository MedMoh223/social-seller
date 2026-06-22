-- Social Seller — create_initial_tenant RPC.
-- The client now provisions its tenant by calling this security-definer
-- function instead of inserting into public.tenants directly. This
-- restores 001_initial_schema.sql's original design ("tenant
-- provisioning ... performed server-side"): the function runs with the
-- owner's privileges and bypasses RLS, so the tenants_insert_self
-- policy added in 003_tenant_profile_setup.sql (which let the client
-- INSERT directly) is dropped here — provisioning now has exactly one
-- path. The on_tenant_created trigger from 003 still fires on this
-- INSERT and provisions the matching public.users row.

drop policy if exists tenants_insert_self on public.tenants;

create or replace function public.create_initial_tenant(
  p_name text,
  p_country text,
  p_currency text,
  p_sector text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_id uuid := auth.uid();
  v_tenant_id uuid;
begin
  if v_owner_id is null then
    raise exception 'not authenticated';
  end if;

  if exists (select 1 from public.users where id = v_owner_id) then
    raise exception 'user already belongs to a tenant';
  end if;

  insert into public.tenants (name, owner_id, country, currency, sector)
  values (p_name, v_owner_id, p_country, p_currency, p_sector)
  returning id into v_tenant_id;

  return v_tenant_id;
end;
$$;

grant execute on function public.create_initial_tenant(text, text, text, text) to authenticated;

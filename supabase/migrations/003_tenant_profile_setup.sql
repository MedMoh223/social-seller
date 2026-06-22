-- Social Seller — tenant self-provisioning (US-05 profile setup).
-- 001_initial_schema.sql deferred tenant/user provisioning to "the
-- server-side, with the service_role key". This migration implements
-- that server side as a security-definer trigger: the client is still
-- only allowed to insert a tenant row for itself (scoped RLS policy
-- below), and the matching public.users row (merchant role, phone/
-- full_name copied from the auth.users signup metadata) is provisioned
-- by the trigger, never written directly by the client.

-- ====================================================================
-- 1. SCHEMA — profile fields collected during onboarding
-- ====================================================================

alter table public.tenants
  add column owner_id uuid references auth.users (id),
  add column country text,
  add column currency text,
  add column sector text,
  add column logo_url text;

-- ====================================================================
-- 2. TRIGGER — provision public.users right after a tenant is created
-- ====================================================================

create or replace function public.handle_new_tenant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  meta jsonb;
begin
  select raw_user_meta_data into meta
  from auth.users
  where id = new.owner_id;

  insert into public.users (id, tenant_id, role, phone, full_name)
  values (
    new.owner_id,
    new.id,
    'merchant',
    meta ->> 'phone',
    trim(concat(meta ->> 'first_name', ' ', meta ->> 'last_name'))
  );

  return new;
end;
$$;

create trigger on_tenant_created
  after insert on public.tenants
  for each row
  execute function public.handle_new_tenant();

-- public.users.id is a primary key referencing auth.users(id), so a
-- second concurrent tenant-creation attempt by the same owner fails
-- this insert with a duplicate-key error, rolling back the whole
-- transaction (including the new tenant row) — no orphan tenants.

-- ====================================================================
-- 3. RLS — scoped self-service INSERT on tenants
-- ====================================================================

create policy tenants_insert_self on public.tenants
  for insert to authenticated
  with check (
    owner_id = auth.uid()
    and not exists (select 1 from public.users where id = auth.uid())
  );

-- ====================================================================
-- 4. STORAGE — "logos" bucket: public read, tenant-owner-only write
-- ====================================================================

insert into storage.buckets (id, name, public)
values ('logos', 'logos', true)
on conflict (id) do nothing;

create policy logos_public_read on storage.objects
  for select to public
  using (bucket_id = 'logos');

create policy logos_owner_write on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'logos'
    and (storage.foldername(name))[1] = 'tenants'
    and (storage.foldername(name))[2] = public.current_tenant_id()::text
  );

create policy logos_owner_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'logos'
    and (storage.foldername(name))[1] = 'tenants'
    and (storage.foldername(name))[2] = public.current_tenant_id()::text
  )
  with check (
    bucket_id = 'logos'
    and (storage.foldername(name))[1] = 'tenants'
    and (storage.foldername(name))[2] = public.current_tenant_id()::text
  );

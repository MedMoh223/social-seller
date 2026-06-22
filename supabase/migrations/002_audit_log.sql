-- Social Seller — audit log for sensitive actions (tenant suspension,
-- order cancellation, etc.). Append-only: rows are inserted exclusively
-- by the backend using the service_role key (which bypasses RLS), and
-- merchants can read their own tenant's history. No UPDATE/DELETE path
-- is exposed to any client role.

-- ------------------------------------------------------------------
-- Helper: role of the currently authenticated user. Mirrors
-- current_tenant_id() from 001_initial_schema.sql.
-- ------------------------------------------------------------------
create or replace function public.current_user_role()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select role
  from public.users
  where id = auth.uid()
$$;

-- ------------------------------------------------------------------
-- audit_log
-- ------------------------------------------------------------------
create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id),
  user_id uuid references public.users (id),
  action text not null,
  table_name text not null,
  record_id uuid,
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz not null default now()
);

create index audit_log_tenant_id_idx on public.audit_log (tenant_id);
create index audit_log_table_record_idx on public.audit_log (table_name, record_id);

alter table public.audit_log enable row level security;

-- Read-only for the merchant of the row's own tenant.
create policy audit_log_select on public.audit_log
  for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.current_user_role() = 'merchant'
  );

-- No INSERT/UPDATE/DELETE policy for anon/authenticated: writes happen
-- exclusively through the backend's service_role key, which bypasses
-- RLS entirely and therefore needs no policy of its own. Revoked here
-- as a second layer of defense, independent of RLS.
revoke insert, update, delete on public.audit_log from anon, authenticated;
revoke select on public.audit_log from anon;

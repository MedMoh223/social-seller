-- Social Seller — Sprint 3: Expo push notification token registry.
-- tenant_id/user_id are stamped server-side by the trigger below from
-- auth.uid() / current_tenant_id(), never trusted from the client's
-- insert/update payload — so a buggy or malicious client can never
-- register a token under a tenant it doesn't belong to.

create table public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id),
  user_id uuid not null references public.users (id),
  token text not null unique,
  platform text not null check (platform in ('ios', 'android', 'web')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index push_tokens_tenant_id_idx on public.push_tokens (tenant_id);
create index push_tokens_user_id_idx on public.push_tokens (user_id);

-- Fires on insert AND update so re-claiming an existing token row (the
-- upsert-on-conflict path, e.g. a device re-registering) also gets its
-- ownership re-stamped rather than trusting whatever the client sent.
create or replace function public.set_push_token_owner()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.user_id := auth.uid();
  new.tenant_id := public.current_tenant_id();
  new.updated_at := now();
  return new;
end;
$$;

create trigger on_push_token_write_set_owner
  before insert or update on public.push_tokens
  for each row
  execute function public.set_push_token_owner();

alter table public.push_tokens enable row level security;

-- "Ses propres tokens": scoped by user_id, not tenant_id — a merchant
-- and their agents each manage their own device's token independently.
create policy push_tokens_select on public.push_tokens
  for select to authenticated
  using (user_id = auth.uid());

create policy push_tokens_insert on public.push_tokens
  for insert to authenticated
  with check (user_id = auth.uid());

create policy push_tokens_update on public.push_tokens
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy push_tokens_delete on public.push_tokens
  for delete to authenticated
  using (user_id = auth.uid());

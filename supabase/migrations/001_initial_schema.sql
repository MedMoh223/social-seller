-- Social Seller — initial multi-tenant schema.
-- Every tenant-scoped table is isolated via Row Level Security using
-- public.current_tenant_id(), resolved from the authenticated user's
-- row in public.users. No table has a DELETE policy: rows are archived
-- via soft delete (deleted_at) or status transitions, never removed
-- by the client.
--
-- File layout (order matters): unlike plpgsql, a `language sql`
-- function body is parsed and analyzed at CREATE FUNCTION time, so
-- every relation it references must already exist. That means:
--   1. all tables (and their indexes) first,
--   2. current_tenant_id() next, since it queries public.users,
--   3. RLS enablement + policies last, since every policy below
--      calls current_tenant_id().

-- ====================================================================
-- 1. TABLES
-- ====================================================================

-- 1.1 tenants
create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  plan text not null default 'free',
  status text not null default 'active',
  whatsapp_number text,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- 1.2 users
-- id mirrors auth.users(id) — there is no custom auth, only Supabase Auth.
create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  tenant_id uuid not null references public.tenants (id),
  role text not null check (role in ('super_admin', 'merchant', 'agent')),
  phone text,
  full_name text,
  created_at timestamptz not null default now()
);

create index users_tenant_id_idx on public.users (tenant_id);

-- 1.3 social_connections
-- access_token must never reach the mobile/web client: see section 3
-- for the corresponding RLS lockout.
create table public.social_connections (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id),
  platform text not null check (platform in ('whatsapp', 'facebook', 'tiktok')),
  access_token text,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

create index social_connections_tenant_id_idx on public.social_connections (tenant_id);

-- 1.4 conversations
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id),
  platform text not null check (platform in ('whatsapp', 'facebook', 'tiktok')),
  customer_name text,
  customer_id text,
  assigned_to uuid references public.users (id),
  status text not null default 'new' check (status in ('new', 'in_progress', 'resolved')),
  created_at timestamptz not null default now()
);

create index conversations_tenant_id_idx on public.conversations (tenant_id);
create index conversations_assigned_to_idx on public.conversations (assigned_to);

-- 1.5 messages
-- tenant_id is denormalized here so RLS can filter without a join
-- back through conversations.
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id),
  tenant_id uuid not null references public.tenants (id),
  direction text not null check (direction in ('inbound', 'outbound')),
  content text not null,
  created_at timestamptz not null default now()
);

create index messages_tenant_id_idx on public.messages (tenant_id);
create index messages_conversation_id_idx on public.messages (conversation_id);

-- 1.6 products
-- Soft delete via deleted_at — no DELETE policy is defined below.
create table public.products (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id),
  name text not null,
  description text,
  price numeric(12, 2) not null check (price >= 0),
  stock_quantity integer not null default 0 check (stock_quantity >= 0),
  alert_threshold integer not null default 0 check (alert_threshold >= 0),
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

create index products_tenant_id_idx on public.products (tenant_id);

-- 1.7 orders
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id),
  conversation_id uuid references public.conversations (id),
  agent_id uuid references public.users (id),
  customer_name text,
  total_amount numeric(12, 2) not null default 0 check (total_amount >= 0),
  status text not null default 'new' check (
    status in ('new', 'confirmed', 'preparing', 'shipped', 'delivered', 'cancelled')
  ),
  cancelled_reason text,
  created_at timestamptz not null default now()
);

create index orders_tenant_id_idx on public.orders (tenant_id);
create index orders_conversation_id_idx on public.orders (conversation_id);
create index orders_agent_id_idx on public.orders (agent_id);

-- 1.8 order_items
-- No tenant_id column: isolation is enforced through the parent
-- order's tenant_id via an EXISTS check.
create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id),
  product_id uuid not null references public.products (id),
  quantity integer not null check (quantity > 0),
  unit_price numeric(12, 2) not null check (unit_price >= 0)
);

create index order_items_order_id_idx on public.order_items (order_id);
create index order_items_product_id_idx on public.order_items (product_id);

-- ====================================================================
-- 2. HELPER FUNCTION
-- ====================================================================

-- Tenant_id of the currently authenticated user.
-- security definer + explicit search_path so it can read public.users
-- without triggering that table's own RLS policy recursively.
create or replace function public.current_tenant_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select tenant_id
  from public.users
  where id = auth.uid()
$$;

-- ====================================================================
-- 3. ROW LEVEL SECURITY
-- ====================================================================

-- 3.1 tenants
alter table public.tenants enable row level security;

create policy tenants_select on public.tenants
  for select to authenticated
  using (id = public.current_tenant_id());

create policy tenants_update on public.tenants
  for update to authenticated
  using (id = public.current_tenant_id())
  with check (id = public.current_tenant_id());

-- No INSERT/DELETE policy: tenant provisioning and any hard removal
-- are performed server-side with the service_role key only.

-- 3.2 users
alter table public.users enable row level security;

create policy users_select on public.users
  for select to authenticated
  using (tenant_id = public.current_tenant_id());

create policy users_update on public.users
  for update to authenticated
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

-- No INSERT policy: a new user row is provisioned server-side
-- together with the auth.users record and its tenant assignment.

-- 3.3 social_connections
-- RLS is enabled with no policy for anon/authenticated (default-deny),
-- and table privileges are revoked from both roles as a second layer
-- of defense. Only the backend (Express on Railway, using the
-- service_role key, which bypasses RLS) can read or write this table.
alter table public.social_connections enable row level security;
revoke all on public.social_connections from anon, authenticated;
-- Intentionally no policies: anon/authenticated get zero access.

-- 3.4 conversations
alter table public.conversations enable row level security;

create policy conversations_select on public.conversations
  for select to authenticated
  using (tenant_id = public.current_tenant_id());

create policy conversations_insert on public.conversations
  for insert to authenticated
  with check (tenant_id = public.current_tenant_id());

create policy conversations_update on public.conversations
  for update to authenticated
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

-- 3.5 messages
alter table public.messages enable row level security;

create policy messages_select on public.messages
  for select to authenticated
  using (tenant_id = public.current_tenant_id());

create policy messages_insert on public.messages
  for insert to authenticated
  with check (tenant_id = public.current_tenant_id());

create policy messages_update on public.messages
  for update to authenticated
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

-- 3.6 products
alter table public.products enable row level security;

create policy products_select on public.products
  for select to authenticated
  using (tenant_id = public.current_tenant_id());

create policy products_insert on public.products
  for insert to authenticated
  with check (tenant_id = public.current_tenant_id());

create policy products_update on public.products
  for update to authenticated
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

-- 3.7 orders
alter table public.orders enable row level security;

create policy orders_select on public.orders
  for select to authenticated
  using (tenant_id = public.current_tenant_id());

create policy orders_insert on public.orders
  for insert to authenticated
  with check (tenant_id = public.current_tenant_id());

create policy orders_update on public.orders
  for update to authenticated
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

-- 3.8 order_items
alter table public.order_items enable row level security;

create policy order_items_select on public.order_items
  for select to authenticated
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_items.order_id
        and o.tenant_id = public.current_tenant_id()
    )
  );

create policy order_items_insert on public.order_items
  for insert to authenticated
  with check (
    exists (
      select 1 from public.orders o
      where o.id = order_items.order_id
        and o.tenant_id = public.current_tenant_id()
    )
  );

create policy order_items_update on public.order_items
  for update to authenticated
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_items.order_id
        and o.tenant_id = public.current_tenant_id()
    )
  )
  with check (
    exists (
      select 1 from public.orders o
      where o.id = order_items.order_id
        and o.tenant_id = public.current_tenant_id()
    )
  );

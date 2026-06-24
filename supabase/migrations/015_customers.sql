-- Social Seller — Gestion des clients (contacts marchands).
-- Un customer représente un contact identifié : créé manuellement par
-- l'agent ou enregistré depuis une conversation. Une conversation peut
-- être liée à un customer (customer_id FK), mais peut aussi exister sans.

create table public.customers (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants (id),
  name           text not null,
  phone          text,
  email          text,
  notes          text,
  -- source : d'où vient le client (whatsapp / facebook / tiktok / manual)
  source         text not null default 'manual'
                   check (source in ('whatsapp', 'facebook', 'tiktok', 'manual')),
  -- external_id : customer_id de la conversation d'origine (ex: numéro WhatsApp)
  external_id    text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz
);

-- Index de recherche par tenant
create index customers_tenant_idx on public.customers (tenant_id) where deleted_at is null;

-- Unicité : un external_id donné ne peut exister qu'une fois par tenant (actif)
create unique index customers_tenant_external_id_idx
  on public.customers (tenant_id, external_id)
  where external_id is not null and deleted_at is null;

-- Trigger updated_at
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger customers_set_updated_at
  before update on public.customers
  for each row execute function public.set_updated_at();

-- FK optionnelle : conversations.customer_id → customers.id
alter table public.conversations
  add column if not exists customer_fk_id uuid references public.customers (id);

-- RLS : service_role uniquement (même pattern que social_connections)
alter table public.customers enable row level security;
revoke all on public.customers from anon, authenticated;

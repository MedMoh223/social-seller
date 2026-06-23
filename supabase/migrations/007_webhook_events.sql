-- Social Seller — Sprint 2: webhook delivery idempotency + raw-payload
-- audit trail. Meta and TikTok retry webhook deliveries aggressively on
-- anything other than a fast 2xx, so every handler must be able to tell
-- "have I already processed this exact event" before doing any writes.
-- Same backend-only access pattern as social_connections/audit_log:
-- RLS enabled with no policies, privileges revoked from anon/authenticated
-- as a second layer of defense — only the service_role-key backend
-- (Express on Railway) reads or writes this table.

create table public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  platform text not null check (platform in ('whatsapp', 'facebook', 'tiktok')),
  external_event_id text,
  payload_hash text not null,
  tenant_id uuid references public.tenants (id),
  social_connection_id uuid references public.social_connections (id),
  status text not null default 'received'
    check (status in ('received', 'processed', 'failed', 'ignored')),
  error_detail text,
  raw_payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

-- external_event_id isn't always present (not every platform exposes a
-- top-level event id), so the dedup key falls back to a hash of the raw
-- body when it's null.
create unique index webhook_events_dedup_idx
  on public.webhook_events (platform, coalesce(external_event_id, payload_hash));

create index webhook_events_tenant_idx on public.webhook_events (tenant_id);
create index webhook_events_status_idx on public.webhook_events (status)
  where status in ('received', 'failed');

alter table public.webhook_events enable row level security;
revoke all on public.webhook_events from anon, authenticated;
-- Intentionally no policies: anon/authenticated get zero access.

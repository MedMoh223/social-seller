-- Social Seller — Sprint 2: CSRF-safe state for the OAuth/Embedded
-- Signup connection flows (WhatsApp, Facebook, TikTok). The backend
-- issues a random `state` before redirecting the merchant to the
-- provider's consent screen, and consumes it exactly once on callback
-- (see backend/src/routes/oauth/*.ts) — a missing/expired/already-
-- consumed state means the callback is rejected outright. Same
-- backend-only access pattern as social_connections/webhook_events.

create table public.oauth_states (
  id uuid primary key default gen_random_uuid(),
  state text not null unique,
  tenant_id uuid not null references public.tenants (id),
  user_id uuid not null references public.users (id),
  platform text not null check (platform in ('whatsapp', 'facebook', 'tiktok')),
  redirect_scheme text not null default 'socialseller://',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  consumed_at timestamptz
);

create index oauth_states_state_idx on public.oauth_states (state);

alter table public.oauth_states enable row level security;
revoke all on public.oauth_states from anon, authenticated;
-- Intentionally no policies: anon/authenticated get zero access. The
-- opaque `state` value is the only thing ever exposed to the client,
-- embedded in the authorizationUrl returned by POST /connections/:platform/start.

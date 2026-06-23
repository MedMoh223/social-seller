-- Social Seller — Sprint 2: OAuth/token lifecycle for social_connections.
-- access_token was a plaintext text column with no real data yet (no
-- channel was ever connectable before this sprint), so it's safe to
-- change its type/name in place rather than add a parallel column.
-- Tokens are encrypted application-side (AES-256-GCM in the Express
-- backend, see backend/src/lib/tokenCrypto.ts) before being written
-- here — not via pgsodium/Supabase Vault, since the service_role-only
-- backend is already the sole reader/writer of this table and is
-- therefore the right place to hold the encryption key (in Railway's
-- env vars), without introducing a second secret store.

alter table public.social_connections
  rename column access_token to access_token_enc;

alter table public.social_connections
  alter column access_token_enc type bytea using access_token_enc::bytea;

alter table public.social_connections
  add column external_account_id text,
  add column waba_id text,
  add column display_name text,
  add column refresh_token_enc bytea,
  add column token_expires_at timestamptz,
  add column scopes text[],
  add column metadata jsonb not null default '{}'::jsonb,
  add column connected_by uuid references public.users (id),
  add column last_webhook_at timestamptz,
  add column disconnected_at timestamptz;

-- Routing key for inbound webhooks (see 007_webhook_events.sql): a given
-- external account (WABA phone_number_id / FB page_id / TikTok open_id)
-- belongs to exactly one *active* tenant connection at a time. Partial
-- on disconnected_at is null so a disconnected-then-reconnected account
-- (possibly by a different tenant) doesn't collide with its own history.
create unique index social_connections_platform_external_account_idx
  on public.social_connections (platform, external_account_id)
  where disconnected_at is null;

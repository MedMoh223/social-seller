-- Social Seller — Sprint 2: columns needed to ingest inbound webhooks
-- into conversations/messages and to track outbound delivery status.

alter table public.conversations
  add column external_thread_id text,
  add column social_connection_id uuid references public.social_connections (id);

-- Find-or-create key for "which conversation does this inbound webhook
-- event belong to" — also the dedup guard against retried deliveries
-- creating duplicate conversation rows for the same customer thread.
create unique index conversations_dedup_idx
  on public.conversations (tenant_id, platform, external_thread_id)
  where external_thread_id is not null;

alter table public.messages
  add column external_message_id text,
  add column message_type text not null default 'text'
    check (message_type in ('text', 'image', 'video', 'audio', 'document', 'sticker', 'location', 'other')),
  add column attachment_url text,
  add column delivery_status text
    check (delivery_status in ('pending', 'sent', 'delivered', 'read', 'failed')),
  add column social_connection_id uuid references public.social_connections (id),
  add column error_detail text;

-- Scoped per-conversation rather than per-tenant: external_message_id
-- namespaces are platform-specific and a conversation is single-platform,
-- so (conversation_id, external_message_id) is enough to dedup retries.
create unique index messages_external_message_idx
  on public.messages (conversation_id, external_message_id)
  where external_message_id is not null;

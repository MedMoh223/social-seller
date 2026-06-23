-- Social Seller — Sprint 3: enable Supabase Realtime on messages.
-- app/conversation/[id].tsx subscribes to postgres_changes on this
-- table to reflect delivery_status updates live; without adding it to
-- the supabase_realtime publication, no change events are ever
-- broadcast, regardless of how the client subscribes. Realtime
-- respects RLS, so a subscriber still only receives rows their own
-- messages_select policy (tenant_id = current_tenant_id()) allows.

alter publication supabase_realtime add table public.messages;

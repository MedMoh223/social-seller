-- Social Seller — Sprint 3: inbox/conversation view support.
-- is_read tracks whether the merchant has seen an inbound message (the
-- unread badge in app/(tabs)/inbox.tsx). conversations.updated_at tracks
-- the most recent message activity so the inbox can sort "most recently
-- active first" without the client recomputing it on every render.
-- Both writers of messages — the Express backend (service_role, on
-- inbound webhooks) and an authenticated client (sending an outbound
-- message) — go through this trigger, so the bump happens regardless
-- of which side inserted the row.

alter table public.messages
  add column is_read boolean not null default false;

alter table public.conversations
  add column updated_at timestamptz not null default now();

create or replace function public.bump_conversation_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.conversations
  set updated_at = new.created_at
  where id = new.conversation_id;

  return new;
end;
$$;

create trigger on_message_inserted_bump_conversation
  after insert on public.messages
  for each row
  execute function public.bump_conversation_updated_at();

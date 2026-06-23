import { supabaseAdmin } from '../lib/supabaseAdmin';
import { logger } from '../lib/logger';

export type Platform = 'whatsapp' | 'facebook' | 'tiktok';
export type MessageType =
  | 'text'
  | 'image'
  | 'video'
  | 'audio'
  | 'document'
  | 'sticker'
  | 'location'
  | 'other';

interface FindOrCreateConversationParams {
  tenantId: string;
  platform: Platform;
  externalThreadId: string;
  socialConnectionId: string;
  customerName?: string | null;
  customerId?: string | null;
}

export async function findOrCreateConversation(params: FindOrCreateConversationParams): Promise<string> {
  const { data: existing, error: lookupError } = await supabaseAdmin
    .from('conversations')
    .select('id')
    .eq('tenant_id', params.tenantId)
    .eq('platform', params.platform)
    .eq('external_thread_id', params.externalThreadId)
    .maybeSingle();

  if (lookupError) {
    throw lookupError;
  }

  if (existing) {
    return existing.id as string;
  }

  const { data, error } = await supabaseAdmin
    .from('conversations')
    .insert({
      tenant_id: params.tenantId,
      platform: params.platform,
      external_thread_id: params.externalThreadId,
      social_connection_id: params.socialConnectionId,
      customer_name: params.customerName ?? null,
      customer_id: params.customerId ?? null,
      status: 'new',
    })
    .select('id')
    .single();

  if (error) {
    if (error.code === '23505') {
      // Two webhook deliveries for a brand-new thread raced past the
      // lookup above and collided on conversations_dedup_idx — the
      // other request already created the row, re-select it.
      const { data: retry, error: retryError } = await supabaseAdmin
        .from('conversations')
        .select('id')
        .eq('tenant_id', params.tenantId)
        .eq('platform', params.platform)
        .eq('external_thread_id', params.externalThreadId)
        .single();

      if (retryError) throw retryError;
      return retry.id as string;
    }
    throw error;
  }

  return data.id as string;
}

interface RecordInboundMessageParams {
  tenantId: string;
  conversationId: string;
  socialConnectionId: string;
  externalMessageId: string;
  content: string;
  messageType?: MessageType;
  attachmentUrl?: string | null;
}

export async function recordInboundMessage(params: RecordInboundMessageParams): Promise<void> {
  const { error } = await supabaseAdmin.from('messages').insert({
    tenant_id: params.tenantId,
    conversation_id: params.conversationId,
    social_connection_id: params.socialConnectionId,
    direction: 'inbound',
    content: params.content,
    external_message_id: params.externalMessageId,
    message_type: params.messageType ?? 'text',
    attachment_url: params.attachmentUrl ?? null,
  });

  if (error && error.code !== '23505') {
    // 23505 = retry of an already-recorded message (messages_external_message_idx) — not an error.
    throw error;
  }
}

export async function updateOutboundDeliveryStatus(
  externalMessageId: string,
  status: 'sent' | 'delivered' | 'read' | 'failed',
  errorDetail?: string | null,
): Promise<void> {
  const { error } = await supabaseAdmin
    .from('messages')
    .update({ delivery_status: status, error_detail: errorDetail ?? null })
    .eq('external_message_id', externalMessageId)
    .eq('direction', 'outbound');

  if (error) {
    logger.error({ err: error, externalMessageId }, 'failed to update delivery status');
  }
}

import { createHash } from 'node:crypto';
import { supabaseAdmin } from '../lib/supabaseAdmin';
import { logger } from '../lib/logger';

export type Platform = 'whatsapp' | 'facebook' | 'tiktok';

interface RecordWebhookEventParams {
  platform: Platform;
  externalEventId?: string | null;
  rawPayload: unknown;
  rawBody: Buffer;
}

// Inserts a dedup row for an inbound webhook delivery. Returns the new
// row's id on first sight of this exact delivery, or null if it's a
// byte-for-byte retry of one already recorded — callers should skip
// processing but the route must still answer 200 either way.
export async function recordWebhookEvent(params: RecordWebhookEventParams): Promise<string | null> {
  const payloadHash = createHash('sha256').update(params.rawBody).digest('hex');

  const { data, error } = await supabaseAdmin
    .from('webhook_events')
    .insert({
      platform: params.platform,
      external_event_id: params.externalEventId ?? null,
      payload_hash: payloadHash,
      raw_payload: params.rawPayload,
      status: 'received',
    })
    .select('id')
    .single();

  if (error) {
    if (error.code === '23505') {
      return null;
    }
    logger.error({ err: error, platform: params.platform }, 'failed to record webhook event');
    throw error;
  }

  return data.id as string;
}

interface ResolveOutcome {
  status: 'processed' | 'failed' | 'ignored';
  tenantId?: string | null;
  socialConnectionId?: string | null;
  errorDetail?: string | null;
}

export async function markWebhookEventResolved(id: string, outcome: ResolveOutcome) {
  const { error } = await supabaseAdmin
    .from('webhook_events')
    .update({
      status: outcome.status,
      tenant_id: outcome.tenantId ?? null,
      social_connection_id: outcome.socialConnectionId ?? null,
      error_detail: outcome.errorDetail ?? null,
      processed_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) {
    logger.error({ err: error, id }, 'failed to update webhook event status');
  }
}

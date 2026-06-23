import { supabaseAdmin } from '../lib/supabaseAdmin';
import { logger } from '../lib/logger';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

interface ExpoPushTicket {
  status?: string;
  message?: string;
}

// A push token is effectively a bearer credential for notifying that
// device — never logged in full, only enough of a prefix to correlate
// a failure with a specific row in push_tokens.
function tokenPrefix(token: string): string {
  return token.slice(0, 8);
}

export async function sendPushNotification(
  token: string,
  title: string,
  body: string,
  data?: Record<string, unknown>,
): Promise<void> {
  try {
    const response = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ to: token, title, body, data }),
    });

    if (!response.ok) {
      logger.warn({ tokenPrefix: tokenPrefix(token), status: response.status }, 'push notification request failed');
      return;
    }

    const result = (await response.json()) as { data?: ExpoPushTicket | ExpoPushTicket[] };
    const ticket = Array.isArray(result.data) ? result.data[0] : result.data;

    if (ticket?.status === 'error') {
      logger.warn({ tokenPrefix: tokenPrefix(token), error: ticket.message }, 'push notification ticket error');
    }
  } catch (err) {
    logger.error({ err, tokenPrefix: tokenPrefix(token) }, 'failed to send push notification');
  }
}

// Loads every push token registered for the tenant — explicitly scoped
// by tenant_id, so a token belonging to a different tenant is never
// even loaded into memory here, let alone notified.
export async function notifyTenantNewMessage(tenantId: string, title: string, body: string): Promise<void> {
  const { data: tokens, error } = await supabaseAdmin.from('push_tokens').select('token').eq('tenant_id', tenantId);

  if (error) {
    logger.error({ err: error, tenantId }, 'failed to load push tokens for tenant');
    return;
  }

  await Promise.all((tokens ?? []).map((row) => sendPushNotification(row.token, title, body)));
}

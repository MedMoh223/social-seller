import { supabaseAdmin } from '../lib/supabaseAdmin';
import { logger } from '../lib/logger';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

interface ExpoPushTicket {
  status?: string;
  message?: string;
  details?: Record<string, unknown>;
}

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
      logger.warn(
        { tokenPrefix: tokenPrefix(token), error: ticket.message, details: ticket.details },
        'push notification ticket error',
      );
    } else {
      logger.info(
        { tokenPrefix: tokenPrefix(token), status: ticket?.status },
        'push notification ticket ok',
      );
    }
  } catch (err) {
    logger.error({ err, tokenPrefix: tokenPrefix(token) }, 'failed to send push notification');
  }
}

export async function notifyTenantNewMessage(tenantId: string, title: string, body: string): Promise<void> {
  const { data: tokens, error } = await supabaseAdmin.from('push_tokens').select('token').eq('tenant_id', tenantId);

  if (error) {
    logger.error({ err: error, tenantId }, 'failed to load push tokens for tenant');
    return;
  }

  logger.info({ tenantId, tokenCount: (tokens ?? []).length }, 'notifying tenant');
  await Promise.all((tokens ?? []).map((row) => sendPushNotification(row.token, title, body)));
}

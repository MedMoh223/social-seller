import { Router } from 'express';
import { env } from '../../config/env';
import { supabaseAdmin } from '../../lib/supabaseAdmin';
import { decryptToken, encryptToken } from '../../lib/tokenCrypto';
import { exchangeForLongLivedToken } from '../../services/metaGraphClient';
import { logger } from '../../lib/logger';

export const tokenRefreshRouter = Router();

// POST /internal/token-refresh
// Called by the Railway cron job every 45 days.
// Protected by Authorization: Bearer <INTERNAL_CRON_SECRET>.
// Finds all active WhatsApp connections whose token_expires_at is within
// the next 15 days and re-exchanges the long-lived token for a fresh one.
// Facebook page tokens derived from a long-lived user token never expire
// (token_expires_at = null) so they are excluded from this query.
tokenRefreshRouter.post('/', async (req, res) => {
  // Auth check — must match regardless of whether the secret is set
  const secret = env.INTERNAL_CRON_SECRET;
  const authHeader = req.headers.authorization;

  if (!secret || authHeader !== `Bearer ${secret}`) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }

  // Connections expiring within 15 days
  const cutoff = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString();

  const { data: connections, error: fetchError } = await supabaseAdmin
    .from('social_connections')
    .select('id, platform, tenant_id, access_token_enc, token_expires_at')
    .is('disconnected_at', null)
    .in('platform', ['whatsapp', 'facebook'])
    .not('token_expires_at', 'is', null)
    .lte('token_expires_at', cutoff);

  if (fetchError) {
    logger.error({ err: fetchError }, 'token-refresh: failed to load expiring connections');
    res.status(500).json({ error: 'db_error' });
    return;
  }

  const results = { total: connections?.length ?? 0, refreshed: 0, failed: 0 };

  for (const conn of connections ?? []) {
    try {
      const currentToken = decryptToken(conn.access_token_enc as string);
      const refreshed = await exchangeForLongLivedToken(currentToken);

      const newExpiresAt = refreshed.expires_in
        ? new Date(Date.now() + refreshed.expires_in * 1000).toISOString()
        : null;

      const { error: updateError } = await supabaseAdmin
        .from('social_connections')
        .update({
          access_token_enc: encryptToken(refreshed.access_token),
          token_expires_at: newExpiresAt,
          status: 'active',
        })
        .eq('id', conn.id);

      if (updateError) throw updateError;

      logger.info(
        { connectionId: conn.id, platform: conn.platform, newExpiresAt },
        'token-refresh: token renewed successfully',
      );
      results.refreshed++;
    } catch (err) {
      // Non-blocking: log and continue with the remaining connections.
      // The token stays in place — it may still have a few days left.
      // On the next cron run (45 days later) it will be picked up again,
      // or the tenant will see a 401 and reconnect from the app.
      logger.error(
        { err, connectionId: conn.id, platform: conn.platform, tenantId: conn.tenant_id },
        'token-refresh: failed to renew token — tenant may need to reconnect',
      );
      results.failed++;
    }
  }

  logger.info(results, 'token-refresh: job completed');
  res.status(200).json(results);
});

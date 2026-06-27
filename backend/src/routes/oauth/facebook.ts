import { Router, type Response } from 'express';
import { env } from '../../config/env';
import { consumeOAuthState } from '../../services/oauthStateService';
import { exchangeCodeForToken, exchangeForLongLivedToken, graphGet, graphPost } from '../../services/metaGraphClient';
import { upsertConnection } from '../../services/connectionsService';
import { recordAuditLog } from '../../services/auditLogService';
import { ConflictError } from '../../lib/httpErrors';
import { logger } from '../../lib/logger';

export const facebookOAuthRouter = Router();

const CALLBACK_PATH = '/oauth/facebook/callback';

function redirectToApp(res: Response, status: 'success' | 'error', reason?: string) {
  // See whatsapp.ts and app.ts (/oauth/redirect) for the full explanation.
  const qs = new URLSearchParams({ platform: 'facebook', status });
  if (reason) qs.set('reason', reason);
  res.redirect(302, `/oauth/redirect?${qs.toString()}`);
}

facebookOAuthRouter.get('/callback', async (req, res) => {
  const code = req.query.code;
  const state = req.query.state;
  const providerError = req.query.error;
  if (providerError || typeof code !== 'string' || typeof state !== 'string') {
    redirectToApp(res, 'error', 'denied');
    return;
  }

  const consumed = await consumeOAuthState(state, 'facebook');

  if (!consumed) {
    redirectToApp(res, 'error', 'invalid_state');
    return;
  }

  try {
    const redirectUri = `${env.BACKEND_PUBLIC_URL}${CALLBACK_PATH}`;
    const shortLived = await exchangeCodeForToken({ code, redirectUri });
    const longLived = await exchangeForLongLivedToken(shortLived.access_token);

    const accounts = await graphGet<{ data: Array<{ id: string; name: string; access_token: string }> }>(
      '/me/accounts',
      longLived.access_token,
    );

    const page = accounts.data[0];

    if (!page) {
      redirectToApp(res, 'error', 'no_page');
      return;
    }

    const connection = await upsertConnection({
      tenantId: consumed.tenantId,
      connectedBy: consumed.userId,
      platform: 'facebook',
      externalAccountId: page.id,
      displayName: page.name,
      accessToken: page.access_token,
      // Page access tokens derived from a long-lived user token have no
      // expiration — storing null prevents the refresh job from treating
      // them as expiring (they don't, unless the user revokes app access).
      tokenExpiresAt: null,
    });

    // Subscribe the page to the app so that Meta delivers Messenger
    // webhook events (messages, delivery receipts, read receipts) to
    // our backend. Without this call, Meta sends no events even though
    // the webhook URL is registered at the app level.
    // subscribed_fields must be query params (not JSON body) for this endpoint.
    try {
      await graphPost<{ success: boolean }>(
        `/${page.id}/subscribed_apps?subscribed_fields=messages%2Cmessage_deliveries%2Cmessage_reads`,
        page.access_token,
        {},
      );
    } catch (subErr) {
      // Non-fatal: log but don't block the connection — the merchant can
      // trigger a re-subscribe by disconnecting and reconnecting the page.
      logger.warn({ err: subErr, pageId: page.id }, 'could not subscribe page to app webhooks');
    }

    await recordAuditLog({
      tenantId: consumed.tenantId,
      userId: consumed.userId,
      action: 'channel_connected',
      tableName: 'social_connections',
      recordId: connection.id,
      newValue: { platform: 'facebook', external_account_id: page.id },
    });

    redirectToApp(res, 'success', undefined);
  } catch (err) {
    if (err instanceof ConflictError) {
      redirectToApp(res, 'error', 'already_connected');
      return;
    }
    logger.error({ err }, 'facebook oauth callback failed');
    redirectToApp(res, 'error', 'internal_error');
  }
});

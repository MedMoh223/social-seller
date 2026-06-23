import { Router, type Response } from 'express';
import { env } from '../../config/env';
import { consumeOAuthState } from '../../services/oauthStateService';
import { exchangeTikTokCodeForToken } from '../../services/tiktokClient';
import { upsertConnection } from '../../services/connectionsService';
import { recordAuditLog } from '../../services/auditLogService';
import { ConflictError } from '../../lib/httpErrors';
import { logger } from '../../lib/logger';

export const tiktokOAuthRouter = Router();

const CALLBACK_PATH = '/oauth/tiktok/callback';

function redirectToApp(res: Response, status: 'success' | 'error', reason?: string) {
  const params = new URLSearchParams({ platform: 'tiktok' });
  if (reason) params.set('reason', reason);
  res.redirect(`socialseller://oauth-${status}?${params.toString()}`);
}

tiktokOAuthRouter.get('/callback', async (req, res) => {
  const code = req.query.code;
  const state = req.query.state;
  const providerError = req.query.error;

  if (providerError || typeof code !== 'string' || typeof state !== 'string') {
    redirectToApp(res, 'error', 'denied');
    return;
  }

  const consumed = await consumeOAuthState(state, 'tiktok');

  if (!consumed) {
    redirectToApp(res, 'error', 'invalid_state');
    return;
  }

  try {
    const redirectUri = `${env.BACKEND_PUBLIC_URL}${CALLBACK_PATH}`;
    const tokenResponse = await exchangeTikTokCodeForToken({ code, redirectUri });

    const connection = await upsertConnection({
      tenantId: consumed.tenantId,
      connectedBy: consumed.userId,
      platform: 'tiktok',
      externalAccountId: tokenResponse.open_id,
      accessToken: tokenResponse.access_token,
      refreshToken: tokenResponse.refresh_token ?? null,
      tokenExpiresAt: tokenResponse.expires_in
        ? new Date(Date.now() + tokenResponse.expires_in * 1000).toISOString()
        : null,
    });

    await recordAuditLog({
      tenantId: consumed.tenantId,
      userId: consumed.userId,
      action: 'channel_connected',
      tableName: 'social_connections',
      recordId: connection.id,
      newValue: { platform: 'tiktok', external_account_id: tokenResponse.open_id },
    });

    redirectToApp(res, 'success');
  } catch (err) {
    if (err instanceof ConflictError) {
      redirectToApp(res, 'error', 'already_connected');
      return;
    }
    logger.error({ err }, 'tiktok oauth callback failed');
    redirectToApp(res, 'error', 'internal_error');
  }
});

import { Router, type Response } from 'express';
import { env } from '../../config/env';
import { consumeOAuthState } from '../../services/oauthStateService';
import { exchangeCodeForToken, exchangeForLongLivedToken, graphGet } from '../../services/metaGraphClient';
import { upsertConnection } from '../../services/connectionsService';
import { recordAuditLog } from '../../services/auditLogService';
import { ConflictError } from '../../lib/httpErrors';
import { logger } from '../../lib/logger';

export const facebookOAuthRouter = Router();

const CALLBACK_PATH = '/oauth/facebook/callback';

function redirectToApp(res: Response, status: 'success' | 'error', reason?: string) {
  const params = new URLSearchParams({ platform: 'facebook' });
  if (reason) params.set('reason', reason);
  const deepLink = `socialseller://oauth-${status}?${params.toString()}`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Connexion ${status === 'success' ? 'réussie' : 'échouée'}</title>
    <meta http-equiv="refresh" content="0;url=${deepLink}" />
    <script>window.location.href = "${deepLink}";</script>
  </head>
  <body>
    <p>${status === 'success' ? 'Connexion réussie. Retour à l\'application…' : 'Connexion échouée. Retour à l\'application…'}</p>
    <a href="${deepLink}">Retourner à l'application</a>
  </body>
</html>`);
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
      tokenExpiresAt: longLived.expires_in
        ? new Date(Date.now() + longLived.expires_in * 1000).toISOString()
        : null,
    });

    await recordAuditLog({
      tenantId: consumed.tenantId,
      userId: consumed.userId,
      action: 'channel_connected',
      tableName: 'social_connections',
      recordId: connection.id,
      newValue: { platform: 'facebook', external_account_id: page.id },
    });

    redirectToApp(res, 'success');
  } catch (err) {
    if (err instanceof ConflictError) {
      redirectToApp(res, 'error', 'already_connected');
      return;
    }
    logger.error({ err }, 'facebook oauth callback failed');
    redirectToApp(res, 'error', 'internal_error');
  }
});

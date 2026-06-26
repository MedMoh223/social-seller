import { Router, type Response } from 'express';
import { env } from '../../config/env';
import { consumeOAuthState } from '../../services/oauthStateService';
import { exchangeCodeForToken, exchangeForLongLivedToken, graphGet } from '../../services/metaGraphClient';
import { upsertConnection } from '../../services/connectionsService';
import { recordAuditLog } from '../../services/auditLogService';
import { ConflictError } from '../../lib/httpErrors';
import { logger } from '../../lib/logger';

export const whatsappOAuthRouter = Router();

const CALLBACK_PATH = '/oauth/whatsapp/callback';

function redirectToApp(res: Response, status: 'success' | 'error', reason?: string) {
  const params = new URLSearchParams({ platform: 'whatsapp' });
  if (reason) params.set('reason', reason);
  const deepLink = `socialseller://oauth-${status}?${params.toString()}`;

  // A bare res.redirect() to a custom scheme is treated as a broken URL
  // by most mobile browsers — they show a "page not found" error instead
  // of handing the link back to the OS. Returning an HTML page that
  // immediately self-redirects via window.location lets the browser
  // execute the redirect in JavaScript, which correctly triggers the
  // OS intent dispatch and lets expo-web-browser close the session.
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

whatsappOAuthRouter.get('/callback', async (req, res) => {
  const code = req.query.code;
  const state = req.query.state;
  const providerError = req.query.error;

  if (providerError || typeof code !== 'string' || typeof state !== 'string') {
    redirectToApp(res, 'error', 'denied');
    return;
  }

  const consumed = await consumeOAuthState(state, 'whatsapp');

  if (!consumed) {
    redirectToApp(res, 'error', 'invalid_state');
    return;
  }

  try {
    const redirectUri = `${env.BACKEND_PUBLIC_URL}${CALLBACK_PATH}`;
    const shortLived = await exchangeCodeForToken({ code, redirectUri });

    // Discover the WABA using the short-lived token — it retains the
    // business_management scope needed for Business Manager API calls.
    // We exchange for a long-lived token only at the end, just before
    // storage, so the discovery calls are never affected.
    const businesses = await graphGet<{ data: Array<{ id: string }> }>('/me/businesses', shortLived.access_token);
    const business = businesses.data[0];

    if (!business) {
      redirectToApp(res, 'error', 'no_business');
      return;
    }

    const wabas = await graphGet<{ data: Array<{ id: string; name: string }> }>(
      `/${business.id}/owned_whatsapp_business_accounts`,
      shortLived.access_token,
    );
    const waba = wabas.data[0];

    if (!waba) {
      redirectToApp(res, 'error', 'no_waba');
      return;
    }

    const phoneNumbers = await graphGet<{
      data: Array<{ id: string; display_phone_number: string; verified_name: string }>;
    }>(`/${waba.id}/phone_numbers`, shortLived.access_token);
    const phoneNumber = phoneNumbers.data[0];

    if (!phoneNumber) {
      redirectToApp(res, 'error', 'no_phone_number');
      return;
    }

    // Exchange for long-lived token (~60 days) only now, after discovery
    // is complete. This is what gets stored and used for sending messages.
    const longLived = await exchangeForLongLivedToken(shortLived.access_token);
    const tokenExpiresAt = longLived.expires_in
      ? new Date(Date.now() + longLived.expires_in * 1000).toISOString()
      : null;

    const connection = await upsertConnection({
      tenantId: consumed.tenantId,
      connectedBy: consumed.userId,
      platform: 'whatsapp',
      externalAccountId: phoneNumber.id,
      wabaId: waba.id,
      displayName: phoneNumber.verified_name || phoneNumber.display_phone_number,
      accessToken: longLived.access_token,
      tokenExpiresAt,
      metadata: {
        display_phone_number: phoneNumber.display_phone_number,
        phone_number_id: phoneNumber.id,
      },
    });

    await recordAuditLog({
      tenantId: consumed.tenantId,
      userId: consumed.userId,
      action: 'channel_connected',
      tableName: 'social_connections',
      recordId: connection.id,
      newValue: { platform: 'whatsapp', external_account_id: phoneNumber.id },
    });

    redirectToApp(res, 'success');
  } catch (err) {
    if (err instanceof ConflictError) {
      redirectToApp(res, 'error', 'already_connected');
      return;
    }
    logger.error({ err }, 'whatsapp oauth callback failed');
    redirectToApp(res, 'error', 'internal_error');
  }
});

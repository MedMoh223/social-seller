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
  // Route through the /oauth/redirect bridge page (see app.ts) so that:
  //  - Android: JavaScript navigates to an intent:// URI → Chrome fires the
  //             Intent AND closes the Custom Tab automatically.
  //  - iOS:     JavaScript navigates to socialseller:// → ASWebAuthenticationSession
  //             intercepts it before the page renders.
  // A direct 302 → intent:// does NOT work because Chrome's network stack does
  // not recognise intent:// as a scheme to follow (only JS navigation does).
  const qs = new URLSearchParams({ platform: 'whatsapp', status });
  if (reason) qs.set('reason', reason);
  res.redirect(302, `/oauth/redirect?${qs.toString()}`);
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

    // Discover the WABA via debug_token + app access token.
    // This is a server-side call that requires no Business Manager setup
    // and bypasses all the permission issues on the user-facing endpoints.
    // The granular_scopes field lists the WABA IDs the user granted access to.
    const appAccessToken = `${env.META_APP_ID}|${env.META_APP_SECRET}`;
    const debugPath = `/debug_token?input_token=${encodeURIComponent(shortLived.access_token)}`;
    const debugInfo = await graphGet<{
      data: {
        granular_scopes?: Array<{ scope: string; target_ids?: string[] }>;
      };
    }>(debugPath, appAccessToken);

    const wabaIds = debugInfo.data.granular_scopes
      ?.find((s) => s.scope === 'whatsapp_business_management')
      ?.target_ids ?? [];
    const wabaId = wabaIds[0];

    if (!wabaId) {
      redirectToApp(res, 'error', 'no_waba');
      return;
    }

    const phoneNumbers = await graphGet<{
      data: Array<{ id: string; display_phone_number: string; verified_name: string }>;
    }>(`/${wabaId}/phone_numbers`, shortLived.access_token);
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
      wabaId,
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

    redirectToApp(res, 'success', undefined);
  } catch (err) {
    if (err instanceof ConflictError) {
      redirectToApp(res, 'error', 'already_connected');
      return;
    }
    logger.error({ err }, 'whatsapp oauth callback failed');
    redirectToApp(res, 'error', 'internal_error');
  }
});

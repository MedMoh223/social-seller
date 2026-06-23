import { Router } from 'express';
import { verifyTikTokSignature, TIKTOK_SIGNATURE_HEADER } from '../../services/tiktokClient';
import { recordWebhookEvent, markWebhookEventResolved } from '../../services/webhookEventService';
import { resolveTenantForExternalAccount } from '../../services/connectionsService';
import { findOrCreateConversation, recordInboundMessage } from '../../services/conversationService';
import { logger } from '../../lib/logger';
import { tiktokWebhookPayloadSchema } from '../../validators/tiktok.schema';

export const tiktokWebhookRouter = Router();

// TikTok's subscription/verification model differs from Meta's GET
// hub.challenge handshake — subscriptions are typically configured via
// a TikTok-for-Business API call or developer portal instead of a live
// GET challenge to this URL. VERIFY against TikTok's current docs
// whether a GET handshake is needed here at all before going live; POST
// is the path that matters for actually ingesting messages regardless.

tiktokWebhookRouter.post('/', async (req, res) => {
  const rawBody = req.body as Buffer;

  try {
    verifyTikTokSignature(rawBody, req.header(TIKTOK_SIGNATURE_HEADER));
  } catch {
    res.sendStatus(401);
    return;
  }

  // Ack immediately, then process — see webhooks/whatsapp.ts for why
  // everything below lives in a single try/catch.
  res.sendStatus(200);

  try {
    const payload = JSON.parse(rawBody.toString('utf8'));

    const eventId = await recordWebhookEvent({ platform: 'tiktok', rawPayload: payload, rawBody });

    if (!eventId) {
      return;
    }

    const parsed = tiktokWebhookPayloadSchema.safeParse(payload);

    if (!parsed.success) {
      logger.warn({ issues: parsed.error.issues }, 'unrecognized tiktok webhook payload shape');
      await markWebhookEventResolved(eventId, { status: 'failed', errorDetail: 'schema mismatch' });
      return;
    }

    const { open_id: openId, conversation_id: externalThreadId, message } = parsed.data;
    const resolved = await resolveTenantForExternalAccount('tiktok', openId);

    if (!resolved) {
      logger.warn({ openId }, 'no social_connections match for tiktok webhook');
      await markWebhookEventResolved(eventId, {
        status: 'ignored',
        errorDetail: 'no matching social_connections row',
      });
      return;
    }

    const conversationId = await findOrCreateConversation({
      tenantId: resolved.tenantId,
      platform: 'tiktok',
      externalThreadId,
      socialConnectionId: resolved.socialConnectionId,
    });

    await recordInboundMessage({
      tenantId: resolved.tenantId,
      conversationId,
      socialConnectionId: resolved.socialConnectionId,
      externalMessageId: message.id,
      content: message.text,
    });

    await markWebhookEventResolved(eventId, {
      status: 'processed',
      tenantId: resolved.tenantId,
      socialConnectionId: resolved.socialConnectionId,
    });
  } catch (err) {
    logger.error({ err }, 'failed to process tiktok webhook delivery');
  }
});

import { Router } from 'express';
import { env } from '../../config/env';
import { verifyMetaSignature, verifyWebhookChallenge, graphGet } from '../../services/metaGraphClient';
import { recordWebhookEvent, markWebhookEventResolved } from '../../services/webhookEventService';
import { resolveTenantForExternalAccount } from '../../services/connectionsService';
import { findOrCreateConversation, recordInboundMessage } from '../../services/conversationService';
import { notifyTenantNewMessage } from '../../services/pushService';
import { logger } from '../../lib/logger';
import { facebookWebhookPayloadSchema } from '../../validators/facebook.schema';
import { supabaseAdmin } from '../../lib/supabaseAdmin';
import { decryptToken } from '../../lib/tokenCrypto';

const PUSH_PREVIEW_LENGTH = 50;

// Fetch a Messenger sender's display name via the Graph API using the
// page access token. Returns null on any error — name is best-effort
// and must never block message delivery.
async function fetchSenderName(senderId: string, pageToken: string): Promise<string | null> {
  try {
    const profile = await graphGet<{ name?: string }>(`/${senderId}?fields=name`, pageToken);
    return profile.name ?? null;
  } catch (err) {
    logger.warn({ err, senderId }, 'could not fetch facebook sender name from Graph API');
    return null;
  }
}

export const facebookWebhookRouter = Router();

facebookWebhookRouter.get('/', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && verifyWebhookChallenge(String(token), env.FACEBOOK_WEBHOOK_VERIFY_TOKEN)) {
    res.status(200).send(String(challenge));
    return;
  }

  res.sendStatus(403);
});

facebookWebhookRouter.post('/', async (req, res) => {
  const rawBody = req.body as Buffer;

  try {
    verifyMetaSignature(rawBody, req.header('x-hub-signature-256'));
  } catch {
    res.sendStatus(401);
    return;
  }

  // Ack immediately, then process — see whatsapp.ts for why everything
  // below lives in a single try/catch (response already sent, so an
  // uncaught rejection here would be an unhandled promise rejection
  // rather than something Express's error handler can answer).
  res.sendStatus(200);

  try {
    const payload = JSON.parse(rawBody.toString('utf8'));

    const eventId = await recordWebhookEvent({ platform: 'facebook', rawPayload: payload, rawBody });

    if (!eventId) {
      return;
    }

    const parsed = facebookWebhookPayloadSchema.safeParse(payload);

    if (!parsed.success) {
      logger.warn({ issues: parsed.error.issues }, 'unrecognized facebook webhook payload shape');
      await markWebhookEventResolved(eventId, { status: 'failed', errorDetail: 'schema mismatch' });
      return;
    }

    let lastResolved: { tenantId: string; socialConnectionId: string } | null = null;

    for (const entry of parsed.data.entry) {
      const pageId = entry.id;
      const resolved = await resolveTenantForExternalAccount('facebook', pageId);

      if (!resolved) {
        logger.warn({ pageId }, 'no social_connections match for facebook webhook');
        continue;
      }

      lastResolved = resolved;

      // Decrypt the page access token once per entry — used for sender
      // name lookups. Failures are non-fatal: name stays null and
      // delivery continues normally.
      let pageToken: string | null = null;
      try {
        const { data: conn } = await supabaseAdmin
          .from('social_connections')
          .select('access_token_enc')
          .eq('id', resolved.socialConnectionId)
          .single();
        if (conn?.access_token_enc) {
          pageToken = decryptToken(conn.access_token_enc);
        }
      } catch (err) {
        logger.warn({ err }, 'could not load page access token for sender name lookup');
      }

      // Cache sender names within this delivery batch so multiple
      // messages from the same sender only trigger one Graph API call.
      const senderNameCache = new Map<string, string | null>();

      for (const messaging of entry.messaging ?? []) {
        if (!messaging.message?.text) {
          continue; // postbacks/reads/typing indicators — out of scope
        }

        const senderId = messaging.sender.id;

        // Fetch sender name (best-effort, cached per batch)
        if (pageToken && !senderNameCache.has(senderId)) {
          senderNameCache.set(senderId, await fetchSenderName(senderId, pageToken));
        }
        const customerName = senderNameCache.get(senderId) ?? null;

        const conversationId = await findOrCreateConversation({
          tenantId: resolved.tenantId,
          platform: 'facebook',
          externalThreadId: senderId,
          socialConnectionId: resolved.socialConnectionId,
          customerName,
          customerId: senderId,
        });

        const content = messaging.message.text;

        await recordInboundMessage({
          tenantId: resolved.tenantId,
          conversationId,
          socialConnectionId: resolved.socialConnectionId,
          externalMessageId: messaging.message.mid,
          content,
          messageType: 'text',
        });

        const preview = content.length > PUSH_PREVIEW_LENGTH ? `${content.slice(0, PUSH_PREVIEW_LENGTH)}…` : content;
        await notifyTenantNewMessage(resolved.tenantId, 'Nouveau message Facebook', preview);
      }
    }

    await markWebhookEventResolved(eventId, {
      status: lastResolved ? 'processed' : 'ignored',
      tenantId: lastResolved?.tenantId ?? null,
      socialConnectionId: lastResolved?.socialConnectionId ?? null,
    });
  } catch (err) {
    logger.error({ err }, 'failed to process facebook webhook delivery');
  }
});

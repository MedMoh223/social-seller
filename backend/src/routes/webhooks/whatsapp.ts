import { Router } from 'express';
import { env } from '../../config/env';
import { verifyMetaSignature, verifyWebhookChallenge } from '../../services/metaGraphClient';
import { recordWebhookEvent, markWebhookEventResolved } from '../../services/webhookEventService';
import { resolveTenantForExternalAccount } from '../../services/connectionsService';
import {
  findOrCreateConversation,
  recordInboundMessage,
  updateOutboundDeliveryStatus,
} from '../../services/conversationService';
import { notifyTenantNewMessage } from '../../services/pushService';
import { logger } from '../../lib/logger';
import { whatsappWebhookPayloadSchema } from '../../validators/whatsapp.schema';

const PUSH_PREVIEW_LENGTH = 50;

export const whatsappWebhookRouter = Router();

// One-time subscription handshake Meta performs when the webhook URL is
// registered in the App Dashboard.
whatsappWebhookRouter.get('/', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && verifyWebhookChallenge(String(token), env.WHATSAPP_WEBHOOK_VERIFY_TOKEN)) {
    res.status(200).send(String(challenge));
    return;
  }

  res.sendStatus(403);
});

whatsappWebhookRouter.post('/', async (req, res) => {
  const rawBody = req.body as Buffer;

  try {
    verifyMetaSignature(rawBody, req.header('x-hub-signature-256'));
  } catch {
    res.sendStatus(401);
    return;
  }

  // Ack immediately once the signature is valid — Meta retries
  // aggressively on anything other than a fast 2xx. Everything below is
  // wrapped in a single try/catch since the response is already sent:
  // an uncaught rejection here would otherwise be an unhandled promise
  // rejection rather than something Express's error handler can answer.
  res.sendStatus(200);

  try {
    const payload = JSON.parse(rawBody.toString('utf8'));

    const eventId = await recordWebhookEvent({ platform: 'whatsapp', rawPayload: payload, rawBody });

    if (!eventId) {
      return; // exact retry of a delivery already recorded
    }

    const parsed = whatsappWebhookPayloadSchema.safeParse(payload);

    if (!parsed.success) {
      logger.warn({ issues: parsed.error.issues }, 'unrecognized whatsapp webhook payload shape');
      await markWebhookEventResolved(eventId, { status: 'failed', errorDetail: 'schema mismatch' });
      return;
    }

    let lastResolved: { tenantId: string; socialConnectionId: string } | null = null;

    for (const entry of parsed.data.entry) {
      for (const change of entry.changes) {
        const phoneNumberId = change.value.metadata.phone_number_id;
        const resolved = await resolveTenantForExternalAccount('whatsapp', phoneNumberId);

        if (!resolved) {
          logger.warn({ phoneNumberId }, 'no social_connections match for whatsapp webhook');
          continue;
        }

        lastResolved = resolved;

        // Build a quick lookup map: wa_id → profile name from the
        // contacts array Meta includes alongside each message batch.
        const contactNameByPhone = new Map<string, string>();
        for (const contact of change.value.contacts ?? []) {
          if (contact.profile?.name) {
            contactNameByPhone.set(contact.wa_id, contact.profile.name);
          }
        }

        for (const message of change.value.messages ?? []) {
          const customerName = contactNameByPhone.get(message.from) ?? null;

          const conversationId = await findOrCreateConversation({
            tenantId: resolved.tenantId,
            platform: 'whatsapp',
            externalThreadId: message.from,
            socialConnectionId: resolved.socialConnectionId,
            customerName,
            customerId: message.from,
          });

          const content = message.text?.body ?? `[${message.type}]`;

          await recordInboundMessage({
            tenantId: resolved.tenantId,
            conversationId,
            socialConnectionId: resolved.socialConnectionId,
            externalMessageId: message.id,
            content,
            messageType: message.type === 'text' ? 'text' : 'other',
          });

          const preview = content.length > PUSH_PREVIEW_LENGTH ? `${content.slice(0, PUSH_PREVIEW_LENGTH)}…` : content;
          await notifyTenantNewMessage(resolved.tenantId, 'Nouveau message WhatsApp', preview, conversationId);
        }

        for (const status of change.value.statuses ?? []) {
          await updateOutboundDeliveryStatus(status.id, status.status, status.errors?.[0]?.title ?? null);
        }
      }
    }

    await markWebhookEventResolved(eventId, {
      status: lastResolved ? 'processed' : 'ignored',
      tenantId: lastResolved?.tenantId ?? null,
      socialConnectionId: lastResolved?.socialConnectionId ?? null,
    });
  } catch (err) {
    logger.error({ err }, 'failed to process whatsapp webhook delivery');
  }
});

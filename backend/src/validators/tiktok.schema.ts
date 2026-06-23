import { z } from 'zod';

// Best-effort shape pending verification against TikTok's current
// Business Messaging webhook payload docs — field names (open_id,
// conversation_id, message.id/text) follow the conceptual equivalent
// of the WhatsApp/Facebook payloads, not a confirmed TikTok schema.
// webhook_events.raw_payload still captures the real body regardless,
// so a wrong guess here is correctable without losing any deliveries.
export const tiktokWebhookPayloadSchema = z.object({
  open_id: z.string(),
  conversation_id: z.string(),
  message: z.object({
    id: z.string(),
    text: z.string(),
  }),
});

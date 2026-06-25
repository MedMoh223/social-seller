import { z } from 'zod';

const messagingEntrySchema = z.object({
  sender: z.object({ id: z.string() }),
  recipient: z.object({ id: z.string() }).optional(),
  timestamp: z.number().optional(),
  message: z.object({ mid: z.string(), text: z.string().optional() }).optional(),
  // Delivery receipts: Meta sends the list of mids that were delivered
  // plus a watermark timestamp (all messages before it were delivered).
  delivery: z
    .object({
      mids: z.array(z.string()).optional(),
      watermark: z.number(),
    })
    .optional(),
  // Read receipts: Meta sends only a watermark (no individual mids).
  read: z.object({ watermark: z.number() }).optional(),
});

const entrySchema = z.object({
  id: z.string(),
  messaging: z.array(messagingEntrySchema).optional(),
});

export const facebookWebhookPayloadSchema = z.object({
  object: z.string(),
  entry: z.array(entrySchema),
});

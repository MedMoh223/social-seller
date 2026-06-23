import { z } from 'zod';

const messagingEntrySchema = z.object({
  sender: z.object({ id: z.string() }),
  recipient: z.object({ id: z.string() }).optional(),
  message: z.object({ mid: z.string(), text: z.string().optional() }).optional(),
});

const entrySchema = z.object({
  id: z.string(),
  messaging: z.array(messagingEntrySchema).optional(),
});

export const facebookWebhookPayloadSchema = z.object({
  object: z.string(),
  entry: z.array(entrySchema),
});

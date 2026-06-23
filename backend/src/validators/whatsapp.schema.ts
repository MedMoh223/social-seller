import { z } from 'zod';

const statusSchema = z.object({
  id: z.string(),
  status: z.enum(['sent', 'delivered', 'read', 'failed']),
  errors: z.array(z.object({ title: z.string().optional() })).optional(),
});

const messageSchema = z.object({
  from: z.string(),
  id: z.string(),
  type: z.string(),
  text: z.object({ body: z.string() }).optional(),
});

const changeValueSchema = z.object({
  metadata: z.object({ phone_number_id: z.string() }),
  messages: z.array(messageSchema).optional(),
  statuses: z.array(statusSchema).optional(),
});

const changeSchema = z.object({
  field: z.string(),
  value: changeValueSchema,
});

const entrySchema = z.object({
  id: z.string(),
  changes: z.array(changeSchema),
});

export const whatsappWebhookPayloadSchema = z.object({
  object: z.string(),
  entry: z.array(entrySchema),
});

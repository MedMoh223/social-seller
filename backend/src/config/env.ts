import { z } from 'zod';

// Parsed and validated once at boot — fail fast on a missing/malformed
// required var instead of crashing later mid-request. Meta/TikTok
// secrets are optional here (they depend on external developer account
// setup the rest of this skeleton doesn't need); the modules that use
// them (metaGraphClient, tiktokClient) check presence themselves before
// the first real call, so /health and /auth/whatsapp-activation keep
// working even before those channels are configured.
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  CORS_ALLOWED_ORIGINS: z
    .string()
    .default('')
    .transform((value) => value.split(',').map((origin) => origin.trim()).filter(Boolean)),

  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  // This service's own public HTTPS URL (Railway domain or an ngrok
  // tunnel in dev) — must exactly match the redirect_uri registered
  // with Meta/TikTok and used in both the /start authorization URL and
  // the /callback token exchange (OAuth requires an exact match).
  BACKEND_PUBLIC_URL: z.string().url(),

  TOKEN_ENCRYPTION_KEY: z
    .string()
    .min(1)
    .refine((value) => Buffer.from(value, 'base64').length === 32, {
      message: 'TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte (256-bit) key',
    }),

  META_APP_ID: z.string().min(1).optional(),
  META_APP_SECRET: z.string().min(1).optional(),
  WHATSAPP_WEBHOOK_VERIFY_TOKEN: z.string().min(1).optional(),
  FACEBOOK_WEBHOOK_VERIFY_TOKEN: z.string().min(1).optional(),

  TIKTOK_CLIENT_KEY: z.string().min(1).optional(),
  TIKTOK_CLIENT_SECRET: z.string().min(1).optional(),

  // Secret used by the Railway cron job to call POST /internal/token-refresh.
  // Optional — if absent the endpoint returns 401 for all callers.
  INTERNAL_CRON_SECRET: z.string().min(1).optional(),
});

function loadEnv() {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error('Invalid environment configuration:', result.error.flatten().fieldErrors);
    process.exit(1);
  }

  return result.data;
}

export const env = loadEnv();
export type Env = typeof env;

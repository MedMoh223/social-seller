import type { NextFunction, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { TooManyRequestsError } from '../lib/httpErrors';

const sharedOptions = {
  standardHeaders: true as const,
  legacyHeaders: false,
  handler: (_req: Request, _res: Response, next: NextFunction) => next(new TooManyRequestsError()),
};

// Authenticated mobile routes: generous, per-IP (express-rate-limit's
// default keying); fine-grained per-user limiting isn't needed yet.
export const authenticatedLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  ...sharedOptions,
});

// Unauthenticated, enumerable routes (e.g. /auth/whatsapp-activation —
// keyed by phone number, could be abused for spam) get a strict limit.
export const publicLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 5,
  ...sharedOptions,
});

// Webhook routes get a separate, higher limit: legitimate Meta/TikTok
// delivery bursts must not be throttled into 429s, which would make the
// platform back off retries and merchants silently miss messages.
// Protection here comes from signature verification, not rate limiting.
export const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 600,
  ...sharedOptions,
});

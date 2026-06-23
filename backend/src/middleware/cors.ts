import cors from 'cors';
import { env } from '../config/env';

// Strict whitelist, no wildcard "*". Requests with no Origin header
// (webhooks, server-to-server, curl) are allowed through here — CORS is
// a browser-enforced mechanism and doesn't apply to them; webhook routes
// are protected by signature verification instead, not CORS.
export const corsMiddleware = cors({
  origin(origin, callback) {
    if (!origin || env.CORS_ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
});

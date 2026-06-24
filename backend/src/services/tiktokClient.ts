import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../config/env';
import { WebhookSignatureError, NotImplementedError } from '../lib/httpErrors';

const TIKTOK_AUTH_BASE = 'https://www.tiktok.com/v2/auth/authorize';
const TIKTOK_TOKEN_URL = 'https://open.tiktokapis.com/v2/oauth/token/';

// TikTok signs Business Messaging webhook deliveries with an HMAC over
// the raw body, conceptually parallel to Meta's X-Hub-Signature-256 —
// but the exact header name and canonicalization (e.g. whether a
// timestamp is folded into the signed string) must be VERIFIED against
// TikTok's current Business Messaging docs before this is relied on in
// production; this API surface iterates faster than Meta's. The header
// name below is a placeholder pending that verification.
export const TIKTOK_SIGNATURE_HEADER = 'tiktok-signature';

export function verifyTikTokSignature(rawBody: Buffer, signatureHeader: string | undefined): void {
  if (!env.TIKTOK_CLIENT_SECRET) {
    throw new WebhookSignatureError('TikTok integration not configured.');
  }

  if (!signatureHeader) {
    throw new WebhookSignatureError();
  }

  const expected = createHmac('sha256', env.TIKTOK_CLIENT_SECRET).update(rawBody).digest('hex');

  const expectedBuffer = Buffer.from(expected, 'hex');
  const providedBuffer = Buffer.from(signatureHeader, 'hex');

  if (expectedBuffer.length !== providedBuffer.length || !timingSafeEqual(expectedBuffer, providedBuffer)) {
    throw new WebhookSignatureError();
  }
}

export function buildTikTokAuthorizationUrl(state: string, redirectUri: string): string {
  if (!env.TIKTOK_CLIENT_KEY) {
    throw new NotImplementedError('Canal TikTok non configuré sur ce serveur.');
  }

  const url = new URL(TIKTOK_AUTH_BASE);
  url.searchParams.set('client_key', env.TIKTOK_CLIENT_KEY);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('state', state);
  url.searchParams.set('response_type', 'code');
  // VERIFY the exact Business Messaging scope name against TikTok's
  // current developer docs — this is a placeholder.
  url.searchParams.set('scope', 'biz.messaging');

  return url.toString();
}

interface TikTokTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  open_id: string;
}

export async function exchangeTikTokCodeForToken(params: {
  code: string;
  redirectUri: string;
}): Promise<TikTokTokenResponse> {
  if (!env.TIKTOK_CLIENT_KEY || !env.TIKTOK_CLIENT_SECRET) {
    throw new Error('TIKTOK_CLIENT_KEY/TIKTOK_CLIENT_SECRET not configured');
  }

  const response = await fetch(TIKTOK_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_key: env.TIKTOK_CLIENT_KEY,
      client_secret: env.TIKTOK_CLIENT_SECRET,
      code: params.code,
      grant_type: 'authorization_code',
      redirect_uri: params.redirectUri,
    }),
  });

  if (!response.ok) {
    throw new Error(`TikTok token exchange failed: ${response.status}`);
  }

  return (await response.json()) as TikTokTokenResponse;
}

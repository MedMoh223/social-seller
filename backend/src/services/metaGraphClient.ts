import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../config/env';
import { WebhookSignatureError } from '../lib/httpErrors';

const GRAPH_API_BASE = 'https://graph.facebook.com/v21.0';

// Shared by both WhatsApp Cloud API and the Facebook Messenger Platform:
// both sign webhook deliveries the same way (HMAC-SHA256 over the raw
// body, keyed with the same Meta App Secret).
export function verifyMetaSignature(rawBody: Buffer, signatureHeader: string | undefined): void {
  if (!env.META_APP_SECRET) {
    throw new WebhookSignatureError('Meta integration not configured.');
  }

  if (!signatureHeader || !signatureHeader.startsWith('sha256=')) {
    throw new WebhookSignatureError();
  }

  const expected = createHmac('sha256', env.META_APP_SECRET).update(rawBody).digest('hex');
  const provided = signatureHeader.slice('sha256='.length);

  const expectedBuffer = Buffer.from(expected, 'hex');
  const providedBuffer = Buffer.from(provided, 'hex');

  if (expectedBuffer.length !== providedBuffer.length || !timingSafeEqual(expectedBuffer, providedBuffer)) {
    throw new WebhookSignatureError();
  }
}

export function verifyWebhookChallenge(verifyToken: string | undefined, expected: string | undefined): boolean {
  return Boolean(expected) && verifyToken === expected;
}

export function buildFacebookAuthorizationUrl(state: string, redirectUri: string): string {
  if (!env.META_APP_ID) {
    throw new Error('META_APP_ID not configured');
  }

  const url = new URL(`${GRAPH_API_BASE}/dialog/oauth`);
  url.searchParams.set('client_id', env.META_APP_ID);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('state', state);
  url.searchParams.set('scope', 'pages_messaging,pages_show_list,pages_manage_metadata');
  url.searchParams.set('response_type', 'code');

  return url.toString();
}

// Embedded Signup for WhatsApp Cloud API: structurally the same OAuth
// dialog as Facebook's, but with WhatsApp-specific scopes plus an
// `extras.feature=whatsapp_embedded_signup` that launches the embedded
// signup experience instead of a plain permission screen. VERIFY this
// `extras` shape against Meta's current Embedded Signup docs before
// relying on it in production — it has changed across Graph API versions.
export function buildWhatsAppAuthorizationUrl(state: string, redirectUri: string): string {
  if (!env.META_APP_ID) {
    throw new Error('META_APP_ID not configured');
  }

  const url = new URL(`${GRAPH_API_BASE}/dialog/oauth`);
  url.searchParams.set('client_id', env.META_APP_ID);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('state', state);
  url.searchParams.set('scope', 'whatsapp_business_management,whatsapp_business_messaging');
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('extras', JSON.stringify({ feature: 'whatsapp_embedded_signup', sessionInfoVersion: '3' }));

  return url.toString();
}

interface MetaTokenResponse {
  access_token: string;
  token_type?: string;
  expires_in?: number;
}

export async function exchangeCodeForToken(params: { code: string; redirectUri: string }): Promise<MetaTokenResponse> {
  if (!env.META_APP_ID || !env.META_APP_SECRET) {
    throw new Error('META_APP_ID/META_APP_SECRET not configured');
  }

  const url = new URL(`${GRAPH_API_BASE}/oauth/access_token`);
  url.searchParams.set('client_id', env.META_APP_ID);
  url.searchParams.set('client_secret', env.META_APP_SECRET);
  url.searchParams.set('redirect_uri', params.redirectUri);
  url.searchParams.set('code', params.code);

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Meta token exchange failed: ${response.status}`);
  }

  return (await response.json()) as MetaTokenResponse;
}

export async function exchangeForLongLivedToken(shortLivedToken: string): Promise<MetaTokenResponse> {
  if (!env.META_APP_ID || !env.META_APP_SECRET) {
    throw new Error('META_APP_ID/META_APP_SECRET not configured');
  }

  const url = new URL(`${GRAPH_API_BASE}/oauth/access_token`);
  url.searchParams.set('grant_type', 'fb_exchange_token');
  url.searchParams.set('client_id', env.META_APP_ID);
  url.searchParams.set('client_secret', env.META_APP_SECRET);
  url.searchParams.set('fb_exchange_token', shortLivedToken);

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Meta long-lived token exchange failed: ${response.status}`);
  }

  return (await response.json()) as MetaTokenResponse;
}

export async function graphGet<T>(path: string, accessToken: string): Promise<T> {
  const url = new URL(`${GRAPH_API_BASE}${path}`);
  url.searchParams.set('access_token', accessToken);

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Graph API GET ${path} failed: ${response.status}`);
  }

  return (await response.json()) as T;
}

export async function graphPost<T>(path: string, accessToken: string, body: Record<string, unknown>): Promise<T> {
  const url = new URL(`${GRAPH_API_BASE}${path}`);

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Graph API POST ${path} failed: ${response.status}`);
  }

  return (await response.json()) as T;
}

import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../config/env';
import { WebhookSignatureError, NotImplementedError } from '../lib/httpErrors';

const GRAPH_API_BASE = 'https://graph.facebook.com/v21.0';
// OAuth dialog URLs must use www.facebook.com, not graph.facebook.com.
// graph.facebook.com is for API calls only — using it for the OAuth
// dialog returns a GraphMethodException "Object with ID 'dialog' does
// not exist" (error code 100, subcode 33).
const FACEBOOK_OAUTH_BASE = 'https://www.facebook.com/v21.0';
// Send API calls pinned to v19.0 per the task spec — kept separate from
// GRAPH_API_BASE (used for OAuth/discovery) rather than bumping every
// Graph call to the same version, since only these two endpoints were
// asked for and Meta's basic messaging endpoints are stable across
// these minor version gaps.
const GRAPH_API_MESSAGING_BASE = 'https://graph.facebook.com/v19.0';

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
    throw new NotImplementedError('Canal Meta non configuré sur ce serveur.');
  }

  const url = new URL(`${FACEBOOK_OAUTH_BASE}/dialog/oauth`);
  url.searchParams.set('client_id', env.META_APP_ID);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('state', state);
  url.searchParams.set('scope', 'pages_messaging,pages_show_list,pages_manage_metadata');
  url.searchParams.set('response_type', 'code');

  return url.toString();
}

// Standard OAuth for WhatsApp Cloud API — no Embedded Signup extras.
// The Embedded Signup flow (extras.feature=whatsapp_embedded_signup) is
// designed to onboard merchants who don't yet have a WABA; using it
// against an account that already has a WABA causes Meta to show
// "Cette page n'existe pas". Use standard OAuth instead: after the
// merchant grants permissions the callback discovers the existing WABA
// via /me/businesses → /owned_whatsapp_business_accounts.
export function buildWhatsAppAuthorizationUrl(state: string, redirectUri: string): string {
  if (!env.META_APP_ID) {
    throw new NotImplementedError('Canal Meta non configuré sur ce serveur.');
  }

  const url = new URL(`${FACEBOOK_OAUTH_BASE}/dialog/oauth`);
  url.searchParams.set('client_id', env.META_APP_ID);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('state', state);
  url.searchParams.set('scope', 'whatsapp_business_management,whatsapp_business_messaging');
  url.searchParams.set('response_type', 'code');

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
    const body = await response.text().catch(() => '');
    throw new Error(`Graph API GET ${path} failed: ${response.status} — ${body}`);
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

interface WhatsAppSendResponse {
  messages?: Array<{ id: string }>;
}

// Returns the WhatsApp message id (used as messages.external_message_id
// so later delivery-status webhooks can match this row).
export async function sendWhatsAppMessage(
  phoneNumberId: string,
  accessToken: string,
  to: string,
  text: string,
): Promise<string> {
  const response = await fetch(`${GRAPH_API_MESSAGING_BASE}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: text },
    }),
  });

  if (!response.ok) {
    throw new Error(`WhatsApp send message failed: ${response.status}`);
  }

  const data = (await response.json()) as WhatsAppSendResponse;
  const messageId = data.messages?.[0]?.id;

  if (!messageId) {
    throw new Error('WhatsApp send message response missing message id');
  }

  return messageId;
}

interface FacebookSendResponse {
  recipient_id?: string;
  message_id?: string;
}

// Returns the Facebook message id (used as messages.external_message_id).
export async function sendFacebookMessage(accessToken: string, recipientId: string, text: string): Promise<string> {
  const response = await fetch(`${GRAPH_API_MESSAGING_BASE}/me/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({
      recipient: { id: recipientId },
      message: { text },
    }),
  });

  if (!response.ok) {
    throw new Error(`Facebook send message failed: ${response.status}`);
  }

  const data = (await response.json()) as FacebookSendResponse;

  if (!data.message_id) {
    throw new Error('Facebook send message response missing message_id');
  }

  return data.message_id;
}

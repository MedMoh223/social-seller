import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { env } from '../config/env';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

const key = Buffer.from(env.TOKEN_ENCRYPTION_KEY, 'base64');

// Encrypts an OAuth access/refresh token for storage in a `bytea` column
// (social_connections.access_token_enc / refresh_token_enc). Layout:
// iv (12 bytes) || authTag (16 bytes) || ciphertext, hex-encoded with the
// `\x` prefix Postgres/PostgREST expects for bytea literals, so the
// result can be passed straight to supabase-js's .insert()/.update().
export function encryptToken(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `\\x${Buffer.concat([iv, authTag, ciphertext]).toString('hex')}`;
}

// Accepts the `\x`-prefixed hex string PostgREST returns for a bytea
// column read back from social_connections.
export function decryptToken(stored: string): string {
  const hex = stored.startsWith('\\x') ? stored.slice(2) : stored;
  const raw = Buffer.from(hex, 'hex');

  const iv = raw.subarray(0, IV_LENGTH);
  const authTag = raw.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = raw.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

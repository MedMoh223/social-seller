import { supabaseAdmin } from '../lib/supabaseAdmin';
import { encryptToken } from '../lib/tokenCrypto';
import { ConflictError } from '../lib/httpErrors';
import { logger } from '../lib/logger';

export type Platform = 'whatsapp' | 'facebook' | 'tiktok';

export interface ResolvedConnection {
  tenantId: string;
  socialConnectionId: string;
}

// Webhook URLs are not tenant-scoped (Meta/TikTok call one fixed URL per
// app, shared across every tenant) — this lookup against the partial
// unique index from 005_social_connections_oauth.sql is what actually
// scopes an inbound delivery to a tenant.
export async function resolveTenantForExternalAccount(
  platform: Platform,
  externalAccountId: string,
): Promise<ResolvedConnection | null> {
  const { data, error } = await supabaseAdmin
    .from('social_connections')
    .select('id, tenant_id')
    .eq('platform', platform)
    .eq('external_account_id', externalAccountId)
    .is('disconnected_at', null)
    .maybeSingle();

  if (error) {
    logger.error({ err: error, platform, externalAccountId }, 'failed to resolve tenant for webhook');
    return null;
  }

  if (!data) {
    return null;
  }

  return { tenantId: data.tenant_id as string, socialConnectionId: data.id as string };
}

export interface UpsertConnectionParams {
  tenantId: string;
  connectedBy: string;
  platform: Platform;
  externalAccountId: string;
  wabaId?: string | null;
  displayName?: string | null;
  accessToken: string;
  refreshToken?: string | null;
  tokenExpiresAt?: string | null;
  scopes?: string[];
  metadata?: Record<string, unknown>;
}

// Explicit select-then-insert/update rather than .upsert(): the
// uniqueness guarantee is a *partial* index (`where disconnected_at is
// null`), and Postgres' ON CONFLICT inference for a partial index needs
// the same WHERE clause repeated on the conflict target, which
// supabase-js's upsert() has no way to express. Doing it explicitly also
// lets us reject a reconnection attempt for an account already owned by
// a different tenant, instead of silently reassigning ownership.
export async function upsertConnection(params: UpsertConnectionParams) {
  const { data: existing, error: lookupError } = await supabaseAdmin
    .from('social_connections')
    .select('id, tenant_id')
    .eq('platform', params.platform)
    .eq('external_account_id', params.externalAccountId)
    .is('disconnected_at', null)
    .maybeSingle();

  if (lookupError) {
    throw lookupError;
  }

  if (existing && existing.tenant_id !== params.tenantId) {
    throw new ConflictError('Ce compte est déjà connecté à une autre boutique.');
  }

  const row = {
    tenant_id: params.tenantId,
    connected_by: params.connectedBy,
    platform: params.platform,
    external_account_id: params.externalAccountId,
    waba_id: params.wabaId ?? null,
    display_name: params.displayName ?? null,
    access_token_enc: encryptToken(params.accessToken),
    refresh_token_enc: params.refreshToken ? encryptToken(params.refreshToken) : null,
    token_expires_at: params.tokenExpiresAt ?? null,
    scopes: params.scopes ?? null,
    metadata: params.metadata ?? {},
    status: 'active',
  };

  if (existing) {
    const { data, error } = await supabaseAdmin
      .from('social_connections')
      .update(row)
      .eq('id', existing.id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  const { data, error } = await supabaseAdmin.from('social_connections').insert(row).select().single();

  if (error) throw error;
  return data;
}

// Column allowlist deliberately excludes access_token_enc/refresh_token_enc
// — this feeds GET /connections, which the mobile client reads directly.
export async function listConnections(tenantId: string) {
  const { data, error } = await supabaseAdmin
    .from('social_connections')
    .select('id, platform, status, display_name, external_account_id, created_at')
    .eq('tenant_id', tenantId)
    .is('disconnected_at', null)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data;
}

export async function disconnectConnection(id: string, tenantId: string) {
  const { data, error } = await supabaseAdmin
    .from('social_connections')
    .update({ disconnected_at: new Date().toISOString(), status: 'disconnected' })
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .is('disconnected_at', null)
    .select('id, platform')
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data;
}

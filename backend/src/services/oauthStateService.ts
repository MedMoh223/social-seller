import { randomBytes } from 'node:crypto';
import { supabaseAdmin } from '../lib/supabaseAdmin';
import { AppError } from '../lib/httpErrors';
import { logger } from '../lib/logger';

export type Platform = 'whatsapp' | 'facebook' | 'tiktok';

export async function createOAuthState(params: {
  tenantId: string;
  userId: string;
  platform: Platform;
}): Promise<string> {
  const state = randomBytes(24).toString('hex');

  const { error } = await supabaseAdmin.from('oauth_states').insert({
    state,
    tenant_id: params.tenantId,
    user_id: params.userId,
    platform: params.platform,
  });

  if (error) {
    logger.error({ err: error, platform: params.platform }, 'oauth_states insert failed');
    throw new AppError(500, 'internal_error', 'Impossible de créer la session OAuth.');
  }

  return state;
}

// Atomically consumes a state token: a missing/expired/already-consumed
// state means zero rows match, which the callback treats as rejected
// (forged, replayed, or simply too old) rather than proceeding.
export async function consumeOAuthState(
  state: string,
  platform: Platform,
): Promise<{ tenantId: string; userId: string } | null> {
  const { data, error } = await supabaseAdmin
    .from('oauth_states')
    .update({ consumed_at: new Date().toISOString() })
    .eq('state', state)
    .eq('platform', platform)
    .is('consumed_at', null)
    .gt('expires_at', new Date().toISOString())
    .select('tenant_id, user_id')
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return { tenantId: data.tenant_id as string, userId: data.user_id as string };
}

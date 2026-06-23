import { createClient } from '@supabase/supabase-js';
import { env } from '../config/env';

// service_role bypasses RLS entirely — this client must never be sent
// to the mobile app, and every query built on top of it must filter by
// tenant_id explicitly in application code, since RLS provides no
// safety net for a service_role connection.
export const supabaseAdmin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
  realtime: {
    // Backend never uses realtime subscriptions — disable to prevent
    // WebSocket connection attempts that could crash the process.
    timeout: 0,
  },
});

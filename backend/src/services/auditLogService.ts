import { supabaseAdmin } from '../lib/supabaseAdmin';
import { logger } from '../lib/logger';

interface AuditLogEntry {
  tenantId: string;
  userId?: string | null;
  action: string;
  tableName: string;
  recordId?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
}

// Best-effort: a failed audit write must never block the sensitive
// action it's describing (channel connect/disconnect already
// succeeded by the time this is called) — log and move on.
export async function recordAuditLog(entry: AuditLogEntry) {
  const { error } = await supabaseAdmin.from('audit_log').insert({
    tenant_id: entry.tenantId,
    user_id: entry.userId ?? null,
    action: entry.action,
    table_name: entry.tableName,
    record_id: entry.recordId ?? null,
    old_value: entry.oldValue ?? null,
    new_value: entry.newValue ?? null,
  });

  if (error) {
    logger.error({ err: error, action: entry.action }, 'failed to write audit log');
  }
}

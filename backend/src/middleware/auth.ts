import type { NextFunction, Request, Response } from 'express';
import { supabaseAdmin } from '../lib/supabaseAdmin';
import { UnauthorizedError } from '../lib/httpErrors';

export interface AuthenticatedUser {
  id: string;
  tenantId: string;
  role: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

// Validates the bearer token against Supabase Auth itself (never
// hand-decoded), then resolves tenant_id/role from public.users via the
// service_role client — mirrors current_tenant_id() in Postgres. Every
// downstream query must still filter by req.user.tenantId explicitly:
// service_role bypasses RLS entirely, so this is the only tenant check
// that applies once a request reaches the backend.
export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : undefined;

    if (!token) {
      throw new UnauthorizedError();
    }

    const { data, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !data.user) {
      throw new UnauthorizedError();
    }

    const { data: userRow, error: userRowError } = await supabaseAdmin
      .from('users')
      .select('tenant_id, role')
      .eq('id', data.user.id)
      .maybeSingle();

    if (userRowError || !userRow) {
      throw new UnauthorizedError();
    }

    req.user = { id: data.user.id, tenantId: userRow.tenant_id, role: userRow.role };
    next();
  } catch (err) {
    next(err);
  }
}

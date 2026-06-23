import type { Express } from 'express';
import jwt from 'jsonwebtoken';
import { createApp } from '../app';

export function makeApp(): Express {
  return createApp();
}

// Forges a Supabase-shaped JWT signed with the test project's legacy
// JWT secret. requireAuth (middleware/auth.ts) validates this via
// supabase.auth.getUser(token) — a real call to the test project's
// GoTrue — then resolves tenant_id/role from public.users by `sub`,
// never from token claims. tenantId is accepted here for readability
// at call sites and is carried as a non-authoritative extra claim; the
// actual tenant scoping in every test comes from which row fixtures.ts
// created for that userId, not from this token.
export function makeAuthHeader(tenantId: string, userId: string): { Authorization: string } {
  const secret = process.env.SUPABASE_JWT_SECRET;

  if (!secret) {
    throw new Error('SUPABASE_JWT_SECRET is not set.');
  }

  const token = jwt.sign(
    {
      aud: 'authenticated',
      role: 'authenticated',
      sub: userId,
      tenant_id: tenantId,
    },
    secret,
    { expiresIn: '1h' },
  );

  return { Authorization: `Bearer ${token}` };
}

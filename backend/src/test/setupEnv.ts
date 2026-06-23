import { config } from 'dotenv';
import { resolve } from 'node:path';

config({ path: resolve(__dirname, '../../.env.test') });

// config/env.ts (and lib/supabaseAdmin.ts, built on top of it) reads
// SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY — not the _TEST-suffixed names
// — so the app-under-test and the fixtures helpers (which import the
// same supabaseAdmin singleton) end up talking to the same test
// project. Mapped here, once, before any test file imports ../app.
if (process.env.SUPABASE_URL_TEST) {
  process.env.SUPABASE_URL = process.env.SUPABASE_URL_TEST;
}
if (process.env.SUPABASE_SERVICE_ROLE_KEY_TEST) {
  process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY_TEST;
}

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    'Missing SUPABASE_URL_TEST/SUPABASE_SERVICE_ROLE_KEY_TEST — copy backend/.env.test.example to backend/.env.test and fill in a dedicated test Supabase project.',
  );
}

if (!process.env.SUPABASE_JWT_SECRET) {
  throw new Error('Missing SUPABASE_JWT_SECRET in backend/.env.test — required to sign test JWTs.');
}

// Not project-specific — fixed test-only values so env.ts's validation
// passes without needing real Meta/TikTok/Railway configuration.
process.env.NODE_ENV = 'test';
process.env.TOKEN_ENCRYPTION_KEY ??= 'CqDaoDgQWcMTvRaB7H7uMIub2Wkd0Wrw1cvwElb4LZE=';
process.env.BACKEND_PUBLIC_URL ??= 'http://localhost:3000';

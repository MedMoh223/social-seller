import express from 'express';

// Mounted only on /webhooks/* and BEFORE the global express.json() in
// app.ts: webhook signature verification needs the exact bytes Meta/
// TikTok signed, which a parse-then-reserialize round-trip through
// express.json() would not reproduce byte-for-byte. Handlers verify the
// signature against this raw Buffer, then JSON.parse it themselves.
export const rawBodyParser = express.raw({ type: '*/*', limit: '2mb' });

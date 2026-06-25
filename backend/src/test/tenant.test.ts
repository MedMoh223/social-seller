import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { makeApp, makeAuthHeader } from './helpers';
import { createTestTenant, deleteTestTenant, type TestTenant } from './fixtures';

describe('tenant routes', () => {
  const app = makeApp();
  let tenantA: TestTenant;
  let tenantB: TestTenant;

  beforeEach(async () => {
    tenantA = await createTestTenant();
    tenantB = await createTestTenant();
  });

  afterEach(async () => {
    await deleteTestTenant(tenantA);
    await deleteTestTenant(tenantB);
  });

  // ── Auth ────────────────────────────────────────────────────────────────────

  it('returns 401 without auth on GET /tenant', async () => {
    const res = await request(app).get('/tenant');
    expect(res.status).toBe(401);
  });

  it('returns 401 without auth on PATCH /tenant', async () => {
    const res = await request(app).patch('/tenant').send({ name: 'X' });
    expect(res.status).toBe(401);
  });

  // ── GET /tenant ─────────────────────────────────────────────────────────────

  it('returns the tenant info for the authenticated user', async () => {
    const res = await request(app)
      .get('/tenant')
      .set(makeAuthHeader(tenantA.tenantId, tenantA.userId));

    expect(res.status).toBe(200);
    expect(res.body.tenant.id).toBe(tenantA.tenantId);
    expect(res.body.tenant).toHaveProperty('name');
    expect(res.body.tenant).toHaveProperty('plan');
    expect(res.body.tenant).toHaveProperty('status');
  });

  it('does not return another tenant\'s info', async () => {
    const resA = await request(app)
      .get('/tenant')
      .set(makeAuthHeader(tenantA.tenantId, tenantA.userId));

    const resB = await request(app)
      .get('/tenant')
      .set(makeAuthHeader(tenantB.tenantId, tenantB.userId));

    expect(resA.body.tenant.id).toBe(tenantA.tenantId);
    expect(resB.body.tenant.id).toBe(tenantB.tenantId);
    expect(resA.body.tenant.id).not.toBe(resB.body.tenant.id);
  });

  // ── PATCH /tenant ───────────────────────────────────────────────────────────

  it('updates the tenant name', async () => {
    const res = await request(app)
      .patch('/tenant')
      .set(makeAuthHeader(tenantA.tenantId, tenantA.userId))
      .send({ name: 'Ma Super Boutique' });

    expect(res.status).toBe(200);
    expect(res.body.tenant.name).toBe('Ma Super Boutique');
    expect(res.body.tenant.id).toBe(tenantA.tenantId);
  });

  it('updates the logo_url', async () => {
    const logoUrl = 'https://example.com/logo.png?token=abc123';

    const res = await request(app)
      .patch('/tenant')
      .set(makeAuthHeader(tenantA.tenantId, tenantA.userId))
      .send({ logo_url: logoUrl });

    expect(res.status).toBe(200);
    expect(res.body.tenant.logo_url).toBe(logoUrl);
  });

  it('sets logo_url to null', async () => {
    // Set then clear
    await request(app)
      .patch('/tenant')
      .set(makeAuthHeader(tenantA.tenantId, tenantA.userId))
      .send({ logo_url: 'https://example.com/logo.png' });

    const res = await request(app)
      .patch('/tenant')
      .set(makeAuthHeader(tenantA.tenantId, tenantA.userId))
      .send({ logo_url: null });

    expect(res.status).toBe(200);
    expect(res.body.tenant.logo_url).toBeNull();
  });

  it('returns 400 when name is empty string', async () => {
    const res = await request(app)
      .patch('/tenant')
      .set(makeAuthHeader(tenantA.tenantId, tenantA.userId))
      .send({ name: '' });

    expect(res.status).toBe(400);
  });

  it('returns 400 when logo_url is not a valid URL', async () => {
    const res = await request(app)
      .patch('/tenant')
      .set(makeAuthHeader(tenantA.tenantId, tenantA.userId))
      .send({ logo_url: 'not-a-url' });

    expect(res.status).toBe(400);
  });

  it('does not apply name update to another tenant', async () => {
    await request(app)
      .patch('/tenant')
      .set(makeAuthHeader(tenantA.tenantId, tenantA.userId))
      .send({ name: 'Tenant A Updated' });

    const resB = await request(app)
      .get('/tenant')
      .set(makeAuthHeader(tenantB.tenantId, tenantB.userId));

    expect(resB.body.tenant.name).not.toBe('Tenant A Updated');
  });

  it('persists the update (GET after PATCH)', async () => {
    await request(app)
      .patch('/tenant')
      .set(makeAuthHeader(tenantA.tenantId, tenantA.userId))
      .send({ name: 'Boutique Persistante' });

    const res = await request(app)
      .get('/tenant')
      .set(makeAuthHeader(tenantA.tenantId, tenantA.userId));

    expect(res.body.tenant.name).toBe('Boutique Persistante');
  });
});

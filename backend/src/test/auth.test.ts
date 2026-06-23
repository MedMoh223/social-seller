import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { makeApp, makeAuthHeader } from './helpers';
import { createTestTenant, deleteTestTenant, type TestTenant } from './fixtures';

describe('auth middleware', () => {
  const app = makeApp();
  let tenant: TestTenant;

  beforeEach(async () => {
    tenant = await createTestTenant();
  });

  afterEach(async () => {
    await deleteTestTenant(tenant);
  });

  it('returns 401 without a token', async () => {
    const response = await request(app).get('/orders');
    expect(response.status).toBe(401);
  });

  it('returns 401 with a malformed token', async () => {
    const response = await request(app).get('/orders').set('Authorization', 'Bearer not-a-real-jwt');
    expect(response.status).toBe(401);
  });

  it('returns 200 with a valid token on a protected route', async () => {
    const response = await request(app).get('/orders').set(makeAuthHeader(tenant.tenantId, tenant.userId));

    expect(response.status).toBe(200);
    expect(response.body.orders).toEqual([]);
  });
});

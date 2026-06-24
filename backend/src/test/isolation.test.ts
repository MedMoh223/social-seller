import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { makeApp, makeAuthHeader } from './helpers';
import { createOrder, createTestTenant, deleteTestTenant, type TestTenant } from './fixtures';

describe('cross-tenant isolation', () => {
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

  it('returns 404, not 403 or 200, when tenant B requests a resource owned by tenant A', async () => {
    const order = await createOrder(tenantA.tenantId, { customerName: 'Tenant A private customer' });

    const response = await request(app)
      .get(`/orders/${order.id}`)
      .set(makeAuthHeader(tenantB.tenantId, tenantB.userId));

    // 404, never 403: the route's tenant-scoped lookup (.eq('tenant_id', ...))
    // makes "exists but belongs to someone else" indistinguishable from
    // "doesn't exist" — a 403 would confirm the id is valid for SOME
    // tenant, leaking existence across tenants.
    expect(response.status).toBe(404);
    expect(response.status).not.toBe(403);
    expect(response.status).not.toBe(200);
    expect(response.body.order).toBeUndefined();
  });
});

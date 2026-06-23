import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { makeApp, makeAuthHeader } from './helpers';
import { createOrder, createTestTenant, deleteTestTenant, type TestTenant } from './fixtures';

describe('orders routes', () => {
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

  it('returns 401 without auth', async () => {
    const response = await request(app).get('/orders');
    expect(response.status).toBe(401);
  });

  it('returns 404 for an order belonging to another tenant', async () => {
    const order = await createOrder(tenantB.tenantId);

    const response = await request(app)
      .get(`/orders/${order.id}`)
      .set(makeAuthHeader(tenantA.tenantId, tenantA.userId));

    expect(response.status).toBe(404);
  });

  it('returns 409 for an invalid transition (new to delivered directly)', async () => {
    const order = await createOrder(tenantA.tenantId, { status: 'new' });

    const response = await request(app)
      .patch(`/orders/${order.id}`)
      .set(makeAuthHeader(tenantA.tenantId, tenantA.userId))
      .send({ status: 'delivered' });

    expect(response.status).toBe(409);
  });

  it('returns 400 when cancelling without a reason', async () => {
    const order = await createOrder(tenantA.tenantId, { status: 'new' });

    const response = await request(app)
      .patch(`/orders/${order.id}`)
      .set(makeAuthHeader(tenantA.tenantId, tenantA.userId))
      .send({ status: 'cancelled' });

    expect(response.status).toBe(400);
  });

  it('applies a valid transition (new to confirmed)', async () => {
    const order = await createOrder(tenantA.tenantId, { status: 'new' });

    const response = await request(app)
      .patch(`/orders/${order.id}`)
      .set(makeAuthHeader(tenantA.tenantId, tenantA.userId))
      .send({ status: 'confirmed' });

    expect(response.status).toBe(200);
    expect(response.body.order.status).toBe('confirmed');
  });
});

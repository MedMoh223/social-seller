import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { makeApp, makeAuthHeader } from './helpers';
import {
  createConversation,
  createOrder,
  createProduct,
  createSocialConnection,
  createTestTenant,
  deleteTestTenant,
  type TestTenant,
} from './fixtures';

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

  it('cannot send a message into a conversation owned by another tenant', async () => {
    const connection = await createSocialConnection(tenantB.tenantId);
    const conversation = await createConversation(tenantB.tenantId, { socialConnectionId: connection.id });

    const response = await request(app)
      .post(`/conversations/${conversation.id}/messages`)
      .set(makeAuthHeader(tenantA.tenantId, tenantA.userId))
      .send({ content: 'leak attempt' });

    expect(response.status).toBe(404);
    expect(response.body.message).toBeUndefined();
  });

  it('cannot read an order owned by another tenant, and no order data leaks', async () => {
    const order = await createOrder(tenantB.tenantId, { customerName: 'Tenant B secret customer' });

    const response = await request(app)
      .get(`/orders/${order.id}`)
      .set(makeAuthHeader(tenantA.tenantId, tenantA.userId));

    expect(response.status).toBe(404);
    expect(response.body.order).toBeUndefined();
    expect(JSON.stringify(response.body)).not.toContain('Tenant B secret customer');
  });

  it('cannot modify a product owned by another tenant, and no product data leaks', async () => {
    const product = await createProduct(tenantB.tenantId, { name: 'Tenant B secret product' });

    const response = await request(app)
      .patch(`/products/${product.id}`)
      .set(makeAuthHeader(tenantA.tenantId, tenantA.userId))
      .send({ name: 'Hijacked' });

    expect(response.status).toBe(404);
    expect(response.body.product).toBeUndefined();
    expect(JSON.stringify(response.body)).not.toContain('Tenant B secret product');
  });
});

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { makeApp, makeAuthHeader } from './helpers';
import { createProduct, createTestTenant, deleteTestTenant, type TestTenant } from './fixtures';

describe('products routes', () => {
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
    const response = await request(app).get('/products');
    expect(response.status).toBe(401);
  });

  it('returns 404 when adjusting stock on a product owned by another tenant', async () => {
    const product = await createProduct(tenantB.tenantId);

    const response = await request(app)
      .patch(`/products/${product.id}/stock`)
      .set(makeAuthHeader(tenantA.tenantId, tenantA.userId))
      .send({ delta: 1, reason: 'test' });

    expect(response.status).toBe(404);
  });

  it('returns 409 when the adjustment would make stock negative', async () => {
    const product = await createProduct(tenantA.tenantId, { stockQuantity: 5 });

    const response = await request(app)
      .patch(`/products/${product.id}/stock`)
      .set(makeAuthHeader(tenantA.tenantId, tenantA.userId))
      .send({ delta: -10, reason: 'test' });

    expect(response.status).toBe(409);
  });

  it('applies a valid stock adjustment', async () => {
    const product = await createProduct(tenantA.tenantId, { stockQuantity: 5 });

    const response = await request(app)
      .patch(`/products/${product.id}/stock`)
      .set(makeAuthHeader(tenantA.tenantId, tenantA.userId))
      .send({ delta: 3, reason: 'Réception fournisseur' });

    expect(response.status).toBe(200);
    expect(response.body.product.stock_quantity).toBe(8);
  });
});

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { makeApp, makeAuthHeader } from './helpers';
import { createOrder, createProduct, createTestTenant, deleteTestTenant, type TestTenant } from './fixtures';

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

  // ── POST /orders ─────────────────────────────────────────────────────────────

  it('creates an order with items and calculates totalAmount', async () => {
    const product = await createProduct(tenantA.tenantId, { price: 2500 });

    const response = await request(app)
      .post('/orders')
      .set(makeAuthHeader(tenantA.tenantId, tenantA.userId))
      .send({
        customerName: 'Mamadou Koné',
        items: [
          { productId: product.id, quantity: 2, unitPrice: 2500 },
        ],
      });

    expect(response.status).toBe(201);
    expect(response.body.order.customer_name).toBe('Mamadou Koné');
    expect(response.body.order.total_amount).toBe(5000);
    expect(response.body.order.status).toBe('new');
  });

  it('creates an order with multiple items', async () => {
    const p1 = await createProduct(tenantA.tenantId, { price: 1000 });
    const p2 = await createProduct(tenantA.tenantId, { price: 3000 });

    const response = await request(app)
      .post('/orders')
      .set(makeAuthHeader(tenantA.tenantId, tenantA.userId))
      .send({
        customerName: 'Fatou Diallo',
        items: [
          { productId: p1.id, quantity: 3, unitPrice: 1000 },
          { productId: p2.id, quantity: 1, unitPrice: 3000 },
        ],
      });

    expect(response.status).toBe(201);
    expect(response.body.order.total_amount).toBe(6000);
  });

  it('links the order to a conversation when conversationId is provided', async () => {
    const { supabaseAdmin } = await import('../lib/supabaseAdmin');
    const { data: conv } = await supabaseAdmin
      .from('conversations')
      .insert({
        tenant_id: tenantA.tenantId,
        platform: 'whatsapp',
        external_thread_id: 'wa-thread-test',
        status: 'new',
        customer_name: 'Test',
      })
      .select('id')
      .single();

    const product = await createProduct(tenantA.tenantId);

    const response = await request(app)
      .post('/orders')
      .set(makeAuthHeader(tenantA.tenantId, tenantA.userId))
      .send({
        customerName: 'Linked Customer',
        conversationId: conv!.id,
        items: [{ productId: product.id, quantity: 1, unitPrice: 1000 }],
      });

    expect(response.status).toBe(201);
  });

  it('returns 400 when items array is empty', async () => {
    const response = await request(app)
      .post('/orders')
      .set(makeAuthHeader(tenantA.tenantId, tenantA.userId))
      .send({
        customerName: 'Empty Cart',
        items: [],
      });

    expect(response.status).toBe(400);
  });

  it('returns 400 when customerName is missing', async () => {
    const product = await createProduct(tenantA.tenantId);

    const response = await request(app)
      .post('/orders')
      .set(makeAuthHeader(tenantA.tenantId, tenantA.userId))
      .send({
        items: [{ productId: product.id, quantity: 1, unitPrice: 1000 }],
      });

    expect(response.status).toBe(400);
  });

  it('returns 400 when conversationId is not a valid UUID', async () => {
    const product = await createProduct(tenantA.tenantId);

    const response = await request(app)
      .post('/orders')
      .set(makeAuthHeader(tenantA.tenantId, tenantA.userId))
      .send({
        customerName: 'Test',
        conversationId: 'not-a-uuid',
        items: [{ productId: product.id, quantity: 1, unitPrice: 1000 }],
      });

    expect(response.status).toBe(400);
  });

  it('returns 401 on POST /orders without auth', async () => {
    const response = await request(app).post('/orders').send({ customerName: 'X', items: [] });
    expect(response.status).toBe(401);
  });
});

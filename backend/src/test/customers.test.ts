import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { makeApp, makeAuthHeader } from './helpers';
import { createCustomer, createTestTenant, deleteTestTenant, type TestTenant } from './fixtures';

describe('customers routes', () => {
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

  it('returns 401 without auth', async () => {
    const res = await request(app).get('/customers');
    expect(res.status).toBe(401);
  });

  // ── GET / ───────────────────────────────────────────────────────────────────

  it('returns empty list when tenant has no customers', async () => {
    const res = await request(app)
      .get('/customers')
      .set(makeAuthHeader(tenantA.tenantId, tenantA.userId));

    expect(res.status).toBe(200);
    expect(res.body.customers).toEqual([]);
  });

  it('returns only customers belonging to the requesting tenant', async () => {
    await createCustomer(tenantA.tenantId, { name: 'Alice A' });
    await createCustomer(tenantB.tenantId, { name: 'Bob B' });

    const res = await request(app)
      .get('/customers')
      .set(makeAuthHeader(tenantA.tenantId, tenantA.userId));

    expect(res.status).toBe(200);
    expect(res.body.customers).toHaveLength(1);
    expect(res.body.customers[0].name).toBe('Alice A');
  });

  it('filters by ?q= search (name)', async () => {
    await createCustomer(tenantA.tenantId, { name: 'Amadou Diallo' });
    await createCustomer(tenantA.tenantId, { name: 'Fatou Koné' });

    const res = await request(app)
      .get('/customers?q=Amadou')
      .set(makeAuthHeader(tenantA.tenantId, tenantA.userId));

    expect(res.status).toBe(200);
    expect(res.body.customers).toHaveLength(1);
    expect(res.body.customers[0].name).toBe('Amadou Diallo');
  });

  it('filters by ?q= search (phone)', async () => {
    await createCustomer(tenantA.tenantId, { name: 'Client 1', phone: '+22376000001' });
    await createCustomer(tenantA.tenantId, { name: 'Client 2', phone: '+22376000002' });

    const res = await request(app)
      .get('/customers?q=76000001')
      .set(makeAuthHeader(tenantA.tenantId, tenantA.userId));

    expect(res.status).toBe(200);
    expect(res.body.customers).toHaveLength(1);
    expect(res.body.customers[0].phone).toBe('+22376000001');
  });

  it('returns a customer by ?external_id=', async () => {
    const extId = 'wa-22376000099';
    await createCustomer(tenantA.tenantId, { name: 'WhatsApp User', external_id: extId });
    await createCustomer(tenantA.tenantId, { name: 'Other User' });

    const res = await request(app)
      .get(`/customers?external_id=${encodeURIComponent(extId)}`)
      .set(makeAuthHeader(tenantA.tenantId, tenantA.userId));

    expect(res.status).toBe(200);
    expect(res.body.customers).toHaveLength(1);
    expect(res.body.customers[0].external_id).toBe(extId);
  });

  it('does not return external_id match from another tenant', async () => {
    const extId = 'wa-shared-id';
    await createCustomer(tenantB.tenantId, { name: 'Tenant B User', external_id: extId });

    const res = await request(app)
      .get(`/customers?external_id=${encodeURIComponent(extId)}`)
      .set(makeAuthHeader(tenantA.tenantId, tenantA.userId));

    expect(res.status).toBe(200);
    expect(res.body.customers).toHaveLength(0);
  });

  it('does not return soft-deleted customers in listing', async () => {
    const c = await createCustomer(tenantA.tenantId, { name: 'To Delete' });

    // soft-delete directly via admin
    const { supabaseAdmin } = await import('../lib/supabaseAdmin');
    await supabaseAdmin
      .from('customers')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', c.id);

    const res = await request(app)
      .get('/customers')
      .set(makeAuthHeader(tenantA.tenantId, tenantA.userId));

    expect(res.status).toBe(200);
    expect(res.body.customers).toHaveLength(0);
  });

  // ── GET /:id ────────────────────────────────────────────────────────────────

  it('returns a customer by id', async () => {
    const c = await createCustomer(tenantA.tenantId, { name: 'Fetched Customer', phone: '+22376001234' });

    const res = await request(app)
      .get(`/customers/${c.id}`)
      .set(makeAuthHeader(tenantA.tenantId, tenantA.userId));

    expect(res.status).toBe(200);
    expect(res.body.customer.id).toBe(c.id);
    expect(res.body.customer.phone).toBe('+22376001234');
  });

  it('returns 404 for a customer belonging to another tenant', async () => {
    const c = await createCustomer(tenantB.tenantId, { name: 'B Customer' });

    const res = await request(app)
      .get(`/customers/${c.id}`)
      .set(makeAuthHeader(tenantA.tenantId, tenantA.userId));

    expect(res.status).toBe(404);
  });

  it('returns 404 for a non-existent id', async () => {
    const res = await request(app)
      .get('/customers/00000000-0000-0000-0000-000000000000')
      .set(makeAuthHeader(tenantA.tenantId, tenantA.userId));

    expect(res.status).toBe(404);
  });

  // ── POST / ──────────────────────────────────────────────────────────────────

  it('creates a customer with minimal fields', async () => {
    const res = await request(app)
      .post('/customers')
      .set(makeAuthHeader(tenantA.tenantId, tenantA.userId))
      .send({ name: 'Nouveau Client' });

    expect(res.status).toBe(201);
    expect(res.body.customer.name).toBe('Nouveau Client');
    expect(res.body.customer.source).toBe('manual');
  });

  it('creates a customer with all fields', async () => {
    const res = await request(app)
      .post('/customers')
      .set(makeAuthHeader(tenantA.tenantId, tenantA.userId))
      .send({
        name: 'Full Customer',
        phone: '+22376111222',
        email: 'full@example.com',
        notes: 'VIP client',
        source: 'whatsapp',
        external_id: 'wa-ext-001',
      });

    expect(res.status).toBe(201);
    expect(res.body.customer.source).toBe('whatsapp');
    expect(res.body.customer.external_id).toBe('wa-ext-001');
  });

  it('returns 400 when name is missing', async () => {
    const res = await request(app)
      .post('/customers')
      .set(makeAuthHeader(tenantA.tenantId, tenantA.userId))
      .send({ phone: '+22376000000' });

    expect(res.status).toBe(400);
  });

  it('returns 400 on duplicate external_id within the same tenant', async () => {
    await createCustomer(tenantA.tenantId, { name: 'First', external_id: 'dup-ext' });

    const res = await request(app)
      .post('/customers')
      .set(makeAuthHeader(tenantA.tenantId, tenantA.userId))
      .send({ name: 'Second', external_id: 'dup-ext' });

    expect(res.status).toBe(400);
  });

  it('allows same external_id across different tenants', async () => {
    await createCustomer(tenantA.tenantId, { name: 'Tenant A', external_id: 'shared-ext' });

    const res = await request(app)
      .post('/customers')
      .set(makeAuthHeader(tenantB.tenantId, tenantB.userId))
      .send({ name: 'Tenant B', external_id: 'shared-ext' });

    expect(res.status).toBe(201);
  });

  // ── PATCH /:id ──────────────────────────────────────────────────────────────

  it('updates a customer name', async () => {
    const c = await createCustomer(tenantA.tenantId, { name: 'Old Name' });

    const res = await request(app)
      .patch(`/customers/${c.id}`)
      .set(makeAuthHeader(tenantA.tenantId, tenantA.userId))
      .send({ name: 'New Name' });

    expect(res.status).toBe(200);
    expect(res.body.customer.name).toBe('New Name');
  });

  it('returns 404 when patching a customer from another tenant', async () => {
    const c = await createCustomer(tenantB.tenantId, { name: 'B Customer' });

    const res = await request(app)
      .patch(`/customers/${c.id}`)
      .set(makeAuthHeader(tenantA.tenantId, tenantA.userId))
      .send({ name: 'Hijack' });

    expect(res.status).toBe(404);
  });

  // ── DELETE /:id (soft delete) ────────────────────────────────────────────────

  it('soft-deletes a customer (returns 204)', async () => {
    const c = await createCustomer(tenantA.tenantId, { name: 'To Remove' });

    const res = await request(app)
      .delete(`/customers/${c.id}`)
      .set(makeAuthHeader(tenantA.tenantId, tenantA.userId));

    expect(res.status).toBe(204);
  });

  it('soft-deleted customer is no longer visible via GET /:id', async () => {
    const c = await createCustomer(tenantA.tenantId, { name: 'Gone' });

    await request(app)
      .delete(`/customers/${c.id}`)
      .set(makeAuthHeader(tenantA.tenantId, tenantA.userId));

    const res = await request(app)
      .get(`/customers/${c.id}`)
      .set(makeAuthHeader(tenantA.tenantId, tenantA.userId));

    expect(res.status).toBe(404);
  });

  it('returns 404 when deleting a customer from another tenant', async () => {
    const c = await createCustomer(tenantB.tenantId, { name: 'B Customer' });

    const res = await request(app)
      .delete(`/customers/${c.id}`)
      .set(makeAuthHeader(tenantA.tenantId, tenantA.userId));

    expect(res.status).toBe(404);
  });

  it('returns 404 when deleting an already soft-deleted customer', async () => {
    const c = await createCustomer(tenantA.tenantId, { name: 'Already Gone' });

    await request(app)
      .delete(`/customers/${c.id}`)
      .set(makeAuthHeader(tenantA.tenantId, tenantA.userId));

    const res = await request(app)
      .delete(`/customers/${c.id}`)
      .set(makeAuthHeader(tenantA.tenantId, tenantA.userId));

    expect(res.status).toBe(404);
  });
});

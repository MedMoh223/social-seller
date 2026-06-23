import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { makeApp, makeAuthHeader } from './helpers';
import {
  createConversation,
  createSocialConnection,
  createTestTenant,
  deleteTestTenant,
  type TestTenant,
} from './fixtures';
import { supabaseAdmin } from '../lib/supabaseAdmin';

// Mocks only the external Graph API call — never the database. A real
// send would hit graph.facebook.com with a fake token, which is both
// unreliable in CI and not what these tests check; everything else
// (tenant scoping, the connection lookup, the DB insert) runs for real
// against the test Supabase project.
vi.mock('../services/metaGraphClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/metaGraphClient')>();
  return {
    ...actual,
    sendWhatsAppMessage: vi.fn().mockResolvedValue('mock-wamid-123'),
    sendFacebookMessage: vi.fn().mockResolvedValue('mock-fb-mid-456'),
  };
});

describe('POST /conversations/:id/messages', () => {
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
    const response = await request(app).post('/conversations/some-id/messages').send({ content: 'hello' });
    expect(response.status).toBe(401);
  });

  it('returns 404 if the conversation belongs to another tenant', async () => {
    const connection = await createSocialConnection(tenantB.tenantId);
    const conversation = await createConversation(tenantB.tenantId, { socialConnectionId: connection.id });

    const response = await request(app)
      .post(`/conversations/${conversation.id}/messages`)
      .set(makeAuthHeader(tenantA.tenantId, tenantA.userId))
      .send({ content: 'hello' });

    expect(response.status).toBe(404);
  });

  it('returns 409 if the channel is disconnected', async () => {
    const connection = await createSocialConnection(tenantA.tenantId, { disconnected: true });
    const conversation = await createConversation(tenantA.tenantId, { socialConnectionId: connection.id });

    const response = await request(app)
      .post(`/conversations/${conversation.id}/messages`)
      .set(makeAuthHeader(tenantA.tenantId, tenantA.userId))
      .send({ content: 'hello' });

    expect(response.status).toBe(409);
  });

  it('inserts the message with the correct tenant_id on success', async () => {
    const connection = await createSocialConnection(tenantA.tenantId);
    const conversation = await createConversation(tenantA.tenantId, { socialConnectionId: connection.id });

    const response = await request(app)
      .post(`/conversations/${conversation.id}/messages`)
      .set(makeAuthHeader(tenantA.tenantId, tenantA.userId))
      .send({ content: 'hello there' });

    expect(response.status).toBe(201);
    expect(response.body.message.content).toBe('hello there');

    const { data: stored } = await supabaseAdmin
      .from('messages')
      .select('tenant_id, conversation_id, direction, content')
      .eq('id', response.body.message.id)
      .single();

    expect(stored?.tenant_id).toBe(tenantA.tenantId);
    expect(stored?.conversation_id).toBe(conversation.id);
    expect(stored?.direction).toBe('outbound');
  });
});

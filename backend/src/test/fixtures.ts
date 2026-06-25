import { randomUUID } from 'node:crypto';
import { supabaseAdmin } from '../lib/supabaseAdmin';
import { encryptToken } from '../lib/tokenCrypto';

export interface TestTenant {
  tenantId: string;
  userId: string;
}

// Creates a fresh tenant + merchant user for one test. The tenants row
// is inserted with owner_id set to a real auth.users id — the
// on_tenant_created trigger (003_tenant_profile_setup.sql,
// handle_new_tenant()) then provisions the matching public.users row
// itself from new.owner_id. Inserting into public.users manually here
// would either race the trigger or hit a duplicate-key conflict, since
// the trigger already does it; if owner_id were left null instead, the
// trigger's insert into public.users (id, ...) values (new.owner_id, ...)
// fails with a not-null violation on id — that was the original bug.
export async function createTestTenant(): Promise<TestTenant> {
  const email = `test-${randomUUID()}@example.com`;

  const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: randomUUID(),
    email_confirm: true,
  });

  if (authError || !authUser.user) {
    throw new Error(`failed to create test auth user: ${authError?.message}`);
  }

  const userId = authUser.user.id;

  const { data: tenant, error: tenantError } = await supabaseAdmin
    .from('tenants')
    .insert({ name: `Test Tenant ${randomUUID()}`, owner_id: userId })
    .select('id')
    .single();

  if (tenantError || !tenant) {
    throw new Error(`failed to create test tenant: ${tenantError?.message}`);
  }

  return { tenantId: tenant.id, userId };
}

// Deletion order respects FK constraints (no ON DELETE CASCADE except
// users -> auth.users): children before parents, and the users row
// last via the auth user delete, which cascades it automatically.
export async function deleteTestTenant(tenant: TestTenant): Promise<void> {
  const { data: orders } = await supabaseAdmin.from('orders').select('id').eq('tenant_id', tenant.tenantId);
  const orderIds = (orders ?? []).map((order) => order.id);

  if (orderIds.length > 0) {
    await supabaseAdmin.from('order_items').delete().in('order_id', orderIds);
  }

  await supabaseAdmin.from('messages').delete().eq('tenant_id', tenant.tenantId);
  await supabaseAdmin.from('orders').delete().eq('tenant_id', tenant.tenantId);
  await supabaseAdmin.from('conversations').delete().eq('tenant_id', tenant.tenantId);
  await supabaseAdmin.from('customers').delete().eq('tenant_id', tenant.tenantId);
  await supabaseAdmin.from('social_connections').delete().eq('tenant_id', tenant.tenantId);
  await supabaseAdmin.from('products').delete().eq('tenant_id', tenant.tenantId);
  await supabaseAdmin.from('audit_log').delete().eq('tenant_id', tenant.tenantId);
  await supabaseAdmin.from('push_tokens').delete().eq('tenant_id', tenant.tenantId);

  // tenants.owner_id also references auth.users(id) (no cascade) — break
  // that link before deleting the auth user, otherwise the delete below
  // is rejected by the same FK it would otherwise need to cascade through.
  await supabaseAdmin.from('tenants').update({ owner_id: null }).eq('id', tenant.tenantId);

  // Cascades the public.users row (users.id references auth.users(id)
  // on delete cascade) — must happen after the deletes above, since
  // conversations.assigned_to/orders.agent_id could otherwise still
  // reference this user.id and block the cascade.
  await supabaseAdmin.auth.admin.deleteUser(tenant.userId);

  await supabaseAdmin.from('tenants').delete().eq('id', tenant.tenantId);
}

export type SocialConnectionPlatform = 'whatsapp' | 'facebook' | 'tiktok';

export async function createSocialConnection(
  tenantId: string,
  overrides: {
    platform?: SocialConnectionPlatform;
    externalAccountId?: string;
    disconnected?: boolean;
    metadata?: Record<string, unknown>;
  } = {},
) {
  const { data, error } = await supabaseAdmin
    .from('social_connections')
    .insert({
      tenant_id: tenantId,
      platform: overrides.platform ?? 'whatsapp',
      external_account_id: overrides.externalAccountId ?? randomUUID(),
      access_token_enc: encryptToken('fake-test-access-token'),
      status: 'active',
      metadata: overrides.metadata ?? { phone_number_id: 'test-phone-number-id' },
      disconnected_at: overrides.disconnected ? new Date().toISOString() : null,
    })
    .select()
    .single();

  if (error || !data) {
    throw new Error(`failed to create test social_connection: ${error?.message}`);
  }

  return data;
}

export async function createConversation(
  tenantId: string,
  overrides: {
    platform?: SocialConnectionPlatform;
    externalThreadId?: string;
    socialConnectionId?: string | null;
    customerName?: string;
  } = {},
) {
  const { data, error } = await supabaseAdmin
    .from('conversations')
    .insert({
      tenant_id: tenantId,
      platform: overrides.platform ?? 'whatsapp',
      external_thread_id: overrides.externalThreadId ?? randomUUID(),
      social_connection_id: overrides.socialConnectionId ?? null,
      customer_name: overrides.customerName ?? 'Test Customer',
      status: 'new',
    })
    .select()
    .single();

  if (error || !data) {
    throw new Error(`failed to create test conversation: ${error?.message}`);
  }

  return data;
}

export async function createProduct(
  tenantId: string,
  overrides: { name?: string; price?: number; stockQuantity?: number; alertThreshold?: number } = {},
) {
  const { data, error } = await supabaseAdmin
    .from('products')
    .insert({
      tenant_id: tenantId,
      name: overrides.name ?? `Test Product ${randomUUID()}`,
      price: overrides.price ?? 1000,
      stock_quantity: overrides.stockQuantity ?? 10,
      alert_threshold: overrides.alertThreshold ?? 2,
    })
    .select()
    .single();

  if (error || !data) {
    throw new Error(`failed to create test product: ${error?.message}`);
  }

  return data;
}

export async function createCustomer(
  tenantId: string,
  overrides: {
    name?: string;
    phone?: string | null;
    email?: string | null;
    source?: 'whatsapp' | 'facebook' | 'tiktok' | 'manual';
    external_id?: string | null;
    notes?: string | null;
  } = {},
) {
  const { data, error } = await supabaseAdmin
    .from('customers')
    .insert({
      tenant_id: tenantId,
      name: overrides.name ?? `Test Customer ${randomUUID()}`,
      phone: overrides.phone ?? null,
      email: overrides.email ?? null,
      source: overrides.source ?? 'manual',
      external_id: overrides.external_id ?? null,
      notes: overrides.notes ?? null,
    })
    .select()
    .single();

  if (error || !data) {
    throw new Error(`failed to create test customer: ${error?.message}`);
  }

  return data;
}

export async function createOrder(
  tenantId: string,
  overrides: { status?: string; totalAmount?: number; customerName?: string } = {},
) {
  const { data, error } = await supabaseAdmin
    .from('orders')
    .insert({
      tenant_id: tenantId,
      status: overrides.status ?? 'new',
      total_amount: overrides.totalAmount ?? 5000,
      customer_name: overrides.customerName ?? 'Test Customer',
    })
    .select()
    .single();

  if (error || !data) {
    throw new Error(`failed to create test order: ${error?.message}`);
  }

  return data;
}

export async function createOrderItem(
  orderId: string,
  productId: string,
  overrides: { quantity?: number; unitPrice?: number } = {},
) {
  const { data, error } = await supabaseAdmin
    .from('order_items')
    .insert({
      order_id: orderId,
      product_id: productId,
      quantity: overrides.quantity ?? 1,
      unit_price: overrides.unitPrice ?? 1000,
    })
    .select()
    .single();

  if (error || !data) {
    throw new Error(`failed to create test order_item: ${error?.message}`);
  }

  return data;
}

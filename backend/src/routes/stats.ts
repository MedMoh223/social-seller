import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { authenticatedLimiter } from '../middleware/rateLimiter';
import { supabaseAdmin } from '../lib/supabaseAdmin';
import { logger } from '../lib/logger';

export const statsRouter = Router();

statsRouter.use(requireAuth, authenticatedLimiter);

const ORDER_STATUSES = ['new', 'confirmed', 'preparing', 'shipped', 'delivered', 'cancelled'] as const;

interface TopProductRow {
  product_id: string;
  name: string;
  total_sold: number;
}

function startOfUTCDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

// ISO week: Monday 00:00 UTC.
function startOfWeek(date: Date): Date {
  const day = startOfUTCDay(date);
  const weekday = day.getUTCDay();
  const diffToMonday = (weekday + 6) % 7;
  day.setUTCDate(day.getUTCDate() - diffToMonday);
  return day;
}

function startOfMonth(date: Date, monthOffset = 0): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + monthOffset, 1));
}

async function countInboundMessagesSince(tenantId: string, since: Date): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('direction', 'inbound')
    .gte('created_at', since.toISOString());

  if (error) throw error;
  return count ?? 0;
}

async function countOrdersByStatus(tenantId: string, status: string): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('status', status);

  if (error) throw error;
  return count ?? 0;
}

async function sumDeliveredRevenue(tenantId: string, from: Date, to: Date): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from('orders')
    .select('total_amount')
    .eq('tenant_id', tenantId)
    .eq('status', 'delivered')
    .gte('created_at', from.toISOString())
    .lt('created_at', to.toISOString());

  if (error) throw error;
  return (data ?? []).reduce((sum, row) => sum + Number(row.total_amount), 0);
}

async function countOrdersToday(tenantId: string, since: Date): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .gte('created_at', since.toISOString());
  if (error) throw error;
  return count ?? 0;
}

async function countActiveConversations(tenantId: string): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from('conversations')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .neq('status', 'resolved');
  if (error) throw error;
  return count ?? 0;
}

statsRouter.get('/', async (req, res, next) => {
  const tenantId = req.user!.tenantId;
  const now = new Date();
  const todayStart = startOfUTCDay(now);

  try {
    const [
      messagesToday,
      messagesThisWeek,
      ordersByStatusCounts,
      revenueThisMonth,
      revenueLastMonth,
      revenueToday,
      ordersToday,
      activeConversations,
      topProductsResult,
      lowStockProductsResult,
    ] = await Promise.all([
      countInboundMessagesSince(tenantId, todayStart),
      countInboundMessagesSince(tenantId, startOfWeek(now)),
      Promise.all(ORDER_STATUSES.map((status) => countOrdersByStatus(tenantId, status))),
      sumDeliveredRevenue(tenantId, startOfMonth(now), startOfMonth(now, 1)),
      sumDeliveredRevenue(tenantId, startOfMonth(now, -1), startOfMonth(now)),
      sumDeliveredRevenue(tenantId, todayStart, new Date(todayStart.getTime() + 86400000)),
      countOrdersToday(tenantId, todayStart),
      countActiveConversations(tenantId),
      supabaseAdmin.rpc('get_top_products', { p_tenant_id: tenantId, p_limit: 3 }),
      supabaseAdmin
        .from('products')
        .select('stock_quantity, alert_threshold')
        .eq('tenant_id', tenantId)
        .is('deleted_at', null),
    ]);

    if (topProductsResult.error) throw topProductsResult.error;
    if (lowStockProductsResult.error) throw lowStockProductsResult.error;

    const ordersByStatus = ORDER_STATUSES.reduce<Record<string, number>>((acc, status, index) => {
      acc[status] = ordersByStatusCounts[index];
      return acc;
    }, {});

    const lowStockCount = (lowStockProductsResult.data ?? []).filter(
      (product) => product.stock_quantity <= product.alert_threshold,
    ).length;

    const topProducts = (topProductsResult.data ?? []) as TopProductRow[];

    res.status(200).json({
      messages_today: messagesToday,
      messages_this_week: messagesThisWeek,
      orders_today: ordersToday,
      revenue_today: revenueToday,
      active_conversations: activeConversations,
      orders_by_status: ordersByStatus,
      revenue_this_month: revenueThisMonth,
      revenue_last_month: revenueLastMonth,
      top_products: topProducts.map((row) => ({
        product_id: row.product_id,
        name: row.name,
        total_sold: Number(row.total_sold),
      })),
      low_stock_count: lowStockCount,
    });
  } catch (err) {
    logger.error({ err }, 'failed to compute stats');
    next(err);
  }
});

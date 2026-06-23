import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { authenticatedLimiter } from '../middleware/rateLimiter';
import { supabaseAdmin } from '../lib/supabaseAdmin';
import { ConflictError, NotFoundError, ValidationError } from '../lib/httpErrors';
import { logger } from '../lib/logger';

export const ordersRouter = Router();

ordersRouter.use(requireAuth, authenticatedLimiter);

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

ordersRouter.get('/', async (req, res, next) => {
  const parsed = listQuerySchema.safeParse(req.query);

  if (!parsed.success) {
    next(new ValidationError('Paramètres de pagination invalides.'));
    return;
  }

  const { limit, offset } = parsed.data;

  try {
    const { data, error, count } = await supabaseAdmin
      .from('orders')
      .select('id, customer_name, total_amount, status, created_at', { count: 'exact' })
      .eq('tenant_id', req.user!.tenantId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    res.status(200).json({ orders: data, total: count ?? 0, limit, offset });
  } catch (err) {
    logger.error({ err }, 'failed to list orders');
    next(err);
  }
});

ordersRouter.get('/:id', async (req, res, next) => {
  try {
    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders')
      .select('*')
      .eq('id', req.params.id)
      .eq('tenant_id', req.user!.tenantId)
      .maybeSingle();

    if (orderError) throw orderError;

    if (!order) {
      next(new NotFoundError('Commande introuvable.'));
      return;
    }

    const { data: items, error: itemsError } = await supabaseAdmin
      .from('order_items')
      .select('id, quantity, unit_price, product:products(id, name)')
      .eq('order_id', order.id);

    if (itemsError) throw itemsError;

    res.status(200).json({ order: { ...order, items: items ?? [] } });
  } catch (err) {
    logger.error({ err, orderId: req.params.id }, 'failed to load order detail');
    next(err);
  }
});

const ORDER_STATUSES = ['new', 'confirmed', 'preparing', 'shipped', 'delivered', 'cancelled'] as const;

const patchOrderSchema = z
  .object({
    status: z.enum(ORDER_STATUSES),
    cancelledReason: z.string().trim().min(1).max(500).optional(),
  })
  .refine((data) => data.status !== 'cancelled' || Boolean(data.cancelledReason), {
    message: 'Un motif est requis pour annuler une commande.',
    path: ['cancelledReason'],
  });

ordersRouter.patch('/:id', async (req, res, next) => {
  const parsed = patchOrderSchema.safeParse(req.body);

  if (!parsed.success) {
    next(new ValidationError(parsed.error.issues[0]?.message ?? 'Requête invalide.'));
    return;
  }

  try {
    // The transition graph, tenant ownership check, stock decrement
    // (on delivery) and audit log insert all happen inside this one
    // RPC call, atomically — see 012_order_status_transitions.sql.
    const { data: order, error } = await supabaseAdmin.rpc('transition_order_status', {
      p_order_id: req.params.id,
      p_tenant_id: req.user!.tenantId,
      p_new_status: parsed.data.status,
      p_user_id: req.user!.id,
      p_cancelled_reason: parsed.data.cancelledReason ?? null,
    });

    if (error) {
      if (error.message.includes('order_not_found')) {
        next(new NotFoundError('Commande introuvable.'));
        return;
      }
      if (error.message.includes('invalid_transition')) {
        next(new ConflictError('Transition de statut invalide.'));
        return;
      }
      if (error.message.includes('cancelled_reason_required')) {
        next(new ValidationError('Un motif est requis pour annuler une commande.'));
        return;
      }
      throw error;
    }

    res.status(200).json({ order });
  } catch (err) {
    logger.error({ err, orderId: req.params.id }, 'failed to transition order status');
    next(err);
  }
});

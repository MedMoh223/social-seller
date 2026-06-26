import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { authenticatedLimiter } from '../middleware/rateLimiter';
import { supabaseAdmin } from '../lib/supabaseAdmin';
import { ConflictError, NotFoundError, ValidationError } from '../lib/httpErrors';
import { logger } from '../lib/logger';
import { decryptToken } from '../lib/tokenCrypto';
import { sendWhatsAppMessage, sendFacebookMessage } from '../services/metaGraphClient';

// Messages envoyés au client selon le nouveau statut.
// Pas de notif pour 'new' (état initial) ni 'preparing' (interne).
const STATUS_NOTIFICATIONS: Partial<Record<string, string>> = {
  confirmed: '✅ Votre commande a été confirmée. Nous la préparons bientôt.',
  shipped: '🚚 Votre commande a été expédiée. Vous la recevrez prochainement.',
  delivered: '🎉 Votre commande a bien été livrée. Merci pour votre confiance !',
  cancelled: "❌ Votre commande a été annulée. N'hésitez pas à nous contacter pour plus d'informations.",
};

async function notifyClientOnStatusChange(
  conversationId: string,
  tenantId: string,
  newStatus: string,
): Promise<void> {
  const message = STATUS_NOTIFICATIONS[newStatus];
  if (!message) return;

  try {
    const { data: conversation } = await supabaseAdmin
      .from('conversations')
      .select('platform, external_thread_id, social_connection_id')
      .eq('id', conversationId)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (!conversation?.social_connection_id || !conversation.external_thread_id) return;

    const { data: connection } = await supabaseAdmin
      .from('social_connections')
      .select('platform, access_token_enc, metadata')
      .eq('id', conversation.social_connection_id)
      .eq('tenant_id', tenantId)
      .is('disconnected_at', null)
      .maybeSingle();

    if (!connection) return;

    const accessToken = decryptToken(connection.access_token_enc as string);

    if (connection.platform === 'whatsapp') {
      const phoneNumberId = (connection.metadata as Record<string, unknown> | null)?.phone_number_id;
      if (typeof phoneNumberId !== 'string') return;
      await sendWhatsAppMessage(phoneNumberId, accessToken, conversation.external_thread_id, message);
    } else if (connection.platform === 'facebook') {
      await sendFacebookMessage(accessToken, conversation.external_thread_id, message);
    }
  } catch (err) {
    // Fire-and-forget : on logue sans faire échouer la transition
    logger.warn({ err, conversationId, newStatus }, 'order status notification failed (non-blocking)');
  }
}

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

const createOrderSchema = z.object({
  customerName: z.string().trim().min(1).max(200),
  customerId: z.string().uuid().optional().nullable(),
  conversationId: z.string().uuid().optional().nullable(),
  deliveryAddress: z.string().trim().max(500).optional().nullable(),
  deliveryFee: z.number().nonnegative().default(0),
  discount: z.number().nonnegative().default(0),
  items: z.array(z.object({
    productId: z.string().uuid(),
    quantity: z.number().int().min(1),
    unitPrice: z.number().nonnegative(),
  })).min(1, 'Au moins un article est requis.'),
});

ordersRouter.post('/', async (req, res, next) => {
  const parsed = createOrderSchema.safeParse(req.body);
  if (!parsed.success) {
    next(new ValidationError(parsed.error.issues[0]?.message ?? 'Requête invalide.'));
    return;
  }

  const { customerName, customerId, conversationId, deliveryAddress, deliveryFee, discount, items } = parsed.data;
  const itemsTotal = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const totalAmount = Math.max(0, itemsTotal + deliveryFee - discount);

  try {
    // Créer la commande
    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders')
      .insert({
        tenant_id: req.user!.tenantId,
        agent_id: req.user!.id,
        customer_name: customerName,
        customer_id: customerId ?? null,
        conversation_id: conversationId ?? null,
        delivery_address: deliveryAddress ?? null,
        delivery_fee: deliveryFee,
        discount: discount,
        total_amount: totalAmount,
        status: 'new',
      })
      .select('id, customer_name, customer_id, total_amount, delivery_fee, discount, status, created_at')
      .single();

    if (orderError) throw orderError;

    // Insérer les articles
    const { error: itemsError } = await supabaseAdmin
      .from('order_items')
      .insert(
        items.map((item) => ({
          order_id: order.id,
          product_id: item.productId,
          quantity: item.quantity,
          unit_price: item.unitPrice,
        })),
      );

    if (itemsError) throw itemsError;

    res.status(201).json({ order });
  } catch (err) {
    logger.error({ err }, 'failed to create order');
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

    // Notifier le client si la commande est liée à une conversation (fire-and-forget)
    if (order.conversation_id) {
      void notifyClientOnStatusChange(order.conversation_id, req.user!.tenantId, parsed.data.status);
    }

    res.status(200).json({ order });
  } catch (err) {
    logger.error({ err, orderId: req.params.id }, 'failed to transition order status');
    next(err);
  }
});

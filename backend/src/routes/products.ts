import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireOwner } from '../middleware/auth';
import { authenticatedLimiter } from '../middleware/rateLimiter';
import { supabaseAdmin } from '../lib/supabaseAdmin';
import { recordAuditLog } from '../services/auditLogService';
import { ConflictError, NotFoundError, ValidationError } from '../lib/httpErrors';
import { logger } from '../lib/logger';

export const productsRouter = Router();

productsRouter.use(requireAuth, authenticatedLimiter);

productsRouter.get('/', async (req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('products')
      .select('id, name, description, price, cost_price, stock_quantity, alert_threshold, image_urls, created_at')
      .eq('tenant_id', req.user!.tenantId)
      .is('deleted_at', null)
      .order('name', { ascending: true });

    if (error) throw error;

    res.status(200).json({ products: data });
  } catch (err) {
    logger.error({ err }, 'failed to list products');
    next(err);
  }
});

const createProductSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
  price: z.number().nonnegative(),
  costPrice: z.number().nonnegative().nullable().optional(),
  stockQuantity: z.number().int().min(0).default(0),
  alertThreshold: z.number().int().min(0).default(0),
  imageUrls: z.array(z.string().url()).max(4).default([]),
});

productsRouter.post('/', requireOwner, async (req, res, next) => {
  const parsed = createProductSchema.safeParse(req.body);

  if (!parsed.success) {
    next(new ValidationError(parsed.error.issues[0]?.message ?? 'Requête invalide.'));
    return;
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('products')
      .insert({
        tenant_id: req.user!.tenantId,
        name: parsed.data.name,
        description: parsed.data.description ?? null,
        price: parsed.data.price,
        cost_price: parsed.data.costPrice ?? null,
        stock_quantity: parsed.data.stockQuantity,
        alert_threshold: parsed.data.alertThreshold,
        image_urls: parsed.data.imageUrls,
      })
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({ product: data });
  } catch (err) {
    logger.error({ err }, 'failed to create product');
    next(err);
  }
});

const updateProductSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  price: z.number().nonnegative().optional(),
  costPrice: z.number().nonnegative().nullable().optional(),
  alertThreshold: z.number().int().min(0).optional(),
  imageUrls: z.array(z.string().url()).max(4).optional(),
});

productsRouter.patch('/:id', requireOwner, async (req, res, next) => {
  const parsed = updateProductSchema.safeParse(req.body);

  if (!parsed.success) {
    next(new ValidationError(parsed.error.issues[0]?.message ?? 'Requête invalide.'));
    return;
  }

  // stock_quantity is deliberately not accepted here — it only ever
  // changes through PATCH /:id/stock, which carries a required reason
  // and an audit log entry.
  const updates: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.description !== undefined) updates.description = parsed.data.description;
  if (parsed.data.price !== undefined) updates.price = parsed.data.price;
  if (parsed.data.costPrice !== undefined) updates.cost_price = parsed.data.costPrice;
  if (parsed.data.alertThreshold !== undefined) updates.alert_threshold = parsed.data.alertThreshold;
  if (parsed.data.imageUrls !== undefined) updates.image_urls = parsed.data.imageUrls;

  if (Object.keys(updates).length === 0) {
    next(new ValidationError('Aucune modification fournie.'));
    return;
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('products')
      .update(updates)
      .eq('id', req.params.id)
      .eq('tenant_id', req.user!.tenantId)
      .is('deleted_at', null)
      .select()
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      next(new NotFoundError('Produit introuvable.'));
      return;
    }

    res.status(200).json({ product: data });
  } catch (err) {
    logger.error({ err, productId: req.params.id }, 'failed to update product');
    next(err);
  }
});

const adjustStockSchema = z.object({
  delta: z.number().int().refine((value) => value !== 0, { message: 'La quantité doit être différente de zéro.' }),
  reason: z.string().trim().min(1).max(500),
});

productsRouter.patch('/:id/stock', requireOwner, async (req, res, next) => {
  const parsed = adjustStockSchema.safeParse(req.body);

  if (!parsed.success) {
    next(new ValidationError(parsed.error.issues[0]?.message ?? 'Requête invalide.'));
    return;
  }

  try {
    // Row lock + stock update + audit log insert all happen atomically
    // inside this RPC — see 013_adjust_product_stock.sql.
    const { data: product, error } = await supabaseAdmin.rpc('adjust_product_stock', {
      p_product_id: req.params.id,
      p_tenant_id: req.user!.tenantId,
      p_delta: parsed.data.delta,
      p_reason: parsed.data.reason,
      p_user_id: req.user!.id,
    });

    if (error) {
      if (error.message.includes('product_not_found')) {
        next(new NotFoundError('Produit introuvable.'));
        return;
      }
      if (error.message.includes('insufficient_stock')) {
        next(new ConflictError('Stock insuffisant pour cet ajustement.'));
        return;
      }
      if (error.message.includes('reason_required')) {
        next(new ValidationError('Un motif est requis pour ajuster le stock.'));
        return;
      }
      throw error;
    }

    res.status(200).json({ product });
  } catch (err) {
    logger.error({ err, productId: req.params.id }, 'failed to adjust product stock');
    next(err);
  }
});

productsRouter.delete('/:id', requireOwner, async (req, res, next) => {
  try {
    const { data: product, error } = await supabaseAdmin
      .from('products')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .eq('tenant_id', req.user!.tenantId)
      .is('deleted_at', null)
      .select()
      .maybeSingle();

    if (error) throw error;

    if (!product) {
      next(new NotFoundError('Produit introuvable.'));
      return;
    }

    await recordAuditLog({
      tenantId: req.user!.tenantId,
      userId: req.user!.id,
      action: 'product_archived',
      tableName: 'products',
      recordId: product.id,
      oldValue: { deleted_at: null },
      newValue: { deleted_at: product.deleted_at },
    });

    res.status(204).send();
  } catch (err) {
    logger.error({ err, productId: req.params.id }, 'failed to archive product');
    next(err);
  }
});
